import type { BendSpec, Block } from '../data/conversation';
import { evaluateBend } from '../lib/bend';

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

/** One quantity the slider moves: its value at the authored input, and its value now. */
interface Swap {
  from: number;
  to: number;
  /** Trimmed and lower-cased; empty when the bend names none. */
  unit: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Too common to be taken as THIS quantity on sight: a small count reads as a rank, a step, a
 *  score out of ten far more often than as the input. */
const distinctive = (n: number): boolean => Math.abs(n) >= 10;

const normUnit = (unit: string | undefined): string => unit?.trim().toLowerCase() ?? '';

/** The quantities a bend moves: the dragged input itself and every output. Two quantities
 *  that share a value at the authored input cannot be told apart on the card, so neither is
 *  moved — a figure left still is honest, a figure moved by the wrong formula is not. */
function bendSwaps(bend: BendSpec, value: number): Swap[] {
  const base = bend.param.value;
  const raw: Swap[] = [{ from: base, to: value, unit: normUnit(bend.param.unit) }];
  for (const o of bend.outputs) {
    const from = evaluateBend(o.formula, base);
    const to = evaluateBend(o.formula, value);
    if (from !== null && to !== null) raw.push({ from, to, unit: normUnit(o.unit) });
  }
  const byValue = new Map<number, Swap | null>();
  for (const s of raw) {
    if (!distinctive(s.from)) continue;
    const key = round2(s.from);
    const seen = byValue.get(key);
    byValue.set(key, seen === undefined || round2(seen?.to ?? NaN) === round2(s.to) ? s : null);
  }
  return [...byValue.values()].filter((s): s is Swap => s !== null && s.from !== s.to);
}

/** The only numeric props that state a figure. Everything else numeric on a block — a gauge's
 *  `max`, a target, a coordinate, a step — is scale or geometry, and moving it because it happens
 *  to equal the input would redraw the card wrongly. */
const FIGURE_KEYS = new Set(['value', 'amount']);
/** Text props that are source, markup or maths: a digit there is syntax, never a stated figure. */
const NOT_PROSE = new Set(['code', 'd', 'path', 'svg', 'formula', 'latex', 'snippet', 'source']);
/** Props that name, place or style a block rather than state a figure. */
const NOT_FIGURES = new Set(['id', 'icon', 'iconColor', 'color', 'src', 'href', 'url', 'key']);
/** A number as written in prose: grouped ("12,400.50") or plain ("12400.5"). */
const NUMBER_IN_TEXT = /(?<![\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d,]*\d)/g;
/** A magnitude word after a figure: "$100M" is not the $100 the slider holds. */
const SCALE_AFTER = /^\s*(?:k|m|b|bn|mm|thousand|million|billion|trillion|%)(?![a-z])/i;

const decimalsOf = (written: string): number => written.split('.')[1]?.length ?? 0;

function matchSwap(n: number, swaps: readonly Swap[]): Swap | undefined {
  const key = round2(n);
  return swaps.find((s) => round2(s.from) === key);
}

function formatLike(written: string, to: number): string {
  const decimals = decimalsOf(written);
  return to.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: written.includes(',') || Math.abs(to) >= 10000,
  });
}

/** The swap's unit is written against the figure — "$1,200", "1,200 $", "40 hrs", "12%" — and
 *  no magnitude word follows it. In prose that is the only evidence a number is this quantity:
 *  a bare "2035" or "range(50)" never moves. */
function readsAsSwap(text: string, start: number, end: number, unit: string): boolean {
  const after = text.slice(end);
  const scale = SCALE_AFTER.exec(after)?.[0].trim().toLowerCase();
  if (scale && scale !== unit) return false;
  const before = text.slice(Math.max(0, start - unit.length - 1), start).toLowerCase();
  return (
    before.trimEnd().endsWith(unit) ||
    after
      .slice(0, unit.length + 1)
      .toLowerCase()
      .trimStart()
      .startsWith(unit)
  );
}

function bendText(text: string, swaps: readonly Swap[]): string {
  // Markup is never rewritten — only the text between tags.
  return text
    .split(/(<[^>]*>)/)
    .map((part) =>
      part.startsWith('<')
        ? part
        : part.replace(NUMBER_IN_TEXT, (written, _g, offset: number) => {
            const swap = matchSwap(Number(written.replaceAll(',', '')), swaps);
            if (!swap?.unit || !readsAsSwap(part, offset, offset + written.length, swap.unit)) {
              return written;
            }
            return formatLike(written, swap.to);
          }),
    )
    .join('');
}

/** Rewrite every figure in a props tree that IS one of the swapped quantities. Returns the
 *  same object when nothing matched, so an untouched block keeps its identity. */
function bendValue(v: unknown, swaps: readonly Swap[], key = '', unit?: string): unknown {
  if (typeof v === 'number') {
    if (!FIGURE_KEYS.has(key)) return v;
    const swap = matchSwap(v, swaps);
    // A unit on the row has to agree; a row with one and a quantity without cannot be checked.
    if (!swap || (unit !== undefined && normUnit(unit) !== swap.unit)) return v;
    return Number(swap.to.toFixed(Math.max(decimalsOf(String(v)), 2)));
  }
  if (typeof v === 'string') return NOT_PROSE.has(key) ? v : bendText(v, swaps);
  if (Array.isArray(v)) {
    const next = v.map((item) => bendValue(item, swaps, '', unit));
    return next.some((item, i) => item !== v[i]) ? next : v;
  }
  if (v && typeof v === 'object') {
    const record = v as Record<string, unknown>;
    const rowUnit = typeof record.unit === 'string' ? record.unit : unit;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, item] of Object.entries(record)) {
      const moved = NOT_FIGURES.has(k) ? item : bendValue(item, swaps, k, rowUnit);
      if (moved !== item) changed = true;
      next[k] = moved;
    }
    return changed ? next : v;
  }
  return v;
}

/** Let the canvas participate in the what-if, not merely the readouts under the slider.
 *
 *  A budget card attached to the bend scales its rows with the input: budget rows have no
 *  individual formulas, so the authored proportions are kept while the income changes.
 *
 *  Every other card follows by identity: a figure that equals the input, or an output at the
 *  authored input, IS that quantity, so it shows the recomputed value — the formula is the
 *  one the strip already shows, nothing is inferred. Figures that match no quantity stay as
 *  authored. */
export function bendBlock(block: Block, bend: BendSpec, value: number): Block {
  const base = bend.param.value;
  if (!Number.isFinite(value) || !Number.isFinite(base) || value === base) return block;
  if (block.id === bend.blockId && block.type === 'budgetallocator') {
    if (base === 0) return block;
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
        footer: undefined,
      },
    };
  }
  const swaps = bendSwaps(bend, value);
  if (swaps.length === 0) return block;
  const props = bendValue(block.props, swaps);
  return props === block.props ? block : ({ ...block, props } as Block);
}
