// extractLead — derive the honest "face" of a saved canvas (the big stat + a real sparkline) from
// the canvas's OWN blocks. Every value here came from an answer the user actually saw, so a library
// card fabricates nothing. When the lead block carries no stat, we return null and the card shows
// just its title — we never invent a number to fill the space.
import type { Block, ConversationSpec } from '../../data/conversation';

export interface LeadFace {
  /** The headline stat exactly as the block rendered it, e.g. "$214/mo", "6h 12m", "+22%". */
  value: string;
  /** A short unit/suffix if the block carried one separately (e.g. "/mo"). */
  unit?: string;
  /** The change chip, if present (e.g. "−48m"). */
  delta?: string;
  /** Direction hint for the delta chip ('up' | 'down' | 'good' | 'bad' | …) — used only to color it. */
  deltaDir?: string;
  /** Real sparkline points pulled from the block (already plain numbers); omitted if none. */
  points?: number[];
  /** The lead block's kind, for a small eyebrow. */
  kind: string;
}

const VALUE_FIELDS = ['stat', 'value', 'big', 'headline'] as const;

/** Pull a numeric series from whatever array a block used for it (points/bars/series/data). */
function readPoints(props: Record<string, unknown>): number[] | undefined {
  const arrays = [props.points, props.bars, props.data, props.series, props.values];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    const nums = arr
      .map((p) => {
        if (typeof p === 'number') return p;
        if (p && typeof p === 'object') {
          const o = p as Record<string, unknown>;
          const v = o.v ?? o.y ?? o.value;
          if (typeof v === 'number') return v;
        }
        return NaN;
      })
      .filter((n) => Number.isFinite(n));
    if (nums.length >= 2) return nums.slice(0, 24);
  }
  return undefined;
}

/** The block that fronts the card: the lead insight if there is one, else the first id-bearing
 *  block with a usable stat. */
function leadBlock(blocks: readonly Block[]): Block | undefined {
  const insight = blocks.find((b) => b.type === 'insight' && !!b.id);
  if (insight) return insight;
  return blocks.find((b) => {
    if (!b.id) return false;
    const props = (b.props ?? {}) as unknown as Record<string, unknown>;
    return VALUE_FIELDS.some((f) => typeof props[f] === 'string' && (props[f] as string).trim());
  });
}

/** The honest face of a saved canvas, or null when its lead block has no stat to show. */
export function extractLead(spec: ConversationSpec): LeadFace | null {
  const block = leadBlock(spec.blocks);
  if (!block) return null;
  const props = (block.props ?? {}) as unknown as Record<string, unknown>;

  const valueField = VALUE_FIELDS.find(
    (f) => typeof props[f] === 'string' && (props[f] as string).trim(),
  );
  if (!valueField) return null;

  const delta =
    typeof props.delta === 'string' && props.delta.trim() ? props.delta.trim() : undefined;
  const deltaDir = typeof props.deltaDir === 'string' ? props.deltaDir : undefined;
  const unit = typeof props.unit === 'string' && props.unit.trim() ? props.unit.trim() : undefined;

  return {
    value: (props[valueField] as string).trim(),
    unit,
    delta,
    deltaDir,
    points: readPoints(props),
    kind: block.type,
  };
}
