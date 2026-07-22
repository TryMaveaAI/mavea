// charts2 family block types — 10 interactive chart components.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';

/* ── slopegraph: before→after two-point lines with labels ── */
export interface SlopeRow {
  label: string;
  before: number;
  after: number;
  color?: AccentVar;
}
export interface SlopegraphProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  unit?: string;
  beforeLabel?: string;
  afterLabel?: string;
  rows: SlopeRow[];
  footer?: HtmlString;
}

/* ── dumbbell: paired dots + connector per row ── */
export interface DumbbellRow {
  label: string;
  start: number;
  end: number;
  tag?: string;
}
export interface DumbbellProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  unit?: string;
  startLabel?: string;
  endLabel?: string;
  startColor?: AccentVar;
  endColor?: AccentVar;
  domain?: [number, number];
  rows: DumbbellRow[];
  footer?: HtmlString;
}

/* ── lollipop: stem+circle bars (clean bar alt) ── */
export interface LollipopRow {
  label: string;
  value: number;
  color?: AccentVar;
  sub?: string;
}
export interface LollipopProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  unit?: string;
  rows: LollipopRow[];
  footer?: HtmlString;
}

/* ── bulletchart: actual vs target with qualitative bands ── */
export interface BulletRow {
  label: string;
  value: number;
  target: number;
  max: number;
  bands?: number[]; // ascending thresholds for qualitative ranges
  color?: AccentVar;
  unit?: string;
}
export interface BulletChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: BulletRow[];
  footer?: HtmlString;
}

/* ── candlestick: OHLC candles over time ── */
export interface Candle {
  label: string;
  o: number;
  h: number;
  l: number;
  c: number;
  vol?: number;
}
export interface CandlestickProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  unit?: string;
  candles: Candle[];
  footer?: HtmlString;
}

/* ── gantt: task bars on a timeline with dependencies ── */
export interface GanttTask {
  name: string;
  start: number; // unit index along timeline
  span: number; // length in units
  lane?: string;
  pct?: number; // 0..100 completion
  color?: AccentVar;
  dependsOn?: number; // index of prerequisite task
  detail?: string;
}
export interface GanttProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cols: string[]; // timeline column labels (e.g. weeks)
  tasks: GanttTask[];
  footer?: HtmlString;
}

/* ── bubble: x/y/size/color scatter ── */
export interface BubblePoint {
  label: string;
  x: number;
  y: number;
  size: number;
  cat: string;
}
export interface BubbleCategory {
  name: string;
  color: AccentVar;
}
export interface BubbleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  xLabel?: string;
  yLabel?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  categories: BubbleCategory[];
  points: BubblePoint[];
  footer?: HtmlString;
}

/* ── arearange: a line with a min/max confidence band ── */
export interface RangePoint {
  label: string;
  value: number;
  lo: number;
  hi: number;
}
export interface AreaRangeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  unit?: string;
  color?: AccentVar;
  points: RangePoint[];
  footer?: HtmlString;
}

/* ── waffle: 10×10 square grid for composition ── */
export interface WaffleCat {
  name: string;
  pct: number; // share, summing to ~100
  color: AccentVar;
}
export interface WaffleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cats: WaffleCat[];
  footer?: HtmlString;
}

/* ── groupedbars: clustered bars by category ── */
export interface GroupSeries {
  name: string;
  color: AccentVar;
  data: number[]; // one value per group
}
export interface GroupedBarsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  unit?: string;
  groups: string[];
  series: GroupSeries[];
  footer?: HtmlString;
}

/* ── calheat: GitHub-style activity calendar; days flow column-major into 7-day weeks,
   each cell shaded by an intensity level 0–4 ── */
export interface CalHeatCell {
  /** intensity 0 (empty) … 4 (max) */
  level: number;
  /** optional label shown on hover (e.g. a date) */
  date?: string;
}
export interface CalHeatProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** base accent; intensity scales how much of it tints each cell (default --insight) */
  color?: AccentVar;
  /** all days in order; laid out top→bottom (Sun→Sat), then left→right by week */
  days: CalHeatCell[];
  /** optional 7 row labels (e.g. ["", "Mon", "", "Wed", "", "Fri", ""]) */
  weekdays?: string[];
  /** legend end labels, default ["Less", "More"] */
  legend?: [string, string];
  footer?: HtmlString;
}

/* ── bump: rank-over-time; each entity's standing (1 = top) traced across periods,
   lines crossing as they overtake each other ── */
export interface BumpSeries {
  label: string;
  color?: AccentVar;
  /** rank at each period (1 = top); aligned index-for-index with `periods` */
  ranks: number[];
}
export interface BumpChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** x-axis period labels (time, left → right) */
  periods: string[];
  series: BumpSeries[];
  footer?: HtmlString;
}

/* ── marimekko: 2D composition; column WIDTH ∝ that group's total, and each column is
   split vertically into shares — magnitude and mix read at once (market × segment) ── */
export interface MekkoSegment {
  /** category label; the SAME label across columns shares a color */
  label: string;
  value: number;
  color?: AccentVar;
}
export interface MekkoColumn {
  label: string;
  segments: MekkoSegment[];
}
export interface MarimekkoProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  columns: MekkoColumn[];
  unit?: string;
  footer?: HtmlString;
}

/* ── plot: Cartesian function/curve plotter — axes (optionally through the origin),
   gridlines + ticks, and one or more curves given as SAMPLED POINTS. The math/STEM
   workhorse (functions, growth, transformations, geometry-on-axes). Data-driven: the
   caller samples the function into points; the block never evaluates an expression. ── */
export interface PlotPoint {
  x: number;
  y: number;
}
export interface PlotCurve {
  label: string;
  color?: AccentVar;
  /** sampled points in data coordinates, drawn as a polyline */
  points: PlotPoint[];
  /** dashed stroke (e.g. an asymptote or a reference line) */
  dashed?: boolean;
}
export interface PlotMarker {
  x: number;
  y: number;
  label?: string;
  color?: AccentVar;
}
export interface PlotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  xLabel?: string;
  yLabel?: string;
  /** axis ranges; auto-fit from the curves + markers when omitted */
  xDomain?: [number, number];
  yDomain?: [number, number];
  curves: PlotCurve[];
  markers?: PlotMarker[];
  /** draw the axes through (0,0) when it's in range (default true); false = edge axes */
  origin?: boolean;
  footer?: HtmlString;
}

/* ── dualaxis: a bar series + a line series sharing an x, on two independent y-axes ── */
export interface DualAxisProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  categories: string[];
  /** Bars read against the LEFT axis. */
  bar: { name: string; data: number[]; color?: AccentVar; unit?: string };
  /** Line reads against the RIGHT axis. */
  line: { name: string; data: number[]; color?: AccentVar; unit?: string };
  footer?: HtmlString;
}

/* ── scatterregression: scatter points + an OLS fit line + R² ── */
export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
}
export interface ScatterRegressionProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  xLabel?: string;
  yLabel?: string;
  points: ScatterPoint[];
  color?: AccentVar;
  /** Draw the fitted line + show R² (default true). */
  fit?: boolean;
  footer?: HtmlString;
}

