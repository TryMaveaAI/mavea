// stats family block types — 10 premium, interactive stat/KPI components.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared
// file we must not edit), so import it from its canonical source — same type, identical
// to what `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── sparkstat ── big number + inline sparkline (hover → point values) ── */
export interface SparkstatPoint {
  /** the y value (data agent supplies raw magnitudes) */
  v: number;
  /** optional x label for the tooltip (e.g. "Mar", "Wk 12") */
  label?: string;
}
export interface SparkstatProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** big formatted display value, e.g. "$48.2k" */
  value: string;
  /** small unit/caption under value, e.g. "this month" */
  unit?: string;
  /** delta chip text, e.g. "+12.4%" */
  delta?: string;
  /** 'up' good (green/amber per token), 'down' bad */
  deltaDir?: 'up' | 'down';
  color?: AccentVar;
  points: SparkstatPoint[];
  footer?: HtmlString;
}

/* ── counter ── big number count-up on reveal + label/delta ── */
export interface CounterProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the numeric target the count-up animates toward */
  value: number;
  /** characters wrapped around value, e.g. prefix "$", suffix "k" */
  prefix?: string;
  suffix?: string;
  /** decimals to show while/after counting (default 0) */
  decimals?: number;
  label: string;
  delta?: string;
  deltaDir?: 'up' | 'down';
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── herostat ── extra-large stat + narrative + trend chip (hover → detail) ── */
export interface HerostatProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  value: string;
  unit?: string;
  /** narrative line under the giant number */
  narrative?: HtmlString;
  /** trend chip text + direction */
  trend?: string;
  trendDir?: 'up' | 'down';
  /** revealed on chip hover */
  detail?: HtmlString;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── trendtile ── compact tile: number + arrow + % delta + tiny bar ── */
export interface TrendtileProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  value: string;
  delta: string;
  deltaDir?: 'up' | 'down';
  color?: AccentVar;
  /** sparkbars (relative magnitudes), last one is "current" */
  bars: number[];
  footer?: HtmlString;
}

/* ── scorebadge ── circular score badge + grade ring (hover → components) ── */
export interface ScoreComponent {
  label: string;
  /** 0–100 contribution */
  value: number;
  color?: AccentVar;
}
export interface ScorebadgeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 0–100 overall score */
  score: number;
  /** letter grade, e.g. "A-" */
  grade?: string;
  caption?: string;
  color?: AccentVar;
  components?: ScoreComponent[];
  footer?: HtmlString;
}

/* ── percentilebar ── distribution bar + percentile marker (hover → top X%) ── */
export interface PercentilebarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 0–100 where the value sits in the distribution */
  percentile: number;
  /** the formatted value at that percentile, e.g. "94 ms" */
  value: string;
  unit?: string;
  /** axis end labels */
  lowLabel?: string;
  highLabel?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── statpair ── two related numbers + connector + ratio ── */
export interface StatpairSide {
  label: string;
  value: string;
  /** numeric weight used for the ratio bar */
  weight: number;
  color?: AccentVar;
  sub?: string;
}
export interface StatpairProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  left: StatpairSide;
  right: StatpairSide;
  /** connector glyph, default "→" */
  connector?: string;
  /** label for the computed ratio, e.g. "conversion" */
  ratioLabel?: string;
  footer?: HtmlString;
}

/* ── scorecard ── grid of mini stats (icon + value + trend), hover lifts ── */
export interface ScorecardTile {
  icon?: IconKey;
  label: string;
  value: string;
  delta?: string;
  deltaDir?: 'up' | 'down';
  color?: AccentVar;
  /** revealed on hover */
  detail?: HtmlString;
}
export interface ScorecardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cols?: number;
  tiles: ScorecardTile[];
  footer?: HtmlString;
}

