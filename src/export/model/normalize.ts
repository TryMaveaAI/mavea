// Flatten one or more Mavéa answers (`ConversationSpec`) into the export model — an ordered
// list of section archetypes plus the masthead facts. Pure and dependency-light so it runs
// the same in a test, the preview, and the export pipeline.
//
// Two paths feed the same output:
//   • Core block types get a precise extractor that knows their exact prop shape.
//   • Everything else routes through `archetypeFor` (its declared DataShape) into a generic,
//     field-probing extractor, and finally a prose fallback — so no block renders blank.
//
// Real-data-only: extractors read a block's real props and never invent content. A slot with
// no real data is simply omitted.
import type { Block, ConversationSpec } from '../../data/conversation';
import { archetypeFor } from './mapping';
import { catalogFacts, type ComponentFacts } from '../../canvas/blocks/catalog/facts';
import { embedClass } from '../../canvas/embed/embedClass';
import type { PdfMetadata } from '../pipeline/raster';
import type {
  ExportMeta,
  RankedItem,
  Section,
  SectionDraft,
  SectionKind,
  SourceMeta,
} from './ExportDoc';

/* ── small pure helpers ─────────────────────────────────────────────────────── */

/** Strip HTML tags, decode the few entities our content uses, and collapse whitespace. */
export function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const isFiniteNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Title-case a confidence word for the "Inferred" honesty tag. */
function confWord(conf?: string): string | undefined {
  if (!conf) return undefined;
  return conf.charAt(0).toUpperCase() + conf.slice(1);
}

/** Format a number with an optional unit, dropping noisy trailing decimals. */
function fmt(n: number, unit?: string): string {
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return unit ? `${r}${unit.length <= 2 ? '' : ' '}${unit}` : String(r);
}

const max = (xs: number[]): number => xs.reduce((m, x) => (x > m ? x : m), 0);
const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);

type AnyProps = Record<string, unknown>;
const propsOf = (b: Block): AnyProps => ((b.props ?? {}) as unknown as AnyProps) || {};

/** First non-empty array prop, preferring conventional collection names. */
function pickArray(p: AnyProps): unknown[] | null {
  const preferred = [
    'items',
    'rows',
    'bars',
    'segments',
    'series',
    'steps',
    'stages',
    'events',
    'kpis',
    'stats',
    'metrics',
    'points',
    'cells',
    'data',
    'entries',
    'list',
  ];
  for (const key of preferred) {
    const v = p[key];
    if (Array.isArray(v) && v.length) return v;
  }
  for (const v of Object.values(p)) if (Array.isArray(v) && v.length) return v;
  return null;
}

/** First string-valued field among `names` on an object. */
function strField(o: unknown, names: string[]): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const rec = o as AnyProps;
  for (const n of names) {
    const v = rec[n];
    if (typeof v === 'string' && v.trim()) return plain(v);
  }
  return undefined;
}

/** First number-valued field among `names` on an object. */
function numField(o: unknown, names: string[]): number | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const rec = o as AnyProps;
  for (const n of names) if (isFiniteNum(rec[n])) return rec[n] as number;
  return undefined;
}

const NAME_FIELDS = ['name', 'label', 'title', 'text', 'k', 't', 'team', 'who'];
const VALUE_FIELDS = ['val', 'value', 'display', 'v', 'amount', 'rec'];
const HEADING_FIELDS = ['title', 'heading', 'label', 'name', 'question', 'caption', 'eyebrow'];
const BODY_FIELDS = ['summary', 'narrative', 'detail', 'sub', 'body', 'text'];

/* ── prose fallback (the universal honest renderer) ─────────────────────────── */

/**
 * Render a block we can't lay out as a heading + paragraph — but ONLY from its real, prop-derived
 * text. Returns null when the block carries no real heading and no real body, so an unrenderable
 * block (a bare map/video with no caption) is dropped rather than left as a placeholder-looking
 * stub. Never surfaces the internal block `type` as printable text (real-data-only).
 */
function proseDraft(b: Block): SectionDraft | null {
  const p = propsOf(b);
  const heading = strField(p, HEADING_FIELDS);
  let body: string | undefined;
  for (const f of BODY_FIELDS) {
    const v = strField(p, [f]);
    if (v && v !== heading) {
      body = v;
      break;
    }
  }
  if (!heading && !body) return null;
  return { kind: 'prose', data: { heading, body: body ?? '' } };
}