/* ── dotplot: stacked-dot distribution above a number line ── */
export interface DotPlotProps {
  title: string;
  /** Raw data values; each observation becomes one dot stacked above the number line. */
  values: number[];
  label?: string;
  /** Dot fill color (CSS var or hex; default var(--presence)). */
  color?: string;
  note?: string;
  sub?: string;
}

/* ── controlchart: Shewhart process-control chart with UCL/LCL and center line ── */
export interface ControlChartPoint {
  label: string;
  value: number;
  /** explicitly flag as out-of-control; also auto-flagged when value > ucl or < lcl */
  outOfControl?: boolean;
}
export interface ControlChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  points: ControlChartPoint[];
  /** upper control limit */
  ucl: number;
  /** lower control limit */
  lcl: number;
  /** process mean / center line */
  centerLine: number;
  yLabel?: string;
  note?: string;
  sub?: string;
}

/* ── bridge: waterfall reconciliation; a start value flows through signed contributions to an end
   value, each step a bar that floats between the running total before and after it ── */
export interface BridgeStep {
  label: string;
  /** signed contribution; positive lifts the running total, negative pulls it down */
  delta: number;
}
export interface BridgeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** opening value the bridge starts from */
  start: number;
  /** closing value the bridge lands on (start + sum of deltas) */
  end: number;
  steps: BridgeStep[];
  /** unit suffix on every value, e.g. 'k', 'users', '%' */
  unit?: string;
  /** currency/symbol prefix on every value (e.g. '$'); used when unit is omitted */
  prefix?: string;
  footer?: HtmlString;
}

/* ── areaplot: a Cartesian plot that SHADES a region and labels its area — the calculus
   workhorse (integral under a curve to the x-axis, area between two curves, probability
   mass under a pdf, consumer/producer surplus, work under an F–x curve). Curves arrive
   pre-sampled (the caller turns f(x) into points). The fill polygon, the optional Riemann/
   trapezoid rectangles, and the reported area are all COMPUTED from those points; the block
   never evaluates an expression and never eyeballs geometry. ── */
export interface AreaPoint {
  x: number;
  y: number;
}
export interface AreaCurve {
  label: string;
  color?: AccentVar;
  /** sampled points in data coordinates, drawn as a polyline (sample finely for a smooth fill) */
  points: AreaPoint[];
  /** dashed stroke (e.g. a reference / boundary curve) */
  dashed?: boolean;
}
/** The region to shade: from a bottom boundary UP to a top curve, optionally clipped in x. */
export interface AreaShade {
  /** bottom boundary: 'axis' shades down to y=0; a curve index shades down to that curve */
  from: 'axis' | number;
  /** index of the TOP curve the fill rises to */
  to: number;
  /** left integration limit (defaults to where the contributing curves' samples start) */
  x0?: number;
  /** right integration limit (defaults to where the contributing curves' samples end) */
  x1?: number;
}
/** Optional Riemann/trapezoid rectangles approximating the shaded area, with a matching estimate. */
export interface AreaRects {
  /** number of equal-width subintervals */
  n: number;
  /** sampling rule for each rectangle's height (or 'trap' for a trapezoid sum) */
  rule: 'left' | 'right' | 'mid' | 'trap';
}
export interface AreaPlotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  xLabel?: string;
  yLabel?: string;
  /** axis ranges; auto-fit from the curves (and always including y=0) when omitted */
  xDomain?: [number, number];
  yDomain?: [number, number];
  curves: AreaCurve[];
  /** the region to fill; omit to draw just the curves with no shading */
  shade?: AreaShade;
  /** draw Riemann/trapezoid rectangles over the shaded region + print the estimate */
  rects?: AreaRects;
  /** override the area badge text (e.g. an exact symbolic value); else the computed integral */
  areaLabel?: string;
  /** show the area read-out badge inside the region (default true) */
  showArea?: boolean;
  /** draw the axes through (0,0) when it's in range (default true); false = edge axes */
  origin?: boolean;
  footer?: HtmlString;
}

/* ── supplydemand: economics supply×demand on price(P)×quantity(Q) axes ── */
export interface SDPoint {
  q: number;
  p: number;
}
export interface SDLine {
  /** P = intercept + slope·Q (textbook price-on-quantity form). Supply slope > 0, demand < 0. */
  intercept?: number;
  slope?: number;
  /** Alternatively pin the line through two (quantity, price) points. */
  points?: SDPoint[];
}
export interface SDShift {
  /** Which curve moves. */
  curve: 'supply' | 'demand';
  /** The curve's NEW position; the original is drawn faded with an arrow to here. */
  to: SDLine;
}
export interface SupplyDemandProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  supply: SDLine;
  demand: SDLine;
  /** Optionally shift one curve: faded original + arrow + relabeled S₁/D₁. */
  shift?: SDShift;
  /** Shade a textbook region under/around the equilibrium. */
  region?: 'consumer' | 'producer' | 'none';
  /** Pin the visible window; auto-fit from the equilibria when omitted. */
  qMax?: number;
  pMax?: number;
  priceLabel?: string;
  quantityLabel?: string;
  /** Currency symbol prefixing every price (e.g. '$'). */
  pricePrefix?: string;
  /** Mark the equilibrium with guide lines + the P*, Q* readouts (default true). */
  showEquilibrium?: boolean;
  footer?: HtmlString;
}

/* ── bigo: Big-O growth comparison; canonical complexity curves (operations vs input size n)
   drawn together so their relative growth reads true. Curves are computed from the data
   (each class is a pure f(n)); the y-axis is capped at the tallest polynomial in view so the
   exponential visibly rockets off the top instead of flattening the slow classes to zero. ── */
export type BigOClass = 'o-1' | 'o-logn' | 'o-n' | 'o-nlogn' | 'o-n2' | 'o-2n';
export interface BigOProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** which complexity classes to draw (default: all six). Order is normalized to the
   *  canonical slow→fast draw order regardless of how it's given. */
  classes?: BigOClass[];
  /** largest input size on the x-axis (clamped 2..64; default 16). Big-O reads at small n,
   *  where the curves fan out — past ~32 the exponential dominates the whole frame. */
  maxN?: number;
  /** emphasize one class (thicker, full-opacity, flagged legend swatch). */
  highlight?: BigOClass;
  /** annotate "this algorithm" onto one curve — a name pinned mid-line on its class. */
  algorithm?: { name: string; complexity: BigOClass };
  xLabel?: string; // default 'input size (n)'
  yLabel?: string; // default 'operations'
  footer?: HtmlString;
}

