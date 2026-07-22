// tableAnnotations.ts — resolve the closed annotation grammar (canvas/lib/annotations) into a small
// precomputed view a table renderer applies per cell/row, with O(1) lookups. This is the "annotate
// a base" render half: it's what turns a plain `datatable` + [format:currency, summary:total,
// emphasize:Total row] into a receipt — the same table component, adapted, no bespoke `receipt`
// code. Pure; the numbers in a `summary` row are computed HERE from the real rows (never trusted
// from the model). tokens-only tones via TONE_VAR.
import { type Annotation, type AnnotationTone, TONE_VAR } from '../annotations';
import { formatValue, withUnit } from '../format';

interface Column {
  key: string;
  label: string;
  numeric?: boolean;
}

/** Parse a display string ("$1,234.50", "42%") to a number for computation. */
function toNumber(s: string | undefined): number {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

const ci = (s: string) => s.trim().toLowerCase();

export interface TableAnnotationView {
  /** Format a cell's display text (applies `format` ops for that column; else identity). */
  formatCell: (colKey: string, raw: string) => string;
  /** A tone token for a cell's text, from a `status` rule matching the raw value; else undefined. */
  cellTone: (colKey: string, raw: string) => string | undefined;
  /** A 0..1 fill fraction for an in-cell magnitude bar (`bar` op), relative to the column max. */
  cellBar: (colKey: string, raw: string) => number | undefined;
  /** A tone token to emphasize a row whose label matches an `emphasize` op; else undefined. */
  rowTone: (rowLabel: string) => string | undefined;
  /** When any `emphasize` op sets dimOthers, non-matched rows render muted. */
  dimUnmatched: boolean;
  /** Computed summary rows (from `summary` ops) to append below the body. Each maps colKey→text. */
  summaryRows: { label: string; cells: Record<string, string> }[];
  /** Whether this view does anything (lets the renderer skip all annotation work when empty). */
  active: boolean;
}

const EMPTY: TableAnnotationView = {
  formatCell: (_k, raw) => raw,
  cellTone: () => undefined,
  cellBar: () => undefined,
  rowTone: () => undefined,
  dimUnmatched: false,
  summaryRows: [],
  active: false,
};

/** Build the render view. `annotations` are assumed already validated (liveSchema) but this is
 *  defensive regardless (an op referencing a missing column simply no-ops). */
export function resolveTableAnnotations(
  annotations: Annotation[] | undefined,
  columns: Column[],
  rows: Record<string, string>[],
): TableAnnotationView {
  if (!annotations || annotations.length === 0) return EMPTY;

  const labelKey = columns[0]?.key ?? '';
  const numericKeys = new Set(columns.filter((c) => c.numeric).map((c) => c.key));

  // format: column → formatter
  const formatters = new Map<string, (raw: string) => string>();
  // status: column → rules
  const statusRules = new Map<string, { match: string; tone: AnnotationTone }[]>();
  // bar: column → max magnitude (for the 0..1 fraction)
  const barCols = new Map<string, number>();
  // emphasize: matched row labels → tone
  const rowTones = new Map<string, AnnotationTone>();
  let dimUnmatched = false;
  const summaryRows: { label: string; cells: Record<string, string> }[] = [];

  for (const a of annotations) {
    switch (a.op) {
      case 'format': {
        const cols = a.target.kind === 'column' ? [a.target.key] : columns.map((c) => c.key);
        for (const key of cols) {
          formatters.set(key, (raw) => {
            const n = toNumber(raw);
            if (a.as === 'currency') return formatValue(n, { currency: 'USD' });
            if (a.as === 'percent') return formatValue(n, { percent: true });
            if (a.as === 'unit') return withUnit(n, a.unit);
            if (a.as === 'duration') return withUnit(n, a.unit ?? 'min');
            return raw;
          });
        }
        break;
      }
      case 'status':
        statusRules.set(a.target.key, a.rules);
        break;
      case 'bar': {
        const key = a.target.key;
        const max = Math.max(1, ...rows.map((r) => Math.abs(toNumber(r[key]))));
        barCols.set(key, max);
        break;
      }
      case 'emphasize':
        if (a.target.kind === 'row') {
          rowTones.set(ci(a.target.match), a.tone ?? 'presence');
          if (a.dimOthers) dimUnmatched = true;
        }
        break;
      case 'summary': {
        // Compute the stat over the numeric columns (or the requested subset), from real rows.
        const cols = (a.columns ?? columns.map((c) => c.key)).filter(
          (k) => numericKeys.has(k) || a.columns?.includes(k),
        );
        const cells: Record<string, string> = {};
        for (const key of cols) {
          const vals = rows.map((r) => toNumber(r[key]));
          if (vals.length === 0) continue;
          let v: number;
          switch (a.stat) {
            case 'total':
              v = vals.reduce((s, x) => s + x, 0);
              break;
            case 'mean':
              v = vals.reduce((s, x) => s + x, 0) / vals.length;
              break;
            case 'max':
              v = Math.max(...vals);
              break;
            case 'min':
              v = Math.min(...vals);
              break;
            case 'count':
              v = vals.length;
              break;
            default:
              v = 0;
          }
          // Reuse the column's formatter so a summed currency column stays currency-formatted.
          const fmt = formatters.get(key);
          cells[key] = fmt ? fmt(String(v)) : formatValue(v, {});
        }
        const label =
          a.label ??
          { total: 'Total', mean: 'Average', max: 'Max', min: 'Min', count: 'Count' }[a.stat];
        // The label sits in the first (label) column if that column has no computed value.
        if (labelKey && cells[labelKey] === undefined) cells[labelKey] = label;
        summaryRows.push({ label, cells });
        break;
      }
      default:
        break; // refline/label/note don't apply to a table body
    }
  }

  const toneVar = (t: AnnotationTone | undefined) => (t ? TONE_VAR[t] : undefined);

  return {
    active: true,
    dimUnmatched,
    summaryRows,
    formatCell: (colKey, raw) => {
      const f = formatters.get(colKey);
      return f ? f(raw) : raw;
    },
    cellTone: (colKey, raw) => {
      const rules = statusRules.get(colKey);
      if (!rules) return undefined;
      const hit = rules.find((r) => ci(raw).includes(ci(r.match)));
      return hit ? TONE_VAR[hit.tone] : undefined;
    },
    cellBar: (colKey, raw) => {
      const max = barCols.get(colKey);
      if (!max) return undefined;
      return Math.max(0, Math.min(1, Math.abs(toNumber(raw)) / max));
    },
    rowTone: (rowLabel) => toneVar(rowTones.get(ci(rowLabel))),
  };
}
