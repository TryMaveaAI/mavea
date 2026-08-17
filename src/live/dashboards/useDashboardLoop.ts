// useDashboardLoop — the honest, foreground update engine. Mounted by the Dashboards surface, it
// polls cheap clocks every 15s and, while Mavéa is open and at rest, batches every DUE dashboard
// (up to a token ceiling — see refresh.ts's buildRefreshBatch) into ONE combined web-grounded call:
// fetch real values + rich widget content + predictions/grades, re-evaluate tripwires
// deterministically (free), and fire the gated AI verdict only when a tripwire actually breaks or a
// schedule is due (shouldFireAi). A daily search budget (budget.ts, derived from the check ledger)
// pauses AUTOMATIC spend at the cap — manual actions are exempt and always work. Nothing runs while
// the tab is hidden or while a turn is in flight, and nothing spends without a connected model.
//
// refreshDashboardNow shares this same batched pipeline (as a batch of one) for the manual
// "Refresh now" action (DashboardDetail) — the one way to update a dashboard on 'manual' cadence,
// which otherwise never has a due clock at all (see cadence.ts's MAX_SAFE_INTEGER parking).
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ModelConfig } from '../../types/mavea';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import { setDataPending } from './dataPending';
import { withSchedulerLease } from './schedulerLease';
import { type CheckRun, endCheckRun, recordStep, startCheckRun } from './checkRun';
import { failureLine } from './trackerState';
import type { TrackerFailure } from './types';
import {
  applyRefreshResult,
  getDashboard,
  getDashboards,
  markAiRefreshed,
  markDataRetry,
  markTrackerFailure,
  markVerdictFailed,
  setVerdict,
  updateTripwireStates,
} from './store';
import {
  buildRefreshBatch,
  dueAiDashboard,
  dueDataDashboards,
  evalDashboard,
  refreshDashboards,
  shouldFireAi,
} from './refresh';
import type { BatchRefreshResult, DashboardRefreshResult, RefreshBatchMember } from './refresh';
import type { Dashboard, Tripwire, Verdict } from './types';
import { analyzeMove } from './analyze';
import { notifyTriggered } from './notify';
import { hasLiveContent, hostOf } from './format';
import { appendLedger, checksThisWeek, getLedger } from './ledger';
import type { LedgerEntry } from './ledger';
import { budgetState, getDashSettings } from './budget';
import { opensSince } from './opens';
import { runOptimizerOnce } from './optimizer';
import { disagreementInsight, runInsights } from './insights';
import { briefingNeededToday, buildBriefingContext, recordBriefing } from './briefing';
import { announceTripwireToast } from './dashboardEvents';

const TICK_MS = 15_000;
// How soon a FAILED fetch (network/429/auth — not "found nothing") gets another try. Short enough
// that a transient blip doesn't park an hourly dashboard stale, long enough not to hammer a
// rate-limited key every tick.
const RETRY_MS = 5 * 60_000;

/** When to try again after a call died, by WHY it died. One flat delay treated a five-second rate
 *  window and a revoked key identically: the window wasted four minutes of staleness, and the key
 *  burned a doomed call every five minutes forever. A provider that TOLD us when to come back is
 *  believed (bounded), because it knows and we are guessing. */
function retryDelayFor(failure: TrackerFailure | undefined, now: number): number {
  switch (failure?.kind) {
    case 'rate-limit':
      return failure.retryAt ? Math.max(15_000, failure.retryAt - now) : 60_000;
    case 'provider-unavailable':
      return 2 * 60_000;
    case 'auth':
      // Nothing here retries itself out of a rejected key. Park it on the normal cadence and let
      // the tracker card ask for a reconnect, rather than spending a doomed call every 5 minutes.
      return 6 * 60 * 60_000;
    default:
      return RETRY_MS;
  }
}

// Module-scope, not per-hook: the surface router (routes.ts) fully unmounts DashboardsApp on any
// hash change, so navigating away and back while a refresh/analyze is still in flight mounts a FRESH
// useDashboardLoop instance with its own (empty) `busy` ref. Without this shared set, that new
// instance's next tick sees the same dashboard(s) still "due" (clocks only advance once the
// original call resolves) and fires a second, overlapping billable call for them. The manual
// trigger (refreshDashboardNow) shares this SAME set so it can't race the automatic loop.
const inFlight = new Set<string>();