/* ── errorbars: group means with uncertainty whiskers (mean ± ci, or low/high) ── */
export interface ErrorGroup {
  label: string;
  /** the group's central estimate (the point / bar height) */
  mean: number;
  /** symmetric half-width of the interval (mean ± ci); ignored if low/high given */
  ci?: number;
  /** explicit interval bound; pair with `high` instead of `ci` for asymmetric CIs */
  low?: number;
  /** explicit upper interval bound; pair with `low` */
  high?: number;
  color?: AccentVar;
}
export interface ErrorBarsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  groups: ErrorGroup[];
  /** unit suffix on every value, e.g. '%', 'mm', 'ms' */
  unit?: string;
  yLabel?: string;
  /** draw a bar from the baseline to each mean behind the whisker (default false = points) */
  bars?: boolean;
  /** horizontal reference line (target, baseline, population mean) */
  reference?: { value: number; label?: string };
  /** significance bracket between two groups, by index, with an annotation */
  bracket?: { from: number; to: number; label: string };
  footer?: HtmlString;
}

/* ── eratimeline: comparative multi-track timeline on ONE shared time axis. Each track (a region,
   field, or person) carries era BANDS (start→end spans) and optional point events, so synchronous
   history lines up vertically. Times are signed years (negative = BCE). ── */
export interface EraSpan {
  /** name of the era / period this band represents */
  label: string;
  /** start time (signed year; negative = BCE) */
  start: number;
  /** end time (signed year; >= start) */
  end: number;
  /** override the track color for just this band */
  color?: AccentVar;
}
export interface EraEvent {
  /** the moment the event happened (signed year; negative = BCE) */
  at: number;
  /** short label drawn beneath the marker */
  label: string;
}
export interface EraTrack {
  /** lane name shown on the left (e.g. a region or person) */
  label: string;
  /** era bands placed along the shared time axis */
  spans: EraSpan[];
  /** single-moment events on this track */
  events?: EraEvent[];
  /** default color for this track's bands/events */
  color?: AccentVar;
}
export interface EraTimelineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the parallel tracks, drawn top → bottom */
  tracks: EraTrack[];
  /** shared axis lower bound (signed year); auto-fit from the data when omitted */
  min?: number;
  /** shared axis upper bound (signed year); auto-fit from the data when omitted */
  max?: number;
  footer?: HtmlString;
}

/* ── indifferencecurve: a microeconomics indifference-curve map. Good X (x) vs good Y (y), a
   family of convex, downward-sloping indifference curves (further from the origin = more
   utility; label them U₁ < U₂ < U₃ so the ordering reads), with an OPTIONAL budget line and
   the OPTIMAL consumption bundle marked where the budget line is tangent to the highest
   reachable curve. The model supplies each curve as sampled points (so the convex shape is its
   responsibility, and curves must not cross — a rule of indifference maps); every coordinate
   here is computed from that data via the shared scale. For consumer choice / utility theory. ── */
export interface IdfPoint {
  x: number;
  y: number;
}
export interface IdfCurve {
  /** utility label, e.g. 'U₁' (lower) … 'U₃' (higher) — parked at the curve's right end */
  label: string;
  color?: AccentVar;
  /** sampled points in data coords (left→right), drawn as a convex polyline; sample finely */
  points: IdfPoint[];
}
/** The consumer's budget line, as Y = intercept + slope·X (slope < 0), OR two points it passes through. */
export interface IdfBudget {
  /** Y-intercept: how much of good Y is affordable when X = 0 (income ÷ price of Y) */
  intercept?: number;
  /** slope = −(price of X ÷ price of Y); negative (more X means less Y) */
  slope?: number;
  /** Alternatively pin the budget line through two (x, y) points. */
  points?: IdfPoint[];
}
export interface IndifferenceCurveProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the family of indifference curves, ordered low→high utility */
  curves: IdfCurve[];
  /** optional budget constraint; drawn as a straight line clipped to the frame */
  budget?: IdfBudget;
  /** optional optimal bundle — the tangency of the budget line with the highest reachable curve;
   *  to highlight the tangent curve, make (x,y) an exact sampled point on it */
  optimal?: { x: number; y: number; label?: string };
  /** x-axis title (default 'Good X') */
  xLabel?: string;
  /** y-axis title (default 'Good Y') */
  yLabel?: string;
  /** pin the visible window; auto-fit from the curves/budget/optimal when omitted */
  xMax?: number;
  yMax?: number;
  footer?: HtmlString;
}

/* ── payoffdiagram: options / derivatives payoff (P&L) at expiration — profit/loss (y) vs the
   underlying price (x). The kinked payoff line is COMPUTED from the position's legs: each leg's
   payoff (long/short × qty × (intrinsic − premium)) is summed across a fine price grid, so the
   curve bends at every strike with no hand-placed points. Breakeven prices (zero-crossings),
   shaded profit/loss zones, the zero reference line, and max profit / max loss (incl.
   'unlimited' tails) are all derived. For single calls/puts, spreads, straddles, collars. ── */
export interface OptionLeg {
  /** option kind */
  type: 'call' | 'put';
  /** long = bought (pay premium), short = written (collect premium) */
  position: 'long' | 'short';
  /** strike price K */
  strike: number;
  /** premium paid (long) or received (short) per contract, in price units */
  premium: number;
  /** number of contracts (default 1); scales this leg's payoff */
  qty?: number;
}
export interface PayoffDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the position's legs; the payoff curve is the sum of their per-leg payoffs */
  legs: OptionLeg[];
  /** visible price-axis lower bound; auto-fit around the strikes when omitted */
  priceMin?: number;
  /** visible price-axis upper bound; auto-fit around the strikes when omitted */
  priceMax?: number;
  /** currency symbol on prices and P/L values (default '$') */
  pricePrefix?: string;
  /** x-axis title (default 'Underlying price at expiration') */
  underlyingLabel?: string;
  /** y-axis title (default 'Profit / loss') */
  pnlLabel?: string;
  /** mark today's underlying price with a vertical guide */
  spot?: number;
  footer?: HtmlString;
}

/* ── phasediagram: a pressure–temperature phase diagram. Temperature (x) vs pressure (y); the
   solid / liquid / gas (and optional supercritical-fluid) regions are separated by phase-boundary
   curves (sublimation, fusion, vaporization), each a sampled polyline; the triple point and
   critical point are marked and labelled. Geometry is plotted entirely from the data through the
   shared linear scale, so faithful special cases — like water's NEGATIVE-slope fusion line — fall
   out naturally from the supplied boundary points. For chemistry / thermodynamics / materials. ── */