/* ── deltacascade ── sequential value changes flowing to a total (hover step) ── */
export interface CascadeStep {
  label: string;
  /** signed delta; the first step is usually the baseline (use isBase) */
  delta: number;
  /** mark this step as the starting baseline (absolute, not a delta) */
  isBase?: boolean;
  /** mark the final running total */
  isTotal?: boolean;
  detail?: HtmlString;
}
export interface DeltacascadeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** unit prefix/suffix for formatting, e.g. prefix "$" */
  prefix?: string;
  suffix?: string;
  steps: CascadeStep[];
  footer?: HtmlString;
}

/* ── bulletkpi ── stacked bullet KPIs (value vs target mini-bars) ── */
export interface BulletRow {
  label: string;
  /** current value */
  value: number;
  /** target marker */
  target: number;
  /** full-scale max for the track */
  max: number;
  /** formatted display of value */
  display?: string;
  color?: AccentVar;
}
export interface BulletkpiProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: BulletRow[];
  footer?: HtmlString;
}

/* ── confusionmatrix ── N×N classification grid (rows=actual, cols=predicted) ── */
export interface ConfusionMatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Class labels for both axes, in order. Row i = actual class[i], column j = predicted class[j].
   *  Needs ≥ 2 for a valid matrix; keep ≤ ~8 so cells stay legible. */
  classes: string[];
  /** Square N×N counts where matrix[i][j] = number of samples whose ACTUAL class is i and
   *  PREDICTED class is j. The diagonal (i===j) is the correct predictions. Real counts only. */
  matrix: number[][];
  /** Heat color for correct (diagonal) cells. Default var(--presence). */
  correctColor?: AccentVar;
  /** Heat color for misclassified (off-diagonal) cells, so errors stand out. Default var(--danger). */
  errorColor?: AccentVar;
  /** Show a row/column totals strip on the right and bottom edges. Default false. */
  showTotals?: boolean;
  /** Derived read-out under the grid: overall accuracy headline, or a per-class
   *  precision/recall table, or none. Default 'accuracy'. */
  readout?: 'accuracy' | 'perclass' | 'none';
  /** y-axis title (the truth axis). Default 'Actual'. */
  actualLabel?: string;
  /** x-axis title (the model's guess axis). Default 'Predicted'. */
  predictedLabel?: string;
  /** Noun for the accuracy read-out (e.g. 'samples', 'cases', 'emails'). Default 'samples'. */
  countLabel?: string;
  footer?: HtmlString;
}

/* ── abtestresult ── A/B experiment readout: control vs variant + lift + significance ── */
export interface ABTestArm {
  /** arm name, e.g. "Control" or "New checkout flow" */
  name: string;
  /** sample size for this arm */
  n: number;
  /** conversion rate as a fraction 0..1 (e.g. 0.084 = 8.4%), never a 0..100 percentage */
  conversionRate: number;
}
export interface AbtestresultProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  control: ABTestArm;
  variant: ABTestArm;
  /** two-sided p-value from the significance test actually run, if the caller has one */
  pValue?: number;
  /** [low, high] 95% CI on the relative lift, on the same percentage-point scale as the
   *  displayed lift figure (e.g. [9.1, 26.8] for a lift shown as "+18.0%"). Real, caller-
   *  computed bounds only — never a fabricated interval. */
  confidenceInterval?: [number, number];
  /** Explicit call on statistical significance; wins over any pValue-derived guess when
   *  given. Omit to fall back to pValue < 0.05, or omit both to render no badge at all. */
  significant?: boolean;
  footer?: HtmlString;
}

