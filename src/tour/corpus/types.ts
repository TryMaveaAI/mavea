// The first-run film replays REAL conversations, not hand-authored mock. Each entry here is a
// genuine Live turn (or short thread) that was generated once against a real model and frozen
// into a committed fixture, so a first-time visitor sees the actual product build a bespoke
// canvas for a real question — with no API key of their own. The whole point of the corpus is
// range: a handful of asks from unrelated domains, so a stranger learns in seconds that Mavéa
// draws the RIGHT thing for anything, not one canned demo.
//
// A conversation is stored as its `frames` (the exact per-turn `TurnFrame` snapshots the live
// surface already persists and replays) plus the compact `history` — i.e. the same shape a
// saved session has. That means the tour can hand these straight to the existing offline
// replay/beat machinery (`replaySequence`, `liveTourBeats`, `buildReelFallback`) with zero
// model calls. See src/live/history.ts (TurnFrame) and src/live/session/store.ts (SavedSession).
import type { TurnFrame } from '../../live/history';
import type { ChatMessage } from '../../live/providers/types';

/** One real, frozen conversation in the tour corpus — a subject and the turns it produced. */
export interface TourConversation {
  /** Stable slug used to reference this conversation from a scene (e.g. 'money', 'space'). */
  id: string;
  /** Human domain label shown as a chapter/tile eyebrow ('Business', 'Science', …). */
  domain: string;
  /** A single emoji glyph for the montage tile / chapter chip. */
  emoji: string;
  /** The hero question that opened this conversation (the first turn's ask). */
  question: string;
  /** The real per-turn snapshots, oldest first — exactly what replay/beats consume. */
  frames: TurnFrame[];
  /** The compact model context after the last turn (narration/titles only). Kept for parity
   *  with a saved session; the tour does not resend it (no model call at play time). */
  history: ChatMessage[];
}

/** The committed corpus: every real conversation the film can replay, plus provenance so we
 *  can tell at a glance which model/version produced it and when it was baked. */
export interface TourCorpus {
  v: 1;
  /** ms epoch the corpus was generated (frozen — never read a live clock at play time). */
  generatedAt: number;
  /** The model that produced these answers, for provenance ('gemini-3.1-flash-lite'). */
  model: string;
  /** The conversations, in the order the film introduces them. */
  conversations: TourConversation[];
}
