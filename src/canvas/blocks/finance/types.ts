// finance family block types — equity, fundraising, and fixed-income visuals: vesting,
// term sheets, round-over-round raises, SAFE/note terms, dilution, the three linked
// financial statements, and the fixed-income pair (yield curve, bond ladder, frontier).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';

/* ── vestingschedule ── one row per equity grant: flat through the cliff, then a linear
   ramp to fully vested, computed from the dates — never authored. A shared "today" needle
   crosses every row so grants on different clocks read on one timeline. ── */
export interface VestingGrant {
  holder: string;
  /** ISO date the grant started (vesting clock zero). */
  grantDate: string;
  totalShares: number;
  /** months from grantDate before anything vests. */
  cliffMonths: number;
  /** months from grantDate to fully vested (100%). */
  vestMonths: number;
  color?: AccentVar;
}
export interface VestingScheduleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  grants: VestingGrant[];
  /** ISO date the "today" needle marks; defaults to the real current date. */
  asOf?: string;
  footer?: HtmlString;
}

/* ── termsheet ── an investment term sheet's terms, under a document header ── */
export interface TermSheetTerm {
  label: string;
  value: string;
  note?: string;
}
export interface TermSheetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  company?: string;
  round?: string;
  /** ISO date the term sheet is dated. */
  date?: string;
  terms: TermSheetTerm[];
  footer?: HtmlString;
}

/* ── fundraisingrounds ── round-by-round raise history: pre-money stacking to post-money,
   Bridge's start→delta→end grammar turned into one column per round. ── */
export interface FundraisingRound {
  name: string;
  raised: number;
  preMoney: number;
  postMoney: number;
  leadInvestor?: string;
  /** ISO date the round closed. */
  date?: string;
  /** valuation step-up vs. the prior round's post-money, e.g. 2.4 → "2.4x". Authored, not derived. */
  stepUp?: number;
}
export interface FundraisingRoundsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** ISO 4217 code for currency formatting; defaults to USD. */
  currency?: string;
  rounds: FundraisingRound[];
  footer?: HtmlString;
}

/* ── saferterms ── a SAFE or convertible note's headline terms; the two instruments share
   nearly every field, so one block covers both, gated on `instrument`. ── */
export type SaferInstrument = 'safe' | 'note';
export interface SaferTermsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  instrument: SaferInstrument;
  investor?: string;
  principal: number;
  valuationCap?: number;
  discountPct?: number;
  mfn?: boolean;
  /** note-only: annual interest rate (%). Ignored for a SAFE. */
  interestRate?: number;
  /** note-only: ISO date the note matures. Ignored for a SAFE. */
  maturityDate?: string;
  /** plain-language line explaining how/when this converts. */
  conversionNote?: string;
  footer?: HtmlString;
}

/* ── dilutionwaterfall ── ownership evolution across rounds: 100%-stacked columns, one per
   round, each holder keeping one consistent color and a thin connecting ribbon to its own
   segment in the next column so the dilution reads as a shape, not just falling numbers. ── */
export interface DilutionHolder {
  holder: string;
  /** ownership % in this round, 0..100. Holders in a round need not sum to exactly 100. */
  pct: number;
  color?: AccentVar;
}
export interface DilutionRound {
  round: string;
  holders: DilutionHolder[];
}
export interface DilutionWaterfallProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rounds: DilutionRound[];
  footer?: HtmlString;
}

/* ── threestatementlink ── income statement → balance sheet → cash flow, side by side, with a
   couple of curved connectors crossing the gaps to show where a line on one statement feeds
   another (net income → retained earnings → cash flow's own net income row). ── */
export interface LinkStatementRow {
  label: string;
  value: number;
  indent?: number;
  bold?: boolean;
}
export interface LinkStatement {
  name: 'Income Statement' | 'Balance Sheet' | 'Cash Flow';
  rows: LinkStatementRow[];
}
export interface StatementLink {
  /** a row label to connect from — resolved against whichever statement panel has it. */
  from: string;
  /** a row label to connect to — resolved in a LATER panel than `from`. */
  to: string;
  label: string;
}
export interface ThreeStatementLinkProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  period: string;
  statements: [LinkStatement, LinkStatement, LinkStatement];
  /** connectors between a row on one statement and a row on a later one; renders with none. */
  links?: StatementLink[];
  /** ISO 4217 code for currency formatting; defaults to USD. */
  currency?: string;
  footer?: HtmlString;
}

