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
import { floatToWavChunked } from './encodeWav';
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

/** Silero v5 hands over 512-sample frames of 16kHz mono — 32ms of audio each. */
const FRAME_SAMPLES = 512;
const SAMPLE_RATE = 16_000;
const FRAME_MS = (FRAME_SAMPLES / SAMPLE_RATE) * 1000;
const PRE_ROLL_FRAMES = 12;
const MAX_UTTERANCE_FRAMES = Math.ceil((90 * SAMPLE_RATE) / FRAME_SAMPLES);
const MAX_PENDING_TRANSCRIPTIONS = 3;
/** whisper.cpp runs its own thread pool, so a second utterance overlaps usefully with the one
 *  ahead of it instead of waiting out its whole round-trip; a third only queues inside the
 *  service, where we can no longer see or cancel it. Results are still DELIVERED in the order
 *  they were captured (see enqueueTranscription). */
const MAX_CONCURRENT_TRANSCRIPTIONS = 2;

// The VAD's own speech thresholds, shared with the provisional end-of-speech signal below so the
// two can never disagree about what counts as speech.
const POSITIVE_SPEECH_THRESHOLD = 0.5;
const NEGATIVE_SPEECH_THRESHOLD = 0.35;
/** How much quiet is enough to SAY the utterance looks finished. The VAD needs `redemptionMs`
 *  (1600) of it before it closes the utterance and transcription can start — 1.6 s in which the
 *  old surface showed nothing at all, because every listening indicator is keyed off a phase that
 *  had not changed yet. This much quiet is already a confident guess, and a cheap one to get
 *  wrong: the signal is visual, and speech resuming takes it back. */
const PROVISIONAL_END_MS = 300;
const PROVISIONAL_END_FRAMES = Math.round(PROVISIONAL_END_MS / FRAME_MS);

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

/** How long one utterance's transcription may take, given whether /stt has answered before in this
 *  session. The first window used to be 3.5s — meant to keep a MISSING service from stalling the
 *  turn, but a missing service doesn't stall: the fetch rejects in milliseconds (connection
 *  refused, or the dev proxy's own error). What 3.5s actually excluded was a service that works
 *  slowly. whisper.cpp on a CPU box takes 15-17s to return one second of audio, so every utterance
 *  timed out and the user was told transcription was "still starting or unavailable" — with the
 *  transcriber running the whole time. The first window is now longer than a real local model
 *  needs; a proven one gets longer still, for genuinely long utterances. */
