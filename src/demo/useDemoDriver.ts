// useDemoDriver — the STEP player for a persona demo. Each step replays one real recorded
// turn on the actual Live surface (the ask types into the real composer, the baked frame
// reveals with its own narration and walk), then performs the step's feature beats — every
// one a real control, driven through the same TourOps closures the first-run walkthrough
// uses. No model, no key. A thin sibling of useTourDriver, not a fork: the shared timing
// primitives live in tour/driverKit.ts, and both consume the same ops object from LiveApp.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TourOps } from '../tour/useTourDriver';
import {
  makeStepTimers,
  whenUnlocked,
  scheduleTypewriter,
  QUIET_POLLS,
  QUIET_POLL_MS,
} from '../tour/driverKit';
import { unlockAudio } from '../voice/voiceEnergy';
import { demoScript, turnSteps, type DemoStep } from './scripts';
import { runBeat, beatsEndMs } from './runBeat';
import { loadDemoConversation } from './corpus';
import type { DemoConversation } from './corpus/types';
import { syncDemoUrl } from './demoEntry';
import type { TurnFrame } from '../live/history';
import { naturalGuidedCopy, naturalizeGuidedFrame } from '../tour/guidedCopy';

/** Default breath a turn step holds after its walk + beats before auto-advance. */
const STEP_HOLD_MS = 4500;
/** Grace after the reveal fires before the quiet-watch starts. This used to be 8s of blind
 *  margin for TTS spin-up; the walk now spans its own readiness barrier and real audio waits
 *  (walkActive holds isBusy true from reveal to last line), so the watch can start almost
 *  immediately — this only bridges the reveal dispatch reaching the walk effect. */
const WALK_GRACE_MS = 1000;
/** Hard cap on waiting for walk-quiet — a stuck walk must never hang the demo. */
const WALK_WAIT_CAP_MS = 60000;

export type DemoLoadState = 'loading' | 'error' | 'ready';

export interface DemoDriver {
  active: boolean;
  /** Nothing performs until Start is clicked, which also unlocks browser audio. */
  started: boolean;
  loadState: DemoLoadState;
  /** The model that actually generated this session (shard provenance) — the voice strip's
   *  model chip shows THIS during a replay, never the visitor's own configured model. */
  model: string | null;
  /** Re-attempt the shard fetch after an offline failure. */
  reload: () => void;
  index: number;
  total: number;
  step: DemoStep | null;
  /** The active step's caption chip (set when its first beat fires). */
  note: string | null;
  playing: boolean;
  muted: boolean;
  done: boolean;
  start: () => void;
  next: () => void;
  prev: () => void;
  jumpTo: (i: number) => void;
  toggle: () => void;
  toggleMute: () => void;
  replay: () => void;
  skip: () => void;
}

/** Which baked frame a step consumes: the n-th turn step maps to frames[n]. */
function frameFor(
  steps: readonly DemoStep[],
  index: number,
  convo: DemoConversation,
): TurnFrame | null {
  const step = steps[index];
  if (!step?.ask) return null;
  const turnIdx = steps.slice(0, index + 1).filter((s) => !!s.ask).length - 1;
  return convo.frames[turnIdx] ?? null;
}

/** The latest canvas on screen at (or before) this step — what feature-only steps beat on. */
function currentFrame(
  steps: readonly DemoStep[],
  index: number,
  convo: DemoConversation,
): TurnFrame | null {
  const turnsSoFar = steps.slice(0, index + 1).filter((s) => !!s.ask).length;
  return convo.frames[Math.max(0, turnsSoFar - 1)] ?? null;
}