export interface PhasePoint {
  /** temperature (x); same unit as tUnit */
  t: number;
  /** pressure (y); same unit as pUnit */
  p: number;
}
export interface PhaseBoundary {
  /** which transition this line separates — drives the default region tint key */
  kind: 'sublimation' | 'fusion' | 'vaporization';
  /** legend label for the curve (e.g. 'Vaporization (liquid⇌gas)') */
  label?: string;
  /** sampled points along the boundary, in data coords, drawn as a polyline */
  points: PhasePoint[];
  /** override the curve color (CSS var); defaults to var(--line-strong) */
  color?: AccentVar;
}
export interface PhaseRegionLabel extends PhasePoint {
  /** which phase occupies this area — drives the default tint */
  phase: 'solid' | 'liquid' | 'gas' | 'supercritical';
  /** the text drawn at (t, p), e.g. 'Solid' */
  label: string;
  /** override the tint/text color (CSS var) */
  color?: AccentVar;
  /** text anchor for the label (default 'middle') */
  anchor?: 'start' | 'middle' | 'end';
}
export interface PhaseDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the phase-boundary curves (sublimation / fusion / vaporization) */
  boundaries: PhaseBoundary[];
  /** the triple point, where all three phases coexist; marked + labelled */
  triplePoint?: PhasePoint;
  /** the critical point, where the liquid⇌gas boundary ends; marked + labelled */
  criticalPoint?: PhasePoint;
  /** region labels placed inside each area (also colour-key the regions) */
  regions?: PhaseRegionLabel[];
  tLabel?: string; // default 'Temperature'
  pLabel?: string; // default 'Pressure'
  /** temperature unit suffix on the axis title + point read-outs, e.g. 'K', '°C' */
  tUnit?: string;
  /** pressure unit suffix, e.g. 'atm', 'kPa', 'bar' */
  pUnit?: string;
  /** axis ranges; auto-fit from the boundaries + special points when omitted */
  tDomain?: [number, number];
  pDomain?: [number, number];
  footer?: HtmlString;
}

/* ── breakeven: a cost-volume-profit (break-even) chart. A revenue line and a total-cost line on
   units(x) × money(y) axes cross at the break-even point, with the loss region (left of the crossing)
   and the profit region (right) shaded. Everything is COMPUTED from four numbers — fixed cost, price
   per unit, and variable cost per unit drive revenue(u)=price·u and totalCost(u)=fixed+varCost·u, whose
   intersection is the break-even volume fixed÷(price−cost); the contribution margin (price−cost) is
   derived too. The block never invents data; it plots straight lines from the supplied rates. For
   pricing, profitability, and "how many do we need to sell" questions. ── */
export interface BreakEvenProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** total fixed cost that doesn't move with volume (rent, salaries, tooling) */
  fixedCost: number;
  /** revenue earned per unit sold */
  pricePerUnit: number;
  /** variable cost incurred per unit produced (must be < pricePerUnit for a finite break-even) */
  costPerUnit: number;
  /** right end of the units axis; auto-fits to ~2× the break-even volume when omitted */
  maxUnits?: number;
  /** unit noun on the x-axis title + readouts, e.g. 'units', 'subscriptions', 'seats' */
  unit?: string;
  /** currency symbol prefixing every money value (default '$') */
  currency?: string;
  /** short note shown beneath the chart (plain text) */
  caption?: string;
  footer?: HtmlString;
}

/* ── loaddiagram: a structural-engineering beam load diagram with its matched shear V(x) and
   bending-moment M(x) plots, three panels stacked on ONE shared position axis (distance along the
   beam). The top panel draws the beam with its supports (pin / roller / fixed) and applied loads
   (point loads as arrows, distributed loads as a band of arrows); the middle and bottom panels plot
   the supplied shear and moment series, with the peak magnitudes marked. The block plots the V and
   M series it is GIVEN — it never solves statics itself — but it COMPUTES every coordinate (support
   positions, load placement, the shared distance scale, the V/M polylines and their extrema) from
   those numeric inputs. For statics, mechanics of materials, and structural-analysis explanations. ── */
export interface BeamSupport {
  /** position along the span where the support sits (0 … span) */
  at: number;
  /** support type — drives the drawn symbol (default 'pin') */
  kind?: 'pin' | 'roller' | 'fixed';
}
export interface BeamLoad {
  /** a single concentrated force, or a uniformly distributed load over [at, to] */
  kind: 'point' | 'udl';
  /** the load's position (point) or its start (udl), along the span */
  at: number;
  /** the udl's end position; required for kind 'udl', ignored for 'point' */
  to?: number;
  /** magnitude — a point load's force, or a udl's intensity per unit length */
  mag: number;
  /** caption drawn by the load (e.g. 'P = 12 kN', 'w = 4 kN/m') */
  label?: string;
}
export interface ShearPoint {
  /** position along the span */
  x: number;
  /** internal shear force V at x */
  v: number;
}
export interface MomentPoint {
  /** position along the span */
  x: number;
  /** internal bending moment M at x */
  m: number;
}
export interface LoadDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** total beam length; sets the shared distance axis [0, span] */
  span: number;
  /** the supports holding the beam up, by position */
  supports: BeamSupport[];
  /** the applied loads (point forces and distributed loads) */
  loads: BeamLoad[];
  /** force/length unit suffix on the load labels + axis read-outs, e.g. 'kN', 'lbf' */
  unit?: string;
  /** the shear diagram V(x) as a sampled series (left→right); plotted, not computed */
  shear?: ShearPoint[];
  /** the bending-moment diagram M(x) as a sampled series (left→right); plotted, not computed */
  moment?: MomentPoint[];
  /** short note shown beneath the diagram (plain text) */
  caption?: string;
  footer?: HtmlString;
}

/* ── ecgstrip: a physiologic ECG rhythm strip on the classic pink graticule. The P-QRS-T
   waveform is drawn from a sampled trace (normalized -1..2, where the QRS R-wave peaks near 2
   and the baseline sits at 0); when no samples are given, a normal sinus beat is SYNTHESIZED and
   repeated at the supplied rate, so the strip stays honest to rateBpm. The graticule (1 mm small
   squares grouped into 5 mm large squares), the beat spacing, the interval brackets (PR/QRS/QT),
   and any abnormality pins are all COMPUTED from the millisecond inputs through the shared time
   scale — the block never invents a measurement, it only plots the trace it is given. For
   cardiology, vitals, and clinical-teaching explanations. ── */
export interface EcgInterval {
  /** which segment this bracket measures, e.g. 'PR', 'QRS', 'QT' */
  label: string;
  /** start of the interval, in milliseconds from the strip's left edge */
  fromMs: number;
  /** end of the interval, in milliseconds (>= fromMs) */
  toMs: number;
}
export interface EcgAbnormality {
  /** time of the finding, in milliseconds from the strip's left edge */
  atMs: number;
  /** short caption pinned above the trace, e.g. 'PVC', 'ST elevation' */
  label: string;
}
export interface EcgStripProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the waveform, one sample per gridMs, normalized -1..2 (0 = baseline, ~2 = R-wave peak);
   *  omit to synthesize a normal sinus beat repeated across the strip at rateBpm */
  samples?: number[];
  /** heart rate in beats per minute; drives synthesized beat spacing + the rate read-out */
  rateBpm?: number;
  /** rhythm interpretation shown beside the rate, e.g. 'Normal sinus rhythm' */
  rhythm?: string;
  /** interval brackets drawn beneath the trace (PR/QRS/QT…) */
  intervals?: EcgInterval[];
  /** findings pinned above the trace at a given time */
  abnormalities?: EcgAbnormality[];
  /** milliseconds represented by one small (1 mm) grid square (default 40 ms, paper standard) */
  gridMs?: number;
  /** short note shown beneath the strip (plain text) */
  caption?: string;
  footer?: HtmlString;
}

