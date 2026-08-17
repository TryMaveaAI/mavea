// observation.ts — what a check actually FETCHED, in a shape this app defines.
//
// The refresh used to ask a model to regenerate a finished canvas block: the exact component type,
// with the exact prop names its React renderer reads, nested item shapes and all. That made the
// model responsible for Mavéa's rendering contract, and every drift in it — an invented field name,
// a wrapped array, a missing key — threw away a grounded search the user had already paid for. The
// prompt grew a whole teaching layer to compensate, and still lost data.
//
// So a check now asks for DATA, in the smallest schema that can carry it, and this app turns that
// data into a component. Two consequences worth stating plainly:
//   · the schemas are tiny (a list is `items[]` of strings, a table is `columns[]` + `rows[][]`),
//     and small schemas are dramatically easier for a model to satisfy than a 600-component
//     rendering contract;
//   · the VIEW becomes a local decision. The same list observation can render as a list today and
//     a leaderboard tomorrow without re-asking anyone, because the truth and its presentation are
//     no longer the same object.
//
// Coercion is deliberately generous about SHAPE (a model may send numbers as strings, wrap rows in
// objects, name a field `label` instead of `text`) and strict about SUBSTANCE: a value that isn't
// really there is dropped rather than defaulted, so nothing renders that a source didn't say.
import { toNumber } from '../ground/number';

export type ObservationKind = 'metric' | 'series' | 'list' | 'table' | 'event';

export interface MetricObservation {
  kind: 'metric';
  value: number;
  /** The value exactly as the source wrote it ("$1,624.95", "4.18%") when that differs. */
  raw?: string;
}
export interface SeriesObservation {
  kind: 'series';
  points: { label: string; value: number }[];
}
export interface ListObservation {
  kind: 'list';
  items: string[];
}
export interface TableObservation {
  kind: 'table';
  columns: string[];
  rows: string[][];
}
export interface EventObservation {
  kind: 'event';
  events: { when: string; title: string; detail?: string }[];
}

export type ObservationData =
  MetricObservation | SeriesObservation | ListObservation | TableObservation | EventObservation;

/** The JSON the model is asked to return per target — one flat object per kind, no nesting beyond
 *  a row/point/event, and no component vocabulary anywhere in it. */
export const OBSERVATION_SHAPE: Record<ObservationKind, string> = {
  metric: '{"kind":"metric","value":number,"raw"?:string}',
  series: '{"kind":"series","points":[{"label":string,"value":number}]}',
  list: '{"kind":"list","items":[string]}',
  table: '{"kind":"table","columns":[string],"rows":[[string]]}',
  event: '{"kind":"event","events":[{"when":string,"title":string,"detail"?:string}]}',
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
/** A cell/label as text. Numbers and booleans are real content a source stated — keep them as
 *  written; only absent/empty becomes ''. */
function text(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return '';
}
/** The first non-empty value among the aliases a model plausibly used instead of the asked name. */
function alias(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const t = text(o[k]);
    if (t) return t;
  }
  return '';
}

/** An object whose values are all primitives, joined into one legible row — the salvage path for a
 *  model that invented its own item schema ({ticker, company, price}) instead of sending strings.
 *  A grounded search was already paid for; discarding it because the shape drifted is the failure
 *  this whole module exists to stop. */
function flattenItem(v: unknown): string {
  if (!isObj(v)) return text(v);
  const named = alias(v, 'text', 'label', 'title', 'name', 'item');
  if (named) {
    const rest = Object.entries(v)
      .filter(([k]) => !['text', 'label', 'title', 'name', 'item'].includes(k))
      .map(([, x]) => text(x))
      .filter(Boolean);
    return rest.length ? `${named} — ${rest.join(' — ')}` : named;
  }
  return Object.values(v).map(text).filter(Boolean).join(' — ');
}

/** Coerce a model's reply for ONE target into the observation its kind promises, or null when
 *  nothing real came back. Null is a first-class answer: it means "this check found nothing for
 *  this target", which the caller reports honestly rather than rendering an empty card as data. */
export function coerceObservation(kind: ObservationKind, raw: unknown): ObservationData | null {
  const o = isObj(raw) ? raw : {};
  switch (kind) {
    case 'metric': {
      const value = toNumber(o.value ?? o.number ?? o.amount ?? raw);
      if (value === null) return null;
      const rawText = alias(o, 'raw', 'display', 'formatted');
      return { kind: 'metric', value, ...(rawText ? { raw: rawText } : {}) };
    }
    case 'series': {
      const points = arr(o.points ?? o.data ?? o.series)
        .map((p) => {
          const po = isObj(p) ? p : {};
          const label = alias(po, 'label', 'name', 'x', 'when', 'date');
          const value = toNumber(po.value ?? po.y ?? po.amount);
          return label && value !== null ? { label, value } : null;
        })
        .filter((p): p is { label: string; value: number } => p !== null);
      return points.length ? { kind: 'series', points } : null;
    }
    case 'list': {
      const items = arr(o.items ?? o.list ?? o.entries ?? raw)
        .map(flattenItem)
        .filter(Boolean);
      return items.length ? { kind: 'list', items } : null;
    }
    case 'table': {
      const rawRows = arr(o.rows ?? o.data ?? raw);
      let columns = arr(o.columns ?? o.headers ?? o.cols)
        .map(text)
        .filter(Boolean);
      // Row-objects carry their own column names — derive the header from the first row when the
      // model sent records instead of a columns array plus arrays.
      if (!columns.length && isObj(rawRows[0])) columns = Object.keys(rawRows[0]).map(text);
      const rows = rawRows
        .map((r) => {
          if (Array.isArray(r)) return r.map(text);
          if (isObj(r)) return columns.map((c) => text(r[c]));
          return [];
        })
        .filter((r) => r.some(Boolean));
      return columns.length && rows.length ? { kind: 'table', columns, rows } : null;
    }
    case 'event': {
      const events = arr(o.events ?? o.items ?? raw)
        .map((e) => {
          const eo = isObj(e) ? e : {};
          const title = alias(eo, 'title', 'name', 'event', 'label');
          if (!title) return null;
          const when = alias(eo, 'when', 'date', 'time', 'at', 'start');
          const detail = alias(eo, 'detail', 'description', 'note', 'status');
          return { when, title, ...(detail ? { detail } : {}) };
        })
        .filter((e): e is { when: string; title: string; detail?: string } => e !== null);
      return events.length ? { kind: 'event', events } : null;
    }
  }
}

/** The observation kind a widget's view needs, or null when it still needs a model-built block.
 *  Keyed on the RENDERER, because that is what decides which data shape can fill it.
 *
 *  The boundary is deliberate and narrow: a view qualifies only when its content IS the data. An
 *  `insight` or `kpi` also carries PROSE — a title that reframes, a summary that says what the
 *  number means — and no observation schema here can hold that, so routing them through this path
 *  would trade a rich card for a bare stat. Those keep the block path, where a model writes the
 *  words. The long tail (scoreboards, forecasts, diagrams) keeps it too. */
const KIND_BY_BLOCK_TYPE: Record<string, ObservationKind> = {
  list: 'list',
  checklist: 'list',
  timeline: 'event',
  datatable: 'table',
  standings: 'table',
  chart: 'series',
  bars: 'series',
};

export function observationKindFor(blockType: string): ObservationKind | null {
  return KIND_BY_BLOCK_TYPE[blockType] ?? null;
}
