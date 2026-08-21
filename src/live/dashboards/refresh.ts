// dashboards/refresh.ts — the deterministic, FREE half of the update engine. These pure functions
// answer "did a tripwire break?" with no model call and no I/O, so they can run every loop tick at
// zero cost. The expensive interpretation ("did this move against my reasoning?") is gated behind
// shouldFireAi and lives in analyze.ts; the actual value-fetching lives in the loop (P8).
//
// Two semantics matter for honesty:
//  • A tripwire fires on the TRANSITION into TRIGGERED, not on every poll while still breached — so
//    you're alerted when something MOVES, not nagged daily. evalDashboard reports `newlyTriggered`
//    (was-not, now-is) for exactly this; level comparators stay TRIGGERED while breached without
//    re-firing the AI call.
//  • A metric with no real value yet is AWAITING, never a false CLEAR.
//
// `refreshData` and `refreshWidgets` (the two model-dependent functions here) fetch current real
// content for a dashboard's search-grounded metrics and rich (non-numeric) widgets respectively —
// both no-op without a connected model and never fabricate anything.
import { getAdapter } from '../providers';
import type { ModelConfig } from '../../types/mavea';
import type { GroundingSource } from '../providers/types';
import type {
  Comparator,
  Dashboard,
  MetricSpec,
  PredictionGrade,
  TrackerFailure,
  Tripwire,
  TripwireState,
  Widget,
} from './types';
import type { Block } from '../../data/conversation';
import { toNumber } from '../ground/number';
import { parseLooseJson } from '../ground/json';
import { currentDateTimeLine } from '../ground/now';
import { normLabel } from '../ground/tokens';
import { coerceExpects, coerceGrade } from './predictions';
import { hostOf, valueWithUnit } from './format';
import { isProjectedWidget } from './project';
import { coerceObservation, observationKindFor, OBSERVATION_SHAPE } from './observation';
import { projectObservation } from './projectObservation';
import { saveObservation } from './observationStore';
// validateLiveResponse is dynamic-imported inside refreshDashboard (below), not statically — a
// static import pulls liveSchema → the ~580-entry catalog into the eager Dashboards-mount chunk.
// The refresh path is already async (post-fetch), so the import adds no perceptible latency.
import { arr, obj } from '../providers/http';

/** Read the provider's thrown error and name the failure it actually is. The adapters throw
 *  `Error("<id> <status><detail>")`, so the status is in the message — crude to match on, but the
 *  alternative is a typed error class threaded through five adapters for one consumer. What matters
 *  is that the loop stops treating every death as the same five-minute retry: a rate window drains
 *  in seconds, a rejected key never drains without the user. */
function classifyProviderError(err: unknown): TrackerFailure {
  const text = err instanceof Error ? err.message : String(err);
  if (/\b429\b|rate.?limit/i.test(text)) {
    // Providers state the wait in the message ("try again in 5.146s") far more often than they
    // send a machine-readable header the adapter kept — read it when it is there.
    const secs = Number(/(?:in|after)\s+([\d.]+)\s*s/i.exec(text)?.[1]);
    return Number.isFinite(secs) && secs > 0
      ? { kind: 'rate-limit', retryAt: Date.now() + Math.min(secs * 1000, 120_000) }
      : { kind: 'rate-limit' };
  }
  if (/\b401\b|\b403\b|api key|unauthor/i.test(text)) return { kind: 'auth' };
  if (/\b5\d\d\b|overloaded|unavailable|capacity/i.test(text))
    return { kind: 'provider-unavailable' };
  return { kind: 'network' };
}

/** Whether the tripwire's condition is met given the metric's current + previous numeric value.
 *  Transition/percent comparators need `prev`; level comparators ignore it. */
export function isBreached(
  comparator: Comparator,
  current: number,
  prev: number | null,
  threshold: number,
): boolean {
  switch (comparator) {
    case 'gt':
      return current > threshold;
    case 'gte':
      return current >= threshold;
    case 'lt':
      return current < threshold;
    case 'lte':
      return current <= threshold;
    case 'crosses_up':
      return prev !== null && prev < threshold && current >= threshold;
    case 'crosses_down':
      return prev !== null && prev > threshold && current <= threshold;
    case 'pct_rise':
      return prev !== null && prev !== 0 && ((current - prev) / Math.abs(prev)) * 100 >= threshold;
    case 'pct_drop':
      return prev !== null && prev !== 0 && ((prev - current) / Math.abs(prev)) * 100 >= threshold;
    default:
      return false;
  }
}

/** Is a not-yet-breached LEVEL tripwire close enough to its threshold to read as WATCHING (vs the
 *  comfortable CLEAR)? "Close" = within 10% on the side the breach would come from. Transition/percent
 *  comparators are inherently "armed and watching", so they read WATCHING until they fire. */
function isNear(comparator: Comparator, current: number, threshold: number): boolean {
  if (threshold === 0) return true; // can't form a ratio — treat as actively watching
  const ratio = current / threshold;
  switch (comparator) {
    case 'gt':
    case 'gte':
      return ratio >= 0.9; // approaching from below
    case 'lt':
    case 'lte':
      return ratio <= 1.1; // approaching from above
    default:
      return true; // crosses_*/pct_* are always watching for the move
  }
}