// A SIBLING set, not a reuse of `inFlight` above: `inFlight` covers the whole pass (data fetch +
// tripwire eval + verdict) and guards against a double-fire; this one exists only to drive a UI
// signal for the narrower "the verdict call itself is running" window, which starts well after
// `inFlight` does (only once the AI gate actually fires) and would otherwise read as pending during
// the unrelated data-fetch phase too.
const verdictPending = new Set<string>();
const VERDICT_PENDING_EVENT = 'mavea-dashboard-verdict-pending';

/** Flip the pending flag for one dashboard's verdict call and broadcast it, same idiom as
 *  store.ts's persist() — a same-tab CustomEvent a subscribed component re-renders on. */
function setVerdictPending(id: string, pending: boolean): void {
  if (pending) verdictPending.add(id);
  else verdictPending.delete(id);
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(VERDICT_PENDING_EVENT, { detail: id }));
    }
  } catch {
    /* non-browser env */
  }
}

function subscribeVerdictPending(onStoreChange: () => void): () => void {
  window.addEventListener(VERDICT_PENDING_EVENT, onStoreChange);
  return () => window.removeEventListener(VERDICT_PENDING_EVENT, onStoreChange);
}

/** Whether `id`'s dashboard has a verdict call in flight right now — drives the narrative card's
 *  "Mavéa is reading the latest numbers…" pending state, distinct from the manual "Refresh now"
 *  button's own spinner (that one covers the whole data+verdict pass; this one is just the verdict
 *  call). */
export function useVerdictPending(id: string): boolean {
  return useSyncExternalStore(
    subscribeVerdictPending,
    () => verdictPending.has(id),
    () => false,
  );
}

// The DATA-fetch pending flag (setDataPending, above import) lives in its own dataPending.ts —
// covers the fetch itself (dispatch → results applied), not just the narrower verdict-
// interpretation window `verdictPending` tracks — split out so eagerly-mounted consumers (the
// home grid's tiles) can subscribe via useDataPending without reaching this module's heavy
// refresh/provider chain. Re-exported here for callers that already import from this module.
export { useDataPending } from './dataPending';

/** A deterministic, human-readable summary of what a batched check found — built ONLY from real
 *  fetched values (never the model's own prose), so the check-log rail is trustworthy even when a
 *  call returns nothing useful for a given member. */
function buildCheckText(members: RefreshBatchMember[], batch: BatchRefreshResult): string {
  const fragments = members.map((m) => {
    const result = batch.perDashboard[m.d.id] ?? { values: {}, widgets: {} };
    const updatedMetric = m.metrics.find((metric) => result.values[metric.id]);
    if (updatedMetric) return `${m.d.title} at ${result.values[updatedMetric.id].raw}`;
    if (m.targets.some((w) => result.widgets[w.id])) return `${m.d.title} updated`;
    // Nothing landed AND the call never grounded — the attempt happened but couldn't be verified
    // against real sources, distinct from a grounded check that genuinely found nothing new.
    if (!batch.grounded) return `${m.d.title} — couldn't verify`;
    return `${m.d.title} checked`;
  });
  return fragments.join(' · ');
}

const PAUSE_TEXT =
  'Daily search budget reached — auto-checks paused until midnight. Manual checks still work.';

