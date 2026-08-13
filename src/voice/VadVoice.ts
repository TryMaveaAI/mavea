// VadVoice: the "Always on" voice controller.
//
// Uses Silero VAD (via @ricky0123/vad-web, WASM) for accurate speech boundary
// detection — it understands the difference between a mid-sentence breath and a
// genuine end-of-thought, something no timer-based approach can do reliably.
//
// Transcription stack: Whisper via /stt (the optional local whisper.cpp server). On speech-end,
// the raw Float32 audio is encoded to WAV and sent to the local service. Browser-vendor speech
// recognition is deliberately not used because its processing and terms are not portable.
//
// The first start() call lazy-loads the WASM model (~2 s on first boot, instant
// after). The always-on lifecycle is controlled by LiveApp (start on toggle/turn-
// end, stop when Mavéa is responding).
import { floatToWav } from './encodeWav';
import type {
  SpeakOptions,
  VoiceCapabilities,
  VoiceController,
  VoiceError,
  VoiceMode,
  VoicePhase,
  VoiceResult,
  VoiceStartContext,
  VoiceStateEvent,
} from './types';

// Lazy type — only resolved after the dynamic import succeeds.
type MicVAD = import('@ricky0123/vad-web').MicVAD;

const PRE_ROLL_FRAMES = 12;
const MAX_UTTERANCE_FRAMES = Math.ceil((90 * 16_000) / 512);
const MAX_PENDING_TRANSCRIPTIONS = 3;

function joinFrames(frames: Float32Array[]): Float32Array {
  const length = frames.reduce((sum, frame) => sum + frame.length, 0);
  const audio = new Float32Array(length);
  let offset = 0;
  for (const frame of frames) {
    audio.set(frame, offset);
    offset += frame.length;
  }
  return audio;
}

interface WhisperTranscript {
  text: string;
  confidence?: number;
  noSpeechProbability?: number;
  error?: Extract<VoiceError, 'no-speech' | 'transcription'>;
}

function microphoneError(error: unknown): VoiceError {
  const name =
    error && typeof error === 'object' && 'name' in error ? String(error.name) : undefined;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : 'audio';
}

export class VadVoice implements VoiceController {
  readonly mode: VoiceMode = 'vad';
  readonly capabilities: VoiceCapabilities;

  private vad: MicVAD | null = null;
  private vadLoading = false;
  private vadFailed = false;
  private phase: VoicePhase = 'idle';
  private muted = false;
  private wantRunning = false;
  private continuous = false;
  // Set once dispose() runs. If disposal races an in-flight MicVAD.new()/start() (the mic is being
  // acquired), the instance would otherwise be assigned AFTER we let go of it — an orphaned mic +
  // AudioContext with the OS "mic in use" indicator stuck on. loadVad checks this and tears down.
  private disposed = false;
  private sessionId = 0;
  private transcriptionAbort: AbortController | null = null;
  private transcriptionChain: Promise<void> = Promise.resolve();
  private queuedTranscriptions = 0;
  private preRollFrames: Float32Array[] = [];
  private utteranceFrames: Float32Array[] = [];

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
  // reverb/last-word tail and the gap before Kokoro fully releases the speakers.
  private static readonly ECHO_TAIL_MS = 600;

  // How long a failed transcription keeps /stt quiet before the next utterance may try again.
  // Short enough that a service which was merely starting up recovers within a retry or two,
  // long enough that a service that isn't installed costs one request per window, not per word.
  private static readonly WHISPER_RETRY_MS = 10_000;

  // null = not probed yet; false = the last attempt failed; true = working.
  private whisperOk: boolean | null = null;
  // A failure suppresses further /stt round-trips only until this moment. The copy the user sees
  // promises "try again in a moment", and whisper.cpp is commonly still booting on the first
  // utterance of a session — condemning the mic for the WHOLE session made that promise a lie.
  private whisperRetryAt = 0;

  private resultSubs = new Set<(r: VoiceResult) => void>();
  private stateSubs = new Set<(e: VoiceStateEvent) => void>();

  constructor() {
    const stt =
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function';
    this.capabilities = { stt, tts: false, canUseRealVoice: stt };
  }

  start(ctx?: VoiceStartContext): void {
    if (this.muted) return;
    if (ctx?.continuous !== undefined) this.continuous = ctx.continuous;
    if (!this.wantRunning) this.sessionId += 1;
    this.wantRunning = true;

    if (this.vadFailed) {
      this.emitState({ phase: 'idle', error: 'unsupported' });
      return;
    }

    if (this.vad) {
      this.startVad();
    } else {
      void this.loadVad();
    }
  }

