// dashboards/types.ts — the shape of a living dashboard. A dashboard is a Live conversation made
// persistent: it holds your VERBATIM reasoning (thesis + tripwires + sources), the numbers you
// asked it to watch (metrics), and an ordered grid of real canvas Blocks (widgets). The hard
// architectural line: your reasoning is STABLE — a refresh only ever touches metric values and the
// tripwire states derived from them, never your thesis. Real-data-only: a value is search-grounded,
// user-supplied (the Blank Space), or honestly empty — never fabricated.
import type { Block, WebSource } from '../../data/conversation';

/** Where a metric's current value came from — drives the honesty badge on the tile. `empty` means
 *  no real value yet (renders "—" / "awaiting" / "not connected"); we never seed a guess. */
export type ValueOrigin = 'search' | 'user' | 'local' | 'empty';

/** A phrase lifted VERBATIM from the transcript, with when it was said. The spine of the
 *  "against your own stated reasoning" promise — never paraphrased, never invented. */
export interface SourceQuote {
  /** The user's exact words. */
  text: string;
  /** Epoch ms of the turn it came from. */
  saidAt: number;
}

/** ORIGIN = the conversation that created the dashboard; ADDED = a later turn folded in;
 *  LINKED = a separate conversation the user explicitly linked. Lineage is append-only. */
export type SourceKind = 'ORIGIN' | 'ADDED' | 'LINKED';
export interface DashSource {
  kind: SourceKind;
  /** Normalized ask — the atlas/library dedup key — so a source maps back to a real conversation. */
  conversationId: string;
  title: string;
  /** What this conversation contributed ("Added: DXY metric + dollar-headwind alert"). */
  contributed: string;
  at: number;
}

/** A number the dashboard watches. The SPEC (label/query/unit) is stable; only `lastValue` and its
 *  origin/asOf move on refresh. `query` empty + `blankKey` set ⇒ the value is the user's to give. */
export interface MetricSpec {
  id: string;
  /** "US 10-year yield", "Weekly mileage". */
  label: string;
  /** The search-grounded re-ask query; empty when the value is user-supplied or local-only. */
  query: string;
  /** "%", "$", "mi", "s/mi". */
  unit?: string;
  /** Why the user cares about this number — surfaced as the metric tile's note. */
  sourceQuote: SourceQuote;
  /** Latest real value, or null when never fetched / not connected. NEVER seeded with a guess. */
  lastValue: number | null;
  /** The raw token a fetch saw ("4.18%", "$1,800") — for display + audit. */
  lastRaw?: string;
  origin: ValueOrigin;
  /** When `lastValue` was obtained (epoch ms). */
  asOf?: number;
  /** When set, this metric is a fillable hole (the Blank Space) the user supplies. */
  blankKey?: string;
  /** A capped ring of past real values (newest last) — the sparkline/area-chart data source. Only
   *  real observations land here (never a guess), so a sparse or empty history is honest: it just
   *  means this metric hasn't been checked enough times yet to draw a trend. */
  history?: { at: number; value: number }[];
}

/** How a tripwire compares a metric to its threshold. `crosses_*`/`pct_*` need the metric's PREVIOUS
 *  value so a tripwire fires on the transition (the move), not on every poll while still over. */
export type Comparator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'crosses_up'
  | 'crosses_down'
  | 'pct_drop'
  | 'pct_rise';

/** WATCHING = armed, not breached; CLEAR = comfortably on-thesis; TRIGGERED = it moved against you;
 *  AWAITING = no real value yet, so we won't pretend it's clear. */
export type TripwireState = 'WATCHING' | 'CLEAR' | 'TRIGGERED' | 'AWAITING';

/** "Reconsider if…" — the user's own stated reversal condition, made checkable. The threshold check
 *  is deterministic and free; INTERPRETING a break is the single gated AI call (see analyze.ts). */
export interface Tripwire {
  id: string;
  /** "10Y above 4.5%", "Long-run pace decay > 30s/mi". */
  label: string;
  /** The metric this watches. */
  metricId: string;
  comparator: Comparator;
  threshold: number;
  unit?: string;
  /** The verbatim "reconsider if…" line. */
  sourceQuote: SourceQuote;
  state: TripwireState;
  /** Set when state flips to TRIGGERED — the value that broke it + when. */
  brokenValue?: number;
  brokenAt?: number;
}

/** S / M / L. Maps onto the 12-col card grid as col 4 / 8 / 12 at render time. */
export type WidgetSpan = 1 | 2 | 3;

