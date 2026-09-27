import type { BendSpec, Block } from '../data/conversation';

function replaceAmount(text: string, from: number, to: number, unit: string): string {
  const groupedFrom = from.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const groupedTo = to.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const candidates: Array<[string, string]> = [
    [`${unit}${groupedFrom}`, `${unit}${groupedTo}`],
    [`${groupedFrom}${unit}`, `${groupedTo}${unit}`],
    [groupedFrom, groupedTo],
    [String(from), String(to)],
  ];
  for (const [needle, replacement] of candidates) {
    if (needle && text.includes(needle)) return text.replace(needle, replacement);
  }
  return text;
}

/** Let the card attached to a bend participate in the what-if, not merely the readouts below it.
 * Budget rows have no individual formulas, so preserve the authored allocation proportions while
 * the input changes. That is deterministic, auditable, and keeps every visible dollar consistent
 * with the slider without inventing a new allocation policy. */
export function bendBlock(block: Block, bend: BendSpec, value: number): Block {
  if (block.id !== bend.blockId || block.type !== 'budgetallocator') return block;
  const base = bend.param.value;
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return block;
  const ratio = value / base;
  const unit = block.props.unit ?? '$';
  return {
    ...block,
    props: {
      ...block.props,
      title: replaceAmount(block.props.title, base, value, unit),
      income: value,
      envelopes: block.props.envelopes.map((envelope) => ({
        ...envelope,
        amount: Math.round(envelope.amount * ratio * 100) / 100,
      })),
      // A prose footer can contain the old literal remainder. The computed remainder directly
      // above it is the trustworthy live explanation, so hide stale prose once the input moves.
      footer: value === base ? block.props.footer : undefined,
    },
  };
}
