// The semantic payload a Mark highlight carries into a turn. Deliberately tiny and free of any
// geometry or Block reference: what rides the wire is just "which on-screen text the user marked,
// and which block (if any) it belongs to" — enough for the model to focus, nothing more. The marked
// blocks are resolved fresh against the current spec at submit time (resolveInkTargets), so an
// intent can never carry a stale block across a turn.
import type { Block } from '../../data/conversation';

// Marking is a pure highlighter — a stroke just grabs the text under it; the user's typed/spoken
// question carries the intent. The single-member union keeps the field explicit and forward-looking.
export type InkGesture = 'highlight';

export interface InkIntent {
  kind: InkGesture;
  /** Owning block ids, DOM order. One id when the grabbed text sits in a block; EMPTY when it's
   *  plain text with no data-spot-id ancestor — still a valid, groundable mark (textAt alone). */
  blockIds: string[];
  /** The literal on-screen text the stroke passed over. Real-data-only: always text the user sees. */
  textAt: string;
}

const clipLabel = (s: string): string => (s.length > 22 ? s.slice(0, 21) + '…' : s);

/** A short label for a mark — the chip text. */
export function inkLabel(it: InkIntent): string {
  return it.textAt ? `Marked “${clipLabel(it.textAt)}”` : 'Marked';
}

/** The user-facing question for a mark-only turn (the chat bubble) when the composer is empty; the
 *  detailed grounding rides separately via buildInkIntentContext. Built only from the marks' own
 *  literal text, so it never invents content. */
export function inkPromptText(intents: readonly InkIntent[]): string {
  if (intents.length === 0) return '';
  const first = intents[0]?.textAt?.trim();
  const head = first ? `Tell me about “${clipLabel(first)}”` : 'Tell me about this';
  if (intents.length === 1) return head;
  const more = intents.length - 1;
  return `${head} (and ${more} more)`;
}

/** Blocks deduped by id, in first-seen order; blocks without an id are dropped (not addressable). */
export function dedupeById(blocks: readonly Block[]): Block[] {
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const b of blocks) {
    if (!b.id || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
  }
  return out;
}

/** Resolve marks against the CURRENT spec at submit time. A text-only mark (no block ids) always
 *  survives — its literal text grounds the turn on its own. A mark that names a block survives only
 *  if that block still resolves (the stale-block drop), and contributes its backing block to the
 *  selectedBlocks grounding rail (deduped, DOM order). */
export function resolveInkTargets(
  intents: readonly InkIntent[],
  specBlocks: readonly Block[],
): { intents: InkIntent[]; blocks: Block[] } {
  const byId = new Map<string, Block>();
  for (const b of specBlocks) if (b.id) byId.set(b.id, b);

  const survivors: InkIntent[] = [];
  const blocks: Block[] = [];
  const pushed = new Set<string>();
  for (const intent of intents) {
    const ids = intent.blockIds;
    if (ids.length > 0 && !ids.every((id) => byId.has(id))) continue; // block-bearing but stale → drop
    survivors.push(intent);
    for (const id of ids) {
      if (pushed.has(id)) continue;
      pushed.add(id);
      const b = byId.get(id);
      if (b) blocks.push(b);
    }
  }
  return { intents: survivors, blocks };
}
