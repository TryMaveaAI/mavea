// tables family block types — 10 interactive table/grid components.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';
import type { Annotation } from '../../lib/annotations';

/* ---------- 1. datatable — sortable + filterable rows ---------- */
export type DataCellAlign = 'left' | 'right';
export interface DataColumn {
  key: string;
  label: string;
  align?: DataCellAlign;
  /** numeric column → sorts by parsed number; else string sort. */
  numeric?: boolean;
  /** optional accent for the value text. */
  color?: AccentVar;
}
export interface DataTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  columns: DataColumn[];
  rows: Record<string, string>[];
  /** default sort key + dir (table looks sorted on reveal). */
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  searchable?: boolean;
  searchPlaceholder?: string;
  footer?: HtmlString;
  /** Closed-grammar annotations (canvas/lib/annotations) that ADAPT this base table to the answer —
   *  currency/percent formatting, a computed total/mean row, row emphasis, status coloring, in-cell
   *  bars. This is how a plain table becomes a receipt/ledger/scorecard without a bespoke component.
   *  Validated + grounded against the real columns/rows in liveSchema before it reaches here. */
  annotations?: Annotation[];
}

/* ---------- 2. pivot — crosstab with togglable measure ---------- */
export interface PivotMeasure {
  key: string;
  label: string;
  /** how to format an aggregated value. */
  unit?: string;
  prefix?: string;
}
export interface PivotCell {
  /** keyed by measure.key → numeric value. */
  values: Record<string, number>;
}
export interface PivotRow {
  label: string;
  cells: PivotCell[]; // one per column
}
export interface PivotProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rowGroup: string; // header for the row-group column
  colHeaders: string[];
  measures: PivotMeasure[];
  rows: PivotRow[];
  /** default measure index. */
  measure?: number;
  accent?: AccentVar;
  footer?: HtmlString;
}

/* ---------- 3. leaderboard — ranked rows w/ medals + movement ---------- */
export interface LeaderMetric {
  key: string;
  label: string;
  unit?: string;
}
export interface LeaderRow {
  name: string;
  sub?: string;
  /** keyed by metric.key. */
  values: Record<string, number>;
  /** rank movement vs prior period (+up / -down / 0 flat). */
  move?: number;
}
export interface LeaderboardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  metrics: LeaderMetric[];
  rows: LeaderRow[];
  metric?: number; // default metric index
  accent?: AccentVar;
  footer?: HtmlString;
}

/* ---------- 4. treetable — hierarchical expand/collapse rows ---------- */
export interface TreeNode {
  label: string;
  value?: string;
  /** 0..1 share for the inline bar. */
  pct?: number;
  tag?: string;
  color?: AccentVar;
  children?: TreeNode[];
  /** start expanded. */
  open?: boolean;
}
export interface TreeColumn {
  label: string;
  align?: DataCellAlign;
}
export interface TreeTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  valueLabel?: string;
  nodes: TreeNode[];
  accent?: AccentVar;
  footer?: HtmlString;
}

/* ---------- 5. swimlane — lanes (actors) × events on a timeline ---------- */
export interface SwimEvent {
  /** start position 0..1 across the lane. */
  at: number;
  /** optional duration 0..1 (bar instead of point). */
  span?: number;
  label: string;
  detail?: string;
  color?: AccentVar;
}
export interface SwimLane {
  actor: string;
  sub?: string;
  events: SwimEvent[];
}
export interface SwimlaneProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  ticks?: string[]; // axis labels left→right
  lanes: SwimLane[];
  footer?: HtmlString;
}

/* ---------- 6. footnotetable — cells with footnote anchors ---------- */
export interface FootCell {
  v: string;
  /** 1-based footnote index → reveals on hover/click. */
  note?: number;
  color?: AccentVar;
}
export interface FootRow {
  cells: FootCell[];
}
export interface FootnoteTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  columns: string[];
  rows: FootRow[];
  notes: HtmlString[]; // footnote text, indexed from 1
  footer?: HtmlString;
}

/* ---------- 7. sparktable — a sparkline column per row ---------- */
export interface SparkRow {
  name: string;
  value: string;
  delta?: string;
  deltaDir?: 'up' | 'down' | 'flat';
  /** the sparkline series. */
  series: number[];
  color?: AccentVar;
}
export interface SparkTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  valueLabel?: string;
  trendLabel?: string;
  rows: SparkRow[];
  footer?: HtmlString;
}

/* ---------- 8. smallmultiples — grid of same-scale mini charts ---------- */
export interface SmallPanel {
  label: string;
  series: number[];
  stat?: string;
  delta?: string;
  deltaDir?: 'up' | 'down' | 'flat';
  color?: AccentVar;
}
export interface SmallMultiplesProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  panels: SmallPanel[];
  cols?: number;
  /** 'bars' | 'line' — render style for each mini chart. */
  kind?: 'bars' | 'line';
  footer?: HtmlString;
}

/* ---------- 9. comparebars — A/B/C bars per metric row ---------- */
export interface CompareSeries {
  name: string;
  color: AccentVar;
}
export interface CompareMetricRow {
  label: string;
  /** one value per series (same order as series[]). */
  values: number[];
  unit?: string;
  /** higher-is-better (drives the leader chip). */
  higherBetter?: boolean;
}
export interface CompareBarsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  series: CompareSeries[];
  rows: CompareMetricRow[];
  /** default highlighted series index (-1 = none). */
  highlight?: number;
  footer?: HtmlString;
}

