// confirmAdd.ts — the add-time reality gate. A live-flavored tile only becomes part of someone's
// board once a REAL grounded read has come back FOR IT. Creation used to persist first and fire
// the first fetch blind — a metric the model invented (or one search can't actually answer) sat
// rendered as if it were fact until a refresh quietly failed. The probe IS the production
// refresh engine (web search on, "NO SOURCE, NO NUMBER", one grounding retry), so "confirmed"
// means exactly what the refresh loop will keep enforcing for the tile's whole life.
//
// Two subtleties the first cut of this gate got wrong, both now pinned by tests:
//   • The probe refreshes the WHOLE board, and its outcome says "something on the board grounded"
//     — on a fold into a healthy board, a pre-existing metric could carry the outcome while the
//     new tile got nothing. Confirmation is therefore checked per ADDED metric, not per pass.
//   • A pass already in flight may have snapshotted the board before this addition landed, so
//     "busy" is not confirmation of anything — the gate waits the slot out (bounded) and probes.
//
// Static content (no search-tracked metric, no refreshable widget) confirms immediately — there
// is nothing to ground, and a hand-typed board must never be blocked by a search hiccup.
import { getDashboard, removeDashboard, updateDashboard } from './store';
import { hasLiveContent } from './format';
import { appendLedger } from './ledger';
import { refreshDashboardNow } from './useDashboardLoop';
import type { Dashboard } from './types';

export type ConfirmOutcome = 'confirmed' | 'unverified' | 'no-model' | 'failed';

/** Shown only while the probe runs. A real web search is slow — tens of seconds is normal — and a
 *  button reading "Confirming live data…" for that long, with nothing else on screen, is
 *  indistinguishable from a hang. Say what it is doing, that it can be left, and where the answer
 *  turns up, so waiting is a choice rather than a guess. */
export const CONFIRM_WAIT_NOTE =
  'Checking a live source before this joins your board — a search can take up to a minute. You can close this; the result lands in your check log either way.';

/** The one honest line every blocked add shows. */
export function confirmFailureMessage(outcome: ConfirmOutcome): string {
  if (outcome === 'no-model')
    return 'Connect a model with an API key first — a tile only joins the board once a real search has confirmed it returns real data.';
  return "Couldn't confirm this with a live source, so it wasn't added — a tile only joins the board once a real search returns real data. Try again in a moment, or reword what to track.";
}

/** Snapshot of what a board held BEFORE a fold, so an unconfirmed addition can be rolled back
 *  without touching anything that was already there. Covers everything a fold writes: metrics,
 *  widgets, the tripwires bound to new metrics, and the "Added: …" provenance row. */
export interface BoardIds {
  metrics: Set<string>;
  widgets: Set<string>;
  tripwires: Set<string>;
  sources: Set<string>;
}

/** DashSource carries no id — the conversation + timestamp pair is its identity. */
const sourceKey = (s: Dashboard['sources'][number]): string => `${s.conversationId}@${s.at}`;

export function boardIds(d: Dashboard): BoardIds {
  return {
    metrics: new Set(d.metrics.map((m) => m.id)),
    widgets: new Set(d.widgets.map((w) => w.id)),
    tripwires: new Set(d.tripwires.map((t) => t.id)),
    sources: new Set(d.sources.map(sourceKey)),
  };
}

/** `before === null` means the whole dashboard is the addition (a fresh create — removed
 *  outright); otherwise everything that wasn't in `before` is stripped, so a failed fold leaves
 *  no orphaned alert rows or phantom "Added: …" lineage behind. */
function rollBack(id: string, before: BoardIds | null): void {
  if (before === null) {
    removeDashboard(id);
    return;
  }
  const cur = getDashboard(id);
  if (!cur) return;
  updateDashboard(id, {
    metrics: cur.metrics.filter((m) => before.metrics.has(m.id)),
    widgets: cur.widgets.filter((w) => before.widgets.has(w.id)),
    tripwires: cur.tripwires.filter((t) => before.tripwires.has(t.id)),
    sources: cur.sources.filter((s) => before.sources.has(sourceKey(s))),
  });
}

// A pass in flight typically lands in seconds; give it real room before giving up, polling
// cheaply — refreshDashboardNow answers 'busy' without spending anything while the slot is held.
const BUSY_POLL_MS = 1_500;
const BUSY_WAIT_MS = 45_000;
/** Bounded patience for a probe that FAILED outright — sized for a per-minute rate window that
 *  outlived the adapter's own retry-after retries; such a window drains within seconds. */
const FAILED_RETRIES = 2;
const FAILED_RETRY_MS = 10_000;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Did every search metric this addition brought in actually land a value? A blank-key metric is
 *  the user's own to fill, and an extraction can seed one from the cited conversation — both count
 *  as held data rather than an empty promise. */
