// The demo corpus: each persona's session, generated ONCE against a real model by
// scripts/build-demo-corpus.mts and frozen into a committed per-persona shard. A demo replays
// these frames through the production canvas with zero model calls. They are model-generated
// fixtures, not recordings of real people or claims that a model call is happening during replay.
//
// A shard stores the session as its `frames` (the exact per-turn `TurnFrame` snapshots the
// live surface persists and replays — post-merge canvases, so multi-turn augment/refine
// history is baked in) plus the compact `history` the model actually accumulated. Same shape
// as a saved session; see src/live/history.ts (TurnFrame) and src/tour/corpus/ (the
// walkthrough's equivalent).
import type { TurnFrame } from '../../live/history';
import type { ChatMessage } from '../../live/providers/types';

/** One persona's frozen session — one shard file, one entry. */
export interface DemoConversation {
  v: 1;
  /** The cast member this session belongs to (cast.ts id, scripts.ts persona). */
  persona: string;
  /** ms epoch the shard was baked (frozen — never read a live clock at play time). */
  generatedAt: number;
  /** The model that produced these answers, for provenance. */
  model: string;
  /** The real per-turn snapshots, oldest first — one per turn step in the persona's script. */
  frames: TurnFrame[];
  /** The model context as it accumulated across the turns (what each turn really saw). */
  history: ChatMessage[];
}
