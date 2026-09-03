// The typed data contract for a Mavéa conversation: the single source of truth for the
// canvas block prop shapes and the ConversationSpec. Canvas components extend these data
// prop types with render-only props (num / spotlight / delay).
import type { IconKey, TopicId } from '../types/mavea';
import { boundedValueHash, fnv1a } from '../lib/hash';

// The extended block library (240 components) lives in src/canvas/blocks and self-assembles
// its union here. Type-only import → erased at runtime, so it pulls in no CSS/JS side effects.
import type { ExtendedBlock } from '../canvas/blocks';

/** CSS variable color strings — the only colors data may reference. */
export type AccentVar =
  | 'var(--presence)'
  | 'var(--presence-soft)'
  | 'var(--presence-deep)'
  | 'var(--insight)'
  | 'var(--insight-soft)'
  | 'var(--warning)'
  | 'var(--warning-soft)'
  | 'var(--danger)'
  | 'var(--text-muted)';

export type Conf = 'strong' | 'partial' | 'inferred' | 'unverified';
export type DeltaDir = 'up' | 'down' | 'good';

/** HTML-bearing string (dangerouslySetInnerHTML). Authored content only — never user input. */
export type HtmlString = string;

export interface SourceRef {
  file: string;
  loc?: string;
}

/** A web citation for a search-grounded Live answer (title + link). Distinct from
 *  SourceRef, which points at a document/location in the scripted demo. */
export interface WebSource {
  title: string;
  url: string;
  /** A short, real excerpt of the source text — the passage the answer leaned on. Present for
   *  keyword-search grounding (Wikipedia et al.); absent for a model's native grounding, which
   *  returns only a URL. The evidence panel shows it as a quoted receipt when it exists. */
  snippet?: string;
}

export interface ContextPillSpec {
  name: string;
  color: AccentVar;
  verb?: string;
}

/** One recomputed readout of a bendable answer: a label and a model-authored arithmetic
 *  formula in `x` (the dragged input), evaluated locally by the whitelist parser in
 *  src/lib/bend.ts. The formula is shown to the user — auditable, never hidden math. */
export interface BendOutput {
  label: string;
  formula: string;
  unit?: string;
}

/** "Grab a number, the truth recomputes" — the ONE draggable input of an answer plus how
 *  its outputs follow. Model-authored only for genuinely calculational answers; at most
 *  one per canvas, attached to the block whose numbers it bends. */
export interface BendSpec {
  /** The block this slider belongs under. */
  blockId: string;
  /** What's being bent — "Monthly budget", "Down payment". */
  label: string;
  param: { value: number; min: number; max: number; step: number; unit?: string };
  outputs: BendOutput[];
}

/** How a blank is filled — and so what kind of input it offers. */
export type BlankKind = 'date' | 'number' | 'text' | 'choice' | 'card';

/** "The Blank Space" — one intentionally-empty slot in an answer: a value Mavéa cannot honestly
 *  know because it is the USER'S to give (a real deadline, their energy today, what would make an
 *  option a hard no). Rather than fabricate it (against real-data-only) or break the canvas with a
 *  text question, Mavéa draws the gap as a glowing hole the user fills. Model-authored; at most a
 *  few per answer. The visual twin of the `conf:'inferred'` honesty marker. */
export interface Blank {
  /** Stable slug `[a-z][a-z0-9_]*`, referenced by the fill map and by inline `{__blank}` tokens. */
  key: string;
  /** Short label on/above the hole — "Real deadline", "Energy level". */
  label: string;
  /** The one question this hole stands in for — "When does this actually have to ship?" */
  prompt: string;
  kind: BlankKind;
  /** Unit suffix for `kind:'number'` — "$", "hrs", "%". */
  unit?: string;
  /** Choices for `kind:'choice'`. */
  options?: string[];
  /** Ghost text inside the empty hole ("e.g. mid-March"). */
  placeholder?: string;
  /** Accent token for the glow; defaults to `var(--presence)`. */
  accent?: AccentVar;
  /** `kind:'card'` only — block `type`s that may be dropped here; undefined means any card. */
  accepts?: string[];
}

/** A value the user supplied for a blank, carried back to the model to complete the answer.
 *  A `card` fill contributes the dragged block's real props (reusing block-context serialization). */
