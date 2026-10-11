// content/figureIndex.ts — an answer's grounded figures, addressed the way a card prints them.
//
// The ContentGraph names a figure by block INDEX and a slug; a card knows its block's id and the
// label it prints beside the number. This is the join between the two, and it admits only what
// can prove itself: a figure no source sentence states is not indexed, so it never becomes a
// control, and a printed figure that differs from its receipt's number (a bend, an edit, two figures
// sharing a label) finds nothing.
import type { Block } from '../../data/conversation';
import { parseAmount } from '../ground/number';
import type { TrustRegistry } from '../trust';
import type { ContentGraph } from './types';

const keyOf = (blockId: string, label: string): string => `${blockId}\u0000${label}`;

export interface FigureIndex {
  byKey: ReadonlyMap<string, string>;
  trust: TrustRegistry;
}

/** The grounded figures of `content`, keyed by the id of the block that prints them. `blocks` must
 *  be the very list the graph was read from — a figure's entity is its position in it. */
export function figureIndex(blocks: readonly Block[], content: ContentGraph): FigureIndex {
  const byKey = new Map<string, string>();
  for (const fact of content.facts) {
    const value = content.trust.values.get(fact.valueId);
    if (value?.kind !== 'grounded') continue;
    const index = Number(/^block:(\d+)$/.exec(fact.entityId)?.[1]);
    const blockId = blocks[index]?.id;
    if (!blockId) continue;
    const key = keyOf(blockId, value.label);
    if (!byKey.has(key)) byKey.set(key, value.id);
  }
  return { byKey, trust: content.trust };
}

/** The receipt for a figure printed as `shown` beside `label` on block `blockId`, if it has one. */
export function receiptFor(
  index: FigureIndex,
  blockId: string,
  label: string,
  shown: string,
): string | undefined {
  const id = index.byKey.get(keyOf(blockId, label));
  const value = id === undefined ? undefined : index.trust.values.get(id);
  if (value?.kind !== 'grounded') return undefined;
  // The producer read this figure out of the same string with the same parser, so an unchanged
  // figure compares exactly; anything else on screen is not the number the source states.
  return parseAmount(shown)?.value === value.resolution.value ? value.id : undefined;
}