/** A dashboard tile = a real canvas Block plus dashboard-level metadata. The Block holds the volatile
 *  values (refreshed in place from `metricId`); the wrapper holds layout + provenance. */
export interface Widget {
  id: string;
  /** Rendered by TopicCanvas exactly like a live card. */
  block: Block;
  span: WidgetSpan;
  /** The MetricSpec whose value refreshes this widget's data prop (when data-bearing). */
  metricId?: string;
  /** The question that originally produced this block — when set, a refresh re-asks this EXACT
   *  question (with search) and replaces the whole block with a fresh answer. This is how RICH
   *  content (a scores list, a timeline — anything not a single number) stays live instead of
   *  freezing at pin-time; metricId-driven widgets don't need this, they refresh via the number. */
  refreshQuery?: string;
  /** Which source (conversationId) added this widget. */
  fromSource: string;
}

export type DataCadenceMode = '15min' | 'hourly' | '6h' | 'daily' | 'manual';
export type AiCadenceMode = 'daily' | 'weekly' | 'on-change' | 'manual';

/** A bounded live-event window ("match only") the data cadence polls INSIDE and parks OUTSIDE —
 *  free/cheap once the window closes instead of polling around the clock for something that's
 *  only live a few hours a week. `origin` tells the honesty story: 'user' means the user stated
 *  the time themselves (accepted at creation, un-searched); 'search' means a grounded refresh
 *  discovered it (e.g. found the match's real kickoff/final-whistle time) — never invented by the
 *  searchless planner. Self-cleans once `endAt` passes (see cadence.ts's nextDataDue). */
export interface CadenceWindow {
  label: string;
  startAt: number;
  endAt: number;
  origin: 'user' | 'search';
}

export interface Cadence {
  data: DataCadenceMode;
  ai: AiCadenceMode;
  window?: CadenceWindow;
}

/** Where alerts go — all client-side and honest. `inApp` gates the transient pop-up notice when a
 *  line is crossed (the dashboard's own alert list is an always-on status read, not gated by this);
 *  `push` shows a native browser Notification (only after the user grants permission, only while
 *  Mavéa is open — no service worker / background push). */
export interface AlertRouting {
  inApp: boolean;
  push: boolean;
}

/** A standing "expects by next check" call, written by the SAME grounded refresh call that fetches
 *  values (never a separate billed call) — the "predictions are free" promise. Replaced by a fresh
 *  one once the current call is graded. */
export interface Prediction {
  text: string;
  at: number;
}

/** One graded prediction, moved from `prediction` into history once the NEXT grounded refresh
 *  judges it. The grade is model-self-reported against real fetched values — displayed verbatim,
 *  never rewritten, and only ever recorded from a grounded call (an ungrounded call grading its
 *  own unfetched guess would be fabrication). `unclear` counts toward the total but not toward
 *  "hits" in the weekly tally — an honest denominator beats a flattering one. */
export interface PredictionGrade {
  at: number;
  expected: string;
  result: 'hit' | 'miss' | 'unclear';
  note?: string;
}

/** Mavéa's brief, honest read on the latest numbers — what they show, what changed, and (when a line
 *  just crossed) whether it's a real move or noise. Kept on the dashboard so the card shows it
 *  without re-billing. */
export interface Verdict {
  text: string;
  at: number;
  /** Whether this call actually grounded in real search (native grounding metadata OR the
   *  self-reported inline "sources" fallback) — distinct from whether `sources` below is
   *  non-empty, since a genuinely grounded turn can still arrive with nothing in that array.
   *  Optional so a verdict predating this field (or a hand-built one in a test) stays valid;
   *  treat "unset" as "unknown", never as a confident "not grounded". */
  grounded?: boolean;
  sources?: WebSource[];
  tripwireId?: string;
}