/** proseDraft as a (possibly empty) draft list — an extractor whose own data is missing falls
 *  back to prose, and prose itself drops to nothing when the block carries no real text. */
function fallback(b: Block): SectionDraft[] {
  const d = proseDraft(b);
  return d ? [d] : [];
}

/* ── generic extractor for the extended library ─────────────────────────────── */

function genericDraft(b: Block, kind: SectionKind): SectionDraft | null {
  const p = propsOf(b);
  const heading = strField(p, ['title', 'heading', 'eyebrow', 'label']);
  const arr = pickArray(p);

  const named = (): { name: string; o: unknown }[] =>
    (arr ?? [])
      .map((o) =>
        typeof o === 'string' ? { name: plain(o), o } : { name: strField(o, NAME_FIELDS) ?? '', o },
      )
      .filter((it) => it.name);

  switch (kind) {
    case 'metricTiles': {
      const tiles = named()
        .map((it) => ({
          value: strField(it.o, VALUE_FIELDS) ?? numField(it.o, VALUE_FIELDS)?.toString() ?? '',
          label: it.name,
        }))
        .filter((t) => t.value);
      return tiles.length ? { kind, data: { heading, tiles } } : null;
    }
    case 'rankedList': {
      const items: RankedItem[] = named().map((it) => ({
        name: it.name,
        meta: strField(it.o, ['meta', 'sub', 'detail', 'domain', 'tag', 'gb', 'rec', 'kind']),
        pct: clampPct(numField(it.o, ['pct', 'value', 'val'])),
      }));
      return items.length ? { kind, data: { heading, items } } : null;
    }
    case 'distributionBars': {
      const raw = named().map((it) => ({
        label: it.name,
        n: numField(it.o, ['pct', 'value', 'val', 'amount']) ?? 0,
        display: strField(it.o, ['display', 'val', 'value']),
      }));
      const total = max(raw.map((r) => r.n)) > 1 ? sum(raw.map((r) => r.n)) : 1;
      const bars = raw
        .filter((r) => r.n > 0)
        .map((r) => ({ label: r.label, pct: clamp01(r.n / (total || 1)), value: r.display }));
      return bars.length ? { kind, data: { heading, bars } } : null;
    }
    case 'figureGrid': {
      const raw = named().map((it) => ({
        title: it.name,
        n: numField(it.o, ['value', 'val', 'v', 'pct']),
        value: strField(it.o, ['display', 'val', 'value']),
      }));
      const m = max(raw.map((r) => r.n ?? 0)) || 1;
      const cells = raw.map((r) => ({
        title: r.title,
        value: r.value ?? (isFiniteNum(r.n) ? String(r.n) : undefined),
        pct: isFiniteNum(r.n) ? clamp01(r.n / m) : undefined,
      }));
      return cells.length ? { kind, data: { heading, cells } } : null;
    }
    case 'checklist': {
      const items = named().map((it) => ({
        title: it.name,
        note: strField(it.o, ['note', 'sub', 'detail']),
        status: normStatus(strField(it.o, ['status', 'st', 'state'])),
      }));
      return items.length ? { kind, data: { heading, items } } : null;
    }
    case 'verticalTimeline': {
      const events = named().map((it) => ({
        marker: strField(it.o, ['time', 'marker', 'when', 'date']),
        title: it.name,
        body: strField(it.o, ['detail', 'body', 'sub', 'note']),
        tag: strField(it.o, ['tag']),
      }));
      return events.length ? { kind, data: { heading, events } } : null;
    }
    case 'numberedMilestones': {
      const items = named().map((it) => ({
        title: it.name,
        body: strField(it.o, ['sub', 'detail', 'body', 'note']),
        tag: strField(it.o, ['tag']),
      }));
      return items.length ? { kind, data: { heading, items } } : null;
    }
    case 'specTable':
      return tableDraft(b, heading);
    case 'ratingMatrix':
      return null; // dot matrices need a real cols×rows shape; let core `heat` own this
    default:
      return null;
  }
}

function clampPct(n?: number): number | undefined {
  if (!isFiniteNum(n)) return undefined;
  return clamp01(n > 1 ? n / 100 : n);
}

