// walkSync — the timing spine that keeps the reveal walk in lockstep with the voice.
//
// The walk used to pace itself by polling the GLOBAL speech queue on a wall clock: advance once
// "1.1s elapsed and nothing is speaking", give up at a fixed cap. On a fast machine that
// approximates sync; on a slow one (Kokoro synthesizing on an old CPU) the cap fires while the
// line is still being synthesized, the spotlight marches on, and every queued line lands one
// stop late — the desync compounds for the rest of the turn. These helpers replace the guesses
// with the line's own lifecycle (SpokenLine.started / .finished): the spotlight moves when its
// audio actually starts and advances when it actually ends. Every wait is bounded — a dead
// server degrades the walk to timer pacing, it never hangs it — and every timer is cleared.
//
// Pure and dependency-injected (speech state comes in as functions) so the pacing rules are
// unit-testable without WebAudio or a DOM.
import { nextFrame } from '../lib/nextFrame';
import {
  isSpeaking as globalIsSpeaking,
  subscribeSpeaking as globalSubscribeSpeaking,
  type SpokenLine,
} from '../voice/tts';

/** Minimum dwell per spoken stop — the proven floor that keeps a short line from flashing. */
export const MIN_STOP_MS = 1100;
/** Failure-only ceiling on "audio started": every KNOWN failure resolves `started` in
 *  milliseconds (health probe cached, fetch errored, queue drained) — this guards the one case
 *  nothing reports, a server that accepted the request and then never sends a byte. */
export const START_HANG_MS = 15_000;
/** Ceiling on waiting for the turn's FIRST line to become audible inside the pre-walk barrier —
 *  a cold Kokoro loads its model on the first synthesis; the prewarm usually absorbs this. */
export const FIRST_LINE_START_CAP_MS = 10_000;
/** Global ceiling on the pre-walk barrier: however wrong the parts go, the walk starts within
 *  this of the turn settling. The warm path is a couple of frames — this bounds the cold one. */
export const BARRIER_MAX_MS = 12_000;
/** Ceiling on waiting for block-family chunks inside the barrier (they're usually preloaded
 *  during streaming, so this only binds on a cold cache + slow link). */
export const FAMILY_LOAD_CAP_MS = 8_000;
/** How long the barrier may run before the voice strip owes the user an honest "Preparing…"
 *  cue — under this it reads as normal turn rhythm, not a stall. */
export const PREPARE_CUE_DELAY_MS = 600;
/** A last resort, not the thing that normally ends the wait. The first spoken line now holds
 *  until the answer's first card has painted OR the turn itself has ended (settled, failed, or
 *  superseded) — so this only fires if neither ever happens, which the stream's own ceilings
 *  (25s to first byte, 90s total) already prevent. It sits above them on purpose.
 *
 *  It was 2500ms, tuned when a first card arrived in ~2s. Measured on a reader's key the first
 *  card now lands 5–16s after send, so the hold expired every time and Mavéa narrated the whole
 *  answer over empty skeletons — the voice and the canvas visibly out of step. */
export const FIRST_PAINT_CAP_MS = 90_000;

/** Failure-only ceiling on "line finished": double the word-count estimate (0.5× voice speed is
 *  the slowest a user can pick) plus synthesis slack. Real lines resolve `finished` themselves —
 *  this only fires when a line dies mid-play with no event, so it must never cut a real one. */
export function finishCapMs(estimateMs: number): number {
  return estimateMs * 2 + 12_000;
}

/** Roughly how long a line takes to say (≈155 wpm), bounded so a one-word line still reads and a
 *  long one cannot stall a walk. It is the dwell when there is no voice, and the failure-only cap
 *  when there is — every walk in the app paces off this one curve, which is why it lives here with
 *  the other pacing constants rather than as a private copy inside each of them. */
export function spokenMs(text: string, dwell = 1700): number {
  const trimmed = text.trim();
  if (!trimmed) return dwell;
  return Math.min(7_000, Math.max(1_500, Math.round(trimmed.split(/\s+/).length * 385 + 500)));
}