/* ---------- 10. matrixgrid — labeled heat/confusion/correlation grid ---------- */
export interface MatrixGridProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rowLabels: string[];
  colLabels: string[];
  /** rows × cols of values (already normalized domain → see min/max). */
  cells: number[][];
  min?: number;
  max?: number;
  /** color ramp accent. */
  accent?: AccentVar;
  /** mark the diagonal (confusion-matrix style). */
  diagonal?: boolean;
  unit?: string;
  legend?: [string, string];
  footer?: HtmlString;
}

/* ---------- 11. discoverytracker — legal discovery request log ---------- */
export type DiscoveryStatus = 'outstanding' | 'produced' | 'objected' | 'privileged';
export interface DiscoveryRequest {
  /** the request's number in the set, e.g. "RFP No. 4"; a duplicate/missing number falls
   *  back to its position in the list. */
  num: number;
  description: string;
  requestingParty: string;
  status: DiscoveryStatus;
  /** the Bates range of what was produced, e.g. "ACME-000412–000488". */
  batesRange?: string;
  dueDate?: string;
  /** the privilege ground asserted, shown only when `status` is 'privileged'. */
  privilegeBasis?: string;
}
export interface DiscoveryTrackerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  requests: DiscoveryRequest[];
  footer?: HtmlString;
}

/* ---------- 12. dentaltreatmentplan — rows grouped by visit, cost running total. The
   per-visit subtotal and the grand total are always summed from `entries[].cost` (the
   BillOfMaterials/FmeaTable rule — a rollup is computed, never accepted as caller input), so
   there's no separate total field on the props to drift out of sync with the rows. ---------- */
export type DentalPriority = 'urgent' | 'recommended' | 'elective';
export interface DentalEntry {
  /** the tooth being worked on, e.g. "#14", "UL6". */
  tooth: string;
  procedure: string;
  /** the tooth surface(s) treated, e.g. "MOD", "buccal". */
  surface?: string;
  priority: DentalPriority;
  /** the visit this procedure is scheduled for, e.g. "Visit 1". Entries are grouped by this
   *  field, in first-appearance order. */
  visit: string;
  cost: number;
  /** free-form, e.g. "planned", "completed" — no fixed vocabulary across practices. */
  status?: string;
}
export interface DentalTreatmentPlanProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  entries: DentalEntry[];
  footer?: HtmlString;
}

/* ---------- 13. rollcall — legislative vote tally. The header tally bar is always counted
   from `legislators[].vote` (the same computed-rollup rule as the dental plan's totals above),
   so there's no separate tally prop for the count to drift out of sync with the roster. ---------- */
export type VoteValue = 'yea' | 'nay' | 'present' | 'absent';
export interface Legislator {
  name: string;
  /** party or caucus label, e.g. "D", "R", "Green" — any string; rows band by it. */
  party?: string;
  vote: VoteValue;
}
export interface RollCallProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the measure being voted on, e.g. "H.R. 4521, Infrastructure Modernization Act". */
  bill: string;
  legislators: Legislator[];
  footer?: HtmlString;
}

/* ---------- 14. collectiontracker — a hobbyist collection (stamps/coins/cards/vinyl…). The
   footer total is always summed from `items[].value` (the same computed-rollup rule as the
   blocks above), so there's no separate total field to drift out of sync with the items. ---------- */
export type CollectionCondition = 'mint' | 'good' | 'fair';
export interface CollectionItem {
  name: string;
  acquiredDate?: string;
  /** estimated current value; omit for an item you're not tracking a value on. */
  value?: number;
  condition?: CollectionCondition;
  notes?: string;
}
export interface CollectionTrackerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: CollectionItem[];
  footer?: HtmlString;
}

/* ---------- 15. cma — real-estate comparative market analysis. Each comp's adjusted price is
   ALWAYS computed as soldPrice + Σ(adjustments), the same "a rollup is never trusted as caller
   input" rule as the blocks above — so there's no adjustedPrice field on CmaComp to drift out
   of sync with its own adjustments. ---------- */
export interface CmaSubject {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt?: number;
}
export interface CmaAdjustment {
  /** what's being adjusted for, e.g. "Extra half-bath", "0.3 mi closer to school". */
  label: string;
  /** signed dollar adjustment toward the subject's value; negative for a comp that outclasses
   *  the subject on this point. */
  amount: number;
}
export interface CmaComp {
  address: string;
  soldPrice: number;
  soldDate: string;
  sqft: number;
  /** distance from the subject, in miles. */
  distance: number;
  adjustments: CmaAdjustment[];
}
export interface CmaPriceRange {
  low: number;
  high: number;
  /** a single best-estimate point within [low, high]; omit when only a range is warranted. */
  point?: number;
}
export interface CmaProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  subject: CmaSubject;
  comps: CmaComp[];
  suggestedListPrice: CmaPriceRange;
  footer?: HtmlString;
}

/* ---------- 16. taxreturnsummary — a 1040-style filing summary (the ledger technique from
   FinancialStatement/BillOfMaterials, one column instead of one-per-period). NOT the marginal-
   rate bracket chart — this is the filed-return line-item summary. ---------- */
export type TaxRowKind = 'line' | 'subtotal' | 'total';
export interface TaxReturnRow {
  label: string;
  amount: number;
  /** 'line' (default) plain row · 'subtotal'/'total' get a top rule + bold + tint. */
  kind?: TaxRowKind;
  /** indent the label this many levels (each ~14px) to show nesting under a subtotal. */
  indent?: number;
}
export type RefundDirection = 'refund' | 'owed';
export interface RefundOrOwed {
  amount: number;
  direction: RefundDirection;
}
export interface TaxReturnSummaryProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  filingStatus: string;
  taxYear: string | number;
  rows: TaxReturnRow[];
  refundOrOwed: RefundOrOwed;
  footer?: HtmlString;
}

