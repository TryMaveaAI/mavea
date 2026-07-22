// charts1 family block types — hierarchy / flow / distribution visualizations.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';

// ───────────────────────── treemap ─────────────────────────
export interface TreemapNode {
  label: string;
  value: number;
  color?: AccentVar;
  children?: TreemapNode[];
}
export interface TreemapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  root: TreemapNode;
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── sunburst ─────────────────────────
export interface SunburstNode {
  label: string;
  value: number;
  color?: AccentVar;
  children?: SunburstNode[];
}
export interface SunburstProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  root: SunburstNode;
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── sankey ─────────────────────────
export interface SankeyNode {
  id: string;
  label: string;
  /** column index 0..n (left→right) */
  layer: number;
  color?: AccentVar;
}
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}
export interface SankeyProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: SankeyNode[];
  links: SankeyLink[];
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── network ─────────────────────────
export interface NetworkNode {
  id: string;
  label: string;
  group?: number;
  weight?: number;
  color?: AccentVar;
}
export interface NetworkEdge {
  source: string;
  target: string;
  weight?: number;
}
export interface NetworkProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  layout?: 'circle' | 'grid';
  footer?: HtmlString;
}

// ───────────────────────── radar ─────────────────────────
export interface RadarSeries {
  label: string;
  color?: AccentVar;
  values: number[];
}
export interface RadarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  axes: string[];
  series: RadarSeries[];
  max?: number;
  footer?: HtmlString;
}

// ───────────────────────── waterfall ─────────────────────────
export interface WaterfallStep {
  label: string;
  /** signed delta; for total/subtotal steps set `total: true` and value = absolute */
  value: number;
  total?: boolean;
  color?: AccentVar;
}
export interface WaterfallProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  steps: WaterfallStep[];
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── funnel ─────────────────────────
export interface FunnelStage {
  label: string;
  value: number;
  color?: AccentVar;
}
export interface FunnelProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  stages: FunnelStage[];
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── histogram ─────────────────────────
export interface HistogramBin {
  /** inclusive lower edge */
  x0: number;
  /** exclusive upper edge */
  x1: number;
  count: number;
}
export interface HistogramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  bins: HistogramBin[];
  unit?: string;
  color?: AccentVar;
  /** optional marker line (e.g. mean) */
  marker?: number;
  markerLabel?: string;
  footer?: HtmlString;
}

// ───────────────────────── boxplot ─────────────────────────
export interface BoxGroup {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: number[];
  color?: AccentVar;
}
export interface BoxplotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  groups: BoxGroup[];
  unit?: string;
  domain?: [number, number];
  footer?: HtmlString;
}

// ───────────────────────── streamgraph ─────────────────────────
export interface StreamSeries {
  label: string;
  color?: AccentVar;
  /** one value per time slice (aligned with `ticks`) */
  values: number[];
}
export interface StreamgraphProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  ticks: string[];
  series: StreamSeries[];
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── venn ─────────────────────────
// Set-overlap diagram (2 or 3 circles). Exclusive regions and intersections each
// carry an optional count — shows what's shared vs unique at a glance (audiences,
// skills, requirements, logic sets).
export interface VennSet {
  label: string;
  /** count/size shown in this set's exclusive region */
  value?: number;
  color?: AccentVar;
}
export interface VennOverlap {
  /** indices into `sets` that this region intersects (e.g. [0,1] or [0,1,2]) */
  sets: number[];
  label?: string;
  value?: number;
}
export interface VennProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 2 or 3 sets */
  sets: VennSet[];
  /** counts/labels for the intersection regions */
  overlaps?: VennOverlap[];
  footer?: HtmlString;
}

// ───────────────────────── piedonut ─────────────────────────
export interface PieSlice {
  label: string;
  value: number;
  color?: AccentVar;
}
export interface PieDonutProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  slices: PieSlice[];
  unit?: string;
  /** Donut hole radius as a fraction (0 = full pie, 0.6 = thin ring). Default 0.58. */
  hole?: number;
  /** Big value shown in the donut hole (e.g. a total). */
  centerValue?: string;
  centerLabel?: string;
  footer?: HtmlString;
}

