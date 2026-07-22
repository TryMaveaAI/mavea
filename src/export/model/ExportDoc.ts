// The export document model: the small, skin-agnostic vocabulary a Mavéa answer is
// flattened into before any template renders it.
//
// A Mavéa answer is a `ConversationSpec` whose `blocks` span ~270 typed component shapes.
// No print template should know about 270 shapes, so `normalize.ts` maps every block onto
// one of the dozen *section archetypes* below — the units every one of the 10 templates
// knows how to draw. A template renders this model; it never sees a raw `Block`. Adding a
// new block type therefore needs only a mapping entry (or its declared `dataShape`), never
// a change to any template.
import type { Block } from '../../data/conversation';
import type { PageFormat } from '../paginate/geometry';

/** The fixed archetype vocabulary — the only section kinds a skin must render. */
export type SectionKind =
  | 'findingCallout' //     a tinted "FINDING 01 — Inferred" summary card        (insight / understand)
  | 'spotlightCard' //      an inverted "feature" card — one punchy item          (a single pull-quote)
  | 'figureGrid' //         a "FIG. 1" row of labeled cells, each w/ a bar/value  (chart / bars / ring / funnel)
  | 'figure' //             a real canvas component at full fidelity, themed + fit (charts1/2, diagrams, code, math)
  | 'rankedList' //         ruled name → meta rows                                (list / web / gallery)
  | 'ratingMatrix' //       rows × columns of dot/level cells                     (compare / heat)
  | 'checklist' //          ✓ items, optionally done/doing/todo                   (checklist / checks / build)
  | 'metricTiles' //        labeled stat tiles                                    (kpi / gauge / scalar)
  | 'distributionBars' //   horizontal proportion bars with %                     (stack / donut / breakdown)
  | 'verticalTimeline' //   a ruled time spine with events                        (timeline / sequence)
  | 'numberedMilestones' // numbered steps with a title + body                    (flow / pipeline of steps)
  | 'specTable' //          a generic rows × columns table                       (scoreboard / standings / schema)
  | 'contents' //           a table of contents — title → dotted leader → page   (injected, multi-answer only)
  | 'sourcesAppendix' //    the full cited-source list, clickable where a URL exists (injected, near the end)
  | 'prose'; //             a heading + paragraph (the universal, honest fallback)

/* ── Per-archetype normalized payloads ─────────────────────────────────────── */

export interface FindingCalloutData {
  /** Sequence label shown in the eyebrow ("01"). */
  num?: string;
  /** Confidence word ("Inferred", "Strong") — the honesty marker. */
  conf?: string;
  title: string;
  summary?: string;
  /** True on a continuation fragment — a summary too long for one page, split across cards by the
   *  paginator. The renderer skips the eyebrow/title header and shows only the remaining summary
   *  text, tinted the same as the original card. */
  cont?: boolean;
}

export interface SpotlightCardData {
  label?: string;
  title: string;
  body?: string;
  /** Same convention as {@link FindingCalloutData.cont} — a continuation fragment renders only the
   *  remaining body text, its label/title header omitted. */
  cont?: boolean;
}

export interface FigureCell {
  /** Small label above the cell ("DAY 1", "W1–3"). */
  label?: string;
  title: string;
  /** Fill fraction 0..1 for the cell's bar (omit to hide the bar). */
  pct?: number;
  /** A short value/caption under the title ("100%", "FULL DAY"). */
  value?: string;
}
/** A real numeric series for a line/area chart — what a trend block actually carries. */
export interface FigureChart {
  /** X-axis category labels (quarters, years, steps…). */
  labels: string[];
  /** One or more named series of values aligned to `labels`. */
  series: { name: string; data: number[] }[];
  /** Optional unit appended to value readouts ("%", "M", "$"). */
  unit?: string;
}

export interface FigureGridData {
  heading?: string;
  /** Running figure number ("1", "2") → renders the reference's "FIG. N" eyebrow. Assigned by
   *  `normalize` so the whole document numbers its figures in order. */
  fig?: string;
  caption?: string;
  cells: FigureCell[];
  /** When present (a real trend), documents draw an SVG line/area chart instead of the cell bars;
   *  the `cells` remain as the slide/fallback representation. Additive — slide compose ignores it. */
  chart?: FigureChart;
}

export interface RankedItem {
  name: string;
  /** Right-aligned meta ("Impressionist focus", a domain, a tag). */
  meta?: string;
  /** Optional fill fraction 0..1 for a trailing bar. */
  pct?: number;
  hot?: boolean;
}
export interface RankedListData {
  heading?: string;
  items: RankedItem[];
  note?: string;
}

export interface MatrixRow {
  label: string;
  /** One value per column: a 0..3-style level (number) or a short string. */
  values: (number | string)[];
}
export interface RatingMatrixData {
  heading?: string;
  columns: string[];
  rows: MatrixRow[];
  /** Highest level on the dot scale (defaults to the largest value seen). */
  scale?: number;
  note?: string;
}

export interface ChecklistEntry {
  title: string;
  note?: string;
  status?: 'done' | 'doing' | 'todo';
}
export interface ChecklistData {
  heading?: string;
  items: ChecklistEntry[];
}