/* ── kpidashboard ── grid of KPI tiles, each with its own inline sparkline ── */
export interface KpiTile {
  /** metric name, e.g. "MRR", "Net revenue retention" */
  label: string;
  /** big formatted display value, e.g. "$48.2k" or a raw number the unit annotates */
  value: string | number;
  /** unit/suffix shown next to the value, e.g. "%", "mo", "/customer" */
  unit?: string;
  /** delta chip text, e.g. "+4.1%" or "−2 days" */
  delta?: string;
  /** how the delta reads: 'up' positive, 'down' negative, 'good' positive (when up
   *  would be bad, e.g. a falling churn rate is 'good'). Colors the chip. */
  deltaDir?: 'up' | 'down' | 'good';
  /** raw magnitudes for the tile's inline sparkline (oldest → newest) */
  spark?: number[];
  /** small confidence/source caption under the tile, e.g. "trailing 6 mo" */
  conf?: string;
}
export interface KpidashboardProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  tiles: KpiTile[];
  /** subdued line under the grid */
  caption?: string;
  footer?: HtmlString;
}

/* ── powersample ── statistical power / sample-size calculator ── */
export interface PowerCurvePoint {
  /** sample size per group at this point on the curve */
  n: number;
  /** power (0..1) actually achieved at that n — a real computed point, never interpolated here */
  power: number;
}
export interface PowersampleProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** standardized effect size (e.g. Cohen's d) the test is powered to detect; sign is kept for
   *  display but only its magnitude drives the sample-size math */
  effectSize: number;
  /** two-sided significance level, 0..1 (default 0.05) */
  alpha?: number;
  /** target power, 0..1 (default 0.8) — used to solve for requiredN when requiredN is omitted */
  power?: number;
  /** caller-computed sample size per group; when given, it's trusted as-is (and power is read
   *  off it instead of solved for) rather than re-derived from effectSize/alpha/power */
  requiredN?: number;
  /** real (n, power) points from an actual power analysis — plotted verbatim, never a fabricated
   *  or interpolated curve */
  curve?: PowerCurvePoint[];
  footer?: HtmlString;
}

/* ── inventoryreorder ── SKU-level stock levels vs reorder point/safety stock ── */
export interface InventoryReorderItem {
  /** stock-keeping unit code, e.g. "SKU-4471" */
  sku: string;
  /** human-readable item name */
  label: string;
  /** current stock on hand */
  level: number;
  /** the threshold that should trigger a purchase order */
  reorderPoint: number;
  /** the minimum buffer never to dip below; defaults to 0 when omitted */
  safetyStock?: number;
  /** full-scale max for the track (warehouse capacity or a comfortable ceiling) */
  max: number;
  /** supplier lead time in days, shown as context for how urgent a reorder is */
  leadTimeDays?: number;
}
export interface InventoryreorderProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: InventoryReorderItem[];
  footer?: HtmlString;
}

/* ── boardgamescore ── tabletop scorepad: players × rounds grid with a leader ── */
export interface BoardGamePlayer {
  name: string;
  /** one entry per round played so far, oldest first */
  roundScores: number[];
  /** the running total; trusted verbatim when finite, else summed from roundScores */
  total: number;
}
export interface BoardgamescoreProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the game being played, e.g. "Wingspan" */
  game?: string;
  players: BoardGamePlayer[];
  /** total rounds to show; defaults to the longest roundScores among players */
  rounds?: number;
  footer?: HtmlString;
}

/* ── cvssscorecard ── CVSS base score gauge + vector metric chips ── */
export type CvssSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';
export interface CvssVectorComponent {
  /** metric abbreviation, e.g. "AV" (Attack Vector), "PR" (Privileges Required) */
  label: string;
  /** the metric's value, e.g. "Network", "Low", "None" */
  value: string;
}
export interface CvssscorecardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** CVSS base score, 0.0–10.0 */
  baseScore: number;
  severity: CvssSeverity;
  /** the CVSS vector's individual metric components, shown as a compact chip row */
  vector?: CvssVectorComponent[];
  /** e.g. "CVE-2024-21306" */
  cve?: string;
  footer?: HtmlString;
}