/* ── yieldcurve ── interest rate by tenor, on a categorical (not numeric) x-axis. Any inverted
   stretch — a later tenor yielding LESS than an earlier one — is detected from the data and
   never authored, since that's the whole signal a yield curve exists to show. ── */
export interface YieldPoint {
  /** a tenor label, e.g. "1M", "2Y", "10Y" — plotted in the order given, evenly spaced. */
  tenor: string;
  rate: number;
}
export interface YieldCurveProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  curve: YieldPoint[];
  /** a second curve for comparison, e.g. the same tenors a year ago. */
  compareCurve?: YieldPoint[];
  footer?: HtmlString;
}

/* ── efficientfrontier ── risk/return scatter (ScatterRegression's axes+points scaffold) plus
   a CALLER-SUPPLIED frontier polyline — never a computed fit, the same "only draw what you're
   given" rule Plot/AreaPlot hold for geometry. ── */
export interface FrontierAsset {
  label: string;
  risk: number;
  return: number;
  highlight?: boolean;
}
export interface FrontierPoint {
  risk: number;
  return: number;
}
export interface EfficientFrontierProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  assets: FrontierAsset[];
  /** the frontier curve, already ordered along it — drawn exactly as given, never fitted. */
  frontier: FrontierPoint[];
  footer?: HtmlString;
}

/* ── bondladder ── one rung per maturity, BracketBar's leader-bar pattern reused but ordered
   by maturity rather than resorted by value — the whole point of a ladder is reading it in
   maturity order, not rank order. ── */
export interface LadderRung {
  label: string;
  /** an ISO date or a short label like "3Y" — determines rung order, earliest first. */
  maturity: string;
  yieldPct: number;
  faceValue: number;
}
export interface BondLadderProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rungs: LadderRung[];
  footer?: HtmlString;
}

/* ── cashflowtimeline ── the engineering-economics cash-flow diagram: a horizontal period
   axis with an upward arrow per inflow and a downward arrow per outflow, every arrow's length
   on ONE shared nice scale so magnitudes compare across the whole timeline. An optional
   discount rate adds a computed NPV summary row — real Σ amount/(1+r)^period math, never an
   authored figure. ── */
export interface CashFlowItem {
  /** integer period index on the axis, ≥ 0 (period 0 = "now"). */
  period: number;
  /** signed amount: positive = inflow (arrow up), negative = outflow (arrow down). */
  amount: number;
  /** what this flow is, e.g. "Salvage value" — shown on hover. */
  label?: string;
}
export interface CashflowTimelineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  flows: CashFlowItem[];
  /** what one period is, e.g. "Year" (the default), "Month", "Quarter". */
  periodLabel?: string;
  /** per-period discount rate as a fraction (0.08 = 8%); when given, an NPV row is computed. */
  discountRate?: number;
  /** currency symbol prefixed to amounts, default "$". */
  currency?: string;
  footer?: HtmlString;
}

export type FinanceBlock =
  | (BlockBase & { type: 'vestingschedule'; props: VestingScheduleProps })
  | (BlockBase & { type: 'termsheet'; props: TermSheetProps })
  | (BlockBase & { type: 'fundraisingrounds'; props: FundraisingRoundsProps })
  | (BlockBase & { type: 'saferterms'; props: SaferTermsProps })
  | (BlockBase & { type: 'dilutionwaterfall'; props: DilutionWaterfallProps })
  | (BlockBase & { type: 'threestatementlink'; props: ThreeStatementLinkProps })
  | (BlockBase & { type: 'yieldcurve'; props: YieldCurveProps })
  | (BlockBase & { type: 'efficientfrontier'; props: EfficientFrontierProps })
  | (BlockBase & { type: 'bondladder'; props: BondLadderProps })
  | (BlockBase & { type: 'cashflowtimeline'; props: CashflowTimelineProps });
