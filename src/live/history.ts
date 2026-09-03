// history.ts — keep a long conversation cheap, and keep every canvas re-viewable.
//
// Two concerns, one place:
//
//  1) buildSendHistory — what we actually RESEND to the model each turn. A conversation
//     can run for hours; resending the entire transcript every turn makes input cost (and
//     latency) climb without bound. So we keep the last few turns VERBATIM (the live
//     context the model reasons over) and fold everything older into a single short
//     "context so far" line. Combined with the adapter putting the stable system prompt
//     first (implicit cache hit), per-turn cost stays roughly FLAT however long the chat
//     goes. Assistant turns are already stored compact (narration/title, never the block
//     JSON), so this bounds the count, not the payload.
//
//  2) TurnFrame — the per-turn snapshot the history/replay UI plays back. The live surface
//     clears or merges the canvas as the conversation moves; a frame captures exactly what
//     was on screen AFTER each turn (plus its spoken line and tour) so the user can scroll
//     back and replay any moment — one answer, from the start, or from a point onward.
//
// Pure + dependency-free; never throws.
import { fnv1a } from '../lib/hash';
import type { ChatMessage } from './providers/types';
import type { ConversationSpec } from '../data/conversation';
import type { CorrectsNote, TourMark } from '../engine/liveSchema';
import type { Mode } from './lifecycle';
import type { MindShapeSpec } from './mindshape/types';

/** How many of the most recent turns to keep verbatim in the resent history. One "turn" is
 *  a user+assistant pair, so this is ~KEEP_RECENT_TURNS*2 messages kept in full. */
export const KEEP_RECENT_TURNS = 4;

/** A spotlight stop carried with a frame so replay reproduces the original narration walk —
 *  including the drawn gesture the model asked for at that stop, so replays re-ink it. */
export interface FrameTourStep {
  index: number;
  say?: string;
  /** Voice-ready twin of `say`; the displayed tour copy remains normally written. */
  saySpoken?: string;
  mark?: TourMark;
  /** When the model requested multiple gestures on this stop, all of them (mark mirrors marks[0]). */
  marks?: TourMark[];
}

/**
 * One moment in the conversation, captured for history + replay. `spec` is the canvas as it
 * stood AFTER this turn (post-merge), so replaying a frame shows exactly what the user saw —
 * including blocks a later turn cleared or replaced.
 */
export interface TurnFrame {
  /** Stable identity for selection, retained audio, and exports. Frames saved before this field
   *  existed use `turnFrameId`, whose deterministic legacy key survives array reindexing. */
  id?: string;
  /** The user's question that produced this canvas. */
  question: string;
  /** The spoken line for this turn (the replay narrates it). */
  narration: string;
  /** Voice-ready twin of `narration`; the screen and saved transcript keep `narration`. */
  spoken?: string;
  /** What this turn did to the canvas — replace / augment / refine (for a history label). */
  mode: Mode;
  /** Whether this turn opened a NEW SUBJECT — the deterministic topic decision with the
   *  model's continuity hint honored, independent of the render path (a follow-up that
   *  streamed renders as a replace but is still the same subject). The session rail
   *  chapters on this; absent on frames saved before it existed (readers fall back to
   *  `mode === 'replace'`). */
  topicShift?: boolean;
  /** The model-or-derived spotlight order, so replay reproduces the original walkthrough. */
  tour: FrameTourStep[];
  /** The canvas after this turn (what replay renders + animates). */
  spec: ConversationSpec;
  /** When the turn settled (ms epoch). Stamped by the caller (no clock in here). */
  at: number;
  /** Set when this turn declared it corrects an earlier answer — the rail/recap mark the
   *  earlier moment CORRECTED instead of letting history silently disagree with itself. */
  corrects?: CorrectsNote;
  /** Set only when this answer was produced from a "Watch Me Think" map — the settled mindshape
   *  that fed the prompt, kept so the user can re-open a read-only view of their thinking next to
   *  the answer it became. Rides into the saved session with the frame. */
  mind?: MindShapeSpec;
}

let turnFrameSerial = 0;

/** Create an immutable identity when a turn first settles. */
export function createTurnFrameId(at: number = Date.now()): string {
  turnFrameSerial += 1;
  return `${at.toString(36)}-${turnFrameSerial.toString(36)}`;
}

/** Stable identity for current and legacy frames. The hash deliberately excludes array position so
 *  a bounded session can drop an old turn without renaming every survivor. */
export function turnFrameId(frame: TurnFrame): string {
  if (frame.id) return frame.id;
  const source = `${frame.at}\u0000${frame.question}\u0000${frame.narration}\u0000${frame.spec.title ?? ''}`;
  return `legacy-${frame.at.toString(36)}-${fnv1a(source)}`;
}

/** Fold older turns into one compact recap line so the model keeps the gist without the
 *  full transcript cost. Uses the user questions (the load-bearing part of the context).
 *
 *  `focusTopic` is set on a CONTINUATION turn ("more in depth", "continue"), where the user is
 *  drilling into the CURRENT thread. Flattening every older topic into one equal-weight line then
 *  competes with the active subject and lets a weak model drift back to an earlier, meatier one
 *  (the "more in depth → answers about Kafka" bug). So on those turns we replace the broad recap
 *  with a single line that names ONLY the active thread. */
function recapOf(older: ChatMessage[], focusTopic?: string): string | null {
  const asks = older
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (!asks.length) return null;
  if (focusTopic) {
    return `The user is continuing the current thread about: ${focusTopic}. Earlier, unrelated topics in this chat are NOT the subject now — stay on this thread and go deeper on it.`;
  }
  // Cap the recap itself so it can't grow without bound on a very long chat.
  const joined = asks.join('; ');
  const capped = joined.length > 600 ? '…' + joined.slice(-600) : joined;
  return `Earlier in this conversation the user asked about: ${capped}. Keep that context in mind.`;
}

/**
 * The history to actually send this turn: the last `keepTurns` turns verbatim, preceded
 * (when there's older context) by a single short recap message. Bounds per-turn input cost
 * for an arbitrarily long conversation. Returns a new array; never mutates the input.
 */
export function buildSendHistory(
  history: ChatMessage[],
  keepTurns: number = KEEP_RECENT_TURNS,
  opts: { focusTopic?: string } = {},
): ChatMessage[] {
  const keepMsgs = Math.max(0, keepTurns) * 2;
  if (history.length <= keepMsgs) return history.slice();
  const older = history.slice(0, history.length - keepMsgs);
  const recent = history.slice(history.length - keepMsgs);
  const recap = recapOf(older, opts.focusTopic);
  return recap ? [{ role: 'user', content: recap }, ...recent] : recent;
}