/** The same curve WITHOUT the 7s cap — for the one wait that is genuinely about a long text:
 *  holding the walk while the opener (a rich narration can run ~220 chars) finishes. Capping
 *  that estimate at 7s let the failure-only ceiling cut a real opener mid-read on long answers
 *  at slow voice speeds. Everything else keeps spokenMs's cap: a per-stop line is short by
 *  construction, and the cap is what stops a bad estimate stalling a walk. */
export function spokenMsUncapped(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 1_700;
  return Math.max(1_500, Math.round(trimmed.split(/\s+/).length * 385 + 500));
}

/** Plain cancellable-by-neglect delay; the caller re-checks its own cancel flags after it. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return untilOrAbort(new Promise<void>(() => {}), ms, signal);
}

/**
 * Ends a walk once its last stroke has finished — unless the walk was cancelled in the meantime.
 * The pen's promise resolves on its own clock, and by then a NEW walk may own the shared walk
 * state (the active flag, the flush hook, the caption); ending the old one there would wipe the
 * new walk's state mid-stop and let a driver cut across it.
 */
export function finishOnceInked(
  penDown: Promise<void>,
  isCancelled: () => boolean,
  finish: () => void,
): void {
  void penDown.then(() => {
    if (!isCancelled()) finish();
  });
}

/**
 * Resolves when a stop's pen has lifted: no mark on its card is still waiting to be placed, and
 * every stroke drawing there has finished. Both are real signals — a card whose entrance holds a
 * mark back for a second is waited out, and a stop whose strokes are done ends at once. The
 * walk chains the NEXT stop's glide onto this — never the next line, which speaks on time — so
 * a stroke is never scrolled or replaced mid-draw and the voice never waits on the pen.
 *
 * `ceilingAt` (performance.now() time) is the only time bound. With reduced motion the strokes do
 * not animate, so it resolves at once.
 */
export async function awaitPenLift({
  drawing,
  pending,
  pendingChanged,
  ceilingAt,
  reducedMotion = false,
  signal,
}: {
  drawing: () => Animation[];
  pending: () => boolean;
  pendingChanged: () => Promise<void>;
  ceilingAt: number;
  reducedMotion?: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  if (reducedMotion) return;
  for (;;) {
    const left = ceilingAt - performance.now();
    if (left <= 0 || signal?.aborted) return;
    if (pending()) {
      await untilOrAbort(pendingChanged(), left, signal);
      continue;
    }
    const running = drawing();
    if (!running.length) return;
    await untilOrAbort(
      Promise.all(running.map((a) => a.finished.catch(() => undefined))),
      left,
      signal,
    );
  }
}

/**
 * Wait until a line's audio is actually audible. Resolves true when the first buffer reached
 * the speakers, false when the line will never be heard (server down, cancelled) or nothing
 * arrived within `hangMs`. This is what lets the spotlight move WITH the voice instead of
 * seconds ahead of it.
 */
export async function waitLineStart(
  line: SpokenLine,
  hangMs: number = START_HANG_MS,
  signal?: AbortSignal,
): Promise<boolean> {
  return (await untilOrAbort(line.started, hangMs, signal)) ?? false;
}

function untilOrAbort<T>(value: Promise<T>, ms: number, signal?: AbortSignal): Promise<T | void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result?: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = (): void => finish();
    const timer = setTimeout(abort, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else void value.then(finish, abort);
  });
}

/**
 * Wait until a line has finished playing, holding at least `floorMs` (anti-flash) and at most
 * the failure cap derived from the line's own length estimate. Resolves regardless of how the
 * line ended — the caller decides what cancellation means by checking its own flags.
 */
export async function waitLineEnd(
  line: SpokenLine,
  estimateMs: number,
  floorMs: number = MIN_STOP_MS,
  signal?: AbortSignal,
): Promise<void> {
  await Promise.all([
    untilOrAbort(line.finished, finishCapMs(estimateMs), signal),
    untilOrAbort(new Promise<void>(() => {}), floorMs, signal),
  ]);
}

