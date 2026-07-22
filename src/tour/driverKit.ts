// driverKit — the timing primitives shared by every scripted driver of the real Live surface
// (the first-run tour's chapter player and the demo replay's step player). Both drivers face
// the same three problems: per-entry timers that must all die when the step is left, a browser
// autoplay policy that silently swallows speech scheduled before the first user gesture, and
// knowing when Mavéa has actually FINISHED everything a step set in motion. Solving them once
// here keeps the two players in lockstep — a pacing fix lands in both or neither.
import { unlockAudio } from '../voice/voiceEnergy';

/** Typewriter cadence (ms per character) for lines "typed" into the real composer. */
export const TYPE_MS = 22;

// How often — and how long — to poll for the shared AudioContext coming unlocked before giving
// up and speaking anyway (see whenUnlocked below).
export const UNLOCK_POLL_MS = 200;
export const UNLOCK_WAIT_CAP_MS = 8000;

/** One step's timer bag: `after` schedules a callback that is dropped (never fired) once
 *  `cancel` runs — the cleanup a step's effect returns. Everything a step schedules must go
 *  through it, or navigating away leaves stray timers mutating the surface. */
export interface StepTimers {
  after: (ms: number, fn: () => void) => void;
  cancel: () => void;
}

export function makeStepTimers(): StepTimers {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  return {
    after(ms, fn) {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    },
    cancel() {
      cancelled = true;
      timers.forEach(clearTimeout);
    },
  };
}

/**
 * Run `fn` once audio is (or is confirmed) unlocked. Autoplay policy can silently swallow a
 * step's very first line: on a fresh page load or deep link, no user gesture has happened yet
 * in this document, so the shared AudioContext is still suspended and speak() would schedule
 * audio nothing plays. Every later step is reached via a transport click, which already
 * confirms the unlock — this only ever waits on that cold entry. It polls briefly for ANY
 * gesture (main.tsx's app-wide listener resumes the context on the user's first click/keypress
 * anywhere on the page); once confirmed — or after a bounded wait — it runs, so a step's voice
 * is never dropped with no retry.
 */
export function whenUnlocked(after: StepTimers['after'], fn: () => void): void {
  if (unlockAudio()) {
    fn();
    return;
  }
  const pollStart = Date.now();
  const poll = (): void => {
    if (unlockAudio() || Date.now() - pollStart >= UNLOCK_WAIT_CAP_MS) {
      fn();
      return;
    }
    after(UNLOCK_POLL_MS, poll);
  };
  after(UNLOCK_POLL_MS, poll);
}

/** Schedule `text` typing character-by-character into the composer, starting at `startMs`.
 *  Returns the moment (ms) the last character lands, for chaining what follows the typing. */
export function scheduleTypewriter(
  after: StepTimers['after'],
  typeInto: (value: string) => void,
  text: string,
  startMs = 0,
): number {
  for (let n = 1; n <= text.length; n++) {
    after(startMs + n * TYPE_MS, () => typeInto(text.slice(0, n)));
  }
  return startMs + text.length * TYPE_MS;
}

/** A hang-guard only — the quiet gate is the real clock, so give voice room. */
export const QUIET_MAX_EXTRA_MS = 20000;
// Seven polls give every scene a full 1.5 second breath after speech and feature work finish. This
// clears the reveal walk's internal requeue gaps and prevents autoplay from feeling like it is
// chasing the user into the next scene.
export const QUIET_POLLS = 7;
export const QUIET_POLL_MS = 250;

/**
 * The auto-advance clock: hold for at least `minHoldMs`, then WAIT for Mavéa to finish
 * everything the step set in motion — the spoken line AND the answer's own reveal walk —
 * before advancing, so a step never cuts itself off mid-thought. "Finished" means QUIET for
 * several consecutive polls (see QUIET_POLLS). The cap still guarantees it never hangs.
 * Returns the cleanup that stops the clock.
 */
export function startQuietGate(opts: {
  minHoldMs: number;
  isQuiet: () => boolean;
  advance: () => void;
  maxExtraMs?: number;
}): () => void {
  const start = Date.now();
  const maxExtra = opts.maxExtraMs ?? QUIET_MAX_EXTRA_MS;
  let quiet = 0;
  const id = window.setInterval(() => {
    const elapsed = Date.now() - start;
    if (elapsed < opts.minHoldMs) return; // still in the minimum hold
    quiet = opts.isQuiet() ? quiet + 1 : 0;
    if (quiet >= QUIET_POLLS || elapsed >= opts.minHoldMs + maxExtra) {
      window.clearInterval(id);
      opts.advance();
    }
  }, QUIET_POLL_MS);
  return () => window.clearInterval(id);
}