  stop(): void {
    this.wantRunning = false;
    this.continuous = false;
    this.sessionId += 1;
    this.transcriptionAbort?.abort();
    this.transcriptionAbort = null;
    // vad-web's pause() fully releases the hardware, not just its own processing: its default
    // pauseStream() stops every MediaStream track, which is what actually turns off the OS
    // "microphone in use" indicator. start()/resumeStream() re-acquires a fresh stream on
    // return, so muting genuinely frees the mic rather than merely idling in the background.
    this.pauseVad();
    this.clearBargeInTimer();
    this.preRollFrames = [];
    this.utteranceFrames = [];
    if (this.phase !== 'idle') this.emitState({ phase: 'idle' });
  }

  forceStop(): void {
    // An explicit finish can land after VAD closed the utterance but while whisper.cpp is still
    // resolving it. Release the mic without aborting that in-flight transcript; its result remains
    // the user's final words and will settle normally.
    if (this.phase === 'transcribing') {
      this.continuous = false;
      this.wantRunning = false;
      this.pauseVad();
      return;
    }
    const resumeAfter = this.continuous;
    this.wantRunning = resumeAfter;
    this.pauseVad();
    this.clearBargeInTimer();
    // Include the rolling pre-roll so releasing Hold after a very short word still sends it even
    // when that word ended before VAD's sustained-speech callback fired.
    const audio = joinFrames([...this.utteranceFrames, ...this.preRollFrames]);
    this.preRollFrames = [];
    this.utteranceFrames = [];
    this.utteranceIsEcho = false;
    if (audio.length > 0) {
      this.emitState({ phase: 'transcribing' });
      this.enqueueTranscription(audio, this.sessionId, resumeAfter);
    } else {
      this.emitState({ phase: 'idle' });
      if (resumeAfter) this.startVad();
    }
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
    this.sessionId += 1;
    this.transcriptionAbort?.abort();
    this.transcriptionAbort = null;
    this.clearBargeInTimer();
    if (this.vad) {
      // Swallow the throw: vad-web's destroy() reads its audio instances first and rejects if the
      // instance is still initializing. loadVad's disposed-check below is what actually reclaims a
      // still-loading instance; here we just release the one we already hold.
      void this.vad.destroy().catch(() => {});
      this.vad = null;
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
        // A conservative onset rejects steady room noise; the separate lower negative threshold
        // adds hysteresis so a real voice does not flicker off mid-word. Short acknowledgements
        // still clear the real-speech gate, and pre-roll preserves their opening consonant.
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        minSpeechMs: 280,
        preSpeechPadMs: 500,
        redemptionMs: 1600,
        onFrameProcessed: (_probabilities, frame) => this.captureFrame(frame),
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
      if (this.wantRunning) this.startVad();
    } catch (err) {
      console.warn('[VadVoice] Local Silero VAD failed to load', err);
      this.vadLoading = false;
      this.vadFailed = true;
      if (this.wantRunning) this.emitState({ phase: 'idle', error: 'unsupported' });
    }
  }

  private clearBargeInTimer(): void {
    if (this.bargeInTimer !== null) {
      clearTimeout(this.bargeInTimer);
      this.bargeInTimer = null;
    }
  }

  private startVad(): void {
    if (!this.vad) return;
    void Promise.resolve(this.vad.start()).catch((error: unknown) => {
      if (!this.disposed && this.wantRunning) {
        this.wantRunning = false;
        this.emitState({ phase: 'idle', error: microphoneError(error) });
      }
    });
  }

  private pauseVad(): void {
    if (!this.vad) return;
    void Promise.resolve(this.vad.pause()).catch(() => {});
  }

  private captureFrame(frame: Float32Array): void {
    const copy = frame.slice();
    if (this.phase === 'listening' && !this.utteranceIsEcho) {
      if (this.utteranceFrames.length < MAX_UTTERANCE_FRAMES) this.utteranceFrames.push(copy);
      return;
    }
    this.preRollFrames.push(copy);
    if (this.preRollFrames.length > PRE_ROLL_FRAMES) this.preRollFrames.shift();
  }