/** The state of one tripwire given its metric's current + previous value. Pure + free. */
export function evalTripwireState(
  tw: Tripwire,
  current: number | null,
  prev: number | null,
): TripwireState {
  if (current === null) return 'AWAITING';
  if (isBreached(tw.comparator, current, prev, tw.threshold)) return 'TRIGGERED';
  return isNear(tw.comparator, current, tw.threshold) ? 'WATCHING' : 'CLEAR';
}

/** Re-evaluate every tripwire against current metric values. Returns the updated tripwire array and
 *  the subset that FLIPPED to TRIGGERED this pass (was not triggered before) — the AI gate reads the
 *  latter so a still-breached tripwire never re-bills. `prevValues` maps metricId → the value before
 *  this refresh (for transition/percent comparators); omit for a pure level-only evaluation. */
export function evalDashboard(
  d: Dashboard,
  prevValues: Record<string, number | null> = {},
): { tripwires: Tripwire[]; newlyTriggered: Tripwire[] } {
  const byId = new Map<string, MetricSpec>(d.metrics.map((m) => [m.id, m]));
  const newlyTriggered: Tripwire[] = [];
  const tripwires = d.tripwires.map((tw) => {
    const metric = byId.get(tw.metricId);
    const current = metric ? metric.lastValue : null;
    const prev = tw.metricId in prevValues ? prevValues[tw.metricId] : current;
    const state = evalTripwireState(tw, current, prev);
    const next: Tripwire =
      state === 'TRIGGERED' && tw.state !== 'TRIGGERED'
        ? {
            ...tw,
            state,
            brokenValue: current ?? undefined,
            brokenAt: metric?.asOf,
          }
        : { ...tw, state };
    if (state === 'TRIGGERED' && tw.state !== 'TRIGGERED') newlyTriggered.push(next);
    return next;
  });
  return { tripwires, newlyTriggered };
}

/** How many dashboards one combined refresh call covers at most — a worst-case batch (each with
 *  metrics + a rich widget + a standing prediction to grade) stays well inside a sane token
 *  budget; anything past this stays due and is picked up on the NEXT 15s tick, not a second call
 *  this same pass. */
export const MAX_BATCH = 4;

/** A dashboard is data-due either on its normal cadence clock OR because a one-shot scheduled
 *  check's moment has arrived — the two are independent triggers (a manual-cadence dashboard with
 *  `nextDataAt` parked at MAX_SAFE_INTEGER can still have a real `oneShotAt`). */
function isDataDue(d: Dashboard, now: number): boolean {
  return d.nextDataAt <= now || (d.oneShotAt !== undefined && d.oneShotAt <= now);
}
function dueAt(d: Dashboard): number {
  return d.oneShotAt !== undefined ? Math.min(d.nextDataAt, d.oneShotAt) : d.nextDataAt;
}

/** Every data-due dashboard, oldest-due first, capped at `max` — the rest stay due for the next
 *  tick rather than growing this pass unboundedly. */
export function dueDataDashboards(
  dashboards: Dashboard[],
  now: number = Date.now(),
  max: number = MAX_BATCH,
): Dashboard[] {
  return dashboards
    .filter((d) => isDataDue(d, now))
    .sort((a, b) => dueAt(a) - dueAt(b))
    .slice(0, max);
}

/** The dashboard whose DATA clock has lapsed (oldest due first), or null. Manual cadences park their
 *  clock far in the future, so they're never returned (unless a one-shot check is due). */
export function dueDataDashboard(
  dashboards: Dashboard[],
  now: number = Date.now(),
): Dashboard | null {
  return dueDataDashboards(dashboards, now, 1)[0] ?? null;
}

/** The dashboard whose scheduled AI clock has lapsed (oldest due first), or null. on-change/manual AI
 *  cadences park their clock far in the future, so only daily/weekly schedules are returned here. */
export function dueAiDashboard(
  dashboards: Dashboard[],
  now: number = Date.now(),
): Dashboard | null {
  const due = dashboards.filter((d) => d.nextAiAt <= now).sort((a, b) => a.nextAiAt - b.nextAiAt);
  return due[0] ?? null;
}

/** The single gate for the billable AI verdict: fire on a fresh tripwire break under smart trigger,
 *  or on a due fixed schedule — otherwise nothing. Pure, so the loop's spend decision is testable. */
export function shouldFireAi(
  d: Dashboard,
  newlyTriggered: Tripwire[],
  now: number = Date.now(),
): { fire: boolean; trigger: Tripwire | 'scheduled' | null } {
  if (d.smartTrigger && newlyTriggered.length > 0) {
    return { fire: true, trigger: newlyTriggered[0] };
  }
  const scheduled = d.cadence.ai === 'daily' || d.cadence.ai === 'weekly';
  if (scheduled && now >= d.nextAiAt) {
    return { fire: true, trigger: 'scheduled' };
  }
  return { fire: false, trigger: null };
}

/** A fetched value for one metric (keyed by metric id). */
export type FetchedValues = Record<string, { value: number; raw: string }>;

// toNumber (lenient value reader) + JSON extraction now live in the shared spine (ground/number.ts,
// ground/json.ts). refreshData uses them below.

