// annotations.ts — the closed annotation grammar. A base component (a table, a chart, a list) is
// ADAPTED to a specific answer by a small, versioned vocabulary of annotations rather than by
// having a bespoke component per use case. This is the "annotate a base" half of the selection
// architecture: a receipt is a `table` + [currency, total-row], not a `receipt` component.
//
// The vocabulary is deliberately CLOSED and CAPPED (six research-grounded categories → eight ops;
// per-target-typed; count-limited). Left open, it would re-create the infinite-library problem in
// annotation space. A future v2 op is invisible to a v1 validator (unknown ops are dropped), which
// is how the grammar versions forward-compatibly.
//
// Pure: types + a data-grounded validator, no I/O and no rendering. The renderers live in
// canvas/lib/annotate/*, and liveSchema validates model-supplied annotations against the block's
// ACTUAL data (a hallucinated column ref is dropped individually, the block still renders).

/** Semantic tone → design token, tokens-only (no hex). */
export type AnnotationTone = 'presence' | 'insight' | 'warning' | 'danger' | 'muted';

const TONES: ReadonlySet<string> = new Set<AnnotationTone>([
  'presence',
  'insight',
  'warning',
  'danger',
  'muted',
]);

/** The CSS custom-property / token an annotation tone paints with. */
export const TONE_VAR: Record<AnnotationTone, string> = {
  presence: 'var(--presence)',
  insight: 'var(--insight)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--text-muted)',
};

/** What an annotation binds to (ChartAccent-style typed targets). Data-driven targets are matched
 *  against the block's real data at validation; a position/value target rides the value axis. */
export type AnnotationTarget =
  | { kind: 'row'; match: string } //        a table row whose first cell / label matches
  | { kind: 'column'; key: string } //       a table column by key
  | { kind: 'cell'; row: string; column: string }
  | { kind: 'item'; match: string } //       a list item / category label
  | { kind: 'series'; name: string } //      a chart series by name
  | { kind: 'value'; value: number } //      a point on the value axis (for a reference line)
  | { kind: 'range'; from: number; to: number } // a band on the value axis
  | { kind: 'block' }; //                     the whole block

/** How a `summary` row/line is computed — WE compute it from the real data, never trusting a
 *  model-supplied total (the numbers must be honest). */
export type SummaryStat = 'total' | 'mean' | 'max' | 'min' | 'count';

/** How a `format` op renders a column's values. */
export type FormatAs = 'currency' | 'percent' | 'unit' | 'duration';

/** One annotation. Eight ops across the six categories (reference · highlight · label · summary ·
 *  semantic-format · narrative). Each carries a typed target and, where relevant, a tone/label. */
export type Annotation =
  | {
      op: 'refline';
      target: { kind: 'value'; value: number } | { kind: 'range'; from: number; to: number };
      label?: string;
      tone?: AnnotationTone;
    }
  | { op: 'emphasize'; target: AnnotationTarget; tone?: AnnotationTone; dimOthers?: boolean }
  | { op: 'label'; target: AnnotationTarget; text: string }
  | { op: 'summary'; stat: SummaryStat; label?: string; columns?: string[] }
  | {
      op: 'format';
      target: { kind: 'column'; key: string } | { kind: 'block' };
      as: FormatAs;
      unit?: string;
    }
  | {
      op: 'status';
      target: { kind: 'column'; key: string };
      rules: { match: string; tone: AnnotationTone }[];
    }
  | { op: 'bar'; target: { kind: 'column'; key: string } }
  | { op: 'note'; target: AnnotationTarget; text: string };

export type AnnotationOp = Annotation['op'];

/** The block's real data, projected once by the caller so annotations validate against what's
 *  actually there — a `column.key` not in `columnKeys`, a `row.match` hitting no row, or a `value`
 *  far outside the domain fails and that annotation is dropped (the block still renders). */
export interface AnnotationSurface {
  columnKeys?: string[];
  rowLabels?: string[];
  itemLabels?: string[];
  seriesNames?: string[];
  valueDomain?: { min: number; max: number };
}

/** Total annotations kept per block, and per-op ceilings (so a model can't bury a card in ink). */
export const MAX_ANNOTATIONS = 6;
const OP_CAPS: Record<AnnotationOp, number> = {
  refline: 2,
  emphasize: 3,
  label: 3,
  summary: 2,
  format: 4,
  status: 2,
  bar: 2,
  note: 2,
};

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const tone = (v: unknown): AnnotationTone | undefined =>
  typeof v === 'string' && TONES.has(v) ? (v as AnnotationTone) : undefined;

const ci = (s: string) => s.trim().toLowerCase();

/** True when a data-driven target resolves against the surface (so a hallucinated ref is dropped). */
function targetValid(t: AnnotationTarget, s: AnnotationSurface): boolean {
  switch (t.kind) {
    case 'block':
      return true;
    case 'column':
      return !!s.columnKeys && s.columnKeys.includes(t.key);
    case 'row':
      return !!s.rowLabels && s.rowLabels.some((r) => ci(r) === ci(t.match));
    case 'cell':
      return (
        !!s.columnKeys &&
        s.columnKeys.includes(t.column) &&
        !!s.rowLabels &&
        s.rowLabels.some((r) => ci(r) === ci(t.row))
      );
    case 'item':
      return !!s.itemLabels && s.itemLabels.some((i) => ci(i) === ci(t.match));
    case 'series':
      return !!s.seriesNames && s.seriesNames.some((n) => ci(n) === ci(t.name));
    case 'value':
      // A value near/within the domain is meaningful as a reference line; wildly-out is dropped.
      if (!s.valueDomain) return true;
      return (
        t.value >= s.valueDomain.min - Math.abs(s.valueDomain.min) - 1 &&
        t.value <= s.valueDomain.max + Math.abs(s.valueDomain.max) + 1
      );
    case 'range':
      return true;
    default:
      return false;
  }
}