  private handleSpeechStart(): void {
    if (this.muted) return;
    // Speech in the post-playback echo tail is residual speaker bleed — drop it.
    this.utteranceIsEcho = Date.now() < this.echoTailUntil;
    this.utteranceFrames = this.preRollFrames;
    this.preRollFrames = [];
    if (this.utteranceIsEcho) return;
    // Start capturing right away so a genuine utterance's opening words aren't lost — but DON'T
    // decide barge-in here (see onSpeechRealStart). A bleed blip that never becomes real speech is
    // cleaned up by onVADMisfire.
    this.emitState({ phase: 'listening' });
  }

  /** Fires only after minSpeechFrames of sustained speech — so this is a real onset, not a plosive
   *  of TTS bleed. If Mavéa is mid-answer, THIS is the confirmed barge-in. */
  private handleSpeechRealStart(): void {
    if (this.muted) return;
    // Once VAD confirms sustained speech after playback, treat it as a fast user reply rather
    // than letting the conservative echo tail swallow their opening words.
    if (this.utteranceIsEcho && !this.maveaSpeaking) {
      this.utteranceIsEcho = false;
      this.utteranceFrames = [...this.utteranceFrames, ...this.preRollFrames];
      this.preRollFrames = [];
      this.emitState({ phase: 'listening' });
    }
    if (this.utteranceIsEcho) return;
    if (this.maveaSpeaking) this.onBargeIn?.();
  }

  /** A speech segment too short to clear minSpeechFrames ended as a misfire (no onSpeechEnd). Stop
   *  the recognizer and settle back to idle so a quick blip doesn't strand the mic in 'listening'. */
  private handleMisfire(): void {
    this.clearBargeInTimer();
    this.utteranceIsEcho = false;
    this.utteranceFrames = [];
    // Tap/Hold own one attempt. A too-short noise must release their stream too; otherwise the UI
    // returns to idle while the hardware keeps listening and a later utterance submits by surprise.
    if (!this.continuous) {
      this.wantRunning = false;
      this.pauseVad();
    }
    if (this.phase !== 'idle') this.emitState({ phase: 'idle' });
  }

  private handleSpeechEnd(audio: Float32Array): void {
    this.clearBargeInTimer();
    // Drop the whole utterance if it started during Mavéa's playback — it's TTS echo, not the
    // user. We skip transcription entirely (no wasted /stt round-trip) and settle quietly back
    // to listening so the always-on mic keeps running for the user's actual next turn.
    if (this.utteranceIsEcho) {
      this.utteranceIsEcho = false;
      this.utteranceFrames = [];
      this.emitState({ phase: 'idle' });
      return;
    }

    this.utteranceFrames = [];
    // VadVoice is also the cross-browser Tap/Hold fallback. Those modes own exactly one utterance;
    // only an explicit continuous session may leave the capture hardware armed after speech ends.
    if (!this.continuous) {
      this.wantRunning = false;
      this.pauseVad();
    }
    this.emitState({ phase: 'transcribing' });
    this.enqueueTranscription(audio, this.sessionId);
  }

  private enqueueTranscription(audio: Float32Array, sessionId: number, resumeAfter = false): void {
    // Keep background noise or a slow local model from building an unbounded promise/audio queue.
    // Saturation is surfaced instead of retaining unbounded audio or handing it to another engine.
    if (this.queuedTranscriptions >= MAX_PENDING_TRANSCRIPTIONS) {
      this.emitState({ phase: 'idle', error: 'audio' });
      if (resumeAfter && this.wantRunning) this.startVad();
      return;
    }

    this.queuedTranscriptions += 1;
    this.transcriptionChain = this.transcriptionChain
      .catch(() => {})
      .then(async () => {
        try {
          if (this.disposed || sessionId !== this.sessionId) return;
          const ctrl = new AbortController();
          this.transcriptionAbort = ctrl;
          const transcript = await this.transcribeWhisper(audio, ctrl.signal);
          if (this.transcriptionAbort === ctrl) this.transcriptionAbort = null;
          if (this.disposed || ctrl.signal.aborted || sessionId !== this.sessionId) return;
          const text = transcript.text.trim();
          if (text) {
            const lowConfidence =
              (transcript.confidence !== undefined && transcript.confidence < 0.7) ||
              (transcript.noSpeechProbability ?? 0) >= 0.6;
            this.emitState({ phase: 'heard', transcript: text });
            this.emitResult({
              transcript: text,
              confidence: transcript.confidence,
              noSpeechProbability: transcript.noSpeechProbability,
              lowConfidence,
            });
          } else {
            this.emitState({ phase: 'idle', error: transcript.error ?? 'no-speech' });
            if (resumeAfter && this.wantRunning) this.startVad();
            return;
          }
          this.emitState({ phase: 'idle' });
          if (resumeAfter && this.wantRunning) this.startVad();
        } finally {
          this.queuedTranscriptions -= 1;
        }
      });
  }