/** The inline "sources" a model self-reports on a search turn — the same recovery generateLive.ts
 *  leans on for Gemini's empty-citation gotcha (native grounding metadata comes back empty even
 *  though a search genuinely ran). Every model call here asks for this fallback array so a call's
 *  real groundedness can be told apart from a plausible-sounding guess, even on adapters whose
 *  native `rr.sources` never arrives. */
function selfReportedSources(parsed: Record<string, unknown>): GroundingSource[] {
  const out: GroundingSource[] = [];
  for (const raw of arr(parsed.sources)) {
    const s = obj(raw);
    if (typeof s.title === 'string' && typeof s.url === 'string')
      out.push({ title: s.title, url: s.url });
  }
  return out;
}

/** Whether a call actually grounded in real search — native grounding metadata OR the self-reported
 *  fallback array, either one is enough (mirrors generateLive.ts's turn-level `grounded` signal). */
function isGrounded(rr: { sources?: GroundingSource[] }, parsed: Record<string, unknown>): boolean {
  return (rr.sources?.length ?? 0) > 0 || selfReportedSources(parsed).length > 0;
}

/** A widget the refresh loop can regenerate: it carries the original question that produced it. */
type RefreshableWidget = Widget & { refreshQuery: string };

/** One list item's live-search instructions, tagged by kind so the single combined prompt below
 *  can tell a bare-number ask from a whole-block ask apart without two separate calls. */
function metricLine(m: MetricSpec): string {
  return `- VALUE "${m.label}" — ${m.query}`;
}
function widgetLine(w: RefreshableWidget, i: number, hint: string | null): string {
  const kind = observationKindFor(w.block.type);
  // A target whose view has a canonical DATA shape asks for that data, never for a rendered block.
  // The schema is a single flat line, and this app builds the component from it — so a drift in
  // the model's prop names can no longer throw away a search the user paid for.
  if (kind) {
    return (
      `- DATA #${i} [${kind}] ${w.refreshQuery}\n` + `  return EXACTLY: ${OBSERVATION_SHAPE[kind]}`
    );
  }
  // The long tail with no canonical shape (scoreboards, forecasts, diagrams) still comes back as a
  // built block. The CURRENT props ride along as a concrete example of the expected detail level
  // AND as the thing the model must check for a state change — without a concrete "was this live?"
  // example, a model asked to "refresh the answer" tends to just restate the same status (observed
  // live: a widget still shown as "live now" long after the real match had finished, because the
  // model searched but never framed the search as "check whether this has concluded since"). The
  // shape line is load-bearing for a board that has NEVER filled: its current props are an empty
  // skeleton, which teaches nothing, and a model left to guess item field names produces data the
  // validator must reject.
  return (
    `- BLOCK #${i} [${w.block.type}] ${w.refreshQuery}\n` +
    (hint ? `  expected props (use EXACTLY these field names): ${hint}\n` : '') +
    `  current content: ${JSON.stringify(w.block.props ?? {}).slice(0, 600)}`
  );
}

/** One entry in a batched refresh's per-dashboard result — everything the loop needs to apply via
 *  store.ts's applyRefreshResult in one persist. `expects`/`grade`/`disagreement`/`liveWindow` are
 *  only ever populated from a GROUNDED call (same "NO SOURCE, NO NUMBER" discipline as values). */
export interface DashboardRefreshResult {
  values: FetchedValues;
  widgets: Record<string, Block>;
  expects?: string;
  grade?: { result: PredictionGrade['result']; note?: string };
  disagreement?: { metricLabel: string; readings: string[]; note: string };
  liveWindow?: { startAt: number; endAt: number; label: string };
}

export interface BatchRefreshResult {
  /** Whether the CALL survived (network/auth/parse) — false means every member should retry soon
   *  without being marked as checked, same semantics as the old single-dashboard `ok`. */
  ok: boolean;
  /** Call-wide groundedness — an ungrounded call discards trusted output for EVERY member. */
  grounded: boolean;
  perDashboard: Record<string, DashboardRefreshResult>;
  sources: GroundingSource[];
  /** Present only when a briefing was requested AND the call grounded successfully. */
  briefing?: string;
  /** Why the CALL died, when `ok` is false — classified HERE, where the provider error is still in
   *  hand, because the loop can only see a boolean by the time it decides what to do next. The
   *  kinds differ in the answer they need: a rate window drains itself in seconds, a rejected key
   *  needs the user, an unreachable host needs the network back. */
  failure?: TrackerFailure;
  /** How many provider calls this pass actually spent (1, or 2 when the first came back
   *  ungrounded and refreshDashboards retried once with a sharpened search demand). NOT what the
   *  ledger's `searches` counts — that stays 1 per user-facing check regardless (see
   *  useDashboardLoop's ledger entry) — this is here for the diagnostic log line and for tests to
   *  pin that the retry actually fired. */
  attempts: number;
}

function emptyDashboardResult(): DashboardRefreshResult {
  return { values: {}, widgets: {} };
}

/** Metrics + refreshable widgets a dashboard actually has to fetch — empty for a dashboard with
 *  only user-supplied/local metrics (nothing here for a model to check; the loop handles those
 *  for free, outside any batch). */
