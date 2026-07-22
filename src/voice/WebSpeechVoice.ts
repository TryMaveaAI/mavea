// Speech INPUT: SpeechRecognition (mic) with continuous capture + a silence grace window,
// emitting final transcripts for the surface to run exactly as it would typed text. There is
// NO browser speechSynthesis output here — Mavéa's only voice is Kokoro (see voice/tts.ts),
// so this controller's speak() is a no-op.
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

// How long to keep listening after speech goes quiet before we treat the utterance as
// finished and submit it. The browser's own end-of-speech is far too eager (it fires on a
// ~½s pause), which cut people off mid-thought and submitted a partial guess. We run
// recognition CONTINUOUSLY and finalize only after this grace window of real silence, so a
// natural thinking pause doesn't end the turn.
const END_SILENCE_MS = 2200;

// A hard ceiling on how long a tap can listen through TOTAL silence (no speech ever heard at
// all). 'no-speech' errors restart the recognizer indefinitely on their own — reasonable for a
// brief pause, but with nothing said since the tap, that loop would otherwise run forever with
// the UI stuck on "listening" and no feedback. Long enough that a slow starter isn't cut off;
// short enough that an accidental tap doesn't strand the mic open indefinitely.
const OVERALL_SILENCE_MS = 20_000;

export class WebSpeechVoice implements VoiceController {
  readonly mode: VoiceMode = 'webspeech';
  readonly capabilities: VoiceCapabilities;

  private rec: SpeechRecognition | undefined;
  private muted = false;
  private wantListening = false;
  private phase: VoicePhase = 'idle';
  // Accumulated finalized transcript for the in-progress utterance + the end-of-speech
  // grace timer. We submit only when the timer fires (real silence) or the user taps to stop.
  private finalBuf = '';
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  // The moment past which total silence gives up rather than restarting again — set on start().
  private silenceDeadline = 0;

  private resultSubs = new Set<(r: VoiceResult) => void>();
  private stateSubs = new Set<(e: VoiceStateEvent) => void>();