export function useDemoDriver(opts: {
  active: boolean;
  personaId: string | null;
  /** Resume step from a mid-demo reload (?step=N). */
  startStep?: number | null;
  ops: TourOps;
}): DemoDriver {
  const { active, personaId } = opts;
  const script = personaId ? demoScript(personaId) : undefined;
  const steps = script?.steps ?? [];
  const total = steps.length;

  const [convo, setConvo] = useState<DemoConversation | null>(null);
  const [loadState, setLoadState] = useState<DemoLoadState>('loading');
  const [index, setIndex] = useState(() => Math.max(0, Math.min(total - 1, opts.startStep ?? 0)));
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [userMuted, setUserMuted] = useState(false);
  const userMutedRef = useRef(userMuted);
  userMutedRef.current = userMuted;
  const [done, setDone] = useState(false);
  // Bumped to force the apply-effect to re-run even when the index is unchanged (replay).
  const [token, setToken] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const opsRef = useRef(opts.ops);
  opsRef.current = opts.ops;
  // The moment (ms epoch) the current step is allowed to auto-advance: set once its walk went
  // quiet and its beats were scheduled (quiet + beats tail + hold). Null while still revealing.
  const stepReadyAtRef = useRef<number | null>(null);

  // Load this persona's shard — lazily, its own chunk. A failed fetch (offline) is an honest
  // error state with retry, never a stall.
  const loadToken = useRef(0);
  const reload = useCallback(() => {
    if (!active || !personaId) return;
    setLoadState('loading');
    const t = ++loadToken.current;
    void loadDemoConversation(personaId).then((c) => {
      if (t !== loadToken.current) return;
      // A shard whose turn count doesn't match the script is stale — treat as missing rather
      // than play a session that desynced from its choreography.
      const expected = script ? turnSteps(script).length : 0;
      const ok = !!c && !!script && c.frames.length === expected;
      setConvo(ok ? c : null);
      setLoadState(ok ? 'ready' : 'error');
    });
  }, [active, personaId, script]);
  useEffect(reload, [reload]);

  /** Revert anything a step might have opened, so navigating away is always clean. */
  const resetTriggers = useCallback(() => {
    const o = opsRef.current;
    o.closeAllOverlays();
    o.stopRevealWalk();
    o.cancelSpeech();
  }, []);

  // APPLY the current step's side effects, once per entry — not keyed on `playing`, so
  // pause/resume never re-reveals or re-fires a beat (the tour's exact contract).
  useEffect(() => {
    if (!active || !started || done || loadState !== 'ready' || !convo || !script) return;
    const step = script.steps[index];
    if (!step) return;
    // Keep the URL resumable: the landing hand-off was a one-shot stash, so without this a
    // mid-demo reload would drop the visitor onto the setup wizard (see syncDemoUrl).
    syncDemoUrl(script.persona, index);
    const o = opsRef.current;
    const st = makeStepTimers();
    const after = st.after;
    setNote(null);
    stepReadyAtRef.current = null;

    resetTriggers();
    o.setMuted(userMutedRef.current);

    const rawFrame = frameFor(script.steps, index, convo);
    const rawBeatFrame = rawFrame ?? currentFrame(script.steps, index, convo);
    const cleanAsk = step.ask ? naturalGuidedCopy(step.ask) : null;
    const frame = rawFrame
      ? naturalizeGuidedFrame({ ...rawFrame, question: cleanAsk ?? rawFrame.question })
      : null;
    const beatFrame = rawBeatFrame ? naturalizeGuidedFrame(rawBeatFrame) : null;

    // Fire the step's beats (measured from walk-quiet) and open the advance window.
    const fireBeats = (): void => {
      const beats = step.beats ?? [];
      for (const b of beats) runBeat(b, o, beatFrame, after);
      if (step.note) {
        const firstAt = beats.length ? Math.min(...beats.map((b) => b.atMs)) : 0;
        after(firstAt, () => setNote(naturalGuidedCopy(step.note ?? '')));
      }
      stepReadyAtRef.current = Date.now() + beatsEndMs(beats) + (step.holdMs ?? STEP_HOLD_MS);
    };

    // Wait for the answer's own narration + reveal walk to finish, then decorate it. The
    // quiet-watch needs several consecutive silent polls (the walk re-queues lines with gaps),
    // and a hard cap so a stuck walk can never hang the step.
    const watchThenBeats = (startDelay: number): void => {
      const watchStart = Date.now();
      let quiet = 0;
      const watch = (): void => {
        if (Date.now() - watchStart >= WALK_WAIT_CAP_MS) {
          fireBeats();
          return;
        }
        quiet = o.isSpeaking() || o.isBusy() ? 0 : quiet + 1;
        if (quiet >= QUIET_POLLS) {
          fireBeats();
          return;
        }
        after(QUIET_POLL_MS, watch);
      };
      after(startDelay, watch);
    };

    if (step.ask && frame) {
      // A real recorded turn. It arrives the way the persona produced it: by pressing a
      // follow-up chip the previous canvas REALLY offers (checked against the baked frame —
      // never a mislabeled press), or by typing into the real composer.
      const turnIdx = script.steps.slice(0, index + 1).filter((s) => !!s.ask).length - 1;
      const prevFrame = turnIdx > 0 ? (convo.frames[turnIdx - 1] ?? null) : null;
      const chipOk =
        !!step.viaChip && !!prevFrame?.spec.suggests?.some((s) => s.label === step.ask);
      const ask = cleanAsk ?? step.ask;
      let revealAt: number;
      if (chipOk) {
        after(700, () => o.pressKeepGoing(step.ask ?? ask));
        revealAt = 1600;
      } else {
        revealAt = scheduleTypewriter(after, o.typeInto, ask, 400) + 360;
      }
      // Cold-entry gate (driverKit.whenUnlocked): a ?demo= deep link or mid-demo reload has no
      // user gesture yet — without this the frame's narration would play on a suspended
      // AudioContext and never be heard.
      after(revealAt, () => whenUnlocked(after, () => o.showFrame(frame, ask)));
      watchThenBeats(revealAt + WALK_GRACE_MS);
    } else {
      // A feature step: no new turn — the beats ARE the content, over the current canvas.
      // A jumped-to or resumed boot may not have one up yet; seed the conversation's latest
      // canvas silently first (no narration, no walk — the same guarantee the tour's
      // needsCanvas gives its chapters), so beats never perform over an empty stage.
      if (!o.hasCanvas() && beatFrame) {
        o.showFrame({ ...beatFrame, narration: '', tour: [] }, beatFrame.question);
      }
      after(300, fireBeats);
    }

    return st.cancel;
  }, [index, token, active, started, done, loadState, convo, script, resetTriggers]);

  // AUTO-ADVANCE — separate so play/pause only starts/stops the clock, never re-applies.
  // Waits for the step's ready moment (walk quiet + beats + hold) AND for real quiet, so a
  // long narration is never cut off.
  useEffect(() => {
    if (!active || !started || done || !playing || loadState !== 'ready') return;
    const o = opsRef.current;
    const id = window.setInterval(() => {
      const readyAt = stepReadyAtRef.current;
      if (!readyAt || Date.now() < readyAt) return;
      if (o.isSpeaking() || o.isBusy()) return;
      window.clearInterval(id);
      if (index + 1 >= total) {
        resetTriggers();
        setDone(true);
      } else {
        setIndex(index + 1);
      }
    }, QUIET_POLL_MS);
    return () => window.clearInterval(id);
  }, [index, token, active, started, done, playing, total, loadState, resetTriggers]);

  // Clean up on unmount so no feature is left open.
  useEffect(() => () => resetTriggers(), [resetTriggers]);

  const start = useCallback(() => {
    unlockAudio();
    setStarted(true);
    setPlaying(true);
    setDone(false);
  }, []);

  const goto = useCallback(
    (i: number, gotoOpts?: { keepPlaying?: boolean }) => {
      // Every transport action is a user gesture — the only moment the browser lets us resume
      // the AudioContext, so the demo's voice actually plays from the next step on.
      unlockAudio();
      setDone(false);
      // Going BACK (or dot-jumping) means the visitor wants to study a step — pause, or the
      // auto-advance clock races their clicks. Next keeps the flow rolling.
      if (!gotoOpts?.keepPlaying) setPlaying(false);
      setIndex(Math.max(0, Math.min(total - 1, i)));
      setToken((t) => t + 1);
    },
    [total],
  );
  const next = useCallback(() => {
    if (index + 1 >= total) {
      resetTriggers();
      setDone(true);
    } else goto(index + 1, { keepPlaying: true });
  }, [index, total, goto, resetTriggers]);
  const prev = useCallback(() => goto(index - 1), [index, goto]);
  const jumpTo = useCallback((i: number) => goto(i), [goto]);
  const replay = useCallback(() => {
    resetTriggers();
    setStarted(true);
    goto(0);
    setPlaying(true);
  }, [goto, resetTriggers]);
  const toggle = useCallback(() => {
    unlockAudio();
    if (!started) {
      start();
      return;
    }
    if (done) {
      replay();
      return;
    }
    setPlaying((p) => !p);
  }, [done, replay, start, started]);
  const toggleMute = useCallback(() => {
    unlockAudio();
    const next = !userMutedRef.current;
    userMutedRef.current = next;
    setUserMuted(next);
    opsRef.current.setMuted(next);
    if (next) opsRef.current.cancelSpeech();
  }, []);
  const skip = useCallback(() => {
    resetTriggers();
    setDone(true);
  }, [resetTriggers]);

  return {
    active,
    started,
    loadState,
    model: convo?.model ?? null,
    reload,
    index,
    total,
    step: active ? (steps[index] ?? null) : null,
    note,
    playing,
    muted: userMuted,
    done,
    start,
    next,
    prev,
    jumpTo,
    toggle,
    toggleMute,
    replay,
    skip,
  };
}