function liveTargets(d: Dashboard): { metrics: MetricSpec[]; targets: RefreshableWidget[] } {
  return {
    metrics: d.metrics.filter((m) => m.query.trim() !== '' && !m.blankKey),
    // A PROJECTED widget is never a target, even when something gave it a refreshQuery: its
    // content is derived from dashboard state at render time (project.ts), so a regenerated block
    // would be overwritten moments later. Asking for it spent tokens for nothing and put another
    // block in the reply that validation could choke on — while the number it shows kept updating
    // anyway, through its metric, which this same call already fetches as a plain value.
    targets: d.widgets.filter(
      (w): w is RefreshableWidget => !!w.refreshQuery?.trim() && !isProjectedWidget(w),
    ),
  };
}

export interface RefreshBatchMember {
  d: Dashboard;
  metrics: MetricSpec[];
  targets: RefreshableWidget[];
}

/** The block types a refresh of `target` is allowed to produce. Its own type — plus, for a
 *  composite, its existing children's types: buildComposite strips 'composite' from the allowed
 *  set it hands the children, so validating against {composite} alone leaves the children an
 *  EMPTY allowed set and a pinned composite card could never refresh at all. The children the
 *  card already holds are exactly the composition a refresh is asked to re-fill. */
function allowedTypesFor(target: RefreshableWidget): string[] {
  const types: string[] = [target.block.type];
  if (target.block.type === 'composite') {
    const regions = (target.block.props as { regions?: Array<{ block?: { type?: string } }> })
      .regions;
    for (const r of regions ?? []) {
      const t = r?.block?.type;
      if (typeof t === 'string' && t) types.push(t);
    }
  }
  return types;
}

/** Rough per-dashboard token cost — enough to decide how many dashboards fit one call before the
 *  rest spill to the next 15s tick, not exact accounting. */
/** Roughly how many output tokens one dashboard's slice of a batch needs. The per-target figure is
 *  the one that matters: a BLOCK target returns a whole rebuilt component (nested props, item
 *  arrays, colors) and genuinely needs ~1200, but a DATA target returns a flat observation — a few
 *  strings, or label/value pairs — which fits in a fraction of that.
 *
 *  This is not a nicety. Providers reserve `input + max_output_tokens` against a per-minute token
 *  quota, so an oversized estimate does not merely waste headroom, it decides how many checks fit
 *  in a minute at all: with the old flat figure a four-board batch reserved ~57k of a 200k/min
 *  limit, so a handful of boards could exhaust the quota and every further check 429'd. */
function estimateCost(d: Dashboard, metrics: MetricSpec[], targets: RefreshableWidget[]): number {
  const targetCost = targets.reduce(
    (sum, w) => sum + (observationKindFor(w.block.type) ? 300 : 1200),
    0,
  );
  return 400 + metrics.length * 120 + targetCost + (d.prediction ? 150 : 0);
}

const BATCH_TOKEN_CEIL = 12_000;

/** Greedily pack due dashboards with something to fetch into one call, up to a sane token
 *  ceiling — ALWAYS takes at least one member (an expensive dashboard is never stuck perpetually
 *  due), and skips a dashboard with nothing live to check (that one is handled free elsewhere).
 *  Anything left over stays due for the next tick rather than growing this call unboundedly. */
export function buildRefreshBatch(due: Dashboard[]): RefreshBatchMember[] {
  const out: RefreshBatchMember[] = [];
  let tokens = 1200;
  for (const d of due) {
    const { metrics, targets } = liveTargets(d);
    if (metrics.length === 0 && targets.length === 0) continue;
    const cost = estimateCost(d, metrics, targets);
    if (out.length > 0 && tokens + cost > BATCH_TOKEN_CEIL) break;
    tokens += cost;
    out.push({ d, metrics, targets });
  }
  return out;
}

function roughAge(at: number, now: number): string {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

function dashboardSection(
  m: RefreshBatchMember,
  now: number,
  hintFor: (type: string) => string | null,
): string {
  const lines = [
    ...m.metrics.map(metricLine),
    ...m.targets.map((w, i) => widgetLine(w, i, hintFor(w.block.type))),
    ...(m.d.prediction
      ? [
          `- PREVIOUS EXPECTATION (made ${roughAge(m.d.prediction.at, now)}): "${m.d.prediction.text}" — grade it.`,
        ]
      : []),
  ];
  return `DASHBOARD ${m.d.id} "${m.d.title}"\n${lines.join('\n')}`;
}

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Pull each DASHBOARD's returned section out of the parsed response. Tolerates: the primary
 *  array shape (matched by echoed id, falling back to array POSITION when a model drops the id);
 *  an id-keyed object (some schema-constrained adapters drift toward this on a search turn, which
 *  forces prose parsing instead of the JSON schema); and — for the single-dashboard degenerate
 *  case — a flat, non-enveloped response (an older model habit, or a caller/test predating
 *  batching), treating the WHOLE parsed object as that one dashboard's section. */
function extractSections(
  parsedObj: Record<string, unknown>,
  members: RefreshBatchMember[],
): Record<string, Record<string, unknown>> {
  const raw = parsedObj.dashboards;
  if (raw === undefined && members.length === 1) {
    return { [members[0].d.id]: parsedObj };
  }
  const byId = new Map<string, Record<string, unknown>>();
  const byIndex: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const o = obj(item);
      byIndex.push(o);
      if (typeof o.id === 'string' && o.id) byId.set(o.id, o);
    }
  } else if (isPlainObj(raw)) {
    for (const [k, v] of Object.entries(raw)) byId.set(k, obj(v));
  }
  const out: Record<string, Record<string, unknown>> = {};
  members.forEach((m, i) => {
    out[m.d.id] = byId.get(m.d.id) ?? byIndex[i] ?? {};
  });
  return out;
}