/* ---------- 17. depreciationschedule — a rental/business asset depreciation schedule. A direct
   sibling of everyday/Amortization's KPI-strip-then-table shape, basis paying down toward
   salvage value instead of a loan balance paying down to zero, using this family's number+
   formatValue convention (FinancialStatement/BillOfMaterials) rather than Amortization's
   pre-formatted-string props. ---------- */
export interface DepreciationRow {
  period: string;
  beginningBasis: number;
  depreciationExpense: number;
  accumulatedDepreciation: number;
  endingBasis: number;
}
export interface DepreciationScheduleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  assetDescription: string;
  cost: number;
  method: string;
  usefulLife: string | number;
  annualDepreciation: number;
  rows: DepreciationRow[];
  footer?: HtmlString;
}

/* ---------- 18. vendortracker — event/wedding vendor management ---------- */
export type VendorCategory = 'catering' | 'venue' | 'photo' | 'av' | 'decor' | 'other';
export type VendorStatus = 'inquired' | 'booked' | 'confirmed';
export interface Vendor {
  name: string;
  category: VendorCategory;
  status: VendorStatus;
  contractSigned?: boolean;
  depositAmount?: number;
  depositPaid?: boolean;
  balanceDue?: number;
  dueDate?: string;
}
export interface VendorTrackerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  vendors: Vendor[];
  footer?: HtmlString;
}

/* ---------- 19. sponsorshiptracker — content-creator brand deals ---------- */
export type SponsorshipStatus = 'pitched' | 'negotiating' | 'contracted' | 'delivered' | 'paid';
export interface SponsorshipDeal {
  brand: string;
  deliverable: string;
  rate: number;
  /** ISO 4217 code, e.g. "USD". Defaults to USD. */
  currency?: string;
  status: SponsorshipStatus;
  dueDate?: string;
  paidDate?: string;
}
export interface SponsorshipTrackerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  deals: SponsorshipDeal[];
  footer?: HtmlString;
}

/* ---------- 20. caseload — social-worker case management. Confidentiality-sensitive: a real
   `clientRef` is a case number or initials, NEVER a full name — this is a data-authoring
   convention (the component renders whatever string it's given verbatim), so every demo/live
   caller of this block must honor it. ---------- */
export type CaseRiskLevel = 'low' | 'medium' | 'high';
export interface CaseEntry {
  /** a case reference or initials — never a full client name. */
  clientRef: string;
  status: string;
  nextContact?: string;
  riskLevel?: CaseRiskLevel;
  note?: string;
}
export interface CaseloadProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cases: CaseEntry[];
  footer?: HtmlString;
}

/* ---------- family sub-union ---------- */
/* ---------- matrix — a general labeled value grid: math brackets [ ] for linear
   algebra, OR row/col headers for truth tables / Punnett squares / payoff &
   multiplication tables / confusion matrices; cells can be tinted or emphasized.
   One primitive, many subjects (math · CS · biology · chemistry · economics). ---------- */
export interface GridCell {
  /** cell content — a number, symbol, or short string */
  v: number | string;
  /** background tint */
  color?: AccentVar;
  /** emphasize this cell (bold + ring) */
  hot?: boolean;
}
export interface GridRow {
  /** optional row header label */
  label?: string;
  cells: GridCell[];
}
export interface MatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** label above the grid, e.g. "A", "A·v = b", "Payoff" */
  caption?: string;
  /** top-left corner label when headers are used (e.g. "×", "P\\Q") */
  corner?: string;
  /** column header labels (omit for a bare matrix) */
  cols?: string[];
  rows: GridRow[];
  /** wrap the value cells in math brackets [ ] (linear-algebra style) */
  bracket?: boolean;
  footer?: HtmlString;
}

/* ── sensitivitytable: a 2-variable what-if grid; each cell is an outcome at a (row, col) pair,
   heat-shaded by value. Finance, PM, ops, data science — "how does the result move as X and Y
   change". ── */
export interface SensitivityProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** What the row axis varies (label) + its values down the side. */
  rowVar: string;
  rows: (string | number)[];
  /** What the column axis varies (label) + its values across the top. */
  colVar: string;
  cols: (string | number)[];
  /** Outcome values, [rowIndex][colIndex]; heat-shaded across their range. */
  cells: number[][];
  unit?: string;
  /** Currency for cell formatting (overrides unit). */
  currency?: string;
  /** Higher is better (green) — set false to invert the heat scale (e.g. cost/risk). */
  higherBetter?: boolean;
  /** Highlight the (row, col) of the base/expected case. */
  baseCell?: [number, number];
  footer?: HtmlString;
}

/* ── labpanel: clinical lab results with reference ranges + out-of-range flags. The value sits on
   a low—high reference bar so "where in range" reads at a glance; out-of-range rows flag high/low.
   Medicine, clinical, health-dashboard. ── */
export interface LabResult {
  name: string;
  value: number;
  unit?: string;
  /** Reference interval [low, high]. */
  low: number;
  high: number;
  /** Optional prior value to show a trend arrow. */
  prior?: number;
}
export interface LabPanelProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  results: LabResult[];
  /** Panel/specimen caption, e.g. "CMP · fasting". */
  caption?: string;
  footer?: HtmlString;
}