/* ── vitalstrip: a multi-channel patient-monitor panel. Each channel (HR, BP, SpO₂, RR, temp…)
   stacks a mini trend line with its normal-range band shaded behind it and a big current read-out;
   any value falling outside the channel's normal range is flagged. The trend geometry, the band
   bounds, and the out-of-range detection are all COMPUTED from the supplied series + range — the
   block plots the numbers it is given and never fabricates a reading. For bedside monitoring,
   triage, and clinical explanations. ── */
export interface VitalChannel {
  /** channel name shown on the left, e.g. 'HR', 'SpO₂' */
  label: string;
  /** unit suffix on the read-out, e.g. 'bpm', '%', '°C' */
  unit?: string;
  /** the trend samples, oldest → newest (left → right) */
  series: number[];
  /** the headline current value; defaults to the last sample when omitted */
  current?: number;
  /** the channel's normal range [low, high]; the band is shaded and excursions flagged */
  normal?: [number, number];
  /** trace + read-out accent (default --presence) */
  color?: AccentVar;
}
export interface VitalStripProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the monitored channels, stacked top → bottom */
  channels: VitalChannel[];
  /** the time window the trends cover, e.g. 'last 30 min' */
  windowLabel?: string;
  /** short note shown beneath the panel (plain text) */
  caption?: string;
  footer?: HtmlString;
}

/* ── growthcurve: a pediatric percentile growth chart. Reference percentile curves (p3 … p97) fan
   out over an age axis; the child's measured points are plotted on top, and the block reports which
   percentile band each landing tracks by interpolating the reference curves AT that age. Both the
   fan and the child's track come from the data (real-data-only) — nothing here invents a growth
   norm; it plots the WHO/CDC-style curves it is given and reads the child's standing off them. For
   pediatrics, well-child visits, and growth-monitoring explanations. ── */
export interface GrowthPercentile {
  /** the percentile this curve represents (e.g. 3, 15, 50, 85, 97) */
  p: number;
  /** the curve as sampled (age, value) points, ascending in age */
  points: { age: number; value: number }[];
}
export interface GrowthPlotted {
  /** the child's age at this measurement, on the same age scale as the curves */
  age: number;
  /** the measured value (weight / height / head circumference) */
  value: number;
}
export interface GrowthCurveProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** which body measurement is charted — drives the default y-axis title */
  metric: 'weight' | 'height' | 'head';
  /** unit suffix on the value axis + read-outs, e.g. 'kg', 'cm', 'lb' */
  unit?: string;
  /** unit noun on the age axis, e.g. 'months', 'years' (default 'months') */
  ageUnit?: string;
  /** the reference percentile curves; drawn as a fan, ordered low→high percentile */
  percentiles: GrowthPercentile[];
  /** the child's measured points, plotted over the fan and tracked to a percentile */
  plotted: GrowthPlotted[];
  /** short note shown beneath the chart (plain text) */
  caption?: string;
  footer?: HtmlString;
}

/* ── sleepcycle: a one-night hypnogram. Sleep stages (Awake / REM / Light / Deep) on a categorical
   y-axis are traced as a stepped line across the hours of the night; REM spans are highlighted, the
   bedtime and wake moments are marked, and the cycle count is reported. The step geometry, the time
   axis, the per-stage time totals, and the REM highlight are all COMPUTED from the supplied spans —
   the block plots the sleep architecture it is given and never fabricates a stage. For sleep
   science, sleep-tracker read-outs, and clinical explanations. ── */
export interface SleepStage {
  /** which stage this span sits at */
  stage: 'awake' | 'rem' | 'light' | 'deep';
  /** start of the span, in minutes from the strip's left edge (lights-out = 0) */
  fromMin: number;
  /** end of the span, in minutes (>= fromMin) */
  toMin: number;
}
export interface SleepCycleProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the night's stage spans, in chronological order */
  stages: SleepStage[];
  /** clock label for lights-out, shown under the strip's left edge, e.g. '11:00 PM' */
  bedtime?: string;
  /** clock label for waking, shown under the strip's right edge, e.g. '7:00 AM' */
  wake?: string;
  /** number of completed sleep cycles, shown as a read-out (else inferred from REM bouts) */
  cycles?: number;
  /** short note shown beneath the strip (plain text) */
  caption?: string;
  footer?: HtmlString;
}

/* ── seasonband: a 12-month seasonal calendar band. Each row (a crop, a flower, a fish) carries
   active WINDOWS across the year — in-season / planting / harvest / peak / bloom spans — drawn on a
   fixed Jan→Dec grid, with an optional "now" marker pinning today's month. Every x-position is
   computed from the month numbers (1..12); the block never invents a month. For "what's in season
   when", planting/harvest calendars, bloom schedules, and any annually-recurring availability. ── */
export type SeasonWindowKind = 'peak' | 'available' | 'planting' | 'harvest' | 'bloom';
export interface SeasonWindow {
  /** first active month, inclusive (1 = Jan … 12 = Dec) */
  from: number;
  /** last active month, inclusive (>= from); clamped into the year */
  to: number;
  /** what this window represents — drives its tint (default 'available') */
  kind?: SeasonWindowKind;
}
export interface SeasonRow {
  /** the thing this row tracks (e.g. a produce name) shown on the left */
  label: string;
  /** the active spans across the year; positioned from their month numbers */
  windows: SeasonWindow[];
  /** short note shown beneath the band for this row (plain text) */
  note?: string;
}
export interface SeasonBandProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the rows, drawn top → bottom on a shared Jan→Dec grid */
  rows: SeasonRow[];
  /** highlight today's month with a vertical marker (1 = Jan … 12 = Dec) */
  nowMonth?: number;
  /** short note shown beneath the band (plain text) */
  caption?: string;
  footer?: HtmlString;
}

/* ── burnrunway: cash balance + monthly burn rate, with projected runway ── */
export interface BurnRunwayMonth {
  label: string;
  burn: number;
  /** explicit end-of-month cash balance; when omitted, computed as running total − burn */
  balance?: number;
}
export interface BurnRunwayProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** month-by-month burn and/or balance data, in chronological order */
  months: BurnRunwayMonth[];
  /** opening cash balance; inferred from the first month when omitted */
  initialCash?: number;
  /** explicit runway count in months; computed from data when omitted */
  runwayMonths?: number;
  /** currency prefix on every cash read-out (default '$') */
  currency?: string;
  footer?: HtmlString;
}

/* ── qqplot: Q–Q plot for assessing normality / distribution fit. Sample quantiles
   on the y-axis vs theoretical quantiles on the x-axis; an IQR-based reference line
   shows where perfect normality would lie; tail deviations are annotated. ── */
export interface QQPlotProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** raw data values; sorted and plotted against theoretical quantiles */
  values: number[];
  /** reference distribution (currently only 'normal' is supported) */
  distribution?: 'normal';
  xlabel?: string;
  ylabel?: string;
  footer?: HtmlString;
}

/* ── roccurve: ROC (Receiver Operating Characteristic) curve for classifier evaluation.
   TPR vs FPR at each decision threshold; diagonal = random baseline; AUC read-out;
   optional operating-point marker on the first curve (interactive). ── */