function coerceDisagreement(v: unknown): DashboardRefreshResult['disagreement'] {
  const o = obj(v);
  if (typeof o.metricLabel !== 'string' || !o.metricLabel.trim()) return undefined;
  const readings = arr(o.readings).filter((r): r is string => typeof r === 'string' && !!r.trim());
  if (readings.length < 2) return undefined;
  return {
    metricLabel: o.metricLabel.trim(),
    readings,
    note: typeof o.note === 'string' ? o.note.trim().slice(0, 200) : '',
  };
}

/** A live-event window ONLY from real search — never invented. Clamped to ≤7 days so an obviously
 *  misread date can't park a dashboard on a bogus window for a week. */
function coerceLiveWindow(v: unknown): DashboardRefreshResult['liveWindow'] {
  const o = obj(v);
  const startAt = typeof o.start === 'string' ? Date.parse(o.start) : NaN;
  const endAt = typeof o.end === 'string' ? Date.parse(o.end) : NaN;
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return undefined;
  if (endAt - startAt > 7 * 24 * 60 * 60 * 1000) return undefined;
  return { startAt, endAt, label: typeof o.label === 'string' ? o.label.trim().slice(0, 60) : '' };
}

/** Appended to the system prompt for ONE in-pass retry when the first attempt parsed but never
 *  grounded (no native citations, no self-reported "sources") — a real dashboard has something
 *  live to fetch, so a genuinely searchless answer is worth one more push before it's discarded.
 *  Escalates the demand without loosening the "never invent a source" rule the base prompt
 *  already carries — the model still has an honest out (null values, no sources) if search truly
 *  turns up nothing. */
const GROUNDING_RETRY =
  ' YOUR PREVIOUS ATTEMPT DID NOT ACTUALLY SEARCH (no citations came back). Before answering ' +
  'this time, you MUST run a real web search for every DASHBOARD section above and report only ' +
  'what those searches returned, listing the real URLs relied on in "sources" — this is not ' +
  'optional. If search is genuinely unavailable or turns up nothing, return null values and ' +
  'omit "sources" entirely; never invent a value or a source just to satisfy this instruction.';

/** Fetch current real data for several dashboards at once — search-grounded metric values, rich
 *  (non-numeric) widget content, predictions/grades, and (optionally) the day's briefing — in ONE
 *  web-grounded model call. This is the cost core of the whole feature: one search-quota hit per
 *  tick covers every due dashboard (up to the batch ceiling), not one call each. Never fabricates
 *  anything; a bad or ungrounded call discards ALL trusted output for EVERY member, and one
 *  member's malformed section can't poison its siblings (each is coerced in isolation).
 *
 *  When the first attempt parses but never grounds — no native citations, no self-reported
 *  "sources" — and there's real live content on the line, this runs ONE more attempt with a
 *  sharpened system prompt (GROUNDING_RETRY) before giving up: a model that simply skipped its
 *  search tool once is common enough that discarding on the first miss made "checked" and
 *  "never actually looked" indistinguishable to the user. A briefing-only call (no members) has
 *  nothing to verify, so it never retries. */
