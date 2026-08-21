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
import { bounded } from '../lib/bounded';
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
/** Content-settle ceilings for the live grid — deliberately tighter than the export path's
 *  (5000/3000): walk latency is user-facing, and a late map tile just pops in as it does today. */
export const SETTLE_TIMEOUT_MS = 3_500;
export const SETTLE_IMG_MS = 2_500;
/** How long the barrier may run before the voice strip owes the user an honest "Preparing…"
 *  cue — under this it reads as normal turn rhythm, not a stall. */
export const PREPARE_CUE_DELAY_MS = 600;
/** showFrame (tour/demo replay) reveal: wait for the frame narration's audio to start, but no
 *  longer than this — with no voice at all, `started` resolves false in milliseconds anyway. */
export const SHOWFRAME_REVEAL_CAP_MS = 3_000;
/** Ceiling on holding the turn's FIRST spoken line for the answer's first card to appear. Past
 *  this the voice goes ahead regardless: a slow renderer, an answer with no blocks at all, or a
 *  backgrounded tab must never leave a turn silent. Comfortably longer than a card's entrance
 *  (`--m-expressive`, 550ms) plus the commit that precedes it. */
export const FIRST_PAINT_CAP_MS = 1_800;

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

/** Plain cancellable-by-neglect delay; the caller re-checks its own cancel flags after it. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
): Promise<boolean> {
  return (await bounded(line.started, hangMs)) ?? false;
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
): Promise<void> {
  await Promise.all([bounded(line.finished, finishCapMs(estimateMs)), delay(floorMs)]);
}

export interface QueueQuietOpts {
  /** Hold at least this long even if the queue is already quiet (anti-flash). */
  floorMs: number;
  /** Give up waiting after this — a wedged queue must not stall the walk. */
  capMs: number;
  /** Speech-state taps, injectable for tests; default to the real voice seam. */
  speaking?: () => boolean;
  subscribe?: (listener: () => void) => () => void;
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
      resolve();
    };
    const check = (): void => {
      if (floorPassed && !speaking()) finish();
    };
    const unsubscribe = subscribe(check);
    setTimeout(() => {
      floorPassed = true;
      check();
    }, opts.floorMs);
    const capTimer = setTimeout(finish, opts.capMs);
  });
}

export interface WalkReadyOpts {
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

/** True once nothing under `host` is still animating. The same reading the export path takes
 *  (clip/capture.ts) — `getAnimations` is what knows about a CSS entrance; a ResizeObserver and a
 *  scrollHeight poll do not, because `.reveal` animates only opacity and transform. */
function stillAnimating(host: Element): boolean {
  const el = host as Element & { getAnimations?: (o?: { subtree?: boolean }) => Animation[] };
  if (typeof el.getAnimations !== 'function') return false; // can't tell → don't wait
  return el.getAnimations({ subtree: true }).some((a) => a.playState === 'running');
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
 * Bounded by `capMs` and never rejects: with no host, no card, or no `getAnimations`, it resolves
 * and the voice proceeds exactly as it used to.
 */
export async function awaitFirstPaint(
  host: () => Element | null,
  cardSelector = '.card',
  capMs: number = FIRST_PAINT_CAP_MS,
): Promise<void> {
  await bounded(
    (async () => {
      // Two frames: the same commit-then-layout wait the pre-walk barrier takes, so the card we
      // then ask about has actually reached the compositor.
      await nextFrame();
      await nextFrame();
      // WAIT for the first card rather than checking once: on the opening turn the stage itself
      // has not mounted yet when the first sentence forms, so a single look would find nothing and
      // wave the voice through on exactly the turn this exists for. `bounded` owns the ceiling.
      let card = host()?.querySelector(cardSelector) ?? null;
      while (!card) {
        await nextFrame();
        card = host()?.querySelector(cardSelector) ?? null;
      }
      // Poll a frame at a time rather than listening: a card's entrance is a TRANSITION whose
      // `transitionend` never fires if it had already finished when we looked, and several
      // properties animate at once. A handful of frames is cheaper than getting that right.
      while (stillAnimating(card)) await nextFrame();
    })(),
    capMs,
  );
}

/**
 * The pre-walk barrier: everything the walk is about to point at — mounted cards, settled
 * layout, and (for a voiced walk) the first audible line — becomes ready together, or the
 * wait expires and the walk proceeds exactly as it used to. Never rejects; total wait is
 * capped by BARRIER_MAX_MS however the parts behave. The warm path (families preloaded during
 * streaming, voice already speaking) resolves in two animation frames.
 */
export async function awaitWalkReady(opts: WalkReadyOpts): Promise<void> {
  try {
    await bounded(
      (async () => {
        // Two frames: the settled spec's cards were just committed — let them reach layout so
        // the settle pass below measures real geometry, not a mid-mount snapshot.
        await nextFrame();
        await nextFrame();
        await bounded(opts.loadFams(), FAMILY_LOAD_CAP_MS);
        if (opts.settle) await opts.settle();
        if (opts.wantVoice && opts.firstLine) {
          await bounded(opts.firstLine.started, FIRST_LINE_START_CAP_MS);
        }
      })(),
      BARRIER_MAX_MS,
    );
  } catch {
    // A barrier that fails is a barrier that's over — the walk falls back to today's behavior.
  }
}