export interface RocPoint {
  fpr: number;
  tpr: number;
  /** decision threshold at this point; shown in the operating-point read-out when present */
  threshold?: number;
}
export interface RocModel {
  /** classifier name shown in the legend */
  name: string;
  /** (fpr, tpr) pairs; need not be pre-sorted — the block sorts by ascending FPR */
  points: RocPoint[];
  /** area under the curve, model-supplied and displayed as-is (never recomputed) */
  auc?: number;
  /** override the auto-assigned palette color */
  color?: AccentVar;
}
export interface RocCurveProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the classifiers to compare; first curve also shows the interactive operating point */
  curves: RocModel[];
  /** initial index into curves[0].points for the operating-point marker (default 0) */
  operatingPoint?: number;
  xLabel?: string;
  yLabel?: string;
  caption?: string;
  footer?: HtmlString;
}

/* ── samplingdistribution: Central Limit Theorem visualizer. Three linked panels:
   (1) the population histogram, (2) one drawn sample as a dot strip with its mean,
   (3) the sampling distribution of x̄ with the theoretical N(μ, σ²/n) curve overlay.
   The population can be a named shape preset or raw values. ── */
export type PopulationShape = 'uniform' | 'skewed' | 'bimodal';
export interface SamplingDistributionProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** named shape preset or raw numeric population array (default { shape: 'uniform' }) */
  population?: { shape: PopulationShape } | number[];
  /** sample size n drawn per iteration (default 30) */
  sampleSize?: number;
  /** number of sample means to accumulate in the sampling distribution (default 200) */
  numSamples?: number;
  footer?: HtmlString;
}

export type Charts2Block =
  | (BlockBase & { type: 'seasonband'; props: SeasonBandProps })
  | (BlockBase & { type: 'growthcurve'; props: GrowthCurveProps })
  | (BlockBase & { type: 'sleepcycle'; props: SleepCycleProps })
  | (BlockBase & { type: 'ecgstrip'; props: EcgStripProps })
  | (BlockBase & { type: 'vitalstrip'; props: VitalStripProps })
  | (BlockBase & { type: 'loaddiagram'; props: LoadDiagramProps })
  | (BlockBase & { type: 'dualaxis'; props: DualAxisProps })
  | (BlockBase & { type: 'scatterregression'; props: ScatterRegressionProps })
  | (BlockBase & { type: 'plot'; props: PlotProps })
  | (BlockBase & { type: 'slopegraph'; props: SlopegraphProps })
  | (BlockBase & { type: 'calheat'; props: CalHeatProps })
  | (BlockBase & { type: 'bump'; props: BumpChartProps })
  | (BlockBase & { type: 'marimekko'; props: MarimekkoProps })
  | (BlockBase & { type: 'dumbbell'; props: DumbbellProps })
  | (BlockBase & { type: 'lollipop'; props: LollipopProps })
  | (BlockBase & { type: 'bulletchart'; props: BulletChartProps })
  | (BlockBase & { type: 'candlestick'; props: CandlestickProps })
  | (BlockBase & { type: 'gantt'; props: GanttProps })
  | (BlockBase & { type: 'bubble'; props: BubbleProps })
  | (BlockBase & { type: 'arearange'; props: AreaRangeProps })
  | (BlockBase & { type: 'waffle'; props: WaffleProps })
  | (BlockBase & { type: 'groupedbars'; props: GroupedBarsProps })
  | (BlockBase & { type: 'dotplot'; props: DotPlotProps })
  | (BlockBase & { type: 'controlchart'; props: ControlChartProps })
  | (BlockBase & { type: 'areaplot'; props: AreaPlotProps })
  | (BlockBase & { type: 'supplydemand'; props: SupplyDemandProps })
  | (BlockBase & { type: 'bigo'; props: BigOProps })
  | (BlockBase & { type: 'errorbars'; props: ErrorBarsProps })
  | (BlockBase & { type: 'eratimeline'; props: EraTimelineProps })
  | (BlockBase & { type: 'indifferencecurve'; props: IndifferenceCurveProps })
  | (BlockBase & { type: 'payoffdiagram'; props: PayoffDiagramProps })
  | (BlockBase & { type: 'phasediagram'; props: PhaseDiagramProps })
  | (BlockBase & { type: 'breakeven'; props: BreakEvenProps })
  | (BlockBase & { type: 'bridge'; props: BridgeProps })
  | (BlockBase & { type: 'burnrunway'; props: BurnRunwayProps })
  | (BlockBase & { type: 'qqplot'; props: QQPlotProps })
  | (BlockBase & { type: 'roccurve'; props: RocCurveProps })
  | (BlockBase & { type: 'samplingdistribution'; props: SamplingDistributionProps })
  | (BlockBase & { type: 'surfaceplot'; props: SurfacePlotProps })
  | (BlockBase & { type: 'gradientdescent'; props: GradientDescentProps })
  | (BlockBase & { type: 'biasvariance'; props: BiasVarianceProps })
  | (BlockBase & { type: 'timeseriesdecomposition'; props: TimeSeriesDecompositionProps })
  | (BlockBase & { type: 'precisionrecallcurve'; props: PrecisionRecallCurveProps })
  | (BlockBase & { type: 'chromatogram'; props: ChromatogramProps })
  | (BlockBase & { type: 'stressstraincurve'; props: StressStrainCurveProps })
  | (BlockBase & { type: 'gatingplot'; props: GatingPlotProps })
  | (BlockBase & { type: 'gellane'; props: GelLaneProps })
  | (BlockBase & { type: 'flightchart'; props: FlightChartProps })
  | (BlockBase & { type: 'paybandchart'; props: PayBandChartProps })
  | (BlockBase & { type: 'linebalance'; props: LineBalanceProps })
  | (BlockBase & { type: 'epicurve'; props: EpiCurveProps })
  | (BlockBase & { type: 'pareto'; props: ParetoProps })
  | (BlockBase & { type: 'populationpyramid'; props: PopulationPyramidProps })
  | (BlockBase & { type: 'parallelcoordinates'; props: ParallelCoordinatesProps })
  | (BlockBase & { type: 'scatterplotmatrix'; props: ScatterplotMatrixProps })
  | (BlockBase & { type: 'pictogramchart'; props: PictogramChartProps })
  | (BlockBase & { type: 'hrdiagram'; props: HrDiagramProps })
  | (BlockBase & { type: 'ternaryplot'; props: TernaryPlotProps })
  | (BlockBase & { type: 'parliamentseats'; props: ParliamentSeatsProps });

// ─────────────────────────── surfaceplot ───────────────────────────
export interface SurfacePlotProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  grid: number[][];
  zRange?: [number, number];
  mode?: 'filled' | 'contour' | 'surface3d';
  levels?: number;
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  caption?: string;
  footer?: HtmlString;
}

