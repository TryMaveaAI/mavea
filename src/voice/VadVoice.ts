// VadVoice: the "Always on" voice controller.
//
// Uses Silero VAD (via @ricky0123/vad-web, WASM) for accurate speech boundary
// detection — it understands the difference between a mid-sentence breath and a
// genuine end-of-thought, something no timer-based approach can do reliably.
//
// Transcription stack:
//   1. WebSpeech (continuous, interim) — runs in parallel during the utterance,
//      gives a live transcript the UI can show while the user speaks.
//   2. Whisper via /stt (an optional local faster-whisper server) — on speech-end,
//      the raw Float32 audio is encoded to WAV and sent here; Whisper transcribes
//      with context-aware accuracy. Falls back to the WebSpeech final if /stt is down.
//
// The first start() call lazy-loads the WASM model (~2 s on first boot, instant
// after). The always-on lifecycle is controlled by LiveApp (start on toggle/turn-
// end, stop when Mavéa is responding).
import { floatToWav } from './encodeWav';
import { mapSpeechRecognitionError } from './mapSpeechError';
import type {
  SpeakOptions,
  VoiceCapabilities,
  VoiceController,
  VoiceMode,
  VoicePhase,
  VoiceResult,
  VoiceStartContext,
  VoiceStateEvent,
} from './types';

// Lazy type — only resolved after the dynamic import succeeds.
type MicVAD = import('@ricky0123/vad-web').MicVAD;

export class VadVoice implements VoiceController {
  readonly mode: VoiceMode = 'vad';
  readonly capabilities: VoiceCapabilities;

  private vad: MicVAD | null = null;
  private vadLoading = false;
  private vadFailed = false;
  private rec: SpeechRecognition | null = null;
  private liveTranscript = '';
  private phase: VoicePhase = 'idle';
  private muted = false;
  private wantRunning = false;
  // Set once dispose() runs. If disposal races an in-flight MicVAD.new()/start() (the mic is being
  // acquired), the instance would otherwise be assigned AFTER we let go of it — an orphaned mic +
  // AudioContext with the OS "mic in use" indicator stuck on. loadVad checks this and tears down.
  private disposed = false;

  // Echo suppression for always-on: the browser's getUserMedia echoCancellation removes
  // most TTS bleed during active playback. The remaining risk is the reverb tail after Mavéa
  // stops — `echoTailUntil` gates out speech that begins in that brief window.
  // Speech that starts DURING Mavéa's playback is treated as a possible user interruption
  // (barge-in), but AEC on speaker+mic setups (no headset) is imperfect — a plosive or loud
  // word can bleed through as a false speech onset. Barge-in fires from onSpeechRealStart (only
  // after minSpeechFrames of SUSTAINED speech), so a brief AEC-missed bleed blip never reaches
  // onBargeIn and never chops Mavéa off mid-word.
  private maveaSpeaking = false;
  private echoTailUntil = 0;
  // Called by the surface when the user barges in so it can cancel TTS immediately.
  onBargeIn?: () => void;
  // The utterance currently in flight began in the post-speech echo tail → drop it.
  private utteranceIsEcho = false;
  private bargeInTimer: ReturnType<typeof setTimeout> | null = null;

  // How long after Mavéa stops speaking to keep treating new speech as echo (ms). Covers the
  // reverb/last-word tail and the gap before speechSynthesis/Kokoro fully releases the speakers.
  private static readonly ECHO_TAIL_MS = 600;

  // null = not probed yet; false = unavailable (stop probing); true = working.
  private whisperOk: boolean | null = null;

  private resultSubs = new Set<(r: VoiceResult) => void>();
  private stateSubs = new Set<(e: VoiceStateEvent) => void>();

