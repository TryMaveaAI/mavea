// settleTurn.ts — the one deterministic step between "the model's result settled" and "the
// canvas the user sees": decide the lifecycle mode, merge into the prior canvas, remap the
// spotlight tour, and capture the timeline frame. Extracted from the turn loop so the demo
// corpus baker (scripts/build-demo-corpus.mts) settles baked turns through EXACTLY the code
// the live surface runs — a replayed demo can never drift from what a real session shows.
import type { Block, ConversationSpec } from '../data/conversation';
import {
  resolveMode,
  mergeForMode,
  topicCohesion,
  SAME_SUBJECT_FLOOR,
  type Mode,
  type TurnSnapshot,
} from './lifecycle';
import { remapTour } from './tourRemap';
import type { TurnFrame } from './history';
import type { LiveResult } from './generateLive';

/** Everything a settled turn hands back to its surface. `frame.spec` is the merged canvas
 *  (what actually renders); `snap` is this turn's snapshot, which becomes the next turn's
 *  `prior`. */
export interface SettledTurn {
  frame: TurnFrame;
  mode: Mode;
  /** The block to spotlight first: the top of a fresh canvas, or the first newly-added
   *  block on a follow-up — never a prior block the user has already seen. */
  spot: string | null;
  snap: TurnSnapshot;
}

/**
 * Settle one successful turn. Decides what the turn does to the canvas (a deterministic
 * topic-shift check overrides the model's hint), then merges accordingly — augment/refine
 * never lose the user's place, and an overcrowded augment falls back to a clean replace.
 *
 * `forceReplace` is for turns that already revealed a fresh canvas while streaming: they
 * must settle as REPLACE, or a late flip to augment would re-add the prior blocks and jump.
 */
export function settleTurn(
  prior: TurnSnapshot | null,
  priorBlocks: Block[],
  displayText: string,
  result: LiveResult,
  opts?: { forceReplace?: boolean },
): SettledTurn {
  const snap: TurnSnapshot = {
    question: displayText,
    narration: result.narration,
    title: result.spec.title,
    blockTypes: result.spec.blocks.map((b) => b.type),
  };
  // The turn's canvas relation, decided from the full answer and the model's own continuity
  // hint. Kept separate from the render mode below: a streamed turn must RENDER as a replace
  // (it already revealed a fresh canvas), and an overcrowded augment falls back to one.
  const naturalMode = resolveMode(prior, snap, result.continuity, result.tier);
  // The SUBJECT boundary the session rail chapters on. The canvas hint is not the subject: a
  // model may legitimately ask to REPLACE the canvas for a fresh take on the same thread
  // ("plan it" after an itinerary), or omit the hint entirely (smaller models often do) — and
  // Jaccard between two verbose, differently-worded answers about one subject reads as
  // unrelated, which is how every Tokyo follow-up once became its own chapter. So a replace
  // only opens a new subject when the two turns' vocabulary genuinely moved on.
  const topicShift =
    !prior || (naturalMode === 'replace' && topicCohesion(prior, snap) < SAME_SUBJECT_FLOOR);
  let mode: Mode = opts?.forceReplace ? 'replace' : naturalMode;
  let merge = mergeForMode(priorBlocks, result.spec.blocks, mode);
  if (mode !== 'replace' && merge.overflow) {
    mode = 'replace';
    merge = mergeForMode(priorBlocks, result.spec.blocks, 'replace');
  }
  const renderedSpec: ConversationSpec = { ...result.spec, blocks: merge.blocks };
  // A bendable slider binds to a block id from its OWN canvas — a merge renumbers ids,
  // so a non-replace turn drops the bend rather than bending the wrong card.
  if (mode !== 'replace') delete renderedSpec.bend;
  const spot = mode === 'replace' ? (merge.blocks.find((b) => b.id)?.id ?? null) : merge.firstNewId;
  // The spotlight order this turn actually used. The model authored its tour against the
  // RESPONSE's blocks, so each stop is remapped to where its block landed in the merged
  // canvas (identity on a clean replace; signature-matched on augment/refine — follow-up
  // walks and their drawn marks survive the merge, on screen and in replays).
  const tour = remapTour(result.tour ?? [], result.spec.blocks, merge.blocks);
  // Capture this turn as a timeline frame: exactly the canvas the user saw, its spoken
  // line, and its tour — so it can be scrolled back to and replayed later.
  const frame: TurnFrame = {
    question: displayText,
    narration: result.narration,
    ...(result.spoken ? { spoken: result.spoken } : {}),
    mode,
    topicShift,
    tour,
    spec: renderedSpec,
    at: Date.now(),
    // A declared correction rides with the frame so the rail/recap can mark the
    // earlier moment it corrects (self-healing history, never a silent rewrite).
    ...(result.corrects ? { corrects: result.corrects } : {}),
  };
  return { frame, mode, spot, snap };
}