export type FillValue =
  | { kind: 'date'; key: string; value: string }
  | { kind: 'number'; key: string; value: number; unit?: string }
  | { kind: 'text'; key: string; value: string }
  | { kind: 'choice'; key: string; value: string }
  | { kind: 'card'; key: string; label: string; block: Block };

/* ---- per-component data prop types ---- */
export interface InsightProps {
  title: string;
  summary?: string;
  stat?: string;
  delta?: string;
  deltaDir?: DeltaDir;
  conf?: Conf;
  sources?: SourceRef[];
}

export interface ChartSeries {
  name: string;
  color: AccentVar;
  data: number[];
  area?: boolean;
}
export interface ChartProps {
  title: string;
  unit?: string;
  labels: string[];
  series: ChartSeries[];
  footer?: string;
  /** Same honesty gate as an insight's `conf`: an unsourced numeric claim stamped "strong" is
   *  downgraded to "inferred" (see liveSchema's honesty gate) — the whole-canvas trust bar
   *  applies to every numeric block, not just the opening insight. */
  conf?: Conf;
}

export interface BreakdownRow {
  name: string;
  val: string;
  pct: number;
  hot?: boolean;
  tag?: string;
  tagColor?: AccentVar;
}
export interface BreakdownProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: BreakdownRow[];
  /** See ChartProps.conf. */
  conf?: Conf;
}

export interface TimelineEvent {
  time: string;
  title: string;
  detail?: string;
  tag?: string;
  color?: AccentVar;
}
export interface TimelineProps {
  eyebrow?: string;
  title?: string;
  events: TimelineEvent[];
}

export interface ListProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: HtmlString[];
}

export interface CmpOption {
  name: string;
  sub?: string;
  pick?: boolean;
}
export interface CmpCell {
  v: string;
  win?: boolean;
}
export interface CmpCriterion {
  label: string;
  cells: CmpCell[];
}
export interface CompareProps {
  eyebrow?: string;
  options: CmpOption[];
  criteria: CmpCriterion[];
  recommendation?: HtmlString;
}

/* ===================================================================== *
 * EXTENDED VISUALIZATION PROP TYPES — the full block library: charts,
 * diagrams, tables, scoreboards, and the creation-layer surfaces.
 * ===================================================================== */

/* ---- RingStat ---- */
export interface RingSpec {
  pct: number; // 0..1
  display: string;
  unit?: string;
  label: string;
  hint?: string;
  color?: AccentVar;
}
export interface RingStatProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rings: RingSpec[];
  footer?: HtmlString;
}

/* ---- BarChart (vertical bars + optional goal line) ---- */
export interface BarSpec {
  value: number;
  label: string;
  label2?: string;
  color?: AccentVar;
  hot?: boolean;
}
export interface BarChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  bars: BarSpec[];
  unit?: string;
  goal?: number;
  goalLabel?: string;
  footer?: HtmlString;
  /** See ChartProps.conf. */
  conf?: Conf;
}

/* ---- StackedBar ---- */
export interface StackSeg {
  value: number;
  label: string;
  display: string;
  color: string;
}
export interface StackedBarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  total?: string;
  segments: StackSeg[];
  footer?: HtmlString;
  /** See ChartProps.conf. */
  conf?: Conf;
}

/* ---- Scatter ---- */
export interface ScatterPoint {
  x: number;
  y: number;
  hot?: boolean;
}
export interface ScatterProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  points: ScatterPoint[];
  xLabel?: string;
  yLabel?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  trend?: [[number, number], [number, number]];
  footer?: HtmlString;
}

/* ---- Heatmap ---- */
export interface HeatCellObj {
  lvl: number;
  note?: string;
  mark?: string;
}
export type HeatCell = number | null | HeatCellObj;
export interface HeatRow {
  label: string;
  cells: HeatCell[];
}
export interface HeatmapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cols?: string[];
  rows: HeatRow[];
  levelColor?: AccentVar;
  legend?: [string, string];
  footer?: HtmlString;
}

/* ---- FlowSteps ---- */
export interface FlowStep {
  title: string;
  sub: string;
  color?: AccentVar;
}
export interface FlowStepsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  steps: FlowStep[];
  footer?: HtmlString;
}