export interface QueueQuietOpts {
  /** Hold at least this long even if the queue is already quiet (anti-flash). */
  floorMs: number;
  /** Give up waiting after this — a wedged queue must not stall the walk. */
  capMs: number;
  /** Speech-state taps, injectable for tests; default to the real voice seam. */
  speaking?: () => boolean;
  subscribe?: (listener: () => void) => () => void;
  signal?: AbortSignal;
}

/**
 * Wait until the whole speech queue goes quiet — used for stop 0, whose line (the opener) was
 * already queued sentence-by-sentence while the answer streamed, so there is no single handle
 * to await. Event-driven via the speaking subscription: no polling timer while the voice plays.
 */
export function waitQueueQuiet(opts: QueueQuietOpts): Promise<void> {
  const speaking = opts.speaking ?? globalIsSpeaking;
  const subscribe = opts.subscribe ?? globalSubscribeSpeaking;
  return new Promise((resolve) => {
    let floorPassed = false;
    let settled = false;
    // `finish` only ever runs from a timer or a speaking transition, both strictly after the
    // bindings below are initialized — the closure reads them safely despite the forward refs.
    const finish = (): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(capTimer);
      clearTimeout(floorTimer);
      opts.signal?.removeEventListener('abort', finish);
      resolve();
    };
    const check = (): void => {
      if (floorPassed && !speaking()) finish();
    };
    const unsubscribe = subscribe(check);
    const floorTimer = setTimeout(() => {
      floorPassed = true;
      check();
    }, opts.floorMs);
    const capTimer = setTimeout(finish, opts.capMs);
    opts.signal?.addEventListener('abort', finish, { once: true });
    if (opts.signal?.aborted) finish();
  });
}

export interface WalkReadyOpts {
  signal?: AbortSignal;
  /** Kick (or join) the block-family chunk loads for the settled blocks. */
  loadFams: () => Promise<unknown>;
  /** Bounded content-settle pass over the mounted grid (fonts/height/tiles/images); the
   *  implementation carries its own internal ceilings. Skipped when absent (no grid host). */
  settle?: () => Promise<void>;
  /** The opener's line handle, when one is already in flight. */
  firstLine?: SpokenLine | null;
  /** Whether this walk will actually be voiced — a muted or captions-only walk must never
   *  wait on audio that will not come. */
  wantVoice: boolean;
}

/** Wait for the card's finite entrance, never a visualization's ambient child motion. Geometry
 *  alone cannot see an opacity/transform entrance, so inspect the animation lifecycle. */
function stillAnimating(host: Element): boolean {
  const el = host as Element & { getAnimations?: (o?: { subtree?: boolean }) => Animation[] };
  if (typeof el.getAnimations !== 'function') return false; // can't tell → don't wait
  return el.getAnimations({ subtree: false }).some((a) => {
    if (a.playState !== 'running') return false;
    const timing = a.effect?.getComputedTiming();
    return timing ? Number.isFinite(timing.endTime) : true;
  });
}

/**
 * Wait until the answer has something on screen to talk about: the first card committed, laid out,
 * and done making its entrance.
 *
 * The opening narration is spoken sentence-by-sentence the instant each one streams in, which is
 * the whole point of the streaming voice — but on the first sentence there is often nothing on the
 * stage yet, so Mavéa describes an answer the reader cannot see. Holding ONLY the first line costs
 * almost nothing (the first card lands well before the first sentence finishes streaming) and
 * removes the case where the voice talks to an empty screen.
 *
 * Discovery uses DOM mutations once the host exists; only the short entrance needs frame checks.
 * A release or deadline disconnects observers and cancels all scheduled work, including when the
 * host never mounts. Callers release cardless/failed turns explicitly.
 */