export function whisperWindowMs(provenWorking: boolean): number {
  return provenWorking ? 45_000 : 25_000;
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
  // One controller per in-flight transcription (up to MAX_CONCURRENT_TRANSCRIPTIONS of them), so
  // stopping the mic still cancels every round-trip and not just the most recent one.
  private transcriptionAborts = new Set<AbortController>();
  private transcriptionChain: Promise<void> = Promise.resolve();
  private queuedTranscriptions = 0;
  private activeTranscriptions = 0;
  private transcriptionSlotWaiters: (() => void)[] = [];
  private preRollFrames: Float32Array[] = [];
  private utteranceFrames: Float32Array[] = [];
  // Consecutive frames whose speech probability sat below the VAD's negative threshold, counted
  // exactly the way the VAD counts its own redemption frames (see trackSpeechTail).
  private quietFrames = 0;
  private speechEnding = false;
  // vad-web builds its own AudioContext when none is handed to it, and frees it only in destroy()
  // — so a paused mic left a second real-time audio thread running for the rest of the session.
  // We pass ours instead: suspended between listens, closed on dispose.
  private captureCtx: AudioContext | null = null;

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

  /** A HEAD on /stt answers in milliseconds whether the service EXISTS. Availability and speed are
   *  different questions, and conflating them is what made a working transcriber report itself
   *  missing: the first inference was given 3.5s to prove the service was there, but whisper.cpp on
   *  a CPU box takes 15s+ to return one second of audio, so it timed out every single time and the
   *  user was told to "try again in a moment" forever. Ask about existence cheaply; then give the
   *  actual transcription the room it needs. */
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
    this.abortTranscriptions();
    // vad-web's pause() fully releases the hardware, not just its own processing: its default
    // pauseStream() stops every MediaStream track, which is what actually turns off the OS
    // "microphone in use" indicator. start()/resumeStream() re-acquires a fresh stream on
    // return, so muting genuinely frees the mic rather than merely idling in the background.
    this.pauseVad();
    this.clearBargeInTimer();
    this.clearSpeechEnding();
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
      // Say so. A send-tap during the transcription gap used to emit NOTHING, so the surface had
      // no event to react to and the tap read as a dead button; re-stating the phase is the whole
      // truth of what is happening (still transcribing, mic now closed).
      this.emitState({ phase: 'transcribing' });
      return;
    }
    const resumeAfter = this.continuous;
    this.wantRunning = resumeAfter;
    this.pauseVad();
    this.clearBargeInTimer();
    this.clearSpeechEnding();
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
    this.abortTranscriptions();
    this.releaseWaitingTranscriptions();
    this.clearBargeInTimer();
    const closeCapture = this.takeCaptureContextCloser();
    if (this.vad) {
      // Swallow the throw: vad-web's destroy() reads its audio instances first and rejects if the
      // instance is still initializing. loadVad's disposed-check below is what actually reclaims a
      // still-loading instance; here we just release the one we already hold.
      // The capture context is ours, so vad-web never closes it — do it after destroy() has let go
      // of its worklet, or the teardown it runs would be talking to a closed context.
      void this.vad
        .destroy()
        .catch(() => {})
        .then(closeCapture);
      this.vad = null;
    } else {
      closeCapture();
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
      const audioContext = this.ensureCaptureContext();
      this.vad = await MicVAD.new({
        model: 'v5',
        startOnLoad: false,
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        // Ours, not vad-web's: it only frees a context it created in destroy(), so a session that
        // toggles the mic off keeps a 48 kHz audio thread alive until the tab closes.
        ...(audioContext ? { audioContext } : {}),
        // vad-web's default getStream already opens the mic with echoCancellation +
        // noiseSuppression + autoGainControl on (see getDefaultRealTimeVADOptions), so browser
        // AEC removes most of Mavéa's TTS bleed at the source. The per-utterance echo gate
        // (maveaSpeaking) is the backstop for the residual it doesn't catch.
        // A conservative onset rejects steady room noise; the separate lower negative threshold
        // adds hysteresis so a real voice does not flicker off mid-word. Short acknowledgements
        // still clear the real-speech gate, and pre-roll preserves their opening consonant.
        positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD,
        negativeSpeechThreshold: NEGATIVE_SPEECH_THRESHOLD,
        minSpeechMs: 280,
        preSpeechPadMs: 500,
        redemptionMs: 1600,
        onFrameProcessed: (probabilities, frame) => {
          this.captureFrame(frame);
          this.trackSpeechTail(probabilities.isSpeech);
        },
        onSpeechStart: () => this.handleSpeechStart(),
        // Barge-in fires HERE, not on onSpeechStart. onSpeechStart trips on the very first frame
        // above threshold — a single ~32 ms plosive of TTS bleed does it — and the old wall-clock
        // confirm timer never helped because onSpeechEnd (which would cancel it) can't fire until
        // redemptionMs (1600 ms) of silence, long after the 300 ms timer already cancelled Mavéa.
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
        const closeCapture = this.takeCaptureContextCloser();
        void this.vad
          .destroy()
          .catch(() => {})
          .then(closeCapture);
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

  /** The capture context, created on first use. Never throws: a browser without WebAudio simply
   *  gets no `audioContext` option and vad-web falls back to owning one, exactly as before. */
  private ensureCaptureContext(): AudioContext | null {
    if (this.captureCtx || this.disposed) return this.captureCtx;
    if (typeof AudioContext !== 'function') return null;
    try {
      this.captureCtx = new AudioContext();
    } catch {
      this.captureCtx = null;
    }
    return this.captureCtx;
  }

  /** Hand ownership of the capture context to the caller's teardown, so it is closed exactly once
   *  no matter which disposal path got there first. */
  private takeCaptureContextCloser(): () => void {
    const ctx = this.captureCtx;
    this.captureCtx = null;
    return () => {
      // A context closed twice (or closed while still initializing) rejects; that is not a failure
      // worth surfacing — the resource is gone either way.
      void ctx?.close().catch(() => {});
    };
  }

  private startVad(): void {
    if (!this.vad) return;
    // Resume BEFORE start() rather than awaiting it: the mic stream and worklet connect happily to
    // a suspended context, so ordering costs nothing, while awaiting would delay the very
    // hardware acquisition the user just asked for.
    if (this.captureCtx?.state === 'suspended') void this.captureCtx.resume().catch(() => {});
    void Promise.resolve(this.vad.start()).catch((error: unknown) => {
      if (!this.disposed && this.wantRunning) {
        this.wantRunning = false;
        this.emitState({ phase: 'idle', error: microphoneError(error) });
      }
    });
  }

  private pauseVad(): void {
    if (!this.vad) return;
    void Promise.resolve(this.vad.pause())
      .catch(() => {})
      .then(() => this.suspendCaptureContext());
  }

  /** Park the capture context while the mic is closed — a suspended context has no audio thread.
   *  Kept off the hot path of a re-arm: a start() that raced the pause leaves wantRunning true,
   *  and suspending under it would silence the mic that is coming back. */
  private suspendCaptureContext(): void {
    if (this.wantRunning || this.disposed) return;
    if (this.captureCtx?.state !== 'running') return;
    void this.captureCtx.suspend().catch(() => {});
  }

  private captureFrame(frame: Float32Array): void {
    // Retained WITHOUT a defensive copy: both vad-web capture paths hand over a buffer that is
    // freshly allocated per frame (the worklet path builds `new Float32Array(data.data)`; the
    // ScriptProcessor path allocates inside its resampler), so nothing upstream reuses it. The
    // copy was ~2KB of pure GC churn ~31×/s the whole time the mic is open. Re-verify those two
    // paths on any vad-web upgrade before trusting this again.
    if (this.phase === 'listening' && !this.utteranceIsEcho) {
      if (this.utteranceFrames.length < MAX_UTTERANCE_FRAMES) this.utteranceFrames.push(frame);
      return;
    }
    this.preRollFrames.push(frame);
    if (this.preRollFrames.length > PRE_ROLL_FRAMES) this.preRollFrames.shift();
  }

  /**
   * Watch the tail of a live utterance so the surface can show "transcribing" as soon as the user
   * has plainly stopped, instead of waiting out the VAD's 1.6 s redemption window with three
   * indicators unmounted and nothing in their place. Counted exactly the way vad-web's frame
   * processor counts its own redemption frames — reset by a frame above the POSITIVE threshold,
   * advanced by one below the NEGATIVE one, held in between — so this signal can never claim the
   * utterance is ending while the VAD still hears speech.
   *
   * Visual only. It never touches the frame buffers, the phase, or when transcription starts.
   */
  private trackSpeechTail(isSpeech: number): void {
    if (this.phase !== 'listening' || this.utteranceIsEcho) return;
    if (isSpeech >= POSITIVE_SPEECH_THRESHOLD) {
      this.quietFrames = 0;
      if (this.speechEnding) {
        // A mid-thought pause, not the end of the turn — take the guess back.
        this.speechEnding = false;
        this.emitState({ phase: 'listening', speechEnding: false });
      }
      return;
    }
    if (isSpeech >= NEGATIVE_SPEECH_THRESHOLD || this.speechEnding) return;
    this.quietFrames += 1;
    if (this.quietFrames < PROVISIONAL_END_FRAMES) return;
    this.speechEnding = true;
    this.emitState({ phase: 'listening', speechEnding: true });
  }

  /** Forget the provisional guess. Silent by design: every caller is about to emit the phase
   *  change that supersedes it. */
  private clearSpeechEnding(): void {
    this.quietFrames = 0;
    this.speechEnding = false;
  }

  private handleSpeechStart(): void {
    if (this.muted) return;
    this.clearSpeechEnding();
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
    this.clearSpeechEnding();
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
    this.clearSpeechEnding();
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
    // Two things are being scheduled here, and they are deliberately different. The round-trip
    // STARTS now (bounded to MAX_CONCURRENT_TRANSCRIPTIONS by the slot gate), because whisper.cpp
    // can work on two utterances at once. The RESULT is delivered through the chain, strictly in
    // the order the utterances were captured — a short second sentence that transcribes faster
    // than the long first one must not reach the surface first and reorder the user's words.
    const pending = this.runTranscription(audio, sessionId);
    this.transcriptionChain = this.transcriptionChain
      .catch(() => {})
      .then(async () => {
        try {
          this.deliverTranscription(await pending, sessionId, resumeAfter);
        } finally {
          this.queuedTranscriptions -= 1;
        }
      });
  }

  /** Run one transcription, holding a concurrency slot for the whole round-trip. Never rejects;
   *  null means the result is no longer wanted (disposed, aborted, or a newer session owns the
   *  mic), which is exactly the case where the surface must hear nothing at all. */
  private async runTranscription(
    audio: Float32Array,
    sessionId: number,
  ): Promise<WhisperTranscript | null> {
    await this.acquireTranscriptionSlot();
    const ctrl = new AbortController();
    this.transcriptionAborts.add(ctrl);
    try {
      if (this.disposed || sessionId !== this.sessionId) return null;
      const transcript = await this.transcribeWhisper(audio, ctrl.signal);
      if (this.disposed || ctrl.signal.aborted || sessionId !== this.sessionId) return null;
      return transcript;
    } catch {
      // transcribeWhisperDetailed already swallows its own network failures; anything that still
      // escapes (a WAV encode that could not run) is "no transcript" as far as the surface goes.
      return null;
    } finally {
      this.transcriptionAborts.delete(ctrl);
      this.releaseTranscriptionSlot();
    }
  }

  private deliverTranscription(
    transcript: WhisperTranscript | null,
    sessionId: number,
    resumeAfter: boolean,
  ): void {
    // Re-checked here, not only where the fetch resolved: waiting for the utterance ahead of this
    // one is time in which the user can stop the mic or start a new session.
    if (!transcript || this.disposed || sessionId !== this.sessionId) return;
    const text = transcript.text.trim();
    if (!text) {
      this.emitState({ phase: 'idle', error: transcript.error ?? 'no-speech' });
      if (resumeAfter && this.wantRunning) this.startVad();
      return;
    }
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
    this.emitState({ phase: 'idle' });
    if (resumeAfter && this.wantRunning) this.startVad();
  }

  private acquireTranscriptionSlot(): Promise<void> {
    if (this.activeTranscriptions < MAX_CONCURRENT_TRANSCRIPTIONS) {
      this.activeTranscriptions += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.transcriptionSlotWaiters.push(resolve));
  }

  private releaseTranscriptionSlot(): void {
    // Hand the slot straight to whoever is waiting; the count only drops when nobody is.
    const next = this.transcriptionSlotWaiters.shift();
    if (next) next();
    else this.activeTranscriptions -= 1;
  }

  /** Wake every waiting transcription so it can settle. Without this, disposal would strand its
   *  promise — and with it the delivery chain and the captured audio it closes over — forever. */
  private releaseWaitingTranscriptions(): void {
    const waiters = this.transcriptionSlotWaiters.splice(0);
    this.activeTranscriptions += waiters.length; // each now holds a slot; its release balances it
    waiters.forEach((resolve) => resolve());
  }

  private abortTranscriptions(): void {
    for (const ctrl of this.transcriptionAborts) ctrl.abort();
    this.transcriptionAborts.clear();
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
      // Encoded across frames: this runs at the exact moment the surface flips to "transcribing",
      // and a long utterance is ~1.5M samples of Float32 → Int16 conversion.
      const wav = await floatToWavChunked(audio, SAMPLE_RATE);
      const fd = new FormData();
      fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
      fd.append('language', 'en');
      fd.append('response_format', 'verbose_json');
      // A missing /stt service must not stall the turn (the old ~10s "it just turns off" hang),
      // but a SLOW one must not be mistaken for a missing one. Settle that with a cheap ping
      // before committing to a window: reachable → give the transcription real time; silent →
      // keep the short leash that fails fast and says so.
      const timeoutMs = whisperWindowMs(this.whisperOk === true);
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
