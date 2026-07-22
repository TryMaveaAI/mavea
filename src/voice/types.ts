// The VoiceController contract. WebSpeechVoice and VadVoice satisfy this single interface.
// A controller never touches presence — it only emits results (user said X) and state
// changes (listening / heard / speaking); the surface maps those to the face, so one place,
// and only one, owns the presence.

export type VoiceMode = 'webspeech' | 'vad';

export interface VoiceCapabilities {
  /** SpeechRecognition present. */
  stt: boolean;
  /** speechSynthesis present. */
  tts: boolean;
  /** stt && tts — gates the Real Voice toggle. */
  canUseRealVoice: boolean;
}

/** What the controller is doing right now — orchestrator maps these to presence. */
export type VoicePhase =
  | 'idle'
  | 'listening' // mic open / sim "Listening…"
  | 'heard' // transcript captured, about to route
  | 'speaking'; // TTS / sim narration in flight

export interface VoiceResult {
  /** What the user said (shown as `heard`; the surface runs it as a turn). */
  transcript: string;
}

export type VoiceError = 'no-speech' | 'not-allowed' | 'audio' | 'unsupported' | 'aborted';

export interface VoiceStateEvent {
  phase: VoicePhase;
  /** For "heard" (and interim "listening" in webspeech). */
  transcript?: string;
  error?: VoiceError;
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
   * controllers that don't run a continuous mic (simulated, tap-to-talk webspeech) ignore it.
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