  constructor() {
    const SR: SpeechRecognitionStatic | undefined =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const stt = !!SR;
    const tts = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.capabilities = { stt, tts, canUseRealVoice: stt };

    if (SR) {
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true;
      // Continuous so WebSpeech accumulates text while the VAD keeps us open.
      rec.continuous = true;
      rec.maxAlternatives = 1;

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let t = '';
        for (let i = 0; i < e.results.length; i++) {
          t += e.results[i][0].transcript;
        }
        this.liveTranscript = t.trim();
        if (this.phase === 'listening') {
          this.emitState({ phase: 'listening', transcript: this.liveTranscript });
        }
      };

      // WebSpeech is a fallback transcript source here, but a real failure still needs to reach
      // the user — otherwise always-on can go permanently, silently deaf (denied mic permission,
      // no mic hardware) with nothing in the UI ever explaining why. 'aborted' is our own
      // start()/stop() churn (VAD drives this rec's lifecycle every utterance) and 'no-speech'
      // is meaningless here (VAD — not this recognizer — decides speech boundaries); both are
      // routine noise, not failures, so only genuine errors are surfaced.
      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        const err = mapSpeechRecognitionError(e.error);
        if (err === 'aborted' || err === 'no-speech') return;
        this.emitState({ phase: 'idle', error: err });
      };

      // VAD controls the lifecycle; don't auto-restart on end.
      rec.onend = () => {};