/* ---- WebSnippets ---- */
export interface WebResult {
  title: string;
  domain: string;
  path?: string;
  excerpt: HtmlString;
  color?: AccentVar;
}
export interface WebSnippetsProps {
  title?: string;
  live?: boolean;
  results: WebResult[];
  footer?: HtmlString;
}

/* ---- Gallery ---- */
export interface GalleryItem {
  label: string;
  source: string;
  tag?: string;
  /** Real image URL (a sourced/real photo when available, else one generated from the label).
   *  When present the tile shows the actual image; h1/h2 are just the gradient shown while it
   *  loads — the tile is never a decorative placeholder standing in for a real image. */
  src?: string;
  /** A few candidate real-photo URLs the model proposed (preference order). We load-test `src` +
   *  these and show the first that decodes, so a dead/hallucinated link never shows a broken tile. */
  candidates?: string[];
  /** A guaranteed-loadable generated image to swap to if no real URL loads, so a dead link never
   *  shows a broken tile — real-when-it-works, generated otherwise. */
  fallbackSrc?: string;
  h1?: string;
  h2?: string;
}
export interface GalleryProps {
  title?: string;
  eyebrow?: string;
  items: GalleryItem[];
  footer?: HtmlString;
}

/* ---- CodeMap ---- */
export interface CodeNode {
  label: string;
  note?: string;
  hot?: boolean;
}
export interface CodeMapProps {
  title?: string;
  center: string;
  nodes: CodeNode[];
  footer?: HtmlString;
}

/* ---- DiffView ---- */
export interface DiffLine {
  t?: 'add' | 'del' | 'ctx';
  c: HtmlString;
}
export interface DiffViewProps {
  title?: string;
  file: string;
  add: number;
  del: number;
  lines: DiffLine[];
  footer?: HtmlString;
}

/* ---- Checks ---- */
export type CheckStatus = 'pass' | 'fail' | 'skip';
export interface CheckItem {
  name: string;
  status: CheckStatus;
  note?: string;
}
export interface ChecksProps {
  title?: string;
  summary?: string;
  items: CheckItem[];
  footer?: HtmlString;
}

/* ---- Donut (composition pie) ---- */
export interface DonutRow {
  label: string;
  pct: number;
  color: string;
}
export interface DonutProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  size?: number;
  thickness?: number;
  rows: DonutRow[];
  footer?: HtmlString;
  /** See ChartProps.conf. */
  conf?: Conf;
}

/* ---- Gauge (radial dial — risk / NPS / readiness) ---- */
export interface GaugeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  value: number;
  max?: number;
  size?: number;
  color?: AccentVar;
  band?: string;
  driver?: HtmlString;
  footer?: HtmlString;
  /** See ChartProps.conf. */
  conf?: Conf;
}

/* ---- Scoreboard (sports) ---- */
export interface Game {
  away: string;
  home: string;
  as: string;
  hs: string;
  status: string;
  hot?: boolean;
}
export interface ScoreboardProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  games: Game[];
  footer?: HtmlString;
}

/* ---- Standings (league table) ---- */
export interface StandingRow {
  team: string;
  rec: string;
  gb: string;
}
export interface StandingsProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: StandingRow[];
  footer?: HtmlString;
}

/* ---- Pipeline (deal-stage funnel) ---- */
export interface PipelineStage {
  k: string;
  v: number;
}
export interface PipelineProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  headline?: string;
  sub?: string;
  unit?: string;
  suffix?: string;
  stages: PipelineStage[];
  footer?: HtmlString;
}

/* ---- KpiGrid (KpiCard / StatPair / MiniStats / Facts) ---- */
export interface KpiSpec {
  val: string;
  label: string;
  /** The tile's qualifier — what the number is a share OF, the window it covers, the target it
   *  is measured against ("50% — non-negotiable", "vs. $2.1M last quarter"). The model has always
   *  written these; a tile without one simply renders the two lines it always did. */
  sub?: string;
  color?: AccentVar;
}
export interface KpiGridProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cols?: number;
  kpis: KpiSpec[];
  footer?: HtmlString;
  /** See ChartProps.conf. */
  conf?: Conf;
}