  private async transcribeWhisper(audio: Float32Array): Promise<string>;
  private async transcribeWhisper(
    audio: Float32Array,
    outerSignal: AbortSignal,
  ): Promise<WhisperTranscript>;
  private async transcribeWhisper(
    audio: Float32Array,
    outerSignal?: AbortSignal,
  ): Promise<string | WhisperTranscript> {
    const transcript = await this.transcribeWhisperDetailed(audio, outerSignal);
    return outerSignal ? transcript : transcript.text;
  }

  private async transcribeWhisperDetailed(
    audio: Float32Array,
    outerSignal?: AbortSignal,
  ): Promise<WhisperTranscript> {
    // Back off after a failure, don't latch: the next utterance past the window probes again, so
    // starting the service mid-session brings the mic back without a reload.
    if (this.whisperOk === false && Date.now() < this.whisperRetryAt) {
      return { text: '', error: 'transcription' };
    }
    try {
      const wav = floatToWav(audio, 16000);
      const fd = new FormData();
      fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
      fd.append('language', 'en');
      fd.append('response_format', 'verbose_json');
      // Until we know Whisper is up, give it only a SHORT window so a missing /stt service
      // can't stall the turn (this was the ~10s "it just turns off" hang). Once Whisper has
      // answered once, allow a longer window for genuinely long utterances.
      const timeoutMs = this.whisperOk === true ? 12_000 : 3_500;
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = outerSignal ? AbortSignal.any([outerSignal, timeoutSignal]) : timeoutSignal;
      const res = await fetch('/stt/inference', {
        method: 'POST',
        body: fd,
        signal,
      });
      if (res.ok) {
        const json = (await res.json()) as {
          text?: string;
          words?: { probability?: number }[];
          segments?: {
            avg_logprob?: number;
            no_speech_prob?: number;
            words?: { probability?: number }[];
          }[];
        };
        const text = json.text?.trim() ?? '';
        this.whisperOk = true;
        this.whisperRetryAt = 0;
        if (text) {
          const wordProbabilities = [
            ...(json.words ?? []),
            ...(json.segments ?? []).flatMap((segment) => segment.words ?? []),
          ]
            .map((word) => word.probability)
            .filter((probability): probability is number => Number.isFinite(probability));
          const logProbabilities = (json.segments ?? [])
            .map((segment) => segment.avg_logprob)
            .filter((probability): probability is number => Number.isFinite(probability));
          const confidence =
            wordProbabilities.length > 0
              ? wordProbabilities.reduce((sum, probability) => sum + probability, 0) /
                wordProbabilities.length
              : logProbabilities.length > 0
                ? Math.exp(
                    logProbabilities.reduce((sum, probability) => sum + probability, 0) /
                      logProbabilities.length,
                  )
                : undefined;
          const noSpeechProbabilities = (json.segments ?? [])
            .map((segment) => segment.no_speech_prob)
            .filter((probability): probability is number => Number.isFinite(probability));
          return {
            text,
            confidence,
            noSpeechProbability:
              noSpeechProbabilities.length > 0 ? Math.max(...noSpeechProbabilities) : undefined,
          };
        }
        return { text: '', error: 'no-speech' };
      }
    } catch (err) {
      // A timeout means the service is just slow to wake — likely a cold start. Don't hold even
      // the short backoff over it: leave whisperOk untouched so the very next utterance retries.
      // AbortSignal.timeout() rejects with
      // a TimeoutError; a bare abort would be AbortError — treat either as "slow, retry". A
      // definitive failure (HTTP error, connection refused) falls through to the backoff below.
      if (
        err instanceof DOMException &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        return { text: '', error: 'transcription' };
      }
    }
    // A service that has already answered once isn't condemned by a single bad response — it
    // keeps its trust (and its longer timeout) and the next utterance simply tries again. Only
    // one that has never answered backs off, and only until the retry window passes.
    if (this.whisperOk !== true) {
      this.whisperOk = false;
      this.whisperRetryAt = Date.now() + VadVoice.WHISPER_RETRY_MS;
    }
    return { text: '', error: 'transcription' };
  }

  private emitResult(r: VoiceResult): void {
    this.resultSubs.forEach((cb) => cb(r));
  }

  private emitState(e: VoiceStateEvent): void {
    this.phase = e.phase;
    this.stateSubs.forEach((cb) => cb(e));
  }
}