      this.rec = rec;
    }
  }

  start(_ctx?: VoiceStartContext): void {
    if (this.muted) return;
    this.wantRunning = true;

    if (this.vadFailed) {
      // VAD failed to load — run as a plain continuous WebSpeech voice.
      if (this.rec && this.phase === 'idle') {
        try {
          this.rec.start();
          this.emitState({ phase: 'listening' });
        } catch {
          /* already running */
        }
      }
      return;
    }

    if (this.vad) {
      void this.vad.start();
    } else {
      void this.loadVad();
    }
  }

  stop(): void {
    this.wantRunning = false;
    // vad-web's pause() fully releases the hardware, not just its own processing: its default
    // pauseStream() stops every MediaStream track, which is what actually turns off the OS
    // "microphone in use" indicator. start()/resumeStream() re-acquires a fresh stream on
    // return, so muting genuinely frees the mic rather than merely idling in the background.
    if (this.vad) void this.vad.pause();
    try {
      this.rec?.stop();
    } catch {
      /* not running */
    }
    this.clearBargeInTimer();
    this.liveTranscript = '';
    if (this.phase !== 'idle') this.emitState({ phase: 'idle' });
  }

  forceStop(): void {
    this.wantRunning = false;
    if (this.vad) void this.vad.pause();
    try {
      this.rec?.stop();
    } catch {
      /* not running */
    }
    this.clearBargeInTimer();
    const text = this.liveTranscript.trim();
    this.liveTranscript = '';
    this.utteranceIsEcho = false;
    if (text) {
      this.emitState({ phase: 'heard', transcript: text });
      this.emitResult({ transcript: text });
    }
    this.emitState({ phase: 'idle' });
  }

  speak(_opts: SpeakOptions): Promise<void> {
    // LiveApp drives TTS via kokoro/tts directly — VadVoice doesn't own output.
    return Promise.resolve();
  }

  cancel(): void {
    this.stop();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  setMaveaSpeaking(speaking: boolean): void {
    // Stamp the playback tail ONLY on a true falling edge. Callers poll this with `false`
    // while idle, and an unconditional stamp kept pushing the tail into the future forever
    // — after Mavéa's first answer, every real utterance was dropped as "echo" and the
    // always-on mic looked dead from the second turn on.
    if (this.maveaSpeaking && !speaking) {
      this.echoTailUntil = Date.now() + VadVoice.ECHO_TAIL_MS;
    }
    this.maveaSpeaking = speaking;
  }

  setSoundEnabled(_enabled: boolean): void {
    // VadVoice doesn't own TTS — LiveApp drives tts.ts directly.
  }

  onResult(cb: (r: VoiceResult) => void): () => void {
    this.resultSubs.add(cb);
    return () => this.resultSubs.delete(cb);
  }

  onStateChange(cb: (e: VoiceStateEvent) => void): () => void {
    this.stateSubs.add(cb);
    return () => this.stateSubs.delete(cb);
  }

  dispose(): void {
    this.disposed = true;
    this.wantRunning = false;
    this.clearBargeInTimer();
    if (this.vad) {
      // Swallow the throw: vad-web's destroy() reads its audio instances first and rejects if the
      // instance is still initializing. loadVad's disposed-check below is what actually reclaims a
      // still-loading instance; here we just release the one we already hold.
      void this.vad.destroy().catch(() => {});
      this.vad = null;
    }
    if (this.rec) {
      this.rec.onresult = null;
      this.rec.onerror = null;
      this.rec.onend = null;
      try {
        this.rec.abort();
      } catch {
        /* not running */
      }
    }
    this.resultSubs.clear();
    this.stateSubs.clear();
  }

  // --- internals -----------------------------------------------------------

  private async loadVad(): Promise<void> {
    if (this.vadLoading) return;
    this.vadLoading = true;
    try {
      // Loaded on demand — the mic is the only thing that needs it, and it drags in a WASM runtime.
      // Deliberately NOT @vite-ignore'd: that hid the package from Vite's dep scan, so the first
      // time a user hit the mic, dev-mode Vite pre-bundled it on the spot and hard-reloaded the
      // page out from under the answer in flight. It is pre-bundled up front instead (optimizeDeps).
      const { MicVAD } = await import('@ricky0123/vad-web');
      this.vad = await MicVAD.new({
        model: 'v5',
        startOnLoad: false,
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        // vad-web's default getStream already opens the mic with echoCancellation +
        // noiseSuppression + autoGainControl on (see getDefaultRealTimeVADOptions), so browser
        // AEC removes most of Mavéa's TTS bleed at the source. The per-utterance echo gate
        // (maveaSpeaking) is the backstop for the residual it doesn't catch.
        // 2 200 ms gives a natural thinking-pause window: long enough that mid-thought
        // silences don't cut the user off, short enough that a complete thought still
        // feels responsive. Below ~1 600 ms users get interrupted; above ~2 500 ms the
        // system starts to feel slow at the end of every utterance.
        redemptionMs: 2200,
        onSpeechStart: () => this.handleSpeechStart(),
        // Barge-in fires HERE, not on onSpeechStart. onSpeechStart trips on the very first frame
        // above threshold — a single ~32 ms plosive of TTS bleed does it — and the old wall-clock
        // confirm timer never helped because onSpeechEnd (which would cancel it) can't fire until
        // redemptionMs (2200 ms) of silence, long after the 300 ms timer already cancelled Mavéa.
        // onSpeechRealStart fires only after minSpeechFrames of genuinely sustained speech, so a
        // brief bleed blip never reaches it.
        onSpeechRealStart: () => this.handleSpeechRealStart(),
        onSpeechEnd: (audio: Float32Array) => void this.handleSpeechEnd(audio),
        // A too-short utterance ends as a misfire, not onSpeechEnd — clean up so the recognizer and
        // phase don't stay stuck 'listening' after a quick "stop"/"yes".
        onVADMisfire: () => this.handleMisfire(),
      });
      // dispose() may have run while MicVAD.new() was loading — if so, reclaim the instance now
      // instead of leaking it (and never start it, so no mic is acquired).
      if (this.disposed) {
        void this.vad.destroy().catch(() => {});
        this.vad = null;
        return;
      }
      this.vadLoading = false;
      if (this.wantRunning) void this.vad.start();
    } catch (err) {
      console.warn('[VadVoice] Silero VAD failed to load — falling back to WebSpeech', err);
      this.vadLoading = false;
      this.vadFailed = true;
      // Repoint the WebSpeech handler to emit results directly (no VAD boundary).
      if (this.rec) {
        this.rec.onresult = (e: SpeechRecognitionEvent) => {
          const last = e.results[e.results.length - 1];
          if (!last) return;
          const text = last[0].transcript.trim();
          // Same echo gate as the VAD path: a final transcript that lands while Mavéa is speaking
          // (or within the playback tail) is its own voice — drop it instead of submitting.
          if (last.isFinal && (this.maveaSpeaking || Date.now() < this.echoTailUntil)) {
            return;
          }
          if (last.isFinal && text) {
            this.emitState({ phase: 'heard', transcript: text });
            this.emitResult({ transcript: text });
            this.emitState({ phase: 'idle' });
          } else if (!last.isFinal) {
            this.liveTranscript = text;
            this.emitState({ phase: 'listening', transcript: text });
          }
        };
        if (this.wantRunning) this.start();
      } else if (this.wantRunning) {
        // No SpeechRecognition in this browser either — there is no possible fallback, and
        // without this the mic would just stay silently dead forever with nothing ever telling
        // the user why (the always-on toggle would look "on" but never react to anything).
        this.emitState({ phase: 'idle', error: 'unsupported' });
      }
    }
  }

  private clearBargeInTimer(): void {
    if (this.bargeInTimer !== null) {
      clearTimeout(this.bargeInTimer);
      this.bargeInTimer = null;
    }
  }

  private handleSpeechStart(): void {
    if (this.muted) return;
    // Speech in the post-playback echo tail is residual speaker bleed — drop it.
    this.utteranceIsEcho = Date.now() < this.echoTailUntil;
    this.liveTranscript = '';
    if (this.utteranceIsEcho) return;
    // Start capturing right away so a genuine utterance's opening words aren't lost — but DON'T
    // decide barge-in here (see onSpeechRealStart). A bleed blip that never becomes real speech is
    // cleaned up by onVADMisfire.
    try {
      this.rec?.start();
    } catch {
      /* already running */
    }
    this.emitState({ phase: 'listening' });
  }

  /** Fires only after minSpeechFrames of sustained speech — so this is a real onset, not a plosive
   *  of TTS bleed. If Mavéa is mid-answer, THIS is the confirmed barge-in. */
  private handleSpeechRealStart(): void {
    if (this.muted || this.utteranceIsEcho) return;
    if (this.maveaSpeaking) this.onBargeIn?.();
  }

  /** A speech segment too short to clear minSpeechFrames ended as a misfire (no onSpeechEnd). Stop
   *  the recognizer and settle back to idle so a quick blip doesn't strand the mic in 'listening'. */
  private handleMisfire(): void {
    this.clearBargeInTimer();
    try {
      this.rec?.stop();
    } catch {
      /* not running */
    }
    this.utteranceIsEcho = false;
    this.liveTranscript = '';
    if (this.phase !== 'idle') this.emitState({ phase: 'idle' });
  }

  private async handleSpeechEnd(audio: Float32Array): Promise<void> {
    this.clearBargeInTimer();
    try {
      this.rec?.stop();
    } catch {
      /* not running */
    }

    // Drop the whole utterance if it started during Mavéa's playback — it's TTS echo, not the
    // user. We skip transcription entirely (no wasted /stt round-trip) and settle quietly back
    // to listening so the always-on mic keeps running for the user's actual next turn.
    if (this.utteranceIsEcho) {
      this.utteranceIsEcho = false;
      this.liveTranscript = '';
      this.emitState({ phase: 'idle' });
      return;
    }

    const transcript = (await this.transcribeWhisper(audio)) || this.liveTranscript;
    const text = transcript.trim();

    if (text) {
      this.emitState({ phase: 'heard', transcript: text });
      this.emitResult({ transcript: text });
    }
    this.liveTranscript = '';
    this.emitState({ phase: 'idle' });
  }

  private async transcribeWhisper(audio: Float32Array): Promise<string> {
    if (this.whisperOk === false) return '';
    try {
      const wav = floatToWav(audio, 16000);
      const fd = new FormData();
      fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
      fd.append('model', 'whisper-1');
      fd.append('language', 'en');
      // Until we know Whisper is up, give it only a SHORT window so a missing /stt service
      // can't stall the turn (this was the ~10s "it just turns off" hang) — we fall straight
      // back to the browser transcript. Once Whisper has answered once, allow a longer window
      // for genuinely long utterances.
      const timeoutMs = this.whisperOk === true ? 12_000 : 3_500;
      const res = await fetch('/stt/v1/audio/transcriptions', {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        const text = json.text?.trim() ?? '';
        if (text) {
          if (this.whisperOk === null) this.whisperOk = true;
          return text;
        }
      }
    } catch (err) {
      // A timeout means the service is just slow to wake — likely a cold start. Don't condemn
      // the whole session over it: leave whisperOk untouched so the next utterance probes again
      // instead of silently downgrading to WebSpeech for good. AbortSignal.timeout() rejects with
      // a TimeoutError; a bare abort would be AbortError — treat either as "slow, retry". A
      // definitive failure (HTTP error, connection refused) falls through to the disable below.
      if (
        err instanceof DOMException &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        return '';
      }
    }
    if (this.whisperOk === null) this.whisperOk = false;
    return '';
  }

  private emitResult(r: VoiceResult): void {
    this.resultSubs.forEach((cb) => cb(r));
  }

  private emitState(e: VoiceStateEvent): void {
    this.phase = e.phase;
    this.stateSubs.forEach((cb) => cb(e));
  }
}
