// The VoiceController contract for local microphone capture and transcription.
// A controller never touches presence — it only emits results (user said X) and state
// changes (listening / heard / speaking); the surface maps those to the face, so one place,
// and only one, owns the presence.

export type VoiceMode = 'vad';

export interface VoiceCapabilities {
  /** Local microphone capture is available. */
  stt: boolean;
  /** Reserved for controllers that own narration output. */
  tts: boolean;
  /** Whether this controller can expose a live microphone voice. */
  canUseRealVoice: boolean;
}

/** What the controller is doing right now — orchestrator maps these to presence. */
export type VoicePhase =
  | 'idle'
  | 'listening' // mic open / sim "Listening…"
  | 'transcribing' // speech ended; local STT is resolving the captured audio
  | 'heard' // transcript captured, about to route
  | 'speaking'; // TTS / sim narration in flight

export interface VoiceResult {
  /** What the user said (shown as `heard`; the surface runs it as a turn). */
  transcript: string;
  /** Mean word confidence when the local recognizer provides it. */
  confidence?: number;
  /** The recognizer's estimate that the segment contained no speech. */
  noSpeechProbability?: number;
  /** Low-confidence speech is preserved as an editable draft instead of auto-submitted. */
  lowConfidence?: boolean;
}

export type VoiceError =
  'no-speech' | 'not-allowed' | 'audio' | 'unsupported' | 'transcription' | 'aborted';

export interface VoiceStateEvent {
  phase: VoicePhase;
  /** For "heard" or an optional local interim transcript. */
  transcript?: string;
  error?: VoiceError;
  /**
   * Provisional end-of-speech, emitted while the phase is still `listening`: the speech
   * probability has been below the VAD's own negative threshold long enough that the utterance is
   * almost certainly over, but the VAD will not CLOSE it (and transcription will not start) until
   * its full redemption window elapses ~1.3 s later. A surface can flip to its transcribing
   * treatment on the `true` and unwind on the `false` that follows if the user simply paused
   * mid-thought. Visual only: nothing about what is captured, when it is sent, or what is
   * transcribed depends on this.
   */
  speechEnding?: boolean;
}

export interface SpeakOptions {
  /** The text to voice (same string given to setCaption). */
  caption: string;
  /** Optional caption karaoke sync. */
  onBoundary?: (charIndex: number) => void;
}

/** Context handed to start() so the controller can adapt to where the surface is. */
export interface VoiceStartContext {
  /** True once a canvas is up (a mid-conversation listen, not a first ask). */
  inCanvas: boolean;
  /** Re-arm after an explicit finish; used only by an unpaused Always-on session. */
  continuous?: boolean;
}

export interface VoiceController {
  readonly mode: VoiceMode;
  readonly capabilities: VoiceCapabilities;

  /** Begin a listen turn. */
  start(ctx?: VoiceStartContext): void;
  /** User pressed mic again / cancel listen. */
  stop(): void;
  /** Narrate; resolves when done/cancelled. */
  speak(opts: SpeakOptions): Promise<void>;
  /** Hard-stop TTS + STT (user interrupt). */
  cancel(): void;
  setMuted(muted: boolean): void;
  /** Gates TTS audio (ctrl.sound). */
  setSoundEnabled(enabled: boolean): void;
  /**
   * Tell the controller that Mavéa is (or is no longer) speaking its answer aloud. An
   * always-on controller uses this to suppress its own TTS echo: while true, the mic stays
   * live (so the user can still barge in), but speech that begins inside the TTS playback
   * is treated as echo and dropped rather than submitted as a new user turn. Optional —
   * controllers that don't run a continuous mic ignore it.
   */
  setMaveaSpeaking?(speaking: boolean): void;
  /**
   * Immediately stop recording and submit whatever was captured so far — used by
   * press-and-hold (PTT) mic: user releases the button and the partial utterance is
   * sent without waiting for the normal end-of-speech timer. Optional — simulated
   * voice and controllers without a live buffer can omit it.
   */
  forceStop?(): void;

  /** Returns an unsubscribe. */
  onResult(cb: (r: VoiceResult) => void): () => void;
  /** Returns an unsubscribe. */
  onStateChange(cb: (e: VoiceStateEvent) => void): () => void;

  dispose(): void;
}