/* ── conjugation: verb conjugation table across persons and tenses — works for any language.
   Pronouns are row headers; tenses are column groups. Irregular forms receive a subtle
   warning-tinted background. ── */
export interface ConjugationForm {
  pronoun: string;
  form: string;
  /** mark as irregular → warning-tinted cell background. */
  irregular?: boolean;
}
export interface ConjugationTense {
  name: string;
  forms: ConjugationForm[];
}
export interface ConjugationTableProps {
  title: string;
  /** the infinitive form of the verb. */
  verb: string;
  /** e.g. "Spanish", "French", "Latin". */
  language?: string;
  tenses: ConjugationTense[];
  note?: string;
}

/* ── clearancematrix: an item × constraint grid where each pairing is rated safe / caution / avoid /
   unknown with a one-line reason. Cells name their own row and column, so a pairing lands in the
   right square even if the model emits them out of order or skips some (a missing pair shows
   "check a pro"). Avoid cells stand out. For drug/supplement interactions, allergen checks,
   material compatibility — any "is X okay with Y" pairing where the verdict only means something
   next to its real reason. ── */
export type ClearanceLevel = 'safe' | 'caution' | 'avoid' | 'unknown';
export interface ClearanceCell {
  /** the row item this rates (matched case/space-insensitively against `rows`). */
  row: string;
  /** the column constraint this rates (matched against `columns`). */
  col: string;
  /** verdict for this pairing. */
  level: ClearanceLevel;
  /** one-line why, e.g. "raises bleeding risk" — shown under the verdict. */
  reason?: string;
}
export interface ClearanceMatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** row labels — the items being checked (drugs, foods, materials…). */
  rows: string[];
  /** column labels — the constraints each item is checked against. */
  columns: string[];
  /** rated pairings; each names its row + col so alignment survives loose output. */
  cells: ClearanceCell[];
  /** show the verdict legend below the grid (default true). */
  legend?: boolean;
  footer?: HtmlString;
}

/* ── financialstatement: a multi-period financial statement (P&L / balance sheet / cash flow).
   A left label column (indented by row.indent) and one right-aligned currency column per period.
   subtotal/total rows are bold with a top rule and an optional tint; negatives render in
   accountant's parentheses. Finance, business, accounting. ── */
export interface FinancialRow {
  label: string;
  /** one value per period, aligned with `periods`. */
  values: number[];
  /** 'line' (default) plain row · 'subtotal'/'total' get a top rule + bold + tint. */
  kind?: 'line' | 'subtotal' | 'total';
  /** indent the label this many levels (each ~14px) to show nesting under a subtotal. */
  indent?: number;
}
export interface FinancialStatementProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** column headers — the reporting periods, left→right. */
  periods: string[];
  rows: FinancialRow[];
  /** ISO 4217 code for currency formatting, e.g. "USD". Defaults to USD. */
  currency?: string;
  /** small caption under the title, e.g. "Unaudited · $ thousands". */
  caption?: string;
  footer?: HtmlString;
}

/* ── cohortgrid: a cohort-retention triangle. Rows are cohorts (label + optional size), columns are
   periods-since-start (0..N). The triangle is ragged — later cohorts have fewer observed cells, and
   a null/missing cell renders empty. Each cell is heat-shaded by its value; a footer row shows the
   per-column average over the cells that exist. Business, growth, data. ── */
export interface Cohort {
  label: string;
  /** cohort size (e.g. signups) — shown beside the label. */
  size?: number;
  /** value per period-since-start; null/undefined → an empty (unobserved) cell. */
  values: (number | null)[];
}
export interface CohortGridProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cohorts: Cohort[];
  /** column headers (period labels). Defaults to "M0, M1, …" sized to the widest cohort. */
  periods?: string[];
  /** unit suffix on each cell, default "%". */
  unit?: string;
  caption?: string;
  footer?: HtmlString;
}

/* ── riskmatrix: a likelihood × impact risk matrix. An N×N grid is RAG-banded by likelihood×impact
   (green→amber→red); each risk is plotted as a labeled chip in its (likelihood, impact) cell, with
   multiple risks stacking in a shared cell. Below the grid sits a compact register pairing each risk
   with its owner and mitigation. Business, product, project, security. ── */
export interface Risk {
  label: string;
  /** 1 (rare) … 5 (almost certain). */
  likelihood: number;
  /** 1 (negligible) … 5 (severe). */
  impact: number;
  owner?: string;
  mitigation?: string;
}
export interface RiskMatrixProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  risks: Risk[];
  /** grid size N (3, 4, or 5). Defaults to 5. */
  size?: 3 | 4 | 5;
  caption?: string;
  footer?: HtmlString;
}

/* ── careplan: a nursing care-plan board. One row per patient problem, reading left→right through the
   nursing process — Assessment/Dx → Goal → Interventions → Rationale → Evaluation — with an outcome
   chip (met / partial / ongoing) on each goal. The columns align across rows so the whole plan reads
   as one board. Health, nursing, clinical education. ── */
