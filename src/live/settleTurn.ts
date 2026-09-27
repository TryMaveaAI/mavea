// settleTurn.ts — the one deterministic step between "the model's result settled" and "the
// canvas the user sees": decide the lifecycle mode, merge into the prior canvas, remap the
// spotlight tour, and capture the timeline frame. Extracted from the turn loop so the demo
// corpus baker (scripts/build-demo-corpus.mts) settles baked turns through EXACTLY the code
// the live surface runs — a replayed demo can never drift from what a real session shows.
import type { Block, ConversationSpec } from '../data/conversation';
import {
  resolveMode,
  mergeForMode,
  AUGMENT_CAP,
  topicCohesion,
  SAME_SUBJECT_FLOOR,
  type Mode,
  type MergeDelta,
  type TurnSnapshot,
} from './lifecycle';
import { remapTour } from './tourRemap';
import { classifyRevision } from './revise/classifyRevision';
import { createTurnFrameId, type TurnFrame } from './history';
import type { AnswerFraming, LiveResult } from './generateLive';

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
  /** What this turn did to the canvas, slot by slot — scoped to `frame.spec.blocks` alone. */
  delta: MergeDelta;
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
  // Live and the demo baker both settle through here, so they make the identical decision.
  const naturalMode = naturalModeOf(prior, snap, result.continuity, result.tier);
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
  const at = Date.now();
  const frame: TurnFrame = {
    id: createTurnFrameId(at),
    question: displayText,
    narration: result.narration,
    ...(result.spoken ? { spoken: result.spoken } : {}),
    mode,
    topicShift,
    tour,
    spec: renderedSpec,
    at,
    // A declared correction rides with the frame so the rail/recap can mark the
    // earlier moment it corrects (self-healing history, never a silent rewrite).
    ...(result.corrects ? { corrects: result.corrects } : {}),
    // Optional: frames baked before this existed carry none, and every reader of it must
    // tolerate that rather than assume — a replay of an older shard must not throw.
    ...(merge.delta.changedIds.length || merge.delta.addedIds.length
      ? { revision: merge.delta }
      : {}),
  };
  // The delta of the merge that actually produced the canvas — on an overflow fallback that is
  // the SECOND merge, not the first, or the board would be told about edits it never rendered.
  return { frame, mode, spot, snap, delta: merge.delta };
}

/** The one call both the settle and the early board cue make, so the cue can never decide
 *  differently from the canvas it announces. */
function naturalModeOf(
  prior: TurnSnapshot | null,
  snap: TurnSnapshot,
  continuity: Mode | undefined,
  tier: LiveResult['tier'],
): Mode {
  return resolveMode(prior, snap, continuity, tier, classifyRevision(snap.question));
}

/** What a follow-up is about to do to the board on screen: add cards to it, or edit cards on it. */
export type BoardCue = 'extend' | 'revise';

/**
 * Name what this turn will do to the board BEFORE its cards land — or return null when that is not
 * yet certain, so the surface stays neutral rather than guess.
 *
 * The mode `settleTurn` will pick depends only on things the answer's framing already carries
 * (its narration, title and continuity hint, which the model writes ahead of the blocks), plus one
 * thing it does not: whether an augment grows past AUGMENT_CAP and falls back to a replace. That
 * needs the final card count, so the cue is only named when NO answer this call can return could
 * overflow — `framing.ceiling` is the most cards the turn can produce. A board too full for that
 * guarantee stays neutral: "adding to this board" followed by a fresh board is the one outcome
 * worse than saying nothing.
 */
export function boardCueFor(
  prior: TurnSnapshot | null,
  priorCount: number,
  displayText: string,
  framing: AnswerFraming,
): BoardCue | null {
  if (!prior || priorCount === 0) return null;
  if (priorCount + framing.ceiling > AUGMENT_CAP) return null;
  const snap: TurnSnapshot = {
    question: displayText,
    narration: framing.narration,
    title: framing.title,
    blockTypes: [],
  };
  const mode = naturalModeOf(prior, snap, framing.continuity, framing.tier);
  return mode === 'augment' ? 'extend' : mode === 'refine' ? 'revise' : null;
}