/** Coerce ONE loose annotation object into a typed target, or null. */
function coerceTarget(raw: unknown): AnnotationTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const kind = asStr(t.kind);
  switch (kind) {
    case 'block':
      return { kind: 'block' };
    case 'column':
      return t.key ? { kind: 'column', key: asStr(t.key) } : null;
    case 'row':
      return t.match ? { kind: 'row', match: asStr(t.match) } : null;
    case 'cell':
      return t.row && t.column
        ? { kind: 'cell', row: asStr(t.row), column: asStr(t.column) }
        : null;
    case 'item':
      return t.match ? { kind: 'item', match: asStr(t.match) } : null;
    case 'series':
      return t.name ? { kind: 'series', name: asStr(t.name) } : null;
    case 'value': {
      const v = asNum(t.value);
      return v === null ? null : { kind: 'value', value: v };
    }
    case 'range': {
      const from = asNum(t.from);
      const to = asNum(t.to);
      return from === null || to === null ? null : { kind: 'range', from, to };
    }
    default:
      return null;
  }
}

/** Coerce + validate ONE loose annotation against the surface, or null to drop it. */
function coerceOne(raw: unknown, s: AnnotationSurface): Annotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const op = asStr(a.op);
  switch (op) {
    case 'refline': {
      const target = coerceTarget(a.target);
      if (!target || (target.kind !== 'value' && target.kind !== 'range')) return null;
      if (!targetValid(target, s)) return null;
      return {
        op,
        target,
        ...(a.label ? { label: asStr(a.label) } : {}),
        ...(tone(a.tone) ? { tone: tone(a.tone) } : {}),
      };
    }
    case 'emphasize': {
      const target = coerceTarget(a.target);
      if (!target || !targetValid(target, s)) return null;
      return {
        op,
        target,
        ...(tone(a.tone) ? { tone: tone(a.tone) } : {}),
        ...(a.dimOthers === true ? { dimOthers: true } : {}),
      };
    }
    case 'label':
    case 'note': {
      const target = coerceTarget(a.target);
      const text = asStr(a.text);
      if (!target || !text || !targetValid(target, s)) return null;
      return { op, target, text };
    }
    case 'summary': {
      const stat = asStr(a.stat) as SummaryStat;
      if (!['total', 'mean', 'max', 'min', 'count'].includes(stat)) return null;
      const columns = Array.isArray(a.columns)
        ? a.columns.map(asStr).filter((c) => !s.columnKeys || s.columnKeys.includes(c))
        : undefined;
      return {
        op,
        stat,
        ...(a.label ? { label: asStr(a.label) } : {}),
        ...(columns && columns.length ? { columns } : {}),
      };
    }
    case 'format': {
      const target = coerceTarget(a.target);
      if (!target || (target.kind !== 'column' && target.kind !== 'block')) return null;
      if (!targetValid(target, s)) return null;
      const as = asStr(a.as) as FormatAs;
      if (!['currency', 'percent', 'unit', 'duration'].includes(as)) return null;
      return { op, target, as, ...(a.unit ? { unit: asStr(a.unit) } : {}) };
    }
    case 'status': {
      const target = coerceTarget(a.target);
      if (!target || target.kind !== 'column' || !targetValid(target, s)) return null;
      const rules = Array.isArray(a.rules)
        ? a.rules
            .map((r) => {
              const rr = r as Record<string, unknown>;
              const t = tone(rr.tone);
              return rr.match && t ? { match: asStr(rr.match), tone: t } : null;
            })
            .filter((r): r is { match: string; tone: AnnotationTone } => r !== null)
        : [];
      return rules.length ? { op, target, rules } : null;
    }
    case 'bar': {
      const target = coerceTarget(a.target);
      if (!target || target.kind !== 'column' || !targetValid(target, s)) return null;
      return { op, target };
    }
    default:
      return null; // unknown op → dropped (this is the forward-compat versioning)
  }
}

/**
 * Validate a loose, model-supplied annotations array against the block's real data. Returns a
 * clean, capped, typed list — invalid or hallucinated entries are dropped INDIVIDUALLY (the block
 * always still renders). Never throws.
 */
export function validateAnnotations(raw: unknown, surface: AnnotationSurface): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  const perOp: Partial<Record<AnnotationOp, number>> = {};
  for (const item of raw) {
    if (out.length >= MAX_ANNOTATIONS) break;
    const a = coerceOne(item, surface);
    if (!a) continue;
    const n = perOp[a.op] ?? 0;
    if (n >= OP_CAPS[a.op]) continue; // per-op cap
    perOp[a.op] = n + 1;
    out.push(a);
  }
  return out;
}