  constructor() {
    const SR: SpeechRecognitionStatic | undefined =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const stt = !!SR;
    const tts = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.capabilities = { stt, tts, canUseRealVoice: stt && tts };

    if (SR) {
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true;
      // Stay listening across natural pauses; WE decide when the utterance is done (after a
      // grace window of silence), instead of the browser ending on the first short pause.
      rec.continuous = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        this.finalBuf = '';
        this.emitState({ phase: 'listening' });
      };

      rec.onresult = (e: SpeechRecognitionEvent) => {
        // Rebuild the whole utterance from all segments: finalized parts accumulate, the
        // tail interim part shows live. Any speech activity resets the end-of-speech timer.
        let finalText = '';
        let interim = '';
        for (let i = 0; i < e.results.length; i++) {
          const seg = e.results[i];
          if (seg.isFinal) finalText += seg[0].transcript;
          else interim += seg[0].transcript;
        }
        this.finalBuf = finalText.trim();
        const shown = `${this.finalBuf} ${interim}`.trim();
        // Stream the running transcript into the live-listen surface — "see what you mean".
        this.emitState({ phase: 'listening', transcript: shown });
        this.armEndTimer();
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        this.clearEndTimer();
        const err = mapSpeechRecognitionError(e.error);
        if (err === 'no-speech') {
          // 'no-speech' means a brief silence — not the end of the user's turn.
          // If we already have text buffered, finalize it (they clearly paused after speaking).
          // If the buffer is empty and the user still wants to listen, restart recognition so the
          // mic stays open rather than dropping them back to idle unexpectedly — UNLESS total
          // silence has already run past the ceiling, in which case restarting forever with
          // nothing ever said is dishonest; stop and let the UI reflect that.
          if (this.finalBuf) {
            this.finalizeUtterance();
          } else if (this.wantListening && Date.now() < this.silenceDeadline) {
            try {
              this.rec?.start();
            } catch {
              /* already running */
            }
          } else {
            this.wantListening = false;
            this.emitState({ phase: 'idle' });
          }
          return;
        }
        this.finalBuf = '';
        // 'aborted' is our own cancel() — swallow it silently (no error surfaced).
        if (err === 'aborted') {
          this.emitState({ phase: 'idle' });
          return;
        }
        // 'not-allowed' surfaces so the orchestrator can auto-revert the toggle.
        this.emitState({ phase: 'idle', error: err });
      };

      rec.onend = () => {
        this.clearEndTimer();
        // The browser ended recognition (its own timeout, or our stop()): if we still have
        // a buffered utterance and hadn't finalized yet, submit it; otherwise settle to idle.
        if (this.phase === 'listening') {
          if (this.finalBuf) this.finalizeUtterance();
          else this.emitState({ phase: 'idle' });
        }
      };

      this.rec = rec;
    }
  }

  start(_ctx?: VoiceStartContext): void {
    if (this.muted || !this.rec) return;
    this.wantListening = true;
    // Set ONCE per tap, not per internal no-speech restart — it's a ceiling on total silence
    // since the user asked to talk, not on any one recognition segment.
    this.silenceDeadline = Date.now() + OVERALL_SILENCE_MS;
    try {
      this.rec.start();
    } catch {
      // start() throws if recognition is already running — safe to ignore.
    }
  }

  stop(): void {
    this.wantListening = false;
    try {
      this.rec?.stop();
    } catch {
      /* not started */
    }
  }

  forceStop(): void {
    this.wantListening = false;
    this.finalizeUtterance();
  }

  // Mavéa speaks through Kokoro (voice/tts.ts), never the browser — this controller is INPUT
  // (mic) only, so speaking is a no-op. Kept to satisfy the VoiceController contract.
  speak(_opts: SpeakOptions): Promise<void> {
    return Promise.resolve();
  }

  cancel(): void {
    this.clearEndTimer();
    this.finalBuf = '';
    this.stop();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  // Sound on/off only ever gated browser TTS, which this controller no longer does (Mavéa's
  // voice is Kokoro). Input is governed by setMuted. No-op, like the other controllers.
  setSoundEnabled(_enabled: boolean): void {}

  onResult(cb: (r: VoiceResult) => void): () => void {
    this.resultSubs.add(cb);
    return () => this.resultSubs.delete(cb);
  }

  onStateChange(cb: (e: VoiceStateEvent) => void): () => void {
    this.stateSubs.add(cb);
    return () => this.stateSubs.delete(cb);
  }

  dispose(): void {
    this.cancel();
    if (this.rec) {
      this.rec.onstart = null;
      this.rec.onresult = null;
      this.rec.onerror = null;
      this.rec.onend = null;
    }
    this.resultSubs.clear();
    this.stateSubs.clear();
  }

  // --- internals -----------------------------------------------------------

  /** (Re)start the end-of-speech grace timer — fires once the user has been silent for
   *  END_SILENCE_MS, at which point we treat the utterance as finished. */
  private armEndTimer(): void {
    this.clearEndTimer();
    this.endTimer = setTimeout(() => this.finalizeUtterance(), END_SILENCE_MS);
  }

  private clearEndTimer(): void {
    if (this.endTimer !== null) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
  }

  /** Finish the in-progress utterance: submit the accumulated transcript and stop the mic.
   *  Settles to idle BEFORE stopping so the resulting onend is a no-op (no double submit). */
  private finalizeUtterance(): void {
    this.clearEndTimer();
    const text = this.finalBuf.trim();
    this.finalBuf = '';
    if (text) {
      this.emitState({ phase: 'heard', transcript: text });
      this.emitResult({ transcript: text });
    }
    this.emitState({ phase: 'idle' });
    try {
      this.rec?.stop();
    } catch {
      /* not running */
    }
  }

  private emitResult(r: VoiceResult): void {
    this.resultSubs.forEach((cb) => cb(r));
  }

  private emitState(e: VoiceStateEvent): void {
    this.phase = e.phase;
    this.stateSubs.forEach((cb) => cb(e));
  }
}