function addedMetricsGrounded(id: string, before: BoardIds | null): boolean {
  const cur = getDashboard(id);
  const added = (cur?.metrics ?? []).filter((m) => !(before?.metrics.has(m.id) ?? false));
  return !added.some((m) => m.query.trim() !== '' && !m.blankKey && m.lastValue == null);
}

/** Why an addition was refused, in the words the check log should use. Distinct causes read very
 *  differently to someone deciding what to do next: an ungrounded search means reword or retry,
 *  while an unreachable model means fix the key — and logging both as "no live source" sent the
 *  reader to the wrong fix. */
const ROLLBACK_REASON: Record<Exclude<ConfirmOutcome, 'confirmed'>, string> = {
  unverified: 'no live source could confirm it returns real data',
  'no-model': 'no model was connected to check it with',
  failed: 'the model could not be reached to check it',
};

/** Undo the addition and say so where check outcomes already live. The sheet that started this may
 *  already be gone — it stays dismissible through a probe that can run for the better part of a
 *  minute, and its caller drops the inline error when the user has moved on — so a board that
 *  vanishes leaving no trace anywhere reads as lost data rather than as honesty. The probe's own
 *  pass ledgered whatever search it spent; this entry adds none. */
function rollBackAndLog<T extends Exclude<ConfirmOutcome, 'confirmed'>>(
  id: string,
  before: BoardIds | null,
  title: string,
  outcome: T,
): T {
  rollBack(id, before);
  const reason = ROLLBACK_REASON[outcome];
  appendLedger({
    kind: 'alert',
    text:
      before === null
        ? `“${title}” wasn’t added — ${reason}.`
        : `The addition to “${title}” was rolled back — ${reason}.`,
    dashboardIds: before === null ? [] : [id],
    searches: 0,
  });
  return outcome;
}

/**
 * Probe a just-persisted addition for real data, and ROLL IT BACK when the probe can't ground
 * every added search metric. Resolves 'confirmed' when the grounded read landed for each new
 * tile (or there was nothing live to ground).
 */
export async function confirmRealData(
  id: string,
  before: BoardIds | null,
): Promise<ConfirmOutcome> {
  const dash = getDashboard(id);
  if (!dash) return 'failed';
  if (!hasLiveContent(dash)) return 'confirmed';
  // Read the title BEFORE the probe: a rolled-back create no longer exists to be asked its name.
  const title = dash.title;

  const startedAt = Date.now();
  // One probe attempt, waiting out a busy slot. 'landed' means a CONCURRENT pass finished while we
  // waited: creating a board arms its first check, so the automatic loop usually claims this very
  // dashboard a beat before the gate can — and the pass it is running is the same grounded search
  // the gate wants. Waiting it out only to fire an identical second search cost the user two web
  // searches per addition; take the result that just landed instead, judged by exactly the same
  // rule as the gate's own pass.
  const probe = async (): Promise<Awaited<ReturnType<typeof refreshDashboardNow>> | 'landed'> => {
    let out = await refreshDashboardNow(id);
    for (let waited = 0; out === 'busy' && waited < BUSY_WAIT_MS; waited += BUSY_POLL_MS) {
      await delay(BUSY_POLL_MS);
      if ((getDashboard(id)?.lastRefreshedAt ?? 0) >= startedAt) return 'landed';
      out = await refreshDashboardNow(id);
    }
    return out;
  };

  let outcome = await probe();
  // A failed probe gets the same bounded patience a busy slot does. The adapter already absorbs a
  // rate limit that names a short retry-after; the failure that reaches here is the window that
  // OUTLIVED those retries — a per-minute token cap saturated by a burst — which drains on its own
  // in seconds. Rolling the board back over that read as "adding never works" when nothing was
  // wrong with the tracker at all. A hard failure (network down, revoked key) fails each retry
  // fast and spends nothing, so the extra patience costs a genuine error only seconds.
  for (let retry = 0; retry < FAILED_RETRIES && outcome === 'failed'; retry++) {
    await delay(FAILED_RETRY_MS);
    outcome = await probe();
  }

  // Pass-level grounding isn't tile-level. 'done' also covers a grounded no-change pass, so an
  // added metric search couldn't answer still shows itself here: its value never filled in.
  // (A blank-key metric is the user's to fill, and an extraction can seed a value from the
  // cited conversation — both count as held data, not an empty promise.)
  if ((outcome === 'done' || outcome === 'landed') && addedMetricsGrounded(id, before)) {
    return 'confirmed';
  }
  if (outcome === 'landed') return rollBackAndLog(id, before, title, 'unverified');
  // 'done' that got here means the pass ran but the added tile never filled — unverified, in the
  // only sense the reader cares about: nothing could stand behind it.
  return rollBackAndLog(
    id,
    before,
    title,
    outcome === 'no-model' || outcome === 'failed' ? outcome : 'unverified',
  );
}