export interface Dashboard {
  id: string;
  title: string;
  /** The originating ask, shown in the detail header (italic). */
  question: string;
  /** The verbatim claim with its date — STABLE, never refresh-mutated. */
  thesis: SourceQuote;
  tripwires: Tripwire[];
  metrics: MetricSpec[];
  /** Lineage, append-only. */
  sources: DashSource[];
  /** ORDERED — array order IS render order. */
  widgets: Widget[];
  cadence: Cadence;
  /** When true, the AI verdict call fires the moment a tripwire flips to TRIGGERED. */
  smartTrigger: boolean;
  alerts: AlertRouting;
  /** Semantic domain (from the model's `topic`), for gallery clustering + relatedness. */
  topic?: string;
  createdAt: number;
  updatedAt: number;
  /** When a USER action last touched this dashboard (created it, edited cadence/alerts/layout,
   *  folded in a conversation) — as opposed to `updatedAt`, which a cross-dashboard batched
   *  refresh bumps on every member at once. Eviction (store.ts's capList) sorts by THIS, so a
   *  manual-cadence dashboard the user actually cares about doesn't get evicted first just because
   *  auto-refreshed dashboards keep touching `updatedAt` and it doesn't. Falls back to `updatedAt`
   *  when absent (a dashboard from before this field existed keeps its prior eviction priority
   *  exactly, rather than jumping to the front or back of the queue on migration). */
  lastTouchedByUserAt?: number;
  /** Honest foreground clocks (epoch ms). */
  nextDataAt: number;
  nextAiAt: number;
  /** A single scheduled check at a known future moment ("June CPI release, 8:30 AM ET") instead of
   *  a recurring cadence — no polling before or after. Cleared the moment it runs. Only ever set
   *  from a time the user explicitly stated or a grounded refresh's `liveWindow` discovery, never
   *  invented by the searchless planner. */
  oneShotAt?: number;
  oneShotLabel?: string;
  /** The current standing "expects by next check" — cleared and graded into `predictionHistory`
   *  once the next grounded refresh judges it. */
  prediction?: Prediction;
  /** Capped history of graded predictions (newest last), the "calls this week" record. */
  predictionHistory?: PredictionGrade[];
  /** Null until a real foreground refresh happens — nothing refreshes while Mavéa is closed. */
  lastRefreshedAt: number | null;
  /** What the LAST data-refresh attempt actually accomplished — so the UI never claims "updated"
   *  when nothing new came back. Undefined/omitted on a dashboard with no searchable metrics at
   *  all (there's nothing a refresh could ever do) or before any refresh has run. 'unverified'
   *  means the call ran and parsed but never grounded in real search, so everything it claimed
   *  was discarded — the check happened, the data didn't (distinct from 'no-change', which is a
   *  grounded pass that genuinely found nothing new). */
  lastDataOutcome?: 'updated' | 'no-change' | 'unverified';
  lastVerdict?: Verdict;
  /** When the LAST verdict call was attempted (success or failure) — lets the card tell "the shown
   *  verdict is current" apart from "an attempt since then failed and this is stale". */
  lastVerdictAttemptAt?: number;
  /** Set when that last attempt failed to produce a verdict; cleared the moment one succeeds. */
  lastVerdictError?: string;
}

/** The gallery status badge, derived purely from tripwire states (see status.ts). */
export type DashboardStatus = 'tracking' | 'at-risk' | 'needs-attention';

/* ---- extraction drafts (pre-Build, looser so the Extraction Preview can render before persist) ---- */

export interface DraftMetric {
  label: string;
  query: string;
  unit?: string;
  sourceQuote: SourceQuote;
  /** True when the value is the user's to supply (becomes a Blank), so we don't search for it. */
  userSupplied: boolean;
}
export interface DraftTripwire {
  label: string;
  comparator: Comparator;
  threshold: number;
  unit?: string;
  sourceQuote: SourceQuote;
  /** References a DraftMetric by label. */
  metricLabel: string;
}
export interface DraftWidget {
  metricLabel: string;
  blockType: string;
  span: WidgetSpan;
}
export interface DashboardDraft {
  title: string;
  thesis: SourceQuote;
  metrics: DraftMetric[];
  tripwires: DraftTripwire[];
  suggestedWidgets: DraftWidget[];
}

/* ---- usage awareness (see cost.ts) ----
 * We deliberately do NOT show dollar amounts or projected call counts: the real cost depends on which
 * model the user connected and that provider's pricing, which only they can verify. Instead we make
 * them AWARE — a qualitative sense of how often this dashboard will reach for their key, plus a clear
 * warning to check their model's pricing and confirm the cadence is what they want. */
export type UsageLevel = 'none' | 'minimal' | 'light' | 'moderate' | 'frequent';
export interface UsageEstimate {
  /** Relative call frequency band — never a precise figure. */
  level: UsageLevel;
  /** Whether this configuration spends any model calls on the user's key at all. */
  usesKey: boolean;
  /** "Hourly while Mavéa is open" / "Free — no live-fetched metrics". */
  dataLabel: string;
  /** "Only when a tripwire breaks" / "Daily". */
  aiLabel: string;
  /** The awareness warning shown next to the cadence controls. */
  warning: string;
}
