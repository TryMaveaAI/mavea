// The slide model: the fixed vocabulary a Mavéa answer is composed into before any deck style
// renders it. It is the presentation cousin of the document export's `Section` model —
// `compose.ts` reuses the same `normalize()` archetypes, then assigns each to one slide layout.
//
// A slide style (skin) renders this model; for most archetypes it never sees a raw `Block`. The
// one exception is `figure`, which carries the real block so a rich visual is shown at full
// fidelity on stage rather than flattened — the presentation cousin of the document's figure.
import type { Block } from '../../data/conversation';

/** The fixed layout vocabulary — one per reference slide archetype. */
export type SlideKind =
  | 'cover' //           title slide: kicker + headline + standfirst + presenter/date
  | 'sectionDivider' //  a chapter break between answers (big numeral + title)
  | 'agenda' //          a numbered contents / ranked list (title + sub per row)
  | 'keyFigure' //       a hero metric + supporting stats
  | 'comparison' //      two columns (Option A vs B), one optionally recommended
  | 'dataTable' //       a rows × columns table (values or rating dots)
  | 'roadmap' //         a horizontal phased timeline with progress
  | 'process' //         numbered / checked steps
  | 'chart' //           a clean bar chart from real figures
  | 'figure' //          a real canvas component at full fidelity (charts1/2, diagrams, code, math)
  | 'quote' //           a big statement with attribution (findings, pull-quotes)
  | 'teamGrid' //        people cards with portraits (only with real images)
  | 'fullBleed' //       a full-frame image with an overlaid headline (only with a real image)
  | 'prose' //           a heading + paragraph (the universal, honest fallback)
  | 'closing'; //        the thank-you slide, mirroring the cover

/* ── Per-layout payloads ──────────────────────────────────────────────────────── */

export interface CoverData {
  title: string;
  subtitle?: string;
  presenter?: string;
  /** Formatted date string (composed from the export epoch). */
  date?: string;
}

export interface DividerData {
  /** Big ghost numeral ("01"). */
  number?: string;
  title: string;
  subtitle?: string;
}

export interface AgendaItem {
  title: string;
  sub?: string;
}
export interface AgendaData {
  title: string;
  items: AgendaItem[];
}

export interface KeyStat {
  label: string;
  value: string;
  /** Optional 0..1 fill for a trailing bar. */
  pct?: number;
}
export interface KeyFigureData {
  /** Hero number, already formatted ("2,600"). */
  value: string;
  /** Small unit beside the hero ("kcal", "%"). */
  unit?: string;
  body?: string;
  stats: KeyStat[];
}

export interface CompareRow {
  label: string;
  value: string;
}
export interface CompareColumn {
  label?: string;
  title: string;
  rows: CompareRow[];
  recommended?: boolean;
}
export interface ComparisonData {
  title?: string;
  columns: CompareColumn[];
  note?: string;
}

export interface DataTableData {
  title?: string;
  columns: string[];
  rows: string[][];
  note?: string;
  /** When set, integer cells render as filled dots on a 1..scale scale. */
  ratingScale?: number;
}

export interface RoadmapPhase {
  marker?: string;
  title: string;
  body?: string;
  /** 0..1 progress. */
  pct?: number;
}
export interface RoadmapData {
  title?: string;
  phases: RoadmapPhase[];
}

export interface ProcessStep {
  title: string;
  body?: string;
  status?: 'done' | 'doing' | 'todo';
}
export interface ProcessData {
  title?: string;
  steps: ProcessStep[];
  /** True when the steps came from a checklist (render checkmarks, not numerals). */
  checks?: boolean;
}

export interface ChartBar {
  label: string;
  /** 0..1 fill. */
  pct?: number;
  /** Display value ("100%", "190g"). */
  value?: string;
}
export interface ChartData {
  title?: string;
  body?: string;
  bars: ChartBar[];
  total?: string;
  note?: string;
}

export interface QuoteData {
  body: string;
  attribution?: string;
}

/** A figure slide: the real block, rendered by its canvas component on stage and themed to the
 *  deck skin. The only layout that keeps a raw block; everything else flattens as before. */
export interface FigureSlideData {
  block: Block;
  embed: 'fluid' | 'flow';
  /** The block's own real title (the slide headline), omitted when it has none. */
  heading?: string;
  /** A real one-line caption under the figure. */
  caption?: string;
}

export interface TeamMember {
  name: string;
  role?: string;
  bio?: string;
  img?: string;
}
export interface TeamGridData {
  title?: string;
  members: TeamMember[];
}

export interface FullBleedData {
  img: string;
  title?: string;
}

export interface ProseData {
  heading?: string;
  body: string;
}

export interface ClosingData {
  title: string;
  subtitle?: string;
  sources: string[];
}

/** Maps each layout to its payload so `Slide` is a precise discriminated union. */
export interface SlideDataMap {
  cover: CoverData;
  sectionDivider: DividerData;
  agenda: AgendaData;
  keyFigure: KeyFigureData;
  comparison: ComparisonData;
  dataTable: DataTableData;
  roadmap: RoadmapData;
  process: ProcessData;
  chart: ChartData;
  figure: FigureSlideData;
  quote: QuoteData;
  teamGrid: TeamGridData;
  fullBleed: FullBleedData;
  prose: ProseData;
  closing: ClosingData;
}

/** A composed, renderable slide. */
export type Slide = {
  [K in SlideKind]: {
    kind: K;
    /** Stable key for React + the navigator. */
    id: string;
    /** Which selected answer this slide came from (-1 for deck-level cover/agenda/closing). */
    source: number;
    /** Eyebrow shown above the slide ("FINDING 01", a topic). */
    kicker?: string;
    /** Speaker-notes line (used by Present). */
    notes?: string;
    data: SlideDataMap[K];
  };
}[SlideKind];