export interface CarePlanEntry {
  /** the patient cue/data that frames the problem (the assessment column). */
  assessment: string;
  /** the nursing diagnosis / problem statement (shown under the assessment). */
  diagnosis?: string;
  /** the goal / expected outcome this plan works toward. */
  goal: string;
  /** the nursing interventions taken to reach the goal. */
  interventions: string[];
  /** why those interventions work (the evidence/rationale column). */
  rationale?: string;
  /** outcome at evaluation — met (insight) · partial (warning) · ongoing (presence). */
  status?: 'met' | 'partial' | 'ongoing';
}
export interface CarePlanProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  entries: CarePlanEntry[];
  /** small caption under the title, e.g. "Med-surg · shift handoff". */
  caption?: string;
  footer?: HtmlString;
}

/* ── doseladder: a medication dosing / titration visual. An optional weight/eGFR-based dose readout
   (input → result, with the formula shown so the number is auditable), a stepped titration ladder
   (each rung a dose + note, the ceiling rung marked), and a banded renal/hepatic adjustment lookup.
   The starting dose is COMPUTED scaffolding shown beside its formula; the ladder + adjustments are
   the given protocol. Health, pharmacology, clinical reference. ── */
export interface DoseComputed {
  /** the patient input the dose is derived from, e.g. "Weight 72 kg". */
  input: string;
  /** the dosing rule applied, e.g. "0.1 mg/kg". */
  formula: string;
  /** the resulting starting dose, e.g. "7.2 mg". */
  result: string;
}
export interface DoseRung {
  /** the step label, e.g. "Start", "Week 2", "Maintenance". */
  step: string;
  /** the dose at this rung, e.g. "25 mg daily". */
  dose: string;
  /** an optional titration note for this rung. */
  note?: string;
  /** mark this rung as the dosing ceiling (the max — do not exceed). */
  ceiling?: boolean;
}
export interface DoseAdjustment {
  /** the organ-function band, e.g. "eGFR 30–59". */
  condition: string;
  /** the dose change for that band, e.g. "Reduce by 50%". */
  change: string;
}
export interface DoseLadderProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the medication name. */
  drug: string;
  /** route of administration, e.g. "oral", "IV". */
  route?: string;
  /** optional weight/eGFR-based starting-dose readout. */
  computed?: DoseComputed;
  /** the titration ladder, low rung → ceiling. */
  ladder: DoseRung[];
  /** renal/hepatic dose-adjustment lookup. */
  adjustments?: DoseAdjustment[];
  /** small caption under the title, e.g. "Adult · normal renal function". */
  caption?: string;
  footer?: HtmlString;
}

/* ── sizechart: an apparel/footwear size comparison chart. Columns are sizing systems or
   measurements (US · UK · EU · cm), one row per size mapping across them. An optional highlighted
   size emphasizes the user's pick, and a "how to measure" guide explains where the figure comes
   from. Shopping, home — "what's my EU size", "find my fit". ── */
export interface SizeRow {
  /** the canonical size label for this row, e.g. "M", "9.5", "32". */
  size: string;
  /** one value per column, aligned with `columns` (a system code or a measurement). */
  values: string[];
}
export interface SizeChartProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the sizing systems / measurements across the top, e.g. ['US','UK','EU','cm']. */
  columns: string[];
  rows: SizeRow[];
  /** unit hint shown under a measurement-style chart, e.g. "Foot length". */
  unit?: string;
  /** a size to emphasize (matched against each row's `size`, case/space-insensitive). */
  highlight?: string;
  /** a short "how to measure" note explaining where the figure comes from. */
  guide?: string;
  /** small caption under the title, e.g. "Women's · true to size". */
  caption?: string;
  footer?: HtmlString;
}

/* ── comparematrix: a qualitative side-by-side comparison. Columns are the things being weighed
   (philosophies, economic systems, candidates, frameworks), one row per attribute they're judged
   on. Cells speak a small shared vocabulary — a short value, a yes/no/partial verdict, or a 0–5
   rating — and a row can flag the column that wins it. Pick over `matrix` (a STEM value grid),
   `comparebars` (numeric bars), `clearancematrix` (safe/caution/avoid verdicts), or `matrixgrid`
   (a numeric heatmap) when the comparison is qualitative and mixed: "X vs Y vs Z", "how do these
   differ", a decision across criteria. ── */
export type CompareCellKind = 'text' | 'yes' | 'no' | 'partial' | 'rating';
export interface CompareCell {
  /** how to render the cell; defaults to 'text'. */
  kind?: CompareCellKind;
  /** the cell's content: a short string for 'text', or a 0–5 score for 'rating'. Unused for
   *  yes/no/partial, whose glyph carries the meaning. */
  value?: string | number;
  /** an optional one-line qualifier shown under the value (e.g. "since 1971"). */
  note?: string;
}
export interface CompareRow {
  /** the attribute / dimension this row compares (the left-hand label). */
  label: string;
  /** one cell per column, in `cols` order; a short row is padded so the grid stays aligned. */
  cells: CompareCell[];
  /** index of the column that wins this attribute — that cell is emphasized. Omit for a tie. */
  best?: number;
}
export interface CompareMatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the things being compared — one column header each. */
  cols: string[];
  /** one row per attribute / dimension. */
  rows: CompareRow[];
  /** small caption under the title, e.g. "Three major schools of ethics". */
  caption?: string;
  footer?: HtmlString;
}

/* ── pricingtable: a tiered plan/pricing comparison. One rich header card per plan (price,
   tagline, CTA, a "most popular" ribbon on the highlighted tier), then one row per feature with
   a check/dash or a short string per plan. Product, sales, SaaS — "which plan should I pick",
   "compare our tiers". ── */