// ───────────────────────── distributioncurve ─────────────────────────
export interface DistributionProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Distribution shape. `normal` uses mean+sd; `custom` uses sampled points. */
  kind?: 'normal' | 'custom';
  mean?: number;
  sd?: number;
  /** Sampled (x,y) density points for `custom`. */
  points?: { x: number; y: number }[];
  /** Shade the region beyond this x (a p-value / critical region). */
  shadeFrom?: number;
  /** Shade between two x values (a confidence interval). */
  shadeBetween?: [number, number];
  /** Vertical markers, e.g. the mean or a test statistic. */
  markers?: { x: number; label?: string; color?: AccentVar }[];
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── quadrant ─────────────────────────────────
/** One plotted item in a 2×2 quadrant diagram. */
export interface QuadrantItem {
  label: string;
  /** Which quadrant: 'topRight'|'topLeft'|'bottomRight'|'bottomLeft' */
  quadrant: 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft';
  note?: string;
}
export interface QuadrantProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Horizontal axis label (left → right). */
  xLabel?: string;
  /** Vertical axis label (bottom → top). */
  yLabel?: string;
  /** Labels for each of the four quadrants (clockwise from top-right). */
  topRight?: string;
  topLeft?: string;
  bottomLeft?: string;
  bottomRight?: string;
  items: QuadrantItem[];
  footer?: HtmlString;
}

// ───────────────────────── latencydist ─────────────────────────
// Latency distribution histogram with percentile markers + an SLO threshold line.
// The component bins the request latencies, draws labelled p50/p90/p95/p99 verticals,
// and colours the SLO line by whether the tail (p99) breaches it.
export interface LatencyBin {
  /** inclusive lower edge (in `unit`) */
  from: number;
  /** exclusive upper edge (in `unit`) */
  to: number;
  count: number;
}
export interface LatencyDistProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  bins: LatencyBin[];
  /** value unit, e.g. 'ms'. Default 'ms'. */
  unit?: string;
  p50?: number;
  p90?: number;
  p95?: number;
  p99?: number;
  /** the service-level objective threshold (same unit). */
  slo?: number;
  /** label for the SLO line, e.g. 'SLO 200ms'. */
  sloLabel?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── captable ─────────────────────────
// Startup capitalization table: a stacked ownership bar over a ledger of holders.
// Fully-diluted % is taken from `fdPct` when present, else computed from `shares`.
export interface CapHolder {
  name: string;
  shares: number;
  /** share class, e.g. 'Common', 'Preferred Seed', 'Options'. */
  class?: string;
  /** fully-diluted percentage (0..100); computed from shares when omitted. */
  fdPct?: number;
  color?: AccentVar;
}
export interface CapTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  holders: CapHolder[];
  /** total shares for % math; defaults to the sum of holder shares. */
  totalShares?: number;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── lifewheel ─────────────────────────
// Wheel-of-life radial self-assessment: one spoke per life domain rated 0..10.
// The filled polygon reads "balance vs imbalance" at a glance — a round, even
// shape is a settled life; a jagged one shows which spokes are starving. Each
// score is plotted on its own spoke against a felt 0..10 scale.
export interface LifeDomain {
  label: string;
  /** felt rating 0..10 (clamped on render). */
  score: number;
  note?: string;
}
export interface LifeWheelProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  domains: LifeDomain[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── stemleaf ─────────────────────────
// Back-to-back or single-sided stem-and-leaf plot for raw distribution display.
export interface StemLeafProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Raw numeric values for the primary (right) side. */
  values: number[];
  /** Optional label for the primary dataset (used in back-to-back mode). */
  title2?: string;
  /** Raw numeric values for the secondary (left) side in back-to-back mode. */
  values2?: number[];
  /** The place value of each leaf digit (e.g. 1 = ones, 10 = tens). Default 1. */
  leafUnit?: number;
  footer?: HtmlString;
}

// ───────────────────────── tamsam ─────────────────────────
// TAM / SAM / SOM concentric-ring market-sizing diagram.
export interface TamSamMarket {
  /** E.g. 'TAM', 'SAM', 'SOM'. */
  label: string;
  /** Numeric market size. */
  value: number;
  /** Optional unit suffix override (e.g. 'B', 'M'). When omitted, auto-formats B/T. */
  unit?: string;
  /** Optional CAGR percentage, e.g. 18. */
  cagr?: number;
  /** Optional descriptive sentence shown in the legend below the chart. */
  description?: string;
}
export interface TamSamProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Ordered outermost→innermost: e.g. [TAM, SAM, SOM]. */
  markets: TamSamMarket[];
  footer?: HtmlString;
}