function localMidnightOf(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** At most one pause notice per local day — the pause is a standing state, not a per-tick event. */
function maybeAppendPauseEntry(now: number): void {
  const todayStart = localMidnightOf(now);
  const already = getLedger().some(
    (e) => e.kind === 'savings' && e.at >= todayStart && e.text === PAUSE_TEXT,
  );
  if (already) return;
  appendLedger({ kind: 'savings', text: PAUSE_TEXT, dashboardIds: [], searches: 0 });
}

/** Apply one member's batched result: values/blocks/tripwires/outcome/prediction land in ONE
 *  persist (applyRefreshResult), tripwires are evaluated against the FETCHED values (not a
 *  re-read — nothing has landed in the store yet), and the AI verdict fires only through the same
 *  gate as before. Shared by the automatic batch and the manual (batch-of-one) path.
 *
 *  `unverified` is the batch-level "this call never grounded in real search" signal (refresh.ts,
 *  after its own in-pass retry already failed) — it only demotes an otherwise-empty result: a
 *  member that DID find something (a metric value, a widget block that survived validation) is
 *  still 'updated' regardless, since it's possible for isolated widget content to pass through an
 *  ungrounded call while values don't (refresh.ts gates values on `grounded` explicitly; blocks
 *  go through validateLiveResponse's own per-field honesty gate). Only a genuinely empty pass
 *  reads as "couldn't verify" instead of the misleading "checked — no new data". */
async function applyMemberResult(
  member: RefreshBatchMember,
  result: DashboardRefreshResult,
  prevValues: Record<string, number | null>,
  cfg: ModelConfig,
  ready: boolean,
  now: number,
  unverified = false,
): Promise<'updated' | 'no-change' | 'unverified'> {
  const { d } = member;
  const foundSomething =
    Object.keys(result.values).length > 0 || Object.keys(result.widgets).length > 0;
  const outcome: 'updated' | 'no-change' | 'unverified' = foundSomething
    ? 'updated'
    : unverified
      ? 'unverified'
      : 'no-change';

  // A virtual post-fetch metrics view (not yet persisted) so tripwire eval can compare the FETCHED
  // values honestly, the same way the old single-dashboard path did via a real re-read after write.
  const mergedMetrics = d.metrics.map((m) => {
    const v = result.values[m.id];
    return v ? { ...m, lastValue: v.value } : m;
  });
  const virtual: Dashboard = { ...d, metrics: mergedMetrics };
  const { tripwires, newlyTriggered } = evalDashboard(virtual, prevValues);

  const consumedOneShot = d.oneShotAt !== undefined && d.oneShotAt <= now;
  applyRefreshResult(
    d.id,
    {
      values: Object.entries(result.values).map(([metricId, v]) => ({
        metricId,
        value: v.value,
        raw: v.raw,
        origin: 'search' as const,
      })),
      blocks: Object.entries(result.widgets).map(([widgetId, block]) => ({ widgetId, block })),
      tripwires,
      outcome,
      ...(result.expects ? { expects: result.expects } : {}),
      ...(result.grade ? { grade: result.grade } : {}),
      ...(consumedOneShot ? { consumedOneShot: true } : {}),
    },
    now,
  );

  // Out-of-app alerts (push) + the free "a line was crossed" ledger note are deterministic — no
  // model required, and the in-pass `newlyTriggered` set guarantees one of each per real move. The
  // transient in-app toast is the one piece the user can switch off (alerts.inApp); the ledger entry
  // and the dashboard's own alert list stay unconditional (they're status, not a pop-up).
  if (newlyTriggered.length) {
    notifyTriggered(virtual, newlyTriggered);
    appendLedger({
      kind: 'alert',
      text: `${newlyTriggered.map((t) => t.label).join(', ')} crossed the line you set.`,
      dashboardIds: [d.id],
      searches: 0,
    });
    if (virtual.alerts.inApp) {
      announceTripwireToast({
        dashboardId: d.id,
        dashboardTitle: d.title,
        tripwireLabel: newlyTriggered[0].label,
      });
    }
  }

  // A model-reported source disagreement is passed through verbatim — it only ever arrives on a
  // grounded call, so no extra honesty gate is needed here (refresh.ts already applies one).
  if (result.disagreement) {
    appendLedger({
      kind: 'insight',
      text: disagreementInsight(d, result.disagreement).text,
      dashboardIds: [d.id],
      searches: 0,
    });
  }

  const gated = { ...d, tripwires };
  const gate = shouldFireAi(gated, newlyTriggered, now);
  if (gate.fire && gate.trigger && ready) {
    // analyzeMove catches internally and never throws, so no try/finally is needed to reset the
    // pending flag on failure — it always resolves.
    setVerdictPending(d.id, true);
    const verdict = await analyzeMove(gated, gate.trigger, cfg, now);
    setVerdictPending(d.id, false);
    if (verdict) setVerdict(d.id, verdict, now);
    else markVerdictFailed(d.id, now, "Mavéa couldn't get a fresh read — will try again.");
    markAiRefreshed(d.id, now);
    appendLedger({
      kind: gate.trigger === 'scheduled' ? 'check' : 'alert',
      text: verdict ? verdict.text.slice(0, 200) : `Couldn't get a fresh read on ${d.title}.`,
      dashboardIds: [d.id],
      searches: 1,
      ...(verdict?.sources?.length ? { sourceCount: verdict.sources.length } : {}),
    });
  } else if (gate.fire && gate.trigger) {
    // No model to interpret the break — still wind the AI clock so we don't retry every tick.
    markAiRefreshed(d.id, now);
  }
  return outcome;
}

/** Run one batched refresh pass over `due` — the automatic tick's whole selection, or a single
 *  dashboard for the manual trigger. Returns each member's outcome, keyed by dashboard id.
 *  `opts.manual` marks the resulting ledger entry as user-triggered (budget-exempt; the CALLER
 *  is responsible for never invoking this from an auto-selected, budget-paused dashboard — this
 *  function itself doesn't consult the budget, since a manual call must never be blocked by it).
 *  Exported for tests — the no-key contract (below) is worth pinning without mounting the React
 *  effect. */
export async function runRefreshBatch(
  due: Dashboard[],
  cfg: ModelConfig,
  ready: boolean,
  opts: {
    manual?: boolean;
    /** Folds the day's briefing into this call, for free — only ever set from the automatic tick
     *  (never a manual refresh). `allDashboards` is needed to compose CONTEXT lines for dashboards
     *  outside this batch and to build the client-side chips once the briefing lands. */
    briefing?: { context: string; allDashboards: Dashboard[] };
  } = {},
): Promise<Record<string, 'updated' | 'no-change' | 'unverified' | 'failed'>> {
  const now = Date.now();
  const outcomes: Record<string, 'updated' | 'no-change' | 'unverified' | 'failed'> = {};
  const members = buildRefreshBatch(due);
  const noContent = due.filter((d) => !members.some((m) => m.d.id === d.id));

  const prevByDashboard: Record<string, Record<string, number | null>> = {};
  for (const d of due) {
    prevByDashboard[d.id] = Object.fromEntries(d.metrics.map((mm) => [mm.id, mm.lastValue]));
  }

  // Nothing live to FETCH — free, no model call for the data itself — but still run the same
  // tripwire/AI-gate pass every dashboard gets: a due SCHEDULED verdict (or a smart-trigger break
  // on a purely user-supplied metric) must not silently no-op just because there was nothing to
  // search for. No 'check' ledger entry (no data call happened); the AI gate logs its own if it fires.
  for (const d of noContent) {
    outcomes[d.id] = await applyMemberResult(
      { d, metrics: [], targets: [] },
      { values: {}, widgets: {} },
      prevByDashboard[d.id],
      cfg,
      ready,
      now,
    );
  }
  if (members.length === 0) return outcomes;

  // One flight recorder per member: a batched call is one provider request, but each tracker gets
  // its own readable story of what that request did FOR IT.
  const recorders = new Map(members.map((m) => [m.d.id, startCheckRun(m.d.id, now)]));
  const eachRun = (fn: (run: CheckRun) => void): void => {
    for (const run of recorders.values()) fn(run);
  };

  if (!ready) {
    // No model connected — leave every live-content member fully DUE: no fetch attempted, so no
    // clock/one-shot/lastRefreshedAt is touched. The old behavior ran a fetch-free "no-change"
    // pass here, which stamped `lastRefreshedAt` and wound a FULL cadence — telling the user
    // "checked, nothing new" about a dashboard that was never actually queried, and silently
    // consuming the durable first-check one-shot every fresh dashboard now carries (see
    // ensureFirstCheck) before it ever got a real chance to fire. Leaving members untouched means
    // the moment a model IS connected, the next tick (or the visibilitychange catch-up) fetches
    // for real instead of waiting out a cadence that was never earned.
    return outcomes;
  }

  const memberIds = members.map((m) => m.d.id);
  setDataPending(memberIds, true);
  try {
    const batchResult = await refreshDashboards(
      members,
      cfg,
      opts.briefing ? { briefingContext: opts.briefing.context } : {},
    );

    if (!batchResult.ok) {
      // The CALL died (network/quota/auth). Don't stamp lastRefreshedAt — no member was checked —
      // and retry soon instead of parking a full cadence on a transient failure. The briefing gate
      // stays open too (markBriefingShown only ever fires from recordBriefing, on success).
      const failure = batchResult.failure ?? { kind: 'network' as const };
      const retryIn = retryDelayFor(batchResult.failure, now);
      eachRun((run) => {
        recordStep(run, 'search', false, { detail: failureLine(failure) });
        endCheckRun(run, { outcome: 'failed', failure, attempts: batchResult.attempts });
      });
      for (const m of members) {
        markDataRetry(m.d.id, now + retryIn);
        // Say WHICH way it died on the tracker itself, so the card can offer the matching next
        // step instead of a generic "couldn't verify" the reader can do nothing with.
        markTrackerFailure(m.d.id, failure, now);
        outcomes[m.d.id] = 'failed';
      }
      return outcomes;
    }

    for (const m of members) {
      const result = batchResult.perDashboard[m.d.id] ?? { values: {}, widgets: {} };
      const run = recorders.get(m.d.id) ?? null;
      // The steps that actually explain a check, in the order they happened: the call returned, it
      // did (or did not) bring sources, and this much of THIS tracker's content came out of it.
      recordStep(run, 'search', true, { count: batchResult.attempts });
      recordStep(run, 'sources', batchResult.sources.length > 0, {
        count: batchResult.sources.length,
        ...(batchResult.sources.length === 0
          ? { detail: 'The model answered without citing a live source.' }
          : {}),
      });
      const extracted = Object.keys(result.values).length + Object.keys(result.widgets).length;
      recordStep(run, 'extraction', extracted > 0, {
        count: extracted,
        ...(extracted === 0
          ? { detail: 'Nothing in the reply matched this tracker’s metrics or cards.' }
          : {}),
      });
      recordStep(run, 'grounding', batchResult.grounded, {
        ...(batchResult.grounded
          ? {}
          : { detail: 'Ungrounded — every value from it was discarded.' }),
      });

      outcomes[m.d.id] = await applyMemberResult(
        m,
        result,
        prevByDashboard[m.d.id],
        cfg,
        ready,
        now,
        !batchResult.grounded,
      );

      const outcome = outcomes[m.d.id];
      recordStep(run, 'saved', outcome === 'updated' || outcome === 'no-change');
      recordStep(run, 'tripwires', true);
      endCheckRun(run, {
        outcome: outcome === 'failed' ? 'failed' : outcome,
        attempts: batchResult.attempts,
        ...(outcome === 'unverified' ? { failure: { kind: 'ungrounded' as const } } : {}),
      });
    }

    if (opts.briefing && batchResult.briefing) {
      recordBriefing(batchResult.briefing, opts.briefing.allDashboards, now);
      appendLedger({
        kind: 'briefing',
        text: 'Morning briefing compiled — folded into this batched search.',
        dashboardIds: members.map((m) => m.d.id),
        searches: 0,
      });
    }

    // ONE ledger entry for the whole batched call — the point of batching. `searches` stays 1 even
    // when refresh.ts's grounding retry spent a second provider call: the ledger's unit is one
    // user-facing CHECK, not a raw call count — the same reason a single call covering 4 batched
    // dashboards is also logged as 1, not 4. The retry is an internal reliability mechanic for this
    // one check, not a second check.
    const domains = [...new Set(batchResult.sources.map((s) => hostOf(s.url)))].filter(Boolean);
    appendLedger({
      kind: 'check',
      text: buildCheckText(members, batchResult),
      dashboardIds: members.map((m) => m.d.id),
      ...(domains.length ? { domains } : {}),
      searches: 1,
      ...(batchResult.sources.length ? { sourceCount: batchResult.sources.length } : {}),
      ...(opts.manual ? { manual: true } : {}),
    });

    return outcomes;
  } finally {
    setDataPending(memberIds, false);
  }
}

/** Re-evaluate + gate ONE dashboard with no data fetch at all — the AI-schedule-only tick, when
 *  nothing is data-due but a scheduled/smart-trigger verdict clock has lapsed on its own. Nothing
 *  changed since nothing fetched, so this only ever matters for the SCHEDULED branch of
 *  shouldFireAi (a fresh tripwire transition can't happen without a fetch). */
async function runVerdictOnly(
  target: Dashboard,
  cfg: ModelConfig,
  ready: boolean,
  now: number,
): Promise<void> {
  const { tripwires, newlyTriggered } = evalDashboard(target);
  updateTripwireStates(target.id, tripwires, now);
  if (newlyTriggered.length) {
    notifyTriggered(target, newlyTriggered);
    if (target.alerts.inApp) {
      announceTripwireToast({
        dashboardId: target.id,
        dashboardTitle: target.title,
        tripwireLabel: newlyTriggered[0].label,
      });
    }
  }
  const gated = { ...target, tripwires };
  const gate = shouldFireAi(gated, newlyTriggered, now);
  if (!gate.fire || !gate.trigger) return;
  if (!ready) return; // nothing to attempt without a model; the schedule stays due
  setVerdictPending(target.id, true);
  const verdict = await analyzeMove(gated, gate.trigger, cfg, now);
  setVerdictPending(target.id, false);
  if (verdict) setVerdict(target.id, verdict, now);
  else markVerdictFailed(target.id, now, "Mavéa couldn't get a fresh read — will try again.");
  markAiRefreshed(target.id, now);
  appendLedger({
    kind: gate.trigger === 'scheduled' ? 'check' : 'alert',
    text: verdict ? verdict.text.slice(0, 200) : `Couldn't get a fresh read on ${target.title}.`,
    dashboardIds: [target.id],
    searches: 1,
    ...(verdict?.sources?.length ? { sourceCount: verdict.sources.length } : {}),
  });
}

/** Manually refresh one dashboard right now, regardless of its cadence's due clock — the only way to
 *  update a dashboard on 'manual' cadence, and a way to force a fresher read on any other cadence
 *  without waiting out the clock. Guarded by the same `inFlight` set as the automatic loop so the two
 *  can never double-fire a billable call for the same dashboard. Always budget-exempt — a user
 *  tapping "Check now" is never blocked by the daily automatic-spend cap. */
export async function refreshDashboardNow(
  id: string,
): Promise<'done' | 'busy' | 'no-model' | 'failed' | 'unverified'> {
  if (inFlight.has(id)) return 'busy';
  const target = getDashboard(id);
  if (!target) return 'busy';
  const cfg = toModelConfig(getLiveConfigV2());
  if (!cfg.apiKey) return 'no-model';
  inFlight.add(id);
  try {
    const outcomes = await runRefreshBatch([target], cfg, true, { manual: true });
    // 'unverified' surfaces as itself, never collapsed into 'done': the add-time reality gate
    // and the manual Refresh button both need to know that the pass produced no sourced data
    // (the engine already discarded the numbers; this is the caller-visible half of that).
    if (outcomes[id] === 'failed') return 'failed';
    if (outcomes[id] === 'unverified') return 'unverified';
    return 'done';
  } finally {
    inFlight.delete(id);
  }
}

/** Manually refresh every live-content dashboard right now — the home grid's "Check all", for a
 *  manual-first world where nothing checks itself unless asked. Chunks through the SAME greedy
 *  packing the automatic tick uses (buildRefreshBatch) round by round, rather than handing
 *  everything to one runRefreshBatch call: that function treats anything NOT selected into its
 *  own internal batch as "nothing live to fetch" and gives it a free tripwire-only pass — fine for
 *  a genuinely content-free dashboard, but it would silently skip the DATA fetch for one that
 *  simply didn't fit this call's token ceiling. Pre-chunking here means every round's `due` list
 *  is exactly what that round's batch covers, so nothing gets marked "checked" without a real
 *  attempt. Budget-exempt like every other manual action. */
export async function checkAllDashboardsNow(): Promise<'done' | 'no-model' | 'busy' | 'failed'> {
  const cfg = toModelConfig(getLiveConfigV2());
  if (!cfg.apiKey) return 'no-model';
  const liveContent = getDashboards().filter(hasLiveContent);
  let remaining = liveContent.filter((d) => !inFlight.has(d.id));
  // Nothing to do at all reads as 'done'; everything that COULD be checked already mid-flight
  // (another manual check, or the automatic tick) reads as 'busy' — the caller's cue to just wait.
  if (remaining.length === 0) return liveContent.length > 0 ? 'busy' : 'done';
  while (remaining.length > 0) {
    const batch = buildRefreshBatch(remaining);
    if (batch.length === 0) break;
    const ids = batch.map((m) => m.d.id);
    ids.forEach((id) => inFlight.add(id));
    let outcomes: Record<string, string> = {};
    try {
      outcomes = await runRefreshBatch(
        batch.map((m) => m.d),
        cfg,
        true,
        { manual: true },
      );
    } finally {
      ids.forEach((id) => inFlight.delete(id));
    }
    // A round where EVERY member died is a provider-level wall, not bad luck on one board — a
    // saturated per-minute token quota being the ordinary case, since a board count high enough to
    // need several rounds is exactly what saturates it. Firing the remaining rounds into that same
    // window spends the user's quota to collect identical failures (observed: three rounds, three
    // identical 429s, nothing checked). Stop and let them retry once the window clears.
    if (ids.length > 0 && ids.every((id) => outcomes[id] === 'failed')) return 'failed';
    remaining = remaining.filter((d) => !ids.includes(d.id));
  }
  return 'done';
}

/** Ask Mavéa to read the latest numbers right now — the on-demand trigger for the AI read, run
 *  DIRECTLY (never through shouldFireAi's gate), so a user can always see it fire. Reuses the exact
 *  verdict trio the automatic loop uses (setVerdictPending → analyzeMove → setVerdict/markVerdictFailed),
 *  is budget-exempt by construction (it never consults budgetState), and tags the read to a
 *  currently-breached line if there is one so the card can say what it's about. Guarded by
 *  `verdictPending` so a manual read and an automatic verdict can't run over each other. */
export async function readDashboardNow(
  id: string,
): Promise<'done' | 'busy' | 'no-model' | 'failed'> {
  if (verdictPending.has(id)) return 'busy';
  const target = getDashboard(id);
  if (!target) return 'failed';
  const cfg = toModelConfig(getLiveConfigV2());
  if (!cfg.apiKey) return 'no-model';
  const now = Date.now();
  const breached = target.tripwires.find((t) => t.state === 'TRIGGERED');
  const trigger: Tripwire | 'scheduled' = breached ?? 'scheduled';
  setVerdictPending(id, true);
  let verdict: Verdict | null;
  try {
    verdict = await analyzeMove(target, trigger, cfg, now); // never throws → null on failure
  } finally {
    setVerdictPending(id, false);
  }
  if (verdict) setVerdict(id, verdict, now);
  else markVerdictFailed(id, now, 'Mavéa couldn’t get a fresh read — try again in a moment.');
  markAiRefreshed(id, now); // wind the AI clock, mirroring how refreshDashboardNow winds the data clock
  appendLedger({
    kind: breached ? 'alert' : 'check',
    text: verdict ? verdict.text.slice(0, 200) : `Couldn’t get a fresh read on ${target.title}.`,
    dashboardIds: [id],
    searches: 1,
    manual: true,
    ...(verdict?.sources?.length ? { sourceCount: verdict.sources.length } : {}),
  });
  return verdict ? 'done' : 'failed';
}

export interface TickTargets {
  dueData: Dashboard[];
  dueAi: Dashboard | null;
  /** True when the budget cap actually excluded something this tick — the caller's cue to log the
   *  once-per-day pause notice. False on a tick where nothing would have spent anyway. */
  pausedAndBlocked: boolean;
}

/** Pure target selection for one tick — which dashboards are data-due (up to the batch ceiling)
 *  and which single dashboard (if any) is AI-schedule-due, after applying the in-flight guard,
 *  the daily budget pause, and de-duplicating an AI-due dashboard that's already covered by this
 *  tick's data batch (its AI gate is evaluated inline there — see applyMemberResult). Exported
 *  standalone so the gating logic is unit-testable without mounting the React effect/timers. */
export function selectTickTargets(
  all: Dashboard[],
  ledger: LedgerEntry[],
  dailyBudget: number,
  now: number,
  inFlightIds: Set<string>,
): TickTargets {
  let dueData = dueDataDashboards(all, now).filter((d) => !inFlightIds.has(d.id));
  let dueAi = dueAiDashboard(all, now);
  if (dueAi && inFlightIds.has(dueAi.id)) dueAi = null;

  const budget = budgetState(ledger, dailyBudget, now);
  let pausedAndBlocked = false;
  if (budget.paused) {
    // Auto spend pauses at the cap — a dashboard with only user-supplied content was never going
    // to spend anyway, so it still gets its free "no-change" clock wind. Manual actions
    // (refreshDashboardNow) never reach this gate at all.
    pausedAndBlocked = dueData.some(hasLiveContent) || !!dueAi;
    dueData = dueData.filter((d) => !hasLiveContent(d));
    dueAi = null;
  }

  // A dashboard already covered by this tick's data batch has its own AI-gate evaluated inline —
  // never double-fire it via the separate schedule-only path.
  const members = buildRefreshBatch(dueData);
  if (dueAi && members.some((m) => m.d.id === dueAi!.id)) dueAi = null;

  return { dueData, dueAi, pausedAndBlocked };
}

export function useDashboardLoop(): void {
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;

    const tick = async (): Promise<void> => {
      if (busy.current || !alive) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const cfg = toModelConfig(getLiveConfigV2());
      const ready = !!cfg.apiKey;
      const now = Date.now();
      const all = getDashboards();
      const settings = getDashSettings();
      const ledger = getLedger();

      // Zero-cost, so safe to call unconditionally — its own once-per-day gate no-ops instantly
      // on every other tick.
      runOptimizerOnce(
        all,
        ledger,
        (id) => checksThisWeek(ledger, id, now),
        (id) => opensSince(id, now - 7 * 24 * 60 * 60 * 1000, now),
        now,
      );

      // Same free/zero-cost sweep, deduped against the ledger so a persisting condition (a
      // flatlined metric, an active window overlap) doesn't re-log every 15s.
      for (const draft of runInsights(all, ledger, now)) {
        appendLedger({
          kind: 'insight',
          text: draft.text,
          dashboardIds: draft.dashboardIds,
          searches: 0,
        });
      }

      const { dueData, dueAi, pausedAndBlocked } = selectTickTargets(
        all,
        ledger,
        settings.dailySearchBudget,
        now,
        inFlight,
      );
      if (pausedAndBlocked) maybeAppendPauseEntry(now);

      const wantsBriefing = ready && settings.briefingEnabled && briefingNeededToday(now);

      if (dueData.length === 0 && !dueAi) {
        // Nothing due at all this tick — the ONE case worth a narrow standalone briefing call:
        // when NO dashboard has live content, a batch will never happen to fold into, so the
        // briefing would otherwise never compose. Real cost, honestly ledgered.
        if (wantsBriefing && !all.some(hasLiveContent)) {
          const context = buildBriefingContext(all, new Set());
          if (context) {
            const result = await refreshDashboards([], cfg, { briefingContext: context });
            if (result.briefing) {
              recordBriefing(result.briefing, all, now);
              appendLedger({
                kind: 'briefing',
                text: 'Morning briefing compiled.',
                dashboardIds: [],
                searches: 1,
              });
            }
          }
        }
        return;
      }

      busy.current = true;
      dueData.forEach((d) => inFlight.add(d.id));
      if (dueAi) inFlight.add(dueAi.id);
      try {
        if (dueData.length > 0) {
          const briefing = wantsBriefing
            ? {
                context: buildBriefingContext(
                  all,
                  new Set(buildRefreshBatch(dueData).map((m) => m.d.id)),
                ),
                allDashboards: all,
              }
            : undefined;
          await runRefreshBatch(dueData, cfg, ready, briefing ? { briefing } : {});
        }
        if (dueAi) await runVerdictOnly(dueAi, cfg, ready, now);
      } finally {
        dueData.forEach((d) => inFlight.delete(d.id));
        if (dueAi) inFlight.delete(dueAi.id);
        busy.current = false;
      }
    };

    // Every AUTOMATIC entry point goes through the lease, so exactly one tab spends no matter how
    // many are open. Manual actions (Check now, Check all) deliberately bypass it — see
    // schedulerLease.ts.
    // The catch is load-bearing, not defensive noise: this is fire-and-forget, so a throw escaping
    // here is an unhandled rejection — and the interval keeps firing into the same broken state
    // with nothing on screen or in the console to say why.
    const leasedTick = (): void => {
      void withSchedulerLease(tick).catch((err) => {
        console.error('[dashboards] scheduled tick failed', err);
      });
    };
    const interval = window.setInterval(leasedTick, TICK_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') leasedTick();
    };
    document.addEventListener('visibilitychange', onVisible);
    leasedTick(); // catch anything already due on open

    return () => {
      alive = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