export interface PricingPlan {
  name: string;
  /** a short price string so any currency/cadence renders verbatim: "$29", "Free", "Custom". */
  price: string;
  /** billing cadence shown after the price, e.g. "/mo", "/seat/mo". */
  period?: string;
  tagline?: string;
  ctaLabel?: string;
  /** spotlight this tier with a "most popular" ribbon + presence glow. */
  highlighted?: boolean;
}
export interface PricingFeatureRow {
  label: string;
  /** one entry per plan, same order as `plans`. true/false → included/not; a string renders as-is
   *  (e.g. "Up to 5 seats"). A short row is padded with "not included". */
  values: (boolean | string)[];
}
export interface PricingTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  plans: PricingPlan[];
  features: PricingFeatureRow[];
  caption?: string;
  footer?: HtmlString;
}

/* ── raci: a RACI responsibility matrix — tasks × roles, each pairing rated Responsible /
   Accountable / Consulted / Informed. A structural clone of clearancematrix: cells name their own
   task + role so alignment survives loose model output. Project management, ops, program
   planning — "who owns what". ── */
export type RaciRating = 'R' | 'A' | 'C' | 'I';
export interface RaciCell {
  /** must match one of `tasks` (matched case/space-insensitively). */
  task: string;
  /** must match one of `roles`. */
  role: string;
  rating: RaciRating;
}
export interface RaciProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** row labels — the tasks/deliverables. */
  tasks: string[];
  /** column labels — the roles/people. */
  roles: string[];
  cells: RaciCell[];
  /** show the R/A/C/I key below the grid (default true). */
  legend?: boolean;
  footer?: HtmlString;
}

/* ── rubric: a grading rubric — criteria × performance levels, each cell a wrapping descriptor
   of what that level looks like. An `achieved` cell (the level actually earned) gets a
   presence-tinted background + check glyph; an optional trailing score column totals the result.
   Education, hiring, any structured evaluation. ── */
export interface RubricCell {
  /** must match one of `criteria`. */
  criterion: string;
  /** must match one of `levels`. */
  level: string;
  /** the prose describing what this level looks like for this criterion. */
  descriptor: string;
  /** mark this as the level actually earned for this criterion. */
  achieved?: boolean;
}
export interface RubricScore {
  criterion: string;
  score: number;
}
export interface RubricProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** row labels — the dimensions being graded. */
  criteria: string[];
  /** column labels — the performance tiers, low → high. */
  levels: string[];
  cells: RubricCell[];
  /** optional per-criterion points earned, shown in a trailing score column. */
  scores?: RubricScore[];
  /** the points a single criterion can earn — used to cap/label the score column. */
  maxScore?: number;
  footer?: HtmlString;
}

/* ── interviewscorecard: an HR interview evaluation — candidates × criteria, each cell a numeric
   rating (color-scaled across `scale`) with an optional note. A structural clone of
   clearancematrix: rows are candidates, columns are the criteria they're scored on. Hiring,
   people ops — "how did the panel score each candidate". ── */
export interface ScorecardCell {
  /** must match one of `candidates`. */
  candidate: string;
  /** must match one of `criteria`. */
  criterion: string;
  rating: number;
  note?: string;
}
export interface InterviewScorecardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** row labels — the people being evaluated. */
  candidates: string[];
  /** column labels — what they're scored on. */
  criteria: string[];
  cells: ScorecardCell[];
  /** the rating scale each cell is drawn from; defaults to 1..5. */
  scale?: { min: number; max: number };
  footer?: HtmlString;
}

/* ── gradebook: a class gradebook — students × assignments, each cell a score (+ derived letter
   grade). An optional trailing class-average column/readout rolls up the whole sheet. Education,
   teaching — "how is the class doing". ── */
export interface GradeCell {
  /** must match one of `students`. */
  student: string;
  /** must match one of `assignments`. */
  assignment: string;
  score: number;
  /** points the assignment is out of; defaults to 100. */
  maxScore?: number;
}
export interface GradebookProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** row labels — the students. */
  students: string[];
  /** column labels — the assignments/tests. */
  assignments: string[];
  cells: GradeCell[];
  /** show a trailing class-average readout (default true). */
  showClassAverage?: boolean;
  footer?: HtmlString;
}

/* ── datadictionary: a dataset variable reference / codebook. One row per column: a monospace
   variable name, a colored dtype pill, unit + description, and a thin missing-data bar scaled by
   `missingPct` — reads like a codebook, not a generic grid. Data science, research, analytics —
   "what's in this dataset", "explain this column", a methods-section variable table. ── */
export type DictDtype = 'int' | 'float' | 'str' | 'bool' | 'category' | 'datetime';
export interface DictVariable {
  name: string;
  dtype: DictDtype;
  unit?: string;
  description: string;
  /** 0–100, the share of rows missing this variable; scales the row's missing-data bar. */
  missingPct?: number;
}
export interface DataDictionaryProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the dataset/table this documents, e.g. "eval_results.parquet". */
  source?: string;
  nRows?: number;
  nCols?: number;
  variables: DictVariable[];
  footer?: HtmlString;
}

/* ── ablationtable: an ML ablation-study comparison. A baseline (full model) row pinned at top,
   bold and distinct, then one row per ablation with a colored ±delta chip against that baseline
   (danger tint when it regresses, presence tint when it improves). ML/data-science research —
   "what does each component contribute", "which piece actually matters". ── */