// ─────────────────────────── gradientdescent ───────────────────────────
/** One sample of the loss surface at (x, y): the model's actual loss z at that point. */
export interface LossSample {
  x: number;
  y: number;
  z: number;
}
/** One point the optimizer actually visited, in step order. */
export interface DescentStep {
  x: number;
  y: number;
  step: number;
}
export interface GradientDescentProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** row-major 2-D mesh of loss samples — grid[0] is the top row; every row shares the same
   *  x-samples and every column shares the same y-samples (a rectilinear grid). Never fabricated. */
  contour: LossSample[][];
  /** the optimizer's real visited points, in step order — connected as-is, never smoothed */
  path: DescentStep[];
  learningRate?: number;
  footer?: HtmlString;
}

// ─────────────────────────── biasvariance ───────────────────────────
export interface BiasVarianceProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** model-complexity x-axis values, one per sample (ascending) */
  complexity: number[];
  /** training error at each complexity level */
  trainError: number[];
  /** held-out/test error at each complexity level */
  testError: number[];
  /** complexity value marking the bias/variance sweet spot, if known */
  sweetSpot?: number;
  footer?: HtmlString;
}

// ─────────────────────────── timeseriesdecomposition ───────────────────────────
export interface TimeSeriesDecompositionProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  dates: string[];
  observed: number[];
  trend: number[];
  seasonal: number[];
  residual: number[];
  footer?: HtmlString;
}

// ─────────────────────────── precisionrecallcurve ───────────────────────────
export interface PrCurvePoint {
  precision: number;
  recall: number;
  threshold?: number;
}
export interface PrCurve {
  label: string;
  points: PrCurvePoint[];
  color?: AccentVar;
}
export interface PrecisionRecallCurveProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the classifiers to compare — precision/recall pairs across decision thresholds */
  curves: PrCurve[];
  /** average precision (area under the PR curve), model-supplied and shown as-is */
  avgPrecision?: number;
  footer?: HtmlString;
}

// ─────────────────────────── chromatogram ───────────────────────────
/** One sampled point of the detector's raw baseline (retention time vs signal). */
export interface ChromatogramSample {
  /** retention time, in the method's own time unit (minutes unless stated otherwise) */
  t: number;
  /** detector response (mAU, counts, or whatever the method reports) */
  signal: number;
}
/** One eluting peak, called out on the trace and listed in the results table. */
export interface ChromatogramPeak {
  /** retention time of the peak apex */
  rt: number;
  /** compound / peak identity, e.g. "Caffeine" */
  label?: string;
  /** percent of total integrated area, 0-100 */
  areaPct?: number;
  /** peak height, in detector units */
  height?: number;
}
export interface ChromatogramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** instrument/method line, e.g. "HPLC · C18, 1.0 mL/min, 254 nm" */
  method?: string;
  /** sampled baseline trace; omit to show only the peak results table (never a fabricated trace) */
  trace?: ChromatogramSample[];
  peaks: ChromatogramPeak[];
  footer?: HtmlString;
}

// ─────────────────────────── stressstraincurve ───────────────────────────
/** One sampled point of the tensile test's real stress/strain trace. */
export interface StressStrainPoint {
  /** engineering strain, dimensionless (e.g. 0.002 = 0.2%) */
  strain: number;
  /** engineering stress, in the caller's own unit (MPa unless stated otherwise) */
  stress: number;
}
/** A single called-out point on the curve (strain, stress) — no other fields, the marker's
 *  identity comes from which prop it's assigned to (yieldPoint / ultimatePoint / fracturePoint). */
export interface StressStrainMarker {
  strain: number;
  stress: number;
}
export interface StressStrainCurveProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the real, sampled stress/strain trace — plotted as given, never fitted or smoothed */
  curve: StressStrainPoint[];
  /** onset of plastic deformation; also seeds the shaded elastic-region band and the Young's-modulus readout */
  yieldPoint?: StressStrainMarker;
  /** peak of the curve — the material's ultimate tensile strength */
  ultimatePoint?: StressStrainMarker;
  /** where the sample actually broke */
  fracturePoint?: StressStrainMarker;
  footer?: HtmlString;
}

// ─────────────────────────── gatingplot ───────────────────────────
/** One flow-cytometry event. */
export interface GatingPoint {
  x: number;
  y: number;
  /** 0-based index into `gates` — the gate this event was actually assigned to. Omitted/out of
   *  range events render as ungated background. */
  gate?: number;
}
/** A drawn gate boundary over one population. `region`'s shape depends on `shape`:
 *  'ellipse' → exactly two [x,y] pairs, `[[cx,cy],[rx,ry]]` (center, then radii);
 *  'polygon' → three or more [x,y] vertices, in order, tracing the boundary. */
export interface Gate {
  name: string;
  shape: 'ellipse' | 'polygon';
  region: number[][];
  /** percent of the parent population this gate captures, 0-100 */
  pctOfParent?: number;
  /** boundary/fill color — a CSS color, not necessarily a design token (each gate needs its own
   *  distinct hue and there are usually more gates than accent tokens) */
  color?: string;
}
export interface GatingPlotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  xLabel: string;
  yLabel: string;
  xScale?: 'linear' | 'log';
  yScale?: 'linear' | 'log';
  points: GatingPoint[];
  gates?: Gate[];
  footer?: HtmlString;
}

// ─────────────────────────── gellane ───────────────────────────
/** One band within a lane — position and darkness only; there is no fabricated intensity
 *  curve here, just the caller's own reading at that migration distance. */
export interface GelBand {
  /** migration distance, 0 (well, top) .. 1 (dye front, bottom) */
  pos: number;
  /** band darkness/intensity, 0 (faint) .. 1 (saturated) */
  intensity: number;
  /** size label shown beside the band, e.g. "480 bp" or "42 kDa" */
  sizeLabel?: string;
}
export interface GelLaneRow {
  label: string;
  bands: GelBand[];
}
export interface GelLadder {
  unit: 'bp' | 'kDa';
  /** marker sizes present in the ladder, any order — larger fragments migrate less */
  marks: number[];
}
export interface GelLaneProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  ladder?: GelLadder;
  lanes: GelLaneRow[];
  footer?: HtmlString;
}

// ─────────────────────────── flightchart ───────────────────────────
/** One media channel — a lane on the flight timeline. */
export interface FlightChannel {
  name: string;
  color?: AccentVar;
}
/** One media flight: a channel's run on the timeline, real caller-supplied period indices —
 *  never interpolated between two known flights. */
export interface Flight {
  /** Which channel lane this flight runs in — matched against `channels[].name`. A flight
   *  whose channel isn't in `channels` still renders, in its own appended lane. */
  channel: string;
  /** 0-based period index the flight starts in (a week/month, whatever the caller's grid is). */
  start: number;
  /** How many periods the flight spans, minimum 1. */
  span: number;
  /** Spend for this one flight, in the chart's currency. */
  budget: number;
}
export interface FlightChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  channels: FlightChannel[];
  flights: Flight[];
  /** Total spend across the flight plan. Shown as-is when given; otherwise summed from
   *  `flights[].budget` — never estimated from anything else. */
  totalBudget?: number;
  /** ISO 4217 currency code for every $ readout. Defaults to USD. */
  currency?: string;
  footer?: HtmlString;
}

