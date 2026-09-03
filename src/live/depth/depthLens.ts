// depthLens.ts — partition a block array into concept sections for "Go Deeper" drawers.
//
// A block with a `section` string belongs to that named concept. Within a section,
// blocks with `depth ≥ 2` go into the collapsible "Go deeper" drawer; all others
// (depth ≤ 1 or undefined) render as normal grid cards on the standard canvas.
//
// Fallback when no block has a `section` field: returns a single anonymous section
// with every block as standard and no drawer — byte-for-byte today's canvas.
import type { Block } from '../../data/conversation';

export interface DepthSection {
  /** Short concept label (e.g. "The TCP handshake"). Empty string for the fallback section. */
  label: string;
  /** 1-based position in the settled canvas — assigned after the sort, so a merged follow-up
   *  continues the numbering instead of restarting it. */
  order: number;
  /** Blocks that render as normal grid cards (depth ≤ 1, or undefined depth). */
  standard: Block[];
  /** Blocks that live in the "Go deeper" drawer (depth ≥ 2). */
  deeper: Block[];
}

/** True when any block carries a non-empty `section` tag. TopicCanvas uses this to decide
 *  whether to render SectionGroups or the plain card-grid (the zero-regression path). */
export function hasSections(blocks: readonly Block[]): boolean {
  return blocks.some(
    (b) =>
      typeof (b as { section?: string }).section === 'string' &&
      (b as { section?: string }).section!.trim() !== '',
  );
}

/** Partition `blocks` into ordered concept sections.
 *
 *  Invariant: each section's `standard` array is non-empty. If every block in a section
 *  is tagged depth≥2, the first such block is promoted to standard so there is always
 *  something visible on the canvas without opening the drawer.
 *
 *  Document order within each section is preserved. */
export function depthLens(blocks: readonly Block[]): DepthSection[] {
  if (!hasSections(blocks)) {
    return [{ label: '', order: 0, standard: blocks.slice(), deeper: [] }];
  }

  // Preserve insertion order per section label.
  let insertIdx = 0;
  const map = new Map<string, { ord: number; standard: Block[]; deeper: Block[] }>();

  for (const b of blocks) {
    const raw = (b as { section?: string }).section;
    const label = typeof raw === 'string' ? raw.trim() : '';
    const key = label || '__ungrouped__';

    if (!map.has(key)) {
      const orderHint =
        typeof (b as { order?: number }).order === 'number' ? (b as { order?: number }).order! : 0;
      map.set(key, { ord: orderHint || ++insertIdx, standard: [], deeper: [] });
    }

    const sec = map.get(key)!;
    const rawDepth = (b as { depth?: number }).depth;
    // undefined depth → treated as standard (1); only depth≥2 goes to the drawer.
    const depthNum = typeof rawDepth === 'number' ? rawDepth : 1;

    if (depthNum >= 2) {
      sec.deeper.push(b);
    } else {
      sec.standard.push(b);
    }
  }

  const sections: DepthSection[] = [];
  for (const [key, data] of map) {
    // Enforce non-empty-standard: promote first deeper block if standard is empty.
    if (data.standard.length === 0 && data.deeper.length > 0) {
      data.standard.push(data.deeper.shift()!);
    }
    sections.push({
      label: key === '__ungrouped__' ? '' : key,
      order: data.ord,
      standard: data.standard,
      deeper: data.deeper,
    });
  }

  // Sort by order hint ascending, preserving insertion order for ties.
  sections.sort((a, b) => a.order - b.order);

  // The badge is a position in THIS canvas, so number it from the settled order rather than
  // printing the model's own hint: a merged follow-up numbers its sections from 1 too, and the
  // reader ends up reading "1, 1, 2, 2, 3, 3".
  return sections.map((s, i) => ({ ...s, order: i + 1 }));
}
