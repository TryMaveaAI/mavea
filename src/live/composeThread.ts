// composeThread.ts — fold a topic thread's turns into ONE canvas spec, on demand.
//
// The canvas normally shows a single answer at a time (calm, never a pile). But a coherent thread —
// "plan a trip" → "rent a car" → "hotels in Lisbon" — is sometimes better seen TOGETHER. The session
// rail's "See this thread together" action composes the thread's frames into one spec the canvas can
// render as a temporary, non-destructive view (useLiveTurn's viewOverride). This is opt-in: the
// default flow is untouched, so nothing accretes unless the user asks for it.
//
// Blocks are merged with the same content-dedupe + renumber the live augment path uses (so a card
// that recurred across turns appears once, and ids stay unique), then bounded by AUGMENT_CAP so even
// a long thread can't build an overwhelming board. Pure; never throws.
import type { Block, ConversationSpec, WebSource } from '../data/conversation';
import type { TurnFrame } from './history';
import { mergeForMode } from './lifecycle';

/** Union of the frames' sources, de-duplicated by URL (first title/snippet wins). */
function mergeSources(frames: readonly TurnFrame[]): WebSource[] {
  const byUrl = new Map<string, WebSource>();
  for (const f of frames) {
    for (const src of f.spec?.sources ?? []) {
      if (src?.url && !byUrl.has(src.url)) byUrl.set(src.url, src);
    }
  }
  return [...byUrl.values()];
}

/** True when composing is meaningful — more than one moment to bring together. */
export function canComposeThread(frames: readonly TurnFrame[]): boolean {
  return frames.length >= 2;
}

/**
 * Compose `frames` (one topic thread's turns, oldest→newest) into a single ConversationSpec for the
 * canvas. Returns null when there's nothing to compose (fewer than 2 frames). The spec is based on the
 * most recent frame (so required fields stay valid), with its blocks replaced by the merged, deduped
 * set and its per-turn interactive bits (bend/awaiting/blanks/suggests) cleared — a composed board is
 * for reading the thread whole, not for continuing a single turn.
 *
 * By default it shows ALL of the thread's cards — this is the explicit "see all moments" action, so
 * truncating would betray it (dedup already collapses repeats, and a thread is naturally bounded by
 * the session's frame cap). A caller may pass a finite `cap` to bound an unusually large thread.
 */
export function composeThread(
  frames: readonly TurnFrame[],
  opts: { title?: string; tint?: string; id?: string; cap?: number } = {},
): ConversationSpec | null {
  if (frames.length < 2) return null;
  const base = frames[frames.length - 1]?.spec;
  if (!base) return null;
  const cap = opts.cap ?? Number.POSITIVE_INFINITY;

  // Fold every frame's blocks into one set. The first iteration hits mergeForMode's replace path
  // (prior empty); each later frame augments — deduping recurring cards and renumbering ids to live-N.
  const merged = frames.reduce<Block[]>(
    (acc, f) => mergeForMode(acc, f.spec?.blocks ?? [], 'augment').blocks,
    [],
  );
  const truncated = merged.length > cap;
  const blocks = truncated ? merged.slice(0, cap) : merged;

  const count = frames.length;
  const sub = truncated
    ? `${count} moments in this thread · showing the first ${cap} cards`
    : `${count} moments in this thread`;
  const sources = mergeSources(frames);

  return {
    ...base,
    id: opts.id ?? base.id,
    title: opts.title ?? base.title,
    sub,
    blocks,
    sources: sources.length ? sources : base.sources,
    tint: opts.tint ?? base.tint,
    // A composed board is a read view of the whole thread — drop the single-turn interactive bits.
    suggests: [],
    bend: undefined,
    awaiting: undefined,
    blanks: undefined,
  };
}