/* ── ridgeplot ── stacked, overlapping density curves by category (a joyplot) ── */
export interface RidgeCategory {
  label: string;
  /** real density/frequency samples, evenly spaced along the shared x-axis — plotted
   *  verbatim, never smoothed or fit */
  curve: number[];
  color?: AccentVar;
}
export interface RidgeplotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  categories: RidgeCategory[];
  /** 0..1, how far each ridge's peak rises into the row above (default 0.55) */
  overlap?: number;
  footer?: HtmlString;
}

/* ── ecdf ── empirical CDF: a real stepped 0→1 cumulative-probability function ── */
export interface EcdfProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** raw sample values — sorted client-side, never fit or interpolated */
  values: number[];
  unit?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── forestplot ── meta-analysis forest plot: study effects + CIs over a shared axis ── */
export type ForestMeasure = 'OR' | 'RR' | 'HR' | 'MD' | 'SMD';
export interface ForestStudy {
  label: string;
  /** point estimate on the measure's natural scale (an OR of 0.82, an MD of −3.1) */
  effect: number;
  /** lower bound of the 95% interval, same scale as effect */
  ciLow: number;
  /** upper bound of the 95% interval, same scale as effect */
  ciHigh: number;
  /** percent weight in the pooled estimate (0..100), sizes the square marker; omit to size
   *  markers by the inverse-variance weight recovered from the CI */
  weight?: number;
  /** publication year, shown after the study label */
  year?: number;
}
export interface ForestPooled {
  effect: number;
  ciLow: number;
  ciHigh: number;
  /** summary-row label, default 'Pooled' */
  label?: string;
}
export interface ForestplotProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  studies: ForestStudy[];
  /** effect measure. Ratio measures (OR/RR/HR) plot on a log axis with the null line at 1;
   *  difference measures (MD/SMD) plot linearly with the null at 0. Default 'OR'. */
  measure?: ForestMeasure;
  /** caller-computed pooled estimate, drawn as the summary diamond. Omit to have a
   *  fixed-effect inverse-variance pool computed from the study CIs. */
  pooled?: ForestPooled;
  /** heterogeneity readout shown beside the pooled line, e.g. 'I² = 34%' */
  heterogeneity?: string;
  /** left axis-end label, e.g. 'Favors treatment' */
  favorsLeft?: string;
  /** right axis-end label, e.g. 'Favors control' */
  favorsRight?: string;
  footer?: HtmlString;
}

export type StatsBlock =
  | (BlockBase & { type: 'sparkstat'; props: SparkstatProps })
  | (BlockBase & { type: 'counter'; props: CounterProps })
  | (BlockBase & { type: 'herostat'; props: HerostatProps })
  | (BlockBase & { type: 'trendtile'; props: TrendtileProps })
  | (BlockBase & { type: 'scorebadge'; props: ScorebadgeProps })
  | (BlockBase & { type: 'percentilebar'; props: PercentilebarProps })
  | (BlockBase & { type: 'statpair'; props: StatpairProps })
  | (BlockBase & { type: 'scorecard'; props: ScorecardProps })
  | (BlockBase & { type: 'deltacascade'; props: DeltacascadeProps })
  | (BlockBase & { type: 'bulletkpi'; props: BulletkpiProps })
  | (BlockBase & { type: 'confusionmatrix'; props: ConfusionMatrixProps })
  | (BlockBase & { type: 'kpidashboard'; props: KpidashboardProps })
  | (BlockBase & { type: 'abtestresult'; props: AbtestresultProps })
  | (BlockBase & { type: 'powersample'; props: PowersampleProps })
  | (BlockBase & { type: 'inventoryreorder'; props: InventoryreorderProps })
  | (BlockBase & { type: 'boardgamescore'; props: BoardgamescoreProps })
  | (BlockBase & { type: 'cvssscorecard'; props: CvssscorecardProps })
  | (BlockBase & { type: 'ridgeplot'; props: RidgeplotProps })
  | (BlockBase & { type: 'ecdf'; props: EcdfProps })
  | (BlockBase & { type: 'forestplot'; props: ForestplotProps });