export async function awaitFirstPaint(
  host: () => Element | null,
  cardSelector = '.card',
  capMs: number = FIRST_PAINT_CAP_MS,
  /** Fires when the turn has ended — settled, failed, or superseded. An answer that ends with no
   *  card must still release the voice, or it waits on a card that is never coming. */
  release?: AbortSignal,
  /** Replay/settled callers already know these cards belong to the current answer. */
  acceptExisting = false,
): Promise<void> {
  const eligible = (el: Element): boolean =>
    !el.matches('.skel-card') && !el.closest('[data-gathered], [aria-hidden="true"]');
  // Snapshot before yielding: a card arriving during the first paint belongs to this turn.
  const before = new Set(
    acceptExisting ? [] : Array.from(host()?.querySelectorAll(cardSelector) ?? []).filter(eligible),
  );
  await new Promise<void>((resolve) => {
    let finished = false;
    let frame: number | undefined;
    let wake: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    let observed: Element | null = null;
    let candidate: Element | null = null;
    let paints = 0;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(wake);
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer?.disconnect();
      release?.removeEventListener('abort', finish);
      resolve();
    };
    const schedule = (paint: boolean): void => {
      if (finished || wake !== undefined || frame !== undefined) return;
      const run = (): void => {
        clearTimeout(wake);
        if (frame !== undefined) cancelAnimationFrame(frame);
        wake = undefined;
        frame = undefined;
        check();
      };
      wake = setTimeout(run, 50);
      if (paint && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(run);
    };
    const check = (): void => {
      if (finished) return;
      const current = host();
      if (current !== observed) {
        observer?.disconnect();
        observed = current;
        if (current && typeof MutationObserver !== 'undefined') {
          observer = new MutationObserver((records) => {
            for (const record of records) {
              if (record.type !== 'childList' && record.type !== 'characterData') continue;
              const element =
                record.target instanceof Element ? record.target : record.target.parentElement;
              const changed = element?.closest(cardSelector);
              if (changed) before.delete(changed);
            }
            schedule(true);
          });
          observer.observe(current.parentElement ?? current, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });
        }
      }
      const card = Array.from(current?.querySelectorAll(cardSelector) ?? []).find(
        (el) => !before.has(el) && eligible(el),
      );
      if (!card) {
        candidate = null;
        paints = 0;
        if (!current || !observer) schedule(false);
        return;
      }
      if (card !== candidate) {
        candidate = card;
        paints = 0;
      }
      if (++paints > 2 && !stillAnimating(card)) finish();
      else schedule(true);
    };
    const deadline = setTimeout(finish, capMs);
    release?.addEventListener('abort', finish, { once: true });
    if (release?.aborted) finish();
    else check();
  });
}

/**
 * The pre-walk barrier: everything the walk is about to point at — mounted cards, settled
 * layout, and (for a voiced walk) the first audible line — becomes ready together, or the
 * wait expires and the walk proceeds exactly as it used to. Never rejects; total wait is
 * capped by BARRIER_MAX_MS however the parts behave. The warm path (families preloaded during
 * streaming, voice already speaking) resolves in two animation frames.
 */
export async function awaitWalkReady(opts: WalkReadyOpts): Promise<void> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  opts.signal?.addEventListener('abort', abort, { once: true });
  if (opts.signal?.aborted) abort();
  const signal = controller.signal;
  try {
    await untilOrAbort(
      (async () => {
        // Two frames: the settled spec's cards were just committed — let them reach layout so
        // the settle pass below measures real geometry, not a mid-mount snapshot.
        await nextFrame();
        if (signal.aborted) return;
        await nextFrame();
        if (signal.aborted) return;
        await untilOrAbort(opts.loadFams(), FAMILY_LOAD_CAP_MS, signal);
        if (signal.aborted) return;
        if (opts.settle) await untilOrAbort(opts.settle(), BARRIER_MAX_MS, signal);
        if (signal.aborted) return;
        if (opts.wantVoice && opts.firstLine) {
          await untilOrAbort(opts.firstLine.started, FIRST_LINE_START_CAP_MS, signal);
        }
      })(),
      BARRIER_MAX_MS,
      signal,
    );
  } catch {
    // A barrier that fails is a barrier that's over — the walk falls back to today's behavior.
  } finally {
    abort();
    opts.signal?.removeEventListener('abort', abort);
  }
}