export async function refreshDashboards(
  members: RefreshBatchMember[],
  cfg: ModelConfig,
  opts: { briefingContext?: string } = {},
): Promise<BatchRefreshResult> {
  const now = Date.now();
  const empty: BatchRefreshResult = {
    ok: true,
    grounded: false,
    perDashboard: {},
    sources: [],
    attempts: 0,
  };
  if (members.length === 0 && !opts.briefingContext) return empty;
  try {
    const adapter = getAdapter(cfg.provider);
    // ONLY block-path targets contribute here. A canonical target is answered as data and built
    // locally, so it needs no canvas schema — and declaring one has a consequence far beyond a few
    // wasted tokens: a non-empty `blockTypes` marks the request a CANVAS turn, which pins the
    // provider's reasoning effort to 'low', and web search does not engage reliably below 'medium'
    // (see openaiResponsesCompatible). A board whose targets were all canonical therefore asked for
    // live data and got an answer from training memory with an empty `sources` array — every value
    // correctly discarded by the grounding gate, one search billed, nothing shown.
    const blockTargets = members.flatMap((m) =>
      m.targets.filter((w) => !observationKindFor(w.block.type)),
    );
    const allowedTypes = new Set(blockTargets.flatMap(allowedTypesFor));
    const anyTargets = allowedTypes.size > 0;
    // The schema module both validates the answer AND teaches the question: each BLOCK line below
    // carries its type's exact prop shape from blockShapeHint. Without that, the model saw only the
    // type name plus "current content" — which on a never-filled board is an empty skeleton — so it
    // invented its own field names, and the validator then (correctly) rejected the very data the
    // search had just paid for. The board read "no new data" forever while every check grounded.
    const schema = anyTargets ? await import('../../engine/liveSchema') : null;
    const sections = members
      .map((m) => dashboardSection(m, now, schema ? schema.blockShapeHint : () => null))
      .join('\n\n');
    // Same explicit-schema discipline as before: omitting `format` on a blockTypes-bearing request
    // makes schema-constrained adapters (OpenAI/Anthropic/Grok) constrain to the canvas shape,
    // silently stripping every non-canvas field (values, expects, grade, …).
    const format = {
      type: 'object',
      properties: {
        dashboards: {
          type: 'array',
          description:
            'One object per DASHBOARD section above, in the same order, each echoing its id.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              values: {
                type: 'object',
                description: 'Map of VALUE label -> current numeric value, or null.',
              },
              observations: {
                type: 'array',
                description:
                  'Exactly one object per DATA item for this dashboard, in the same order, each in the exact shape that DATA line specifies.',
                items: { type: 'object' },
              },
              blocks: {
                type: 'array',
                description: 'Exactly one block per BLOCK item for this dashboard, in order.',
                items: {
                  type: 'object',
                  properties: { type: { type: 'string' }, props: { type: 'object' } },
                  required: ['type', 'props'],
                },
              },
              expects: {
                type: 'string',
                description:
                  'A short "by next check" expectation — omit if nothing here is genuinely predictable.',
              },
              grade: {
                type: 'object',
                description: 'ONLY when this dashboard has a PREVIOUS EXPECTATION line.',
                properties: { result: { type: 'string' }, note: { type: 'string' } },
              },
              disagreement: {
                type: 'object',
                description: 'ONLY when two real sources genuinely disagreed on a value.',
                properties: {
                  metricLabel: { type: 'string' },
                  readings: { type: 'array', items: { type: 'string' } },
                  note: { type: 'string' },
                },
              },
              liveWindow: {
                type: 'object',
                description: 'ONLY when search revealed a real, bounded live-event window.',
                properties: {
                  start: { type: 'string' },
                  end: { type: 'string' },
                  label: { type: 'string' },
                },
              },
            },
            required: ['id'],
          },
        },
        ...(opts.briefingContext
          ? {
              briefing: {
                type: 'string',
                description:
                  '2-4 sentences summarizing ALL dashboards (this batch + the given CONTEXT), real values only; use [[shown|said]] pronunciation twins for speech-risky terms.',
              },
            }
          : {}),
        sources: {
          type: 'array',
          description:
            'OMIT unless this call used web search. Real source URLs actually relied on — never invented.',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, url: { type: 'string' } },
            required: ['title', 'url'],
          },
        },
      },
      required: ['dashboards'],
    };
    // What we RESERVE, which is not the same as what we spend — providers bill
    // `input + max_output_tokens` against a per-minute quota, so an oversized reservation decides
    // how many checks fit in a minute even when the replies are tiny. Measured on a real four-board
    // batch: ~2.5k tokens of input, ~12k reserved, and a few hundred tokens actually returned. The
    // ceiling therefore drops sharply once every target answers with DATA rather than a rebuilt
    // component; a batch that still has to rebuild a component keeps the original headroom.
    const dataOnly = anyTargets === false;
    const maxTokens = Math.min(
      dataOnly ? 4_000 : 14_000,
      Math.max(
        dataOnly ? 1_500 : 3000,
        1200 +
          members.reduce((sum, m) => sum + estimateCost(m.d, m.metrics, m.targets), 0) +
          (opts.briefingContext ? 700 : 0),
      ),
    );
    const system =
      currentDateTimeLine() +
      ' You are checking several standing trackers at once. Return ONLY JSON: {"dashboards": ' +
      '[{"id": string, "values": {...}, "observations": [...], "blocks": [...], "expects"?: string, "grade"?: {...}, ' +
      '"disagreement"?: {...}, "liveWindow"?: {...}}, ...], ' +
      (opts.briefingContext ? '"briefing": string, ' : '') +
      '"sources": [...]}. Use web search for every DASHBOARD section below — never invent a ' +
      'value or detail. ECHO each dashboard\'s exact "id" so results map back correctly. For a ' +
      'VALUE item, give its CURRENT real number (no units) or null if unverifiable. For a BLOCK ' +
      'For a DATA item, return ONE object in "observations" (same order as the DATA lines) in the ' +
      'exact shape that line prints — plain data, no component or prop names, and omit the entry ' +
      'entirely rather than inventing a value you did not find. For a BLOCK ' +
      'item, produce exactly one block whose "type" is the EXACT bracketed type given — never ' +
      'substitute a different one — matching its current content for detail level (real names, ' +
      'numbers, dates). Where a BLOCK lists "expected props", copy that shape EXACTLY: the same ' +
      'field names, and an array shown as string[] takes plain strings, never objects. ' +
      'CRITICAL — a "current content" showing something live, in progress, or ' +
      'upcoming is NOT necessarily still true right now: explicitly check whether it has SINCE ' +
      'concluded and report the concluding outcome if so, reasoning from the date/time above ' +
      'which of upcoming/live/finished applies at this exact moment. If a dashboard has a ' +
      'PREVIOUS EXPECTATION line, grade it honestly ("hit" it came true, "miss" it did not, ' +
      '"unclear" if genuinely unknowable yet) — grade ONLY dashboards that have this line, never ' +
      'invent a grade otherwise. Offer a fresh "expects" only when something is genuinely ' +
      'predictable by the next check; most checks have nothing worth predicting, so omit it far ' +
      'more often than not. If two real sources genuinely disagree on a value, report it in ' +
      '"disagreement" instead of silently picking one. If search reveals a real bounded ' +
      "live-event window (a match's actual start/end time) for a dashboard, report it in " +
      '"liveWindow" with ISO start/end — never invent a time. ' +
      (opts.briefingContext
        ? 'Also compose "briefing": 2-4 warm, concrete sentences summarizing ALL dashboards — ' +
          'this batch PLUS the CONTEXT lines below (already-known values — do NOT search for ' +
          'those, use them as given) — real values only, never memory. The briefing is displayed ' +
          'and spoken: preserve normal spelling on the left, but wrap a name, place, brand, ' +
          'or borrowed term a voice would genuinely mispronounce as [[shown|said]] (for example ' +
          '[[Omakase|oh-mah-kah-seh]]). The said side must be lowercase voice-safe syllables ' +
          'matching a native/source-language pronunciation, never IPA or an Anglicized guess. ' +
          'Annotate sparingly — the said side is one you invent, so a wrong one makes the voice ' +
          'say a word WRONG. Ordinary English words and names are never annotated. '
        : '') +
      'If search genuinely turns up nothing more specific than what is already shown, say so ' +
      'honestly rather than inventing new specifics or repeating the old ones as if just ' +
      'confirmed. CITE SOURCES — every real URL actually relied on, in "sources"; omit it ' +
      'entirely if you used no search.';
    const user =
      `Use web search.\n\n${sections}` +
      (opts.briefingContext
        ? `\n\nCONTEXT (already known — do not search these):\n${opts.briefingContext}`
        : '');
    const runCall = (
      sharpen: boolean,
    ): Promise<{ rr: Awaited<ReturnType<typeof adapter.generate>>; grounded: boolean }> =>
      adapter
        .generate(
          {
            system: sharpen ? system + GROUNDING_RETRY : system,
            history: [],
            user,
            maxTokens,
            // First pass stays 'low' so providers that already ground well at low (Gemini, Anthropic)
            // are unchanged; the OpenAI adapter internally lifts a search-metric turn to 'medium' on
            // its own (web search is reasoning-gated on gpt-5.x — it doesn't engage reliably below
            // 'medium', the root cause of "couldn't verify"). Only the grounding retry escalates to
            // 'high' across every provider — a failed first check is exactly when it's worth thinking
            // (and searching) harder.
            temperature: 0.15,
            thinkingLevel: sharpen ? 'high' : 'low',
            // A dashboard check is the definition of a turn that is worthless ungrounded — the
            // engine discards every value from a call that did not cite a source. Require the
            // search rather than leaving it to the model's discretion.
            tools: { webSearch: true, requireSearch: true },
            format,
            ...(anyTargets ? { blockTypes: [...allowedTypes], complexity: 'brief' as const } : {}),
          },
          cfg,
        )
        .then((rr) => ({ rr, grounded: isGrounded(rr, obj(parseLooseJson(rr.raw))) }));

    let attempt = await runCall(false);
    let attempts = 1;
    // One retry, only when there's real live content on the line to verify — a call that never
    // grounded on the first try is common enough (the model skipped its search tool) that
    // discarding immediately made "checked" and "never actually looked" indistinguishable.
    if (!attempt.grounded && members.length > 0) {
      attempt = await runCall(true);
      attempts = 2;
    }
    const { rr } = attempt;
    const parsedObj = obj(parseLooseJson(rr.raw));
    const grounded = isGrounded(rr, parsedObj);
    const sectionsById = extractSections(parsedObj, members);
    // Declared before the per-member loop: an observation's receipts name the same sources the
    // pass reports, and reading them from one binding keeps those two from ever disagreeing.
    const sources = rr.sources && rr.sources.length ? rr.sources : selfReportedSources(parsedObj);
    // Deduped: three citations from fda.gov are one receipt saying fda.gov, not three.
    const receiptHosts = [...new Set(sources.map((src) => hostOf(src.url)).filter(Boolean))];
    const validateLiveResponse = schema ? schema.validateLiveResponse : null;

    const perDashboard: Record<string, DashboardRefreshResult> = {};
    for (const m of members) {
      const section = sectionsById[m.d.id] ?? {};
      const result = emptyDashboardResult();
      // Same "NO SOURCE, NO NUMBER" rule as before: an ungrounded call earns zero trusted values —
      // a bad number here can flip a real tripwire alert, the highest-stakes failure mode this
      // engine has. Discard rather than pick through it.
      if (grounded && m.metrics.length > 0) {
        const rawValues = obj(section.values);
        const byNorm = new Map(Object.entries(rawValues).map(([k, v]) => [normLabel(k), v]));
        for (const metric of m.metrics) {
          const n = toNumber(rawValues[metric.label] ?? byNorm.get(normLabel(metric.label)));
          if (n !== null) {
            result.values[metric.id] = { value: n, raw: valueWithUnit(String(n), metric.unit) };
          }
        }
      }
      if (m.targets.length > 0 && grounded) {
        // Canonical targets come back as DATA and are projected here — the model never named a
        // prop. Indexed by the same position the prompt used, so a reply that echoes the order (the
        // only thing it was asked to do) maps back without needing an id to survive the round trip.
        const rawObs = arr(section.observations ?? section.data);
        m.targets.forEach((target, i) => {
          const kind = observationKindFor(target.block.type);
          if (!kind) return;
          const data = coerceObservation(kind, rawObs[i]);
          if (!data) return;
          const prev = (target.block as unknown as { props?: Record<string, unknown> }).props ?? {};
          const metric = target.metricId
            ? m.d.metrics.find((x) => x.id === target.metricId)
            : undefined;
          const props = projectObservation(target.block.type, data, prev, metric?.unit);
          if (props) {
            result.widgets[target.id] = { ...target.block, props } as Block;
            // History goes to its own record, keyed by tracker — never into the whole-dashboard
            // blob this store rewrites on every write. Detached: a card renders from the value
            // already in memory, so nothing on screen waits on this landing.
            void saveObservation(m.d.id, target.id, data, now, receiptHosts);
          }
        });
      }
      if (m.targets.length > 0 && validateLiveResponse) {
        const rawBlocks = arr(section.blocks);
        m.targets.forEach((target, i) => {
          // A canonical target was already filled from its observation above — never ask the
          // block path to second-guess it.
          if (observationKindFor(target.block.type)) return;
          const rawBlock = rawBlocks[i];
          if (!rawBlock) return;
          // Validate each block in ISOLATION (a one-block envelope) — validateLiveResponse
          // enforces canvas-wide rules (e.g. at most one "insight" block) that are correct for a
          // single answer but wrong here: two unrelated widgets that both happen to be
          // insight-shaped must both refresh, not have the second one silently dropped.
          const single = validateLiveResponse(
            { narration: '', title: 'x', sub: '', blocks: [rawBlock] },
            new Set(allowedTypesFor(target)),
            1,
            grounded,
            // A standalone tile, not a canvas: composition-only floors (a list's two-item
            // minimum) don't apply — one sourced calendar entry is a complete, honest refresh.
            true,
          );
          const b = single?.blocks[0];
          // Never accept a type swap — a mismatched block is worse than leaving the old one.
          if (b && b.type === target.block.type) result.widgets[target.id] = b;
        });
      }
      if (grounded) {
        const expects = coerceExpects(section.expects);
        if (expects) result.expects = expects;
        if (m.d.prediction) {
          const grade = coerceGrade(section.grade);
          if (grade) result.grade = grade;
        }
        const disagreement = coerceDisagreement(section.disagreement);
        if (disagreement) result.disagreement = disagreement;
        const liveWindow = coerceLiveWindow(section.liveWindow);
        if (liveWindow) result.liveWindow = liveWindow;
      }
      perDashboard[m.d.id] = result;
    }

    // A parsed-but-empty result for EVERY member is the "the model answered but gave nothing
    // usable" case (didn't search, returned prose, used different label text, or genuinely wasn't
    // grounded) — worth logging once for the whole call. An individual dashboard coming back empty
    // is common and NOT logged (it just means nothing changed this check).
    const totallyEmpty = Object.values(perDashboard).every(
      (r) =>
        Object.keys(r.values).length === 0 && Object.keys(r.widgets).length === 0 && !r.expects,
    );
    if (totallyEmpty) {
      console.warn(
        `[dashboards] refreshDashboards got a response but nothing parsed out of it for any dashboard (${grounded ? 'empty/unparseable' : `ungrounded after ${attempts} attempt${attempts > 1 ? 's' : ''}, discarded`})`,
        { dashboardIds: members.map((m) => m.d.id), raw: rr.raw },
      );
    }

    const briefing =
      opts.briefingContext &&
      grounded &&
      typeof parsedObj.briefing === 'string' &&
      parsedObj.briefing.trim()
        ? parsedObj.briefing.trim()
        : undefined;

    return {
      ok: true,
      grounded,
      perDashboard,
      sources,
      attempts,
      ...(briefing ? { briefing } : {}),
    };
  } catch (err) {
    console.error('[dashboards] refreshDashboards failed', err);
    // ok:false is the loop's cue that the CALL itself died (network, 429, auth) — distinct from
    // "ran fine, found nothing new" — so it can retry soon instead of parking a full cadence.
    const perDashboard: Record<string, DashboardRefreshResult> = {};
    for (const m of members) perDashboard[m.d.id] = emptyDashboardResult();
    return {
      ok: false,
      grounded: false,
      perDashboard,
      sources: [],
      attempts: 0,
      failure: classifyProviderError(err),
    };
  }
}

/** Compatibility wrapper over the batched engine for a single dashboard — used by callers/tests
 *  predating batching. Prefer `refreshDashboards` for the real (multi-dashboard) refresh loop. */
export async function refreshDashboard(
  d: Dashboard,
  cfg: ModelConfig,
): Promise<{ values: FetchedValues; widgets: Record<string, Block>; ok: boolean }> {
  const batch = buildRefreshBatch([d]);
  if (batch.length === 0) return { values: {}, widgets: {}, ok: true };
  const result = await refreshDashboards(batch, cfg);
  const single = result.perDashboard[d.id] ?? emptyDashboardResult();
  return { values: single.values, widgets: single.widgets, ok: result.ok };
}