function normStatus(s?: string): 'done' | 'doing' | 'todo' | undefined {
  if (!s) return undefined;
  const v = s.toLowerCase();
  if (['done', 'pass', 'complete', 'completed', 'ok'].includes(v)) return 'done';
  if (['doing', 'active', 'progress', 'in_progress', 'skip', 'partial'].includes(v)) return 'doing';
  if (['todo', 'fail', 'pending', 'blocked'].includes(v)) return 'todo';
  return undefined;
}

/** Build a specTable from an array of objects (or arrays), inferring columns from keys. */
function tableDraft(b: Block, heading?: string): SectionDraft | null {
  const arr = pickArray(propsOf(b));
  if (!arr) return null;
  if (Array.isArray(arr[0])) {
    const rows = (arr as unknown[][]).map((r) => r.map((c) => plain(String(c ?? ''))));
    return rows.length ? { kind: 'specTable', data: { heading, columns: [], rows } } : null;
  }
  const objs = arr.filter((o): o is AnyProps => !!o && typeof o === 'object');
  if (!objs.length) return null;
  const keys = Array.from(
    objs.reduce((set, o) => {
      Object.keys(o).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  )
    .filter(isPresentableKey)
    .slice(0, 5);
  // If nothing reader-facing survives (all ids / timestamps / internal fields), this isn't a table
  // a human would read — fall back to prose rather than print raw machine field names.
  if (!keys.length) return null;
  const columns = keys.map(humanizeHeader);
  const rows = objs.map((o) => keys.map((c) => plain(String(o[c] ?? ''))));
  return { kind: 'specTable', data: { heading, columns, rows } };
}

/** Object keys that don't belong in a reader-facing table — internal ids, timestamps, private fields. */
function isPresentableKey(key: string): boolean {
  if (key.startsWith('_')) return false;
  return !/^(id|.*_id|uid|uuid|guid|key|slug|ts|timestamp|created_?at|updated_?at|__typename)$/i.test(
    key,
  );
}

/** "unitPrice" / "unit_price" / "unit-price" → "Unit Price"; an ALL-CAPS or already-spaced label is kept. */
function humanizeHeader(key: string): string {
  const words = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return words
    .split(' ')
    .map((w) => (/^[A-Z0-9]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/* ── precise core extractors ────────────────────────────────────────────────── */

type CoreExtractor = (b: Block) => SectionDraft[];

/** Read a core block's typed props. The union is narrowed by `b.type` at each call site, so the
 *  cast to the specific props type is sound (the extractor is only registered for that type). */
const core: Partial<Record<string, CoreExtractor>> = {
  insight: (b) => {
    const p = propsOf(b);
    const summary =
      plain(p.summary as string) ||
      [plain(p.stat as string), plain(p.delta as string)].filter(Boolean).join(' · ') ||
      undefined;
    return [
      {
        kind: 'findingCallout',
        data: {
          num: (b as { num?: string }).num,
          conf: confWord(p.conf as string),
          title: plain(p.title as string),
          summary,
        },
      },
    ];
  },

  understand: (b) => {
    const p = propsOf(b);
    const items = ((p.items as AnyProps[]) ?? [])
      .map((it) => ({ name: plain(it.text as string), meta: strField(it, ['source']) }))
      .filter((it) => it.name);
    if (!items.length) return fallback(b);
    return [
      {
        kind: 'rankedList',
        data: { heading: plain(p.title as string) || 'What I understood', items },
      },
    ];
  },

  chart: (b) => {
    const p = propsOf(b);
    const labels = ((p.labels as string[]) ?? []).map(plain);
    const series = (p.series as { name: string; data: number[] }[]) ?? [];
    const unit = p.unit as string | undefined;
    const heading = plain(p.title as string);
    const caption = plain(p.footer as string) || undefined;
    if (!series.length) return fallback(b);
    // The real trend payload — documents draw it as an SVG line/area chart; the cells below remain
    // the slide/fallback representation (a chart needs ≥2 points and at least one numeric series).
    const numericSeries = series.filter(
      (s) => Array.isArray(s.data) && s.data.some((d) => isFiniteNum(d)),
    );
    const chart =
      labels.length >= 2 && numericSeries.length
        ? {
            labels,
            series: numericSeries.map((s) => ({ name: plain(s.name), data: s.data })),
            unit,
          }
        : undefined;
    if (labels.length && labels.length <= 10) {
      const s0 = series[0];
      const m = max(series.flatMap((s) => s.data.map((d) => Math.abs(d)))) || 1;
      const cells = labels.map((label, i) => ({
        title: label,
        value: isFiniteNum(s0.data[i]) ? fmt(s0.data[i], unit) : undefined,
        pct: isFiniteNum(s0.data[i]) ? clamp01(Math.abs(s0.data[i]) / m) : undefined,
      }));
      return [{ kind: 'figureGrid', data: { heading, caption, cells, chart } }];
    }
    // A long trend: summarise the cells as the latest reading of each series (the chart shows the
    // full shape; the cells are just the fallback readout).
    const m = max(series.flatMap((s) => s.data.map((d) => Math.abs(d)))) || 1;
    const cells = series.map((s) => {
      const last = s.data[s.data.length - 1];
      return {
        title: plain(s.name),
        value: isFiniteNum(last) ? fmt(last, unit) : undefined,
        pct: isFiniteNum(last) ? clamp01(Math.abs(last) / m) : undefined,
      };
    });
    return [{ kind: 'figureGrid', data: { heading, caption, cells, chart } }];
  },

  breakdown: (b) => {
    const p = propsOf(b);
    const bars = ((p.rows as AnyProps[]) ?? [])
      .map((r) => ({
        label: plain(r.name as string),
        pct: clampPct(r.pct as number) ?? 0,
        value: plain(r.val as string) || undefined,
      }))
      .filter((r) => r.label);
    return bars.length
      ? [{ kind: 'distributionBars', data: { heading: plain(p.title as string), bars } }]
      : fallback(b);
  },

  timeline: (b) => {
    const p = propsOf(b);
    const events = ((p.events as AnyProps[]) ?? [])
      .map((e) => ({
        marker: plain(e.time as string) || undefined,
        title: plain(e.title as string),
        body: plain(e.detail as string) || undefined,
        tag: plain(e.tag as string) || undefined,
      }))
      .filter((e) => e.title);
    const heading = plain(p.title as string) || plain(p.eyebrow as string) || undefined;
    return events.length ? [{ kind: 'verticalTimeline', data: { heading, events } }] : fallback(b);
  },

  list: (b) => {
    const p = propsOf(b);
    const items = ((p.items as string[]) ?? [])
      .map((i) => ({ name: plain(i) }))
      .filter((i) => i.name);
    return items.length
      ? [{ kind: 'rankedList', data: { heading: plain(p.title as string), items } }]
      : fallback(b);
  },

  ring: (b) => {
    const p = propsOf(b);
    const cells = ((p.rings as AnyProps[]) ?? [])
      .map((r) => ({
        title: plain(r.label as string),
        value:
          [plain(r.display as string), plain(r.unit as string)].filter(Boolean).join(' ') ||
          undefined,
        pct: clamp01((r.pct as number) ?? 0),
      }))
      .filter((c) => c.title);
    return cells.length
      ? [{ kind: 'figureGrid', data: { heading: plain(p.title as string), cells } }]
      : fallback(b);
  },

  bars: (b) => {
    const p = propsOf(b);
    const raw = (p.bars as AnyProps[]) ?? [];
    const unit = p.unit as string | undefined;
    const m = max(raw.map((x) => Math.abs((x.value as number) ?? 0))) || 1;
    const cells = raw
      .map((x) => ({
        title: plain(x.label as string),
        value: isFiniteNum(x.value) ? fmt(x.value as number, unit) : undefined,
        pct: isFiniteNum(x.value) ? clamp01(Math.abs(x.value as number) / m) : undefined,
      }))
      .filter((c) => c.title);
    return cells.length
      ? [
          {
            kind: 'figureGrid',
            data: {
              heading: plain(p.title as string),
              caption: plain(p.footer as string) || undefined,
              cells,
            },
          },
        ]
      : fallback(b);
  },

  stack: (b) => {
    const p = propsOf(b);
    const segs = (p.segments as AnyProps[]) ?? [];
    const total = sum(segs.map((s) => (s.value as number) ?? 0)) || 1;
    const bars = segs
      .map((s) => ({
        label: plain(s.label as string),
        pct: clamp01(((s.value as number) ?? 0) / total),
        value: plain(s.display as string) || undefined,
      }))
      .filter((s) => s.label);
    return bars.length
      ? [
          {
            kind: 'distributionBars',
            data: {
              heading: plain(p.title as string),
              total: plain(p.total as string) || undefined,
              bars,
            },
          },
        ]
      : fallback(b);
  },

  donut: (b) => {
    const p = propsOf(b);
    const rows = (p.rows as AnyProps[]) ?? [];
    const bars = rows
      .map((r) => {
        // clampPct treats a value >1 as a percent and ≤1 as a fraction — robust to both conventions.
        const frac = clampPct(r.pct as number) ?? 0;
        return { label: plain(r.label as string), pct: frac, value: `${Math.round(frac * 100)}%` };
      })
      .filter((r) => r.label);
    return bars.length
      ? [{ kind: 'distributionBars', data: { heading: plain(p.title as string), bars } }]
      : fallback(b);
  },

  flow: (b) => {
    const p = propsOf(b);
    const items = ((p.steps as AnyProps[]) ?? [])
      .map((s) => ({ title: plain(s.title as string), body: plain(s.sub as string) || undefined }))
      .filter((s) => s.title);
    return items.length
      ? [{ kind: 'numberedMilestones', data: { heading: plain(p.title as string), items } }]
      : fallback(b);
  },

  pipeline: (b) => {
    const p = propsOf(b);
    const stages = (p.stages as AnyProps[]) ?? [];
    const m = max(stages.map((s) => (s.v as number) ?? 0)) || 1;
    const cells = stages
      .map((s) => ({
        title: plain(s.k as string),
        value: isFiniteNum(s.v)
          ? `${plain((p.unit as string) ?? '')}${s.v}${plain((p.suffix as string) ?? '')}`.trim()
          : undefined,
        pct: isFiniteNum(s.v) ? clamp01(s.v / m) : undefined,
      }))
      .filter((c) => c.title);
    const heading = plain(p.title as string) || plain(p.headline as string) || undefined;
    return cells.length
      ? [
          {
            kind: 'figureGrid',
            data: { heading, caption: plain(p.sub as string) || undefined, cells },
          },
        ]
      : fallback(b);
  },

  web: (b) => {
    const p = propsOf(b);
    const items = ((p.results as AnyProps[]) ?? [])
      .map((r) => ({
        name: plain(r.title as string),
        meta: plain(r.domain as string) || undefined,
      }))
      .filter((r) => r.name);
    return items.length
      ? [{ kind: 'rankedList', data: { heading: plain(p.title as string) || 'Sources', items } }]
      : fallback(b);
  },

  gallery: (b) => {
    const p = propsOf(b);
    const items = ((p.items as AnyProps[]) ?? [])
      .map((it) => ({
        name: plain(it.label as string),
        meta: plain((it.source as string) ?? (it.tag as string)) || undefined,
      }))
      .filter((it) => it.name);
    const heading = plain(p.title as string) || plain(p.eyebrow as string) || undefined;
    return items.length ? [{ kind: 'rankedList', data: { heading, items } }] : fallback(b);
  },

  screenmap: (b) => {
    const p = propsOf(b);
    const items = ((p.screens as AnyProps[]) ?? [])
      .map((s) => ({ name: plain(s.name as string), meta: plain(s.kind as string) || undefined }))
      .filter((s) => s.name);
    return items.length
      ? [{ kind: 'rankedList', data: { heading: plain(p.title as string) || 'Screens', items } }]
      : fallback(b);
  },

  heat: (b) => {
    const p = propsOf(b);
    // Cap columns so the dot grid stays legible (too many 1fr tracks crush the cells).
    const MAX_COLS = 6;
    const cols = ((p.cols as string[]) ?? []).map(plain).slice(0, MAX_COLS);
    const colCount = cols.length || MAX_COLS;
    const rows = ((p.rows as AnyProps[]) ?? [])
      .map((r) => ({
        label: plain(r.label as string),
        values: ((r.cells as unknown[]) ?? []).map(levelOf).slice(0, colCount),
      }))
      .filter((r) => r.label);
    if (!rows.length) return fallback(b);
    // Clamp the dot scale to a sane range so a stray large level can't render hundreds of dots.
    const scale =
      Math.min(
        6,
        Math.max(1, max(rows.flatMap((r) => r.values.filter(isFiniteNum) as number[]))),
      ) || 3;
    const legend = p.legend as [string, string] | undefined;
    return [
      {
        kind: 'ratingMatrix',
        data: {
          heading: plain(p.title as string),
          columns: cols,
          rows,
          scale,
          note: legend
            ? `${plain(legend[0])} → ${plain(legend[1])}`
            : plain(p.footer as string) || undefined,
        },
      },
    ];
  },

  compare: (b) => {
    const p = propsOf(b);
    // Cap options so the table's columns stay readable on the page.
    const MAX_OPTS = 5;
    const options = ((p.options as AnyProps[]) ?? [])
      .map((o) => plain(o.name as string))
      .slice(0, MAX_OPTS);
    const criteria = (p.criteria as AnyProps[]) ?? [];
    if (!options.length || !criteria.length) return fallback(b);
    const rows = criteria.map((c) => [
      plain(c.label as string),
      ...((c.cells as AnyProps[]) ?? [])
        .slice(0, options.length)
        .map((cell) => plain(cell.v as string)),
    ]);
    return [
      {
        kind: 'specTable',
        data: {
          heading: plain(p.eyebrow as string) || 'Comparison',
          columns: ['', ...options],
          rows,
          note: plain(p.recommendation as string) || undefined,
        },
      },
    ];
  },

  checklist: (b) => {
    const p = propsOf(b);
    const items = ((p.rows as AnyProps[]) ?? [])
      .map((r) => ({ title: plain(r.t as string), status: normStatus(r.st as string) }))
      .filter((r) => r.title);
    return items.length
      ? [{ kind: 'checklist', data: { heading: plain(p.title as string) || undefined, items } }]
      : fallback(b);
  },

  checks: (b) => {
    const p = propsOf(b);
    const items = ((p.items as AnyProps[]) ?? [])
      .map((it) => ({
        title: plain(it.name as string),
        note: plain(it.note as string) || undefined,
        status: normStatus(it.status as string),
      }))
      .filter((it) => it.title);
    return items.length
      ? [{ kind: 'checklist', data: { heading: plain(p.title as string) || undefined, items } }]
      : fallback(b);
  },

  buildprog: (b) => {
    const p = propsOf(b);
    const items = ((p.steps as AnyProps[]) ?? [])
      .map((s) => ({
        title: plain(s.label as string),
        note: plain(s.sub as string) || undefined,
        status: normStatus(s.status as string),
      }))
      .filter((s) => s.title);
    return items.length
      ? [{ kind: 'checklist', data: { heading: plain(p.title as string) || undefined, items } }]
      : fallback(b);
  },

  kpi: (b) => {
    const p = propsOf(b);
    const tiles = ((p.kpis as AnyProps[]) ?? [])
      .map((k) => ({ value: plain(k.val as string), label: plain(k.label as string) }))
      .filter((t) => t.value || t.label);
    return tiles.length
      ? [{ kind: 'metricTiles', data: { heading: plain(p.title as string), tiles } }]
      : fallback(b);
  },

  gauge: (b) => {
    const p = propsOf(b);
    const value = p.value as number;
    if (!isFiniteNum(value)) return fallback(b);
    const valueStr = isFiniteNum(p.max) ? `${value} / ${p.max}` : String(value);
    return [
      {
        kind: 'metricTiles',
        data: {
          heading: plain(p.title as string),
          tiles: [{ value: valueStr, label: plain(p.band as string) || 'Reading' }],
        },
      },
    ];
  },

  scoreboard: (b) => {
    const p = propsOf(b);
    const rows = ((p.games as AnyProps[]) ?? []).map((g) => [
      `${plain(g.away as string)} @ ${plain(g.home as string)}`,
      `${plain(g.as as string)}–${plain(g.hs as string)}`,
      plain(g.status as string),
    ]);
    return rows.length
      ? [
          {
            kind: 'specTable',
            data: {
              heading: plain(p.title as string) || 'Scoreboard',
              columns: ['Matchup', 'Score', 'Status'],
              rows,
            },
          },
        ]
      : fallback(b);
  },

  standings: (b) => {
    const p = propsOf(b);
    const rows = ((p.rows as AnyProps[]) ?? []).map((r) => [
      plain(r.team as string),
      plain(r.rec as string),
      plain(r.gb as string),
    ]);
    return rows.length
      ? [
          {
            kind: 'specTable',
            data: {
              heading: plain(p.title as string) || 'Standings',
              columns: ['Team', 'Record', 'GB'],
              rows,
            },
          },
        ]
      : fallback(b);
  },

  schema: (b) => {
    const p = propsOf(b);
    const rows: string[][] = [];
    for (const e of (p.entities as AnyProps[]) ?? []) {
      for (const f of (e.fields as AnyProps[]) ?? []) {
        rows.push([
          plain(e.name as string),
          `${plain(f.name as string)}${f.key ? ' (key)' : ''}`,
          plain(f.type as string),
        ]);
      }
    }
    return rows.length
      ? [
          {
            kind: 'specTable',
            data: {
              heading: plain(p.title as string) || 'Data model',
              columns: ['Entity', 'Field', 'Type'],
              rows,
            },
          },
        ]
      : fallback(b);
  },

  quotes: (b) => {
    const p = propsOf(b);
    const quotes = ((p.quotes as AnyProps[]) ?? []).filter((q) => plain(q.text as string));
    if (!quotes.length) return fallback(b);
    if (quotes.length === 1) {
      const q = quotes[0];
      return [
        {
          kind: 'spotlightCard',
          data: {
            label: plain(p.title as string) || 'Quote',
            title: plain(q.text as string),
            body: plain(q.who as string) || undefined,
          },
        },
      ];
    }
    const body = quotes
      .map((q) => `“${plain(q.text as string)}” — ${plain(q.who as string)}`)
      .join('   ');
    return [{ kind: 'prose', data: { heading: plain(p.title as string) || 'Quotes', body } }];
  },

  scatter: (b) => {
    const p = propsOf(b);
    const pts = (p.points as unknown[]) ?? [];
    const body =
      plain(p.footer as string) ||
      `${plain(p.xLabel as string) || 'x'} vs ${plain(p.yLabel as string) || 'y'} · ${pts.length} points.`;
    return [{ kind: 'prose', data: { heading: plain(p.title as string), body } }];
  },

  codemap: (b) => {
    const p = propsOf(b);
    const nodes = ((p.nodes as AnyProps[]) ?? [])
      .map((n) => plain(n.label as string))
      .filter(Boolean);
    const body = `${plain(p.center as string)}${nodes.length ? `: ${nodes.join(', ')}.` : ''}`;
    return [{ kind: 'prose', data: { heading: plain(p.title as string) || 'Map', body } }];
  },

  diff: (b) => {
    const p = propsOf(b);
    return [
      {
        kind: 'prose',
        data: {
          heading: plain(p.title as string) || plain(p.file as string),
          body: `${plain(p.file as string)} · +${p.add ?? 0} −${p.del ?? 0}.`,
        },
      },
    ];
  },

  preview: (b) => {
    const p = propsOf(b);
    return [
      {
        kind: 'prose',
        data: {
          heading: plain(p.app as string) || 'Preview',
          body: plain(p.seededFrom as string) || plain(p.app as string),
        },
      },
    ];
  },

  composite: (b) => {
    const regions = (propsOf(b).regions as { block: Block }[]) ?? [];
    return regions.flatMap((r) => (r?.block ? extractBlock(r.block) : []));
  },
};

/** Heatmap cell → a level number. Accepts a bare number, null, or `{ lvl }`. */
function levelOf(cell: unknown): number {
  if (isFiniteNum(cell)) return cell;
  if (cell && typeof cell === 'object' && isFiniteNum((cell as AnyProps).lvl)) {
    return (cell as { lvl: number }).lvl;
  }
  return 0;
}

/* ── figure extraction (the real-component path) ──────────────────────────────── */

/** Real-data-only gate for a figure: the block must carry the props its component needs to draw
 *  (a chart with series, a diagram with nodes, code with source). Reuses the catalog's declared
 *  `requires`, so it stays correct as the library grows — a block missing any required prop yields
 *  no figure and falls back to an honest prose heading, exactly like every other extractor. */
function hasFigureData(b: Block, meta: ComponentFacts): boolean {
  const p = propsOf(b);
  for (const key of meta.requires) {
    const v = p[key];
    if (v == null) return false;
    if (typeof v === 'string' && !v.trim()) return false;
    if (Array.isArray(v) && v.length === 0) return false;
  }
  return true;
}

/** A figure section carrying the real block, or null when the block has no real data to draw. The
 *  heading/caption are read only from the block's own real props — never invented. */
function figureDraft(b: Block): SectionDraft | null {
  const meta = catalogFacts(b.type);
  const cls = embedClass(meta);
  if (cls === 'none' || !meta) return null;
  if (!hasFigureData(b, meta)) return null;
  const p = propsOf(b);
  const heading = plain(p.title) || plain(p.heading) || undefined;
  const caption = plain(p.footer) || plain(p.caption) || plain(p.sub) || undefined;
  return { kind: 'figure', data: { block: b, embed: cls, heading, caption } };
}

/* ── per-block extraction ───────────────────────────────────────────────────── */

function extractBlock(b: Block): SectionDraft[] {
  const extractor = core[b.type];
  if (extractor) return extractor(b);
  const kind = archetypeFor(b);
  if (kind === null) return []; // interactive-only block, dropped
  if (kind === 'figure') {
    // A rich visual rendered as its real component; if it has no real data, fall back honestly.
    const fig = figureDraft(b);
    if (fig) return [fig];
    const fallback = proseDraft(b);
    return fallback ? [fallback] : [];
  }
  const draft = genericDraft(b, kind) ?? proseDraft(b);
  return draft ? [draft] : [];
}

/* ── public surface ─────────────────────────────────────────────────────────── */

/** Build the masthead/footer facts from the first selected answer. `num` is the primary answer's
 *  1-based position in its session (only supplied when bundling more than one answer) — it drives
 *  the masthead's "No. NN" issue number. */
export function buildMeta(
  specs: ConversationSpec[],
  generatedAt: number,
  num?: number,
): ExportMeta {
  const primary = specs[0];
  const sources: SourceMeta[] = [
    ...(primary?.context ?? []).map((c) => ({ name: plain(c.name) })),
    // A context pill carries a name only; a real web citation carries its real url too — kept
    // verbatim (never run through `plain`, which is for prose, not URLs) so the sources appendix
    // can draw a genuine clickable link rather than discarding it.
    ...(primary?.sources ?? []).map((s) => ({ name: plain(s.title), url: s.url || undefined })),
  ].filter((s) => s.name);
  return {
    title: plain(primary?.title) || 'Untitled',
    sub: plain(primary?.sub) || undefined,
    topic: plain(primary?.topic) || undefined,
    sources,
    generatedAt,
    num,
  };
}

/** The PDF's document-info dictionary, populated from the real export meta — never invented.
 *  Shared by the modal's real download and the QA lab's export button, so a document produced
 *  from #/exportlab carries the same metadata a real export would, not an empty/default one. */
export function pdfProperties(meta: ExportMeta): PdfMetadata {
  return {
    title: meta.title,
    subject: meta.topic,
    author: 'Mavea',
    keywords: meta.sources.length ? meta.sources.map((s) => s.name).join(', ') : undefined,
    creator: 'Mavea',
  };
}

/**
 * Flatten the selected answers into placed sections. The first answer's title rides the
 * masthead (see {@link buildMeta}); each later answer is introduced by a prose heading that
 * restates its real title, so a multi-answer export reads as one document with clear breaks.
 */
export function normalize(specs: ConversationSpec[]): Section[] {
  const out: Section[] = [];
  specs.forEach((spec, source) => {
    let first = true;
    if (source > 0) {
      out.push({
        kind: 'prose',
        id: `${source}-intro`,
        source,
        lead: true,
        data: { heading: plain(spec.title), body: plain(spec.sub) },
      });
      first = false;
    }
    for (const [bi, block] of spec.blocks.entries()) {
      for (const [di, draft] of extractBlock(block).entries()) {
        out.push({ ...draft, id: `${source}-${bi}-${di}`, source, lead: first });
        first = false;
      }
    }
  });

  numberSections(out);
  return out;
}

/**
 * Number a document's findings and figures in order, the way a typeset report does — findings read
 * 01 / 02 / 03 and figures FIG. 1 / 2 / 3 (instead of every one defaulting to "01"). Mutates in
 * place. Shared by `normalize` (the real path) and the export lab, which builds sections by hand.
 */
export function numberSections(sections: Section[]): void {
  let findingN = 0;
  let figureN = 0;
  for (const s of sections) {
    if (s.kind === 'findingCallout') {
      findingN += 1;
      if (!s.data.num) s.data = { ...s.data, num: String(findingN).padStart(2, '0') };
    } else if (s.kind === 'figureGrid') {
      figureN += 1;
      if (s.data.fig == null) s.data = { ...s.data, fig: String(figureN) };
    } else if (s.kind === 'figure') {
      // Embedded figures share the one FIG. N sequence with figureGrid, in document order.
      figureN += 1;
      if (s.data.fig == null) s.data = { ...s.data, fig: String(figureN) };
    }
  }
}

/** The core block types this module extracts precisely — exported for coverage tests. */
export const CORE_EXTRACTOR_TYPES = Object.keys(core);