/* ---- QuoteBlock (testimonials) ---- */
export interface QuoteSpec {
  text: string;
  who: string;
  tone?: 'pos' | 'neg' | 'warn' | 'neutral';
}
export interface QuoteBlockProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  quotes: QuoteSpec[];
  footer?: HtmlString;
}

/* ---- ProgressChecklist (done / doing / todo) ---- */
export interface ChecklistRow {
  t: string;
  st: 'done' | 'doing' | 'todo';
}
export interface ProgressChecklistProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: ChecklistRow[];
  footer?: HtmlString;
}

/* ---- creation layer: UnderstandCard (cited "what I learned about you", correctable) ---- */
export interface UnderstandItem {
  text: HtmlString;
  source?: string;
}
export interface UnderstandProps {
  title?: string;
  items: UnderstandItem[];
  conf?: Conf;
  footer?: HtmlString;
}

/* ---- creation layer: SchemaDiagram (the data model it'll build) ---- */
export interface SchemaField {
  name: string;
  type: string;
  key?: boolean;
}
export interface SchemaEntity {
  name: string;
  color?: AccentVar;
  badge?: string;
  fields: SchemaField[];
}
export interface SchemaRelation {
  from: string;
  label: string;
  to: string;
}
export interface SchemaProps {
  title?: string;
  entities: SchemaEntity[];
  relations?: SchemaRelation[];
  footer?: HtmlString;
}

/* ---- creation layer: ScreenMap (wireframe thumbs of the generated screens) ---- */
export type ScreenKind = 'dashboard' | 'table' | 'board' | 'detail' | 'list';
export interface ScreenSpec {
  name: string;
  kind: ScreenKind;
}
export interface ScreenMapProps {
  title?: string;
  screens: ScreenSpec[];
  footer?: HtmlString;
}

/* ---- creation layer: BuildProgress (legible build steps — what & why) ---- */
export interface BuildStep {
  label: string;
  sub?: string;
  status?: 'done' | 'active' | 'todo';
}
export interface BuildProgressProps {
  title?: string;
  steps: BuildStep[];
  footer?: HtmlString;
}

/* ---- creation layer: PreviewFrame (a real, clickable app Mavéa built; config-driven) ---- */
export type PreviewView = 'dashboard' | 'table' | 'board' | 'group' | 'activity';
export interface PreviewNavItem {
  label: string;
  view: PreviewView;
}
export interface PreviewStage {
  key: string;
  kind: 'lead' | 'warm' | 'won';
  color: AccentVar;
}
export interface PreviewRow {
  name: string;
  group: string;
  stage: string;
  amt?: number;
  value: string;
  color: string; // raw hex for the avatar dot
}
export interface PreviewActivity {
  who: string;
  what: string;
  when: string;
  color: string;
}
export interface PreviewProps {
  app: string;
  seededFrom?: string; // dashboard subtitle, e.g. "Seeded from studio-aria.com"
  nav: PreviewNavItem[];
  stages: PreviewStage[];
  rows: PreviewRow[];
  kpis: { v: string; k: string }[];
  columns: string[]; // table headers (4): name, group, stage, value
  groupColumns?: string[]; // group-view headers (3): group, count, aggregate
  pipelineLabel?: string; // dashboard panel heading (default "Pipeline by stage")
  agg?: 'money' | 'plain'; // how per-stage / per-group totals are formatted
  createdNote?: string; // activity-view "you created this" line
  activities?: PreviewActivity[];
  footer?: HtmlString;
}

