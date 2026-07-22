// moments.ts — the story a saved canvas can honestly tell on its Library card: the question that
// started it, then what the answer actually contained (each row is a real block's own heading via
// blockLabel — nothing is summarized or invented). Pure and dependency-free, like extractLead.
import type { Block } from '../../data/conversation';
import { blockLabel } from '../../canvas/blockLabel';
import type { LibraryEntry } from './store';

export type MomentIcon = 'ask' | 'finding' | 'evidence';

export interface Moment {
  icon: MomentIcon;
  text: string;
}

/** Block kinds that read as a found insight rather than supporting evidence. */
const FINDING_TYPES = new Set(['insight', 'quotes', 'kpi', 'callout', 'note', 'insightcard']);

/** How many block-derived rows a card shows before collapsing to "+N more". */
const MAX_BLOCK_MOMENTS = 3;

/**
 * The card's moment rows: the spoken ask first, then up to three real blocks (icon = finding vs
 * evidence), plus how many more the canvas holds. `more` counts hidden blocks, not all moments.
 */
export function momentsFor(entry: LibraryEntry): { moments: Moment[]; more: number } {
  const blocks: Block[] = entry.spec.blocks ?? [];
  const rows: Moment[] = [{ icon: 'ask', text: entry.question }];
  for (const b of blocks.slice(0, MAX_BLOCK_MOMENTS)) {
    rows.push({ icon: FINDING_TYPES.has(b.type) ? 'finding' : 'evidence', text: blockLabel(b) });
  }
  return { moments: rows, more: Math.max(0, blocks.length - MAX_BLOCK_MOMENTS) };
}