// ─────────────────────────── paybandchart ───────────────────────────
/** One person/offer plotted within the band. */
export interface PayBandMarker {
  name: string;
  value: number;
  /** True flags this marker with the equity-watch accent (e.g. a compression risk, an
   *  off-cycle exception) — a distinct visual from an ordinary offer/incumbent marker. */
  flag?: boolean;
}
export interface PayBandChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  role: string;
  min: number;
  mid: number;
  max: number;
  markers: PayBandMarker[];
  /** ISO 4217 currency code. Defaults to USD. */
  currency?: string;
  footer?: HtmlString;
}

// ─────────────────────────── linebalance ───────────────────────────
/** One assembly/production station's real measured cycle time. */
export interface LineBalanceStation {
  name: string;
  cycleTime: number;
  /** True when this station is a known constraint, independent of the takt comparison (the
   *  renderer also flags any station whose cycleTime exceeds takt on its own). */
  bottleneck?: boolean;
}
export interface LineBalanceProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Takt time — the pace demand sets, same time unit as each station's cycleTime. */
  takt: number;
  unit?: string;
  stations: LineBalanceStation[];
  footer?: HtmlString;
}

// ─────────────────────────── epicurve ───────────────────────────
/** One period's real case count, optionally split by how confirmed the diagnosis is. */
export interface EpiCurveCase {
  period: string;
  count: number;
  classification?: 'confirmed' | 'probable' | 'suspected';
}
/** A named intervention/event marker, drawn as a dotted vertical line at its period. Only
 *  rendered when `period` matches one of `cases[].period` — never placed by interpolation. */
export interface EpiCurvePhase {
  label: string;
  period: string;
}
export interface EpiCurveProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cases: EpiCurveCase[];
  /** An epidemic/alert threshold, drawn as a dashed reference line. */
  threshold?: { value: number; label: string };
  phases?: EpiCurvePhase[];
  footer?: HtmlString;
}

// ─────────────────────────── pareto ───────────────────────────
export interface ParetoBar {
  label: string;
  value: number;
}
export interface ParetoProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  bars: ParetoBar[];
  /** Draw the cumulative-percent line and the 80% guide. Defaults to true — the whole point
   *  of a Pareto chart is the cumulative read, so it only turns off for a plain sorted-bars view. */
  cumulative?: boolean;
  unit?: string;
  footer?: HtmlString;
}

// ─────────────────────────── populationpyramid ───────────────────────────
/** One age band's two real counts — never a computed split of a single total. */
export interface PopulationBand {
  label: string;
  left: number;
  right: number;
}
export interface PopulationPyramidProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  bands: PopulationBand[];
  leftLabel: string;
  rightLabel: string;
  unit?: string;
  footer?: HtmlString;
}

// ─────────────────────────── parallelcoordinates ───────────────────────────
/** One vertical axis of the plot. */
export interface ParallelAxis {
  /** The key each line's `values` object is read by. */
  key: string;
  label: string;
  /** Fixed [min,max] to normalize this axis by; omitted axes derive their range from the
   *  real min/max seen across every line's own value on that key — never invented. */
  domain?: [number, number];
}
/** One multivariate observation, one value per axis key. A key missing from `values` just
 *  skips that axis for this line — the segment on either side of the gap still connects the
 *  two nearest real points, never an interpolated value at the missing axis. */
export interface ParallelLine {
  label: string;
  color?: AccentVar;
  values: Record<string, number>;
}
export interface ParallelCoordinatesProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  axes: ParallelAxis[];
  lines: ParallelLine[];
  footer?: HtmlString;
}

// ─────────────────────────── scatterplotmatrix ───────────────────────────
export interface ScatterplotMatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The variables to plot, in display order — every NxN cell pairs two of these. */
  vars: string[];
  /** One real observation per row, keyed by variable name. A row missing a variable is
   *  simply not plotted in the cells that need it — never fabricated. */
  rows: Record<string, number>[];
  color?: AccentVar;
  footer?: HtmlString;
}

// ─────────────────────────── pictogramchart ───────────────────────────
export interface PictogramCategory {
  label: string;
  count: number;
  icon?: IconKey;
  color?: AccentVar;
}
export interface PictogramChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  categories: PictogramCategory[];
  /** How many real units one glyph stands for. Defaults to whatever keeps the whole chart
   *  within the 100-glyph grid. */
  unitValue?: number;
  footer?: HtmlString;
}

// ─────────────────────────── hrdiagram ───────────────────────────
/** One star's real observed values — a star with a non-positive temperature or luminosity
 *  cannot sit on the log–log plane and is dropped rather than faked onto an edge. */
export interface HrStar {
  name: string;
  /** Surface temperature in Kelvin. Must be > 0 (the axis is logarithmic). */
  tempK: number;
  /** Luminosity in solar units (Sun = 1). Must be > 0 (the axis is logarithmic). */
  luminosity: number;
  /** Luminosity class — sizes and tints the dot. Omit when unknown. */
  stage?: 'main-sequence' | 'giant' | 'supergiant' | 'white-dwarf';
}
export interface HrDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  stars: HrStar[];
  /** Soft tinted bands for the main sequence, giants, supergiants and white dwarfs.
   *  Defaults to true — the regions are most of the diagram's teaching value. */
  showRegions?: boolean;
  /** Name of one star (matched against `stars[].name`) to ring and label persistently. */
  highlight?: string;
  footer?: HtmlString;
}

// ─────────────────────────── ternaryplot ───────────────────────────
/** The three corner labels: `a` is the TOP apex, `b` bottom-left, `c` bottom-right. */
export interface TernaryAxes {
  a: string;
  b: string;
  c: string;
}
/** One three-part composition on any scale — each point is normalized by its OWN a+b+c sum,
 *  so raw percentages, fractions, and grams all land on the same simplex. */
export interface TernaryPoint {
  label: string;
  a: number;
  b: number;
  c: number;
}
export interface TernaryZoneVertex {
  a: number;
  b: number;
  c: number;
}
/** A named region of the simplex (e.g. a soil-texture class), drawn as a translucent
 *  polygon beneath the points. Vertices are normalized the same way points are. */
export interface TernaryZone {
  label: string;
  vertices: TernaryZoneVertex[];
  color?: AccentVar;
}
export interface TernaryPlotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  axes: TernaryAxes;
  points: TernaryPoint[];
  zones?: TernaryZone[];
  /** Unit the raw values are in (e.g. "%"), appended to the corner labels. */
  unit?: string;
  footer?: HtmlString;
}

// ─────────────────────────── parliamentseats ───────────────────────────
/** One party's real seat count. Parties fill the hemicycle in array order, sweeping
 *  left → right, so list them in the order they should sit. */
export interface ParliamentParty {
  name: string;
  /** Whole number of seats won — a count, never a percentage. */
  seats: number;
  /** Accent for this party's dots; omitted parties cycle the token palette. */
  color?: AccentVar;
}
export interface ParliamentSeatsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  parties: ParliamentParty[];
  /** Label under the big center total. Defaults to "seats". */
  totalLabel?: string;
  footer?: HtmlString;
}