/* ---- canvas block discriminated union (col/delay/id live on the block) ---- */
export interface BlockBase {
  col: number;
  delay?: number;
  id?: string; // any block with an id can be spotlighted/dimmed (TopicCanvas: isCard = !!b.id)
  /** A short, model-authored explanation of THIS block — what it shows and why it matters.
   *  Surfaced in Focus mode as the slide's caption and spoken as it takes the stage. Optional:
   *  Demo blocks (and any the model omits) show no caption and fall back to a derived spoken line. */
  note?: string;
  /** The voice-ready twin of `note`, derived from its inline [[shown|said]] annotations. Spoken
   *  in Focus mode while the card shows the clean `note`; absent when the note reads aloud as-is. */
  noteSpoken?: string;
  /** Named concept section this block belongs to (e.g. "What it is", "The handshake").
   *  When present, TopicCanvas groups blocks under collapsible concept sections with "Go deeper"
   *  drawers for depth≥2 content. Absent → block renders as a plain grid card, exactly as today. */
  section?: string;
  /** 1-based display order for this section. Sections are sorted ascending by this value. */
  order?: number;
  /** Conceptual depth: 0=gist · 1=standard canvas card (default) · 2=detailed worked content ·
   *  3=deep expert content. `undefined` is treated as 1 (standard).
   *  depth decides WHERE a block renders (grid card vs. drawer), not whether it is hidden —
   *  every depth level is visible authored content. depth≥2 blocks live in the section's
   *  "Go deeper" drawer and never appear on the main canvas. */
  depth?: number;
  /** Role of a depth≥2 block: "example" | "derivation" | "edge" | "analogy" | "history" | "check".
   *  Used for facet organisation inside the drawer (P1). Omit on depth≤1 blocks. */
  facet?: string;
  /** The Study's margin voices for this block, written by the model in the SAME call that wrote
   *  the answer — so they cost no extra request and can say things the card does not contain.
   *  Absent on demo/baked blocks and whenever the model omits one; the Study then falls back to
   *  the voices it derives from the block itself, which can only ever RE-READ what is on screen. */
  study?: BlockStudy;
}

/** One drawn gesture: a kind, and the on-block text it aims at. Authored by the model on a
 *  tour stop and, in the Study, on a block's own `study.marks`. Lives here rather than with
 *  the validator because it is part of the ANSWER's shape, which a block now carries.
 */
export interface TourMark {
  kind:
    | 'circle'
    | 'underline'
    | 'point'
    | 'highlight'
    | 'rising'
    | 'falling'
    | 'bracket'
    | 'note'
    | 'connect'
    | 'strike'
    | 'question'
    | 'star'
    | 'check'
    | 'frame'
    | 'brace';
  /** The exact text of the value or label to mark — must appear in the block's own data.
   *  For a span gesture it's the START of the span; for "note" it's the item the aside hangs off. */
  at: string;
  /** The far end of a span gesture (the value the trend climbs TO, the right side of a bracket).
   *  Must also appear in the block's data. Optional for "rising"/"falling" (then it glosses the
   *  whole chart); required for "connect" (searched in `onIndex`'s block, not this stop's own);
   *  ignored by the point gestures. */
  to?: string;
  /** The handwritten words for a "note", or a "bracket"'s delta caption ("+38%", "vs. last year"). */
  label?: string;
  /** Optional ink tone: "key" = presence purple (the single most important mark of the tour),
   *  "cool" = blue (negative / contrast / lower-than-expected). Default is warm orange. */
  color?: 'warm' | 'key' | 'cool';
  /** "connect" only: the 0-based index (same numbering as `tour[].index`) of the OTHER block
   *  `to` lives in. Omitted, or equal to this stop's own index, is meaningless for "connect"
   *  and gets dropped — a connector needs two distinct blocks. */
  onIndex?: number;
}

/** The three notes Mavéa pins beside a block in the Study. The fourth voice — the evidence check —
 *  is deliberately NOT here: it is Mavéa's own reading of the turn's real sources, and a
 *  model-authored receipt would be a fabricated one. */
