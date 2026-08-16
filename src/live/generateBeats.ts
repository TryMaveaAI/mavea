// generateBeats.ts — turn a finished Live answer into a played walkthrough.
//
// The demo never dumps a canvas; it narrates and spotlights one block at a time,
// gliding each to center before moving on. Live had none of that — it revealed the
// whole spec at once with nothing lit. This module is the deterministic source of
// that choreography: given the validated blocks (and, when a capable model offers
// one, an explicit tour), it returns the same Beat[] the demo's runner plays —
// spotlight a block, hold the spoken line, release, advance.
//
// It is the ALWAYS-ON floor: a 3B local model that can't author a tour still gets a
// clean, ordered walkthrough because we derive one from reading order. It only reads
// data and returns beats — no model call, never throws — so the spotlight tour works
// identically on every tier.
import type { Beat } from '../orchestration/state';
import type { Block } from '../data/conversation';
import { spokenMs } from './walkSync';

/** One model-authored (or derived) stop on the tour: light `spot`, say `say`. */
export interface TourStep {
  spot: string;
  say?: string;
}

export interface TourOptions {
  /** A model-authored order. Steps whose `spot` doesn't resolve to a block are dropped. */
  tour?: TourStep[];
  /** The already-spoken opening line — shown as the first block's caption so the lit
   *  block matches what the face just said (we never re-speak per beat). */
  opener?: string;
  /** How long to hold each spotlight before advancing (ms, pre-motion-scale). */
  dwellMs?: number;
  /** Cap the number of spotlight stops, then release. The demo spotlights a few lead
   *  blocks while narrating and reveals the rest at rest — a short guided tour, not a
   *  walk that dims the whole canvas. Omit to tour every block (e.g. a model-authored tour). */
  maxStops?: number;
  /** Begin the tour at this block id (e.g. the first block ADDED on an augment turn, so the
   *  spotlight goes to the new content). Unknown id falls back to the first block. */
  startId?: string;
}

const DEFAULT_DWELL = 1700;

/** Pull a human-readable label from a block's props, for a caption when none is given.
 *  Defensive across the whole union: tries the keys components actually use, else ''. */
function blockLabel(block: Block): string {
  const props = (block as { props?: unknown }).props;
  if (!props || typeof props !== 'object') return '';
  const p = props as Record<string, unknown>;
  for (const key of ['title', 'eyebrow', 'headline', 'head', 'label', 'name', 'query']) {
    const v = p[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * Build the ordered list of stops. A model tour wins when present (filtered to
 * resolvable block ids, de-duped, capped at the block count); otherwise we walk the
 * blocks in reading order. Only blocks that carry an id can be spotlit.
 */
function tourSteps(blocks: Block[], tour?: TourStep[]): TourStep[] {
  const ids = new Set(blocks.map((b) => b.id).filter((id): id is string => !!id));
  if (tour && tour.length) {
    const seen = new Set<string>();
    const steps: TourStep[] = [];
    for (const step of tour) {
      if (!step || !ids.has(step.spot) || seen.has(step.spot)) continue;
      seen.add(step.spot);
      steps.push({ spot: step.spot, say: step.say });
      if (steps.length >= ids.size) break;
    }
    if (steps.length) return steps;
  }
  return blocks
    .filter((b): b is Block & { id: string } => !!b.id)
    .map((b) => ({ spot: b.id, say: blockLabel(b) }));
}

/**
 * Derive the played Beat[] for one Live turn. Each stop spotlights its block from the
 * corner and holds the line; the first stop carries the spoken opener so audio and the
 * lit block agree. A final beat releases the spotlight so the whole canvas rests
 * visible. Returns [] for an empty canvas.
 */
export function liveTourBeats(blocks: Block[], opts: TourOptions = {}): Beat[] {
  const all = tourSteps(blocks, opts.tour);
  if (!all.length) return [];
  const startAt = opts.startId
    ? Math.max(
        0,
        all.findIndex((s) => s.spot === opts.startId),
      )
    : 0;
  const fromStart = all.slice(startAt);
  const steps = opts.maxStops ? fromStart.slice(0, Math.max(1, opts.maxStops)) : fromStart;

  const dwell = opts.dwellMs ?? DEFAULT_DWELL;
  const beats: Beat[] = steps.map((step, i) => {
    // The first caption is the opener (already spoken); later stops show their own
    // line as a caption only — or keep the prior caption when we have no text.
    const caption = i === 0 ? (opts.opener ?? step.say ?? '') : (step.say ?? '');
    const set: Beat['set'] = { spot: step.spot, pstate: 'showing', gaze: 'right' };
    if (caption) set.caption = caption;
    return { set, ms: spokenMs(caption, dwell) };
  });

  // Release: drop the spotlight and settle so nothing stays dimmed at rest.
  beats.push({ set: { spot: null, pstate: 'idle', status: null } });
  return beats;
}

/** Below this block count a canvas is small enough that lighting up the lead card adds nothing —
 *  a calm, fully-visible canvas reads better than a one-stop spotlight. */
export const REVEAL_TOUR_MIN = 5;

/**
 * Whether a freshly-landed canvas should run a reveal-tour walk (vs. sitting fully visible at
 * rest). A model-authored tour always walks; otherwise only a substantial canvas, an augment
 * (non-replace), or a teach turn earns the guided highlight. When this is false the lead-block
 * spotlight opened on arrival MUST be released — there is no walk whose final beat would clear it.
 */
export function shouldRevealTour(opts: {
  blockCount: number;
  mode: string;
  hasModelTour: boolean;
  teach: boolean;
}): boolean {
  if (opts.hasModelTour) return true;
  return opts.blockCount >= REVEAL_TOUR_MIN || opts.mode !== 'replace' || opts.teach;
}