export interface AblationRow {
  /** the component/feature removed for this run, e.g. "Attention pooling". */
  removed: string;
  /** the metric's value with that component removed. */
  value: number;
  /** change vs. `baselineValue`; computed as `value - baselineValue` when omitted. */
  delta?: number;
  /** whether the change is an improvement or a regression; inferred from the delta's sign
   *  (respecting `higherBetter`) when omitted. */
  deltaDirection?: 'better' | 'worse';
}
export interface AblationTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the full/unablated system's name, e.g. "Transformer-v3 (full)". */
  baseline: string;
  /** the full system's score on `metric` — the number every ablation row is diffed against. */
  baselineValue: number;
  /** what's being measured, e.g. "Accuracy (%)". */
  metric: string;
  rows: AblationRow[];
  /** whether a larger metric value is the better outcome (default true — accuracy/F1/AUC style).
   *  Set false for an error/loss-style metric where a smaller value wins. */
  higherBetter?: boolean;
  footer?: HtmlString;
}

/* ── spectrumtable: a spectroscopy peak-interpretation table (NMR/IR/MS). Columns switch by
   `technique` — NMR shows shift/multiplicity/integration/assignment, IR shows
   wavenumber/intensity/functional-group, MS shows m/z/relative-abundance/fragment — so an
   irrelevant column is never shown empty. An optional tick-marked axis strip above the table
   plots each peak's real x position on a straight line (never an interpolated curve). Chemistry,
   analytical/organic-chemistry coursework — "read this spectrum". ── */
export type SpectrumTechnique = 'nmr-1h' | 'nmr-13c' | 'ir' | 'ms';
export interface SpectrumPeak {
  /** δ (ppm) for NMR, wavenumber (cm⁻¹) for IR, m/z for MS. */
  x: number;
  /** NMR only, e.g. "s", "d", "t", "q", "dd", "m". */
  multiplicity?: string;
  /** NMR only, the integrated proton count at this shift. */
  integration?: number;
  /** IR/MS only, 0–100 relative peak height (transmittance/abundance). */
  intensity?: number;
  /** NMR: the assignment (e.g. "CH3"). IR: the functional group. MS: the fragment. */
  assignment?: string;
}
export interface SpectrumTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  technique: SpectrumTechnique;
  compound?: string;
  /** NMR only, e.g. "CDCl3". */
  solvent?: string;
  peaks: SpectrumPeak[];
  footer?: HtmlString;
}

/* ── fmeatable: a Failure Mode and Effects Analysis. One row per failure mode, each scored
   1–10 on severity × occurrence × detection; the Risk Priority Number (severity × occurrence ×
   detection) is always computed client-side (never trusted from the caller), rows auto-sort
   descending by it, and a thin danger-tinted rule marks off the top 1–3 highest-RPN rows as the
   ones to fix first. Manufacturing, reliability/quality engineering, systems design —
   "what could fail, and which failure matters most". ── */
export interface FmeaItem {
  failureMode: string;
  effect?: string;
  cause?: string;
  /** 1 (none) … 10 (catastrophic). */
  severity: number;
  /** 1 (rare) … 10 (near-certain). */
  occurrence: number;
  /** 1 (certain to catch it) … 10 (no way to catch it). */
  detection: number;
  currentControl?: string;
  /** the recommended fix. */
  action?: string;
  owner?: string;
}
export interface FmeaTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: FmeaItem[];
  footer?: HtmlString;
}

/* ── billofmaterials: a hierarchical parts list with cost rollup. Rows nest by `indent` (the
   FinancialStatement technique); qty × unitCost is always computed into an extended-cost column
   client-side (a row never gets to assert its own extended cost), a subassembly row rolls up the
   extended cost of every part nested under it, and a `total` row is the grand total across every
   part in the table. Manufacturing, hardware, procurement — "what does this build cost". ── */
export type BomRowKind = 'part' | 'subassembly' | 'total';
export interface BomRow {
  label: string;
  partNo?: string;
  qty?: number;
  unitCost?: number;
  /** nesting depth (each level ≈14px); a subassembly's rollup sums every row nested under it. */
  indent?: number;
  /** 'part' (default) a priced line item · 'subassembly' a rollup heading · 'total' the grand total. */
  kind?: BomRowKind;
}
export interface BillOfMaterialsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: BomRow[];
  /** ISO 4217 code for currency formatting, e.g. "USD". Defaults to USD. */
  currency?: string;
  footer?: HtmlString;
}