export interface BlockStudy {
  /** The load-bearing assumption: what has to be true for this block to hold, naming the real
   *  figure, term or step it rests on. */
  assumes?: string;
  /** The margin fact — context, a comparison, a rule of thumb or a consequence that is NOT on the
   *  card. This is the one that has to teach; a restatement of the card is worse than nothing. */
  pattern?: string;
  /** One sharp question that would test this block, naming the specific datum it would test. */
  test?: string;
  /** The margin scrawls — the few words a reader actually pencils beside a slide, one per slot
   *  the desk draws. Derived scrawls can only count what the block renders ("3 steps — which one
   *  decides it?"), which is the same remark beside every list; these carry the substance that
   *  makes a margin worth reading. Over-long ones are dropped at the surface, not truncated. */
  scrawls?: string[];
  /** Gestures drawn ON this block when it takes the desk — a circle round the figure that
   *  matters, a highlight over the row being discussed, a bracket across the span. Without these
   *  the Study can only place ONE generic mark per block, resolved from whatever the component
   *  stamps as salient, so every slide is annotated the same way regardless of what it says. */
  marks?: TourMark[];
}
export type Block =
  | (BlockBase & { type: 'insight'; id: string; num: string; prove?: boolean; props: InsightProps })
  | (BlockBase & { type: 'chart'; props: ChartProps })
  | (BlockBase & { type: 'breakdown'; props: BreakdownProps })
  | (BlockBase & { type: 'timeline'; props: TimelineProps })
  | (BlockBase & { type: 'list'; props: ListProps })
  | (BlockBase & { type: 'compare'; props: CompareProps })
  // --- charts & diagrams ---
  | (BlockBase & { type: 'ring'; props: RingStatProps })
  | (BlockBase & { type: 'bars'; props: BarChartProps })
  | (BlockBase & { type: 'stack'; props: StackedBarProps })
  | (BlockBase & { type: 'scatter'; props: ScatterProps })
  | (BlockBase & { type: 'heat'; props: HeatmapProps })
  | (BlockBase & { type: 'flow'; props: FlowStepsProps })
  | (BlockBase & { type: 'web'; props: WebSnippetsProps })
  | (BlockBase & { type: 'gallery'; props: GalleryProps })
  | (BlockBase & { type: 'codemap'; props: CodeMapProps })
  | (BlockBase & { type: 'diff'; props: DiffViewProps })
  | (BlockBase & { type: 'checks'; props: ChecksProps })
  // --- stats, sports & funnels ---
  | (BlockBase & { type: 'donut'; props: DonutProps })
  | (BlockBase & { type: 'gauge'; props: GaugeProps })
  | (BlockBase & { type: 'scoreboard'; props: ScoreboardProps })
  | (BlockBase & { type: 'standings'; props: StandingsProps })
  | (BlockBase & { type: 'pipeline'; props: PipelineProps })
  | (BlockBase & { type: 'kpi'; props: KpiGridProps })
  | (BlockBase & { type: 'quotes'; props: QuoteBlockProps })
  | (BlockBase & { type: 'checklist'; props: ProgressChecklistProps })
  // --- creation layer ---
  | (BlockBase & { type: 'understand'; props: UnderstandProps })
  | (BlockBase & { type: 'schema'; props: SchemaProps })
  | (BlockBase & { type: 'screenmap'; props: ScreenMapProps })
  | (BlockBase & { type: 'buildprog'; props: BuildProgressProps })
  | (BlockBase & { type: 'preview'; props: PreviewProps })
  // A model-composed layout: a small sub-grid of OTHER (already-vetted) blocks arranged for
  // one answer. The "build a new component on the fly" primitive — novel arrangement, every
  // region still a real typed Block rendered by the same path. Recursive by construction.
  | (BlockBase & { type: 'composite'; props: CompositeProps })
  // ⨁ the 240-component extended library (src/canvas/blocks/*, 22 families). Each adds its own variants.
  | ExtendedBlock;

/** One cell of a composite: a child block plus how wide it sits in the composite's own
 *  12-col sub-grid. The child is a full Block, so anything renderable can be composed. */
export interface CompositeRegion {
  block: Block;
  /** Span within the composite's 12-col sub-grid (1..12); defaults to a sensible width. */
  span?: number;
}
export interface CompositeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  regions: CompositeRegion[];
  footer?: string;
}

/* ---- proof / evidence ---- */
export interface ProofRow {
  a: string;
  b: string;
  c: string;
  hot?: boolean;
}
export interface ProofSpec {
  spotId: string;
  say: string;
  claim: string;
  conf: Conf;
  file: { label: string; type: 'csv' | 'pdf' | 'xls'; loc: string };
  rows: ProofRow[];
  note: HtmlString;
  assumptions: string[];
}

/* ---- extras (built on demand: slide / action / replay) ---- */
export interface SlideBullet {
  color?: AccentVar;
  text: HtmlString;
}
export interface SlideProps {
  kicker: string;
  head: string;
  bullets: SlideBullet[];
  foot?: string;
  eyebrow?: string;
}
export interface ActionLine {
  k: string;
  v: string;
}
export interface ActionField {
  param: string;
  label: string;
  value: string;
  multiline?: boolean;
}
export interface ActionProps {
  eyebrow?: string;
  icon?: IconKey;
  title?: string;
  lines?: ActionLine[];
  perm?: string;
  cta?: string;
  doneText?: string;
  mcpId?: string;
  fields?: ActionField[];
}
export interface ReplayProps {
  line?: string;
}
export type Extra =
  | { kind: 'slide'; col: number; status: string; say: string; props: SlideProps }
  | { kind: 'action'; col: number; status: string; say: string; props: ActionProps }
  | { kind: 'replay'; col: number; status: string; say: string; props: ReplayProps };