export interface MetricTile {
  value: string;
  label: string;
}
export interface MetricTilesData {
  heading?: string;
  tiles: MetricTile[];
}

export interface DistributionBar {
  label: string;
  /** Proportion 0..1. */
  pct: number;
  /** A display value next to the label ("190g · 29%"). */
  value?: string;
}
export interface DistributionBarsData {
  heading?: string;
  total?: string;
  bars: DistributionBar[];
  note?: string;
}

export interface TimelineEntry {
  /** The left-rail marker ("4 WEEKS OUT", a clock time). */
  marker?: string;
  title: string;
  body?: string;
  tag?: string;
}
export interface VerticalTimelineData {
  heading?: string;
  events: TimelineEntry[];
}

export interface MilestoneEntry {
  title: string;
  body?: string;
  tag?: string;
}
export interface NumberedMilestonesData {
  heading?: string;
  items: MilestoneEntry[];
}

export interface SpecTableData {
  heading?: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

export interface ProseData {
  heading?: string;
  body: string;
}

/** A cited source: a real name plus, when known, its real URL (never fabricated). Shared by the
 *  masthead provenance caption and the sources appendix so both draw from the one shape. */
export interface SourceMeta {
  name: string;
  url?: string;
}

export interface ContentsEntry {
  title: string;
  /** 1-based page number, matching the footer's "NN / TT" numbering. */
  page: number;
}
export interface ContentsData {
  heading?: string;
  items: ContentsEntry[];
}

export interface SourcesAppendixData {
  heading?: string;
  items: SourceMeta[];
}

/** The one archetype that keeps the original block instead of a flattened payload: a rich visual
 *  (a chart, diagram, code listing, equation) drawn by its real canvas component — themed to the
 *  skin and scaled to fit the page. Routed here by `embedClass`; everything else flattens as
 *  before. Only the figure renderer reads `.block`. */
export interface FigureData {
  /** The original block — the renderer mounts its real component via `canvas/embed`. */
  block: Block;
  /** Fit strategy: 'fluid' SVG scales to any frame; 'flow' content is measured / given its own page. */
  embed: 'fluid' | 'flow';
  /** Running figure number ("1", "2") → the "FIG. N" eyebrow; assigned by `numberSections`. */
  fig?: string;
  /** The block's own real title, shown as the figure heading (omitted when it has none). */
  heading?: string;
  /** A real one-line caption (the block's own footer/sub; model narration in a later pass). */
  caption?: string;
}

/** Maps each archetype to its payload type so `Section` is a precise discriminated union. */
export interface SectionDataMap {
  findingCallout: FindingCalloutData;
  spotlightCard: SpotlightCardData;
  figureGrid: FigureGridData;
  rankedList: RankedListData;
  ratingMatrix: RatingMatrixData;
  checklist: ChecklistData;
  metricTiles: MetricTilesData;
  distributionBars: DistributionBarsData;
  verticalTimeline: VerticalTimelineData;
  numberedMilestones: NumberedMilestonesData;
  specTable: SpecTableData;
  figure: FigureData;
  contents: ContentsData;
  sourcesAppendix: SourcesAppendixData;
  prose: ProseData;
}

/** A draft section — what an extractor returns before pagination assigns it an id/source. */
export type SectionDraft = {
  [K in SectionKind]: { kind: K; data: SectionDataMap[K] };
}[SectionKind];

/** A placed, renderable section. */
export type Section = {
  [K in SectionKind]: {
    kind: K;
    /** Stable key for React + the measurement cache. */
    id: string;
    data: SectionDataMap[K];
    /** Which selected answer (index into the export's answer list) this came from. */
    source: number;
    /** A heading-style section that should open its source answer's block group. */
    lead?: boolean;
    /** Measured pixel height at content width; filled by the measure pass. */
    measuredH?: number;
  };
}[SectionKind];

/** The masthead/footer facts for one answer — drives the page chrome, not a flowing section. */
export interface ExportMeta {
  title: string;
  sub?: string;
  /** Semantic domain ("Travel", "Finance") → the masthead kicker. */
  topic?: string;
  /** Source documents / citations → the provenance caption under the masthead (and, past the
   *  masthead's truncation, the sources appendix). A context pill carries a name only; a real
   *  web citation carries its real URL too — never fabricated. */
  sources: SourceMeta[];
  /** ms epoch the export was generated; stamped by the caller (no clock in pure code). */
  generatedAt: number;
  /** 1-based position of the primary answer within its session, shown as the masthead's "No. NN"
   *  issue number. Only meaningful when bundling more than one answer into a document — a solo
   *  export leaves this unset and the masthead falls back to its plain "No. 01". */
  num?: number;
}

/** A single page: the sections placed on it. Page 0 carries the full masthead. */
export interface ExportPage {
  index: number;
  sections: Section[];
}

/** The fully-resolved document a skin renders into pages. */
export interface ExportDoc {
  meta: ExportMeta;
  /** Flat ordered sections as PACKED — including the page-boundary fragments pagination cut
   *  ("~n" ids, "(cont.)" headings). A skin change re-lays-out from the original answers via
   *  buildExportDoc, never by re-paginating these already-cut fragments. */
  sections: Section[];
  pages: ExportPage[];
  /** Paper size this layout was measured/paginated against (defaults to Letter). */
  format: PageFormat;
}