export type TablesBlock =
  | (BlockBase & { type: 'comparematrix'; props: CompareMatrixProps })
  | (BlockBase & { type: 'sizechart'; props: SizeChartProps })
  | (BlockBase & { type: 'careplan'; props: CarePlanProps })
  | (BlockBase & { type: 'doseladder'; props: DoseLadderProps })
  | (BlockBase & { type: 'financialstatement'; props: FinancialStatementProps })
  | (BlockBase & { type: 'cohortgrid'; props: CohortGridProps })
  | (BlockBase & { type: 'riskmatrix'; props: RiskMatrixProps })
  | (BlockBase & { type: 'labpanel'; props: LabPanelProps })
  | (BlockBase & { type: 'sensitivitytable'; props: SensitivityProps })
  | (BlockBase & { type: 'matrix'; props: MatrixProps })
  | (BlockBase & { type: 'datatable'; props: DataTableProps })
  | (BlockBase & { type: 'pivot'; props: PivotProps })
  | (BlockBase & { type: 'leaderboard'; props: LeaderboardProps })
  | (BlockBase & { type: 'treetable'; props: TreeTableProps })
  | (BlockBase & { type: 'swimlane'; props: SwimlaneProps })
  | (BlockBase & { type: 'footnotetable'; props: FootnoteTableProps })
  | (BlockBase & { type: 'sparktable'; props: SparkTableProps })
  | (BlockBase & { type: 'smallmultiples'; props: SmallMultiplesProps })
  | (BlockBase & { type: 'comparebars'; props: CompareBarsProps })
  | (BlockBase & { type: 'matrixgrid'; props: MatrixGridProps })
  | (BlockBase & { type: 'ingredientmatrix'; props: IngredientMatrixProps })
  | (BlockBase & { type: 'conjugation'; props: ConjugationTableProps })
  | (BlockBase & { type: 'clearancematrix'; props: ClearanceMatrixProps })
  | (BlockBase & { type: 'pricingtable'; props: PricingTableProps })
  | (BlockBase & { type: 'raci'; props: RaciProps })
  | (BlockBase & { type: 'rubric'; props: RubricProps })
  | (BlockBase & { type: 'interviewscorecard'; props: InterviewScorecardProps })
  | (BlockBase & { type: 'gradebook'; props: GradebookProps })
  | (BlockBase & { type: 'datadictionary'; props: DataDictionaryProps })
  | (BlockBase & { type: 'ablationtable'; props: AblationTableProps })
  | (BlockBase & { type: 'spectrumtable'; props: SpectrumTableProps })
  | (BlockBase & { type: 'fmeatable'; props: FmeaTableProps })
  | (BlockBase & { type: 'billofmaterials'; props: BillOfMaterialsProps })
  | (BlockBase & { type: 'complexitysummary'; props: ComplexitySummaryProps })
  | (BlockBase & { type: 'expressionheatmap'; props: ExpressionHeatmapProps })
  | (BlockBase & { type: 'discoverytracker'; props: DiscoveryTrackerProps })
  | (BlockBase & { type: 'dentaltreatmentplan'; props: DentalTreatmentPlanProps })
  | (BlockBase & { type: 'rollcall'; props: RollCallProps })
  | (BlockBase & { type: 'collectiontracker'; props: CollectionTrackerProps })
  | (BlockBase & { type: 'cma'; props: CmaProps })
  | (BlockBase & { type: 'taxreturnsummary'; props: TaxReturnSummaryProps })
  | (BlockBase & { type: 'depreciationschedule'; props: DepreciationScheduleProps })
  | (BlockBase & { type: 'vendortracker'; props: VendorTrackerProps })
  | (BlockBase & { type: 'sponsorshiptracker'; props: SponsorshipTrackerProps })
  | (BlockBase & { type: 'caseload'; props: CaseloadProps });

/* ── ingredientmatrix: which ingredients appear in which recipes — a shopping overlap view.
   Use for: "which groceries do these recipes share", "meal-prep shopping list". ── */

export interface IngredientMatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Column headers — recipe or meal names. */
  recipes: string[];
  /** Row labels — ingredient names. */
  ingredients: string[];
  /** Boolean grid [ingredientIndex][recipeIndex]. */
  matrix: boolean[][];
  /** Optional quantity overrides: matrix[i][j] quantity string. */
  quantities?: (string | null)[][];
  /** Highlight a specific ingredient row. */
  highlight?: string;
  footer?: HtmlString;
}

/* ── complexitysummary: a multi-approach Big-O comparison — the wrap-up artifact at the end of
   a technical-interview walkthrough. One row per approach with its time/space complexity in
   monospace notation and a short tradeoff note; a structural clone of datadictionary's
   fixed-column table technique. Coding interviews, algorithms coursework, code review —
   "how do these approaches compare". ── */
export interface ComplexityApproach {
  /** the approach's name, e.g. "Brute force", "Two pointers", "Hash map". */
  name: string;
  /** Big-O time complexity, e.g. "O(n log n)". */
  timeComplexity: string;
  /** Big-O space complexity, e.g. "O(n)". */
  spaceComplexity: string;
  /** a short qualifier — the tradeoff, or when this approach is worth picking. */
  notes?: string;
}
export interface ComplexitySummaryProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  approaches: ComplexityApproach[];
  footer?: HtmlString;
}

/* ── expressionheatmap: a gene-expression heat map — genes × samples, each cell a log2
   fold-change tinted on a DIVERGING scale centered at zero (blue = down-regulated, red =
   up-regulated, unchanged left untinted). Directly extends matrixgrid's cell-grid technique
   with a two-sided accent instead of matrixgrid's single-hue sequential ramp, since this is a
   signed comparison against a baseline rather than a bounded magnitude. `clusterGenes` /
   `clusterSamples` are accepted for forward-compatibility only — real hierarchical-clustering
   reordering is nontrivial math this component doesn't fabricate, so both are currently a
   no-op reservation (rows/columns always render in the given order). Molecular biology,
   bioinformatics — "read this expression panel". ── */
export interface ExpressionHeatmapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** row labels — gene names. */
  genes: string[];
  /** column labels — sample/condition names. */
  samples: string[];
  /** log2 fold-change, genes × samples; negative = down-regulated, positive = up-regulated,
   *  0 = unchanged. */
  values: number[][];
  /** reserved for forward-compat — hierarchical gene-clustering reorder is NOT implemented;
   *  a no-op today. */
  clusterGenes?: boolean;
  /** reserved for forward-compat — hierarchical sample-clustering reorder is NOT implemented;
   *  a no-op today. */
  clusterSamples?: boolean;
  /** the scale caption, e.g. "log2 fold-change". */
  scaleLabel?: string;
  footer?: HtmlString;
}