// ───────────────────────── violinplot ─────────────────────────
// Kernel-density violin plot with optional embedded IQR box-and-whisker.
export interface ViolinGroup {
  label: string;
  /** Raw sample values used to estimate the density curve. */
  values: number[];
  /** Optional accent colour. Falls back to the palette by index. */
  color?: AccentVar;
}
export interface ViolinPlotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  groups: ViolinGroup[];
  /** Overlay an IQR box-and-whisker inside each violin. Default true. */
  showBox?: boolean;
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── correlationheatmap ─────────────────────────
// Numeric correlation matrix (Pearson/Spearman/etc. — the caller decides which). Diverges
// around 0: positive correlations tint toward `--presence`, negative toward `--danger`, and
// the diagonal (a variable against itself, always 1) gets its own border treatment so it
// reads as "trivially true" rather than "the strongest relationship in the data".
export interface CorrelationHeatmapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Variable names, same order on both axes. */
  variables: string[];
  /** Square matrix, matrix[i][j] = correlation of variables[i] with variables[j], in [-1, 1]. */
  matrix: number[][];
  footer?: HtmlString;
}

// ───────────────────────── bcgmatrix ─────────────────────────
// BCG growth-share matrix: plots a portfolio of products or business units by market
// growth (y) against relative market share (x), split into the four classic quadrants
// by the median of each axis (there's no external benchmark to threshold against, so the
// portfolio's own median is the honest split). Bubble radius carries revenue when given,
// so the biggest bets in the portfolio read as the biggest circles.
export interface BcgItem {
  label: string;
  /** Market growth rate, in percent (e.g. 18 for +18% YoY). Can be negative. */
  growth: number;
  /** Relative market share vs. the category leader (1 = tied for the lead). */
  share: number;
  /** Optional revenue/size — sizes the bubble when given; every bubble matches otherwise. */
  revenue?: number;
  note?: string;
}
export interface BcgMatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: BcgItem[];
  /** Unit suffix for revenue, shown in the hover tooltip (e.g. 'k', 'M'). */
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── flowchord ─────────────────────────
// Circular relationship/flow diagram: nodes ring the card's perimeter and flows arc
// between them as ribbons whose width carries the value — Sankey's flow-width-by-value
// logic, bent onto a circle instead of laid out in left-to-right columns. Reads two-way
// movement between the same nodes (a gain AND a loss) cleanly, which a layered Sankey
// can't without a duplicate reverse column.
export interface FlowChordNode {
  id: string;
  label: string;
  color?: AccentVar;
}
export interface FlowChordFlow {
  from: string;
  to: string;
  value: number;
}
export interface FlowChordProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: FlowChordNode[];
  flows: FlowChordFlow[];
  unit?: string;
  footer?: HtmlString;
}

// ───────────────────────── family sub-union ─────────────────────────
export type Charts1Block =
  | (BlockBase & { type: 'piedonut'; props: PieDonutProps })
  | (BlockBase & { type: 'distributioncurve'; props: DistributionProps })
  | (BlockBase & { type: 'venn'; props: VennProps })
  | (BlockBase & { type: 'treemap'; props: TreemapProps })
  | (BlockBase & { type: 'sunburst'; props: SunburstProps })
  | (BlockBase & { type: 'sankey'; props: SankeyProps })
  | (BlockBase & { type: 'network'; props: NetworkProps })
  | (BlockBase & { type: 'radar'; props: RadarProps })
  | (BlockBase & { type: 'waterfall'; props: WaterfallProps })
  | (BlockBase & { type: 'funnel'; props: FunnelProps })
  | (BlockBase & { type: 'histogram'; props: HistogramProps })
  | (BlockBase & { type: 'boxplot'; props: BoxplotProps })
  | (BlockBase & { type: 'streamgraph'; props: StreamgraphProps })
  | (BlockBase & { type: 'quadrant'; props: QuadrantProps })
  | (BlockBase & { type: 'latencydist'; props: LatencyDistProps })
  | (BlockBase & { type: 'captable'; props: CapTableProps })
  | (BlockBase & { type: 'lifewheel'; props: LifeWheelProps })
  | (BlockBase & { type: 'stemleafplot'; props: StemLeafProps })
  | (BlockBase & { type: 'tamsam'; props: TamSamProps })
  | (BlockBase & { type: 'violinplot'; props: ViolinPlotProps })
  | (BlockBase & { type: 'correlationheatmap'; props: CorrelationHeatmapProps })
  | (BlockBase & { type: 'bcgmatrix'; props: BcgMatrixProps })
  | (BlockBase & { type: 'flowchord'; props: FlowChordProps });
