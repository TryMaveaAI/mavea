// The controller that turns queued "moments" into the face actually emerging to speak.
//
// Lifecycle of one interjection: a moment is enqueued → when the surface is at rest (idle, no
// modal, mic closed) and the cadence allows it, the face flies from its brand home to center
// (`interjecting` true), speaks the line, dwells until speech ends (a floor so a short/muted line
// still registers, a cap so a failed voice can't hang it), then flies home and lets the next one
// play. A real user turn (or an opened mic/modal) preempts it cleanly and flushes the queue, so
// Mavéa never talks over the conversation.
//
// Everything timer-ish is owned here and torn down on unmount; the cadence policy + words are the
// pure modules next door. No model call, ever.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MomentType } from './types';
import { pickLine } from './catalog';
import { allow, record, freshLimiter, type LimiterState } from './rateLimit';

/** Surface signals that decide whether it's safe for Mavéa to step in right now. */
export interface InterjectGates {
  // The turn machine is at rest (canvas shown, no thinking/speaking). Live settles to 'showing',
  // not 'idle', so this is "the turn is done", not a literal idle status.
  atRest: boolean;
  busy: boolean; // a request is in flight
  listening: boolean; // the mic is open
  introHold: boolean; // the cold-open is holding the face centered
  hasCanvas: boolean; // a session exists (don't interject on the welcome)
  modalOpen: boolean; // any overlay is up (would fly the face behind it)
}

export interface UseInterjectionsOptions {
  speak: (text: string) => void;
  cancelSpeak: () => void;
  isSpeaking: () => boolean;
  muted: boolean;
  gates: InterjectGates;
  /** Turn count (frames so far) — drives the per-turn gap and the "asks covered" milestone. */
  turnCount: number;
}

export interface InterjectionsApi {
  interjecting: boolean;
  line: string | null;
  enqueue: (type: MomentType) => void;
  reset: () => void;
}

const HOLD_FLOOR_MS = 1100; // minimum dwell at center, even for a short or muted line
const HOLD_CAP_MS = 6000; // never linger past this (e.g. TTS unavailable)
const HOLD_POLL_MS = 150; // cadence of the "has speech finished?" check
const RETURN_SETTLE_MS = 950; // ~ --m-cinematic: let the face fly home before the next aside
const SPEAK_WAIT_MS = 350; // re-check delay while an answer is still being spoken
const QUEUE_CAP = 8; // bound the queue so events can never pile up without limit

export function useInterjections(opts: UseInterjectionsOptions): InterjectionsApi {
  const { muted, turnCount, gates } = opts;

  // Keep callbacks in refs so the playback effect doesn't churn when their identity changes.
  const speakRef = useRef(opts.speak);
  const cancelRef = useRef(opts.cancelSpeak);
  const speakingRef = useRef(opts.isSpeaking);
  speakRef.current = opts.speak;
  cancelRef.current = opts.cancelSpeak;
  speakingRef.current = opts.isSpeaking;

  const [queue, setQueue] = useState<MomentType[]>([]);
  const [interjecting, setInterjecting] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [kick, setKick] = useState(0); // nudges the playback effect to re-evaluate

  const limiterRef = useRef<LimiterState>(freshLimiter());
  const lastLineRef = useRef<string | undefined>(undefined);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    if (returnRef.current) {
      clearTimeout(returnRef.current);
      returnRef.current = null;
    }
  }, []);

  const enqueue = useCallback((type: MomentType) => {
    setQueue((q) => (q.length >= QUEUE_CAP || q[q.length - 1] === type ? q : [...q, type]));
  }, []);

  const beginReturn = useCallback(() => {
    clearTimers();
    setInterjecting(false); // face flies home (CSS), caption hides
    returnRef.current = setTimeout(() => {
      returnRef.current = null;
      setLine(null); // clear after the fly-home settles, freeing the next aside
    }, RETURN_SETTLE_MS);
  }, [clearTimers]);

  const startHold = useCallback(
    (startedAt: number) => {
      const check = (): void => {
        const elapsed = Date.now() - startedAt;
        if ((elapsed >= HOLD_FLOOR_MS && !speakingRef.current()) || elapsed >= HOLD_CAP_MS) {
          beginReturn();
        } else {
          holdRef.current = setTimeout(check, HOLD_POLL_MS);
        }
      };
      holdRef.current = setTimeout(check, HOLD_FLOOR_MS);
    },
    [beginReturn],
  );

  const gatesOpen =
    gates.atRest &&
    !gates.busy &&
    !gates.listening &&
    !gates.introHold &&
    gates.hasCanvas &&
    !gates.modalOpen;

  // Play the next queued aside when the surface is at rest and the cadence allows it.
  useEffect(() => {
    if (interjecting || line !== null) return; // busy speaking or flying home
    if (!gatesOpen || queue.length === 0) return;
    // Don't talk over the answer that just finished — wait for its tail, then re-evaluate.
    if (speakingRef.current()) {
      const t = setTimeout(() => setKick((k) => k + 1), SPEAK_WAIT_MS);
      return () => clearTimeout(t);
    }
    const type = queue[0];
    const now = Date.now();
    if (!allow(limiterRef.current, { type, now, turnCount })) {
      setQueue((q) => q.slice(1)); // too soon / already used this session → drop it
      return;
    }
    limiterRef.current = record(limiterRef.current, { type, now, turnCount });
    const chosen = pickLine(type, now, lastLineRef.current);
    lastLineRef.current = chosen;
    setQueue((q) => q.slice(1));
    setLine(chosen);
    setInterjecting(true);
    if (!muted && chosen) speakRef.current(chosen);
    startHold(now);
  }, [interjecting, line, gatesOpen, queue, turnCount, muted, startHold, kick]);

  // A real turn (or an opened mic/modal) preempts an in-flight aside and flushes the queue.
  useEffect(() => {
    if (!interjecting) return;
    const turnTook = gates.busy || !gates.atRest;
    const otherInterrupt = gates.listening || gates.modalOpen;
    if (!turnTook && !otherInterrupt) return;
    clearTimers();
    setInterjecting(false);
    setLine(null);
    setQueue([]);
    lastLineRef.current = undefined;
    // The turn owns its own audio (it cancels + speaks its narration); only we cancel our own.
    if (otherInterrupt && !turnTook) cancelRef.current();
  }, [interjecting, gates.busy, gates.atRest, gates.listening, gates.modalOpen, clearTimers]);

  const reset = useCallback(() => {
    clearTimers();
    setQueue([]);
    setInterjecting(false);
    setLine(null);
    limiterRef.current = freshLimiter();
    lastLineRef.current = undefined;
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return { interjecting, line, enqueue, reset };
}