/* ---- routing metadata (each spec owns its own routing so adding a convo = one file) ---- */
export interface SuggestSpec {
  label: string;
  icon: IconKey;
  route: string;
  lead?: string;
}
export type IntentSpec =
  | { kind: 'spotlight'; spotId: string; say: string }
  | { kind: 'proof' }
  | { kind: 'build'; key: 'slide' | 'action' | 'replay' };
export interface KeywordRule {
  test: RegExp;
  route: string;
  sub?: { test: RegExp; route: string }[];
}

/* ---- the full conversation ---- */
export type ConversationGroup = 'home' | 'health' | 'docs' | 'learn' | 'decide' | 'household';

export interface ConversationSpec {
  id: TopicId;
  workspace: string;
  title: string;
  sub: string;
  opener: string;
  switchSay?: string;
  /** spoken while "gathering" during a from-scratch conversation start (beginConversation). */
  gather?: string;
  /** the "here's what I found" line said before the Face-to-Canvas reveal. */
  found?: string;
  /** background mood tint for this topic (CSS color). */
  tint?: string;
  context: ContextPillSpec[];
  blocks: Block[];
  proof: ProofSpec | null;
  /** Semantic domain category from the model (e.g. "Finance", "Biology") — stored with
   *  the canvas so the atlas can cluster it into a meaningful neighborhood. */
  topic?: string;
  /** Web citations for a search-grounded answer (Live). The surface renders these
   *  under the canvas so the user can see what the answer was grounded in. */
  sources?: WebSource[];
  /** The one draggable number of a calculational answer (Live; see BendSpec). */
  bend?: BendSpec;
  /** "The Blank Space" (Live) — personal unknowns this answer turned into fillable holes.
   *  Referenced by a `blanks` block and/or inline `{__blank}` tokens. */
  blanks?: Blank[];
  /** True when the answer is materially incomplete until ≥1 blank is filled — the surface reads
   *  this to nudge ("fill the glowing slots to complete this"). Hint only. */
  awaiting?: boolean;
  /** The model's own judgement (Live) that this answer is worth standing up as a living dashboard:
   *  `score` 0–100, and a short `reason`. Surfaced as a quiet "Track this live" chip only when the
   *  score clears the threshold (see dashboards/detect). Absent on the vast majority of answers. */
  track?: { score: number; reason: string };
  extras: { slide?: Extra; action?: Extra; replay?: Extra };

  // routing metadata — kept next to the data it routes
  group: ConversationGroup;
  tryChip?: { label: string; route: string };
  suggests: SuggestSpec[];
  intents?: Record<string, IntentSpec>;
  keywords: KeywordRule[];
}

/**
 * The identity of an ANSWER — for anything that must reset, refetch or re-deal when the answer
 * changes.
 *
 * `spec.id` alone is NOT it, and that is the trap this exists to close: a live spec's id is the
 * constant `'live'` for a whole session, so an effect keyed on it fires once and never again, and
 * a REPLACE restarts block ids at `live-1`, so a bare id list collides across answers too.
 *
 * Nor is id:type enough on its own. Answers repeat their silhouette constantly — insight + chart
 * + list is the house style — so a shape-only key reads a genuinely new answer as the same one,
 * which is how the desk kept the previous answer's notes and the reader's pin. The content
 * fingerprint is what makes two answers of the same shape distinguishable; it reads a bounded
 * slice of each block so the cost stays flat however large the props grow.
 */
export function answerSignature(spec: Pick<ConversationSpec, 'id' | 'blocks'>): string {
  const shape = spec.blocks.map((b) => `${b.id ?? ''}:${b.type}`).join(',');
  const content = spec.blocks.map((b) => boundedValueHash(b.props ?? {})).join('|');
  return `${spec.id}|${shape}|${fnv1a(content)}`;
}
