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
import { refreshDashboardNow } from './useDashboardLoop';
import type { Dashboard } from './types';

export type ConfirmOutcome = 'confirmed' | 'unverified' | 'no-model' | 'failed';

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
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

  let outcome = await refreshDashboardNow(id);
  for (let waited = 0; outcome === 'busy' && waited < BUSY_WAIT_MS; waited += BUSY_POLL_MS) {
    await delay(BUSY_POLL_MS);
    outcome = await refreshDashboardNow(id);
  }
  if (outcome === 'done') {
    // Pass-level grounding isn't tile-level. 'done' also covers a grounded no-change pass, so an
    // added metric search couldn't answer still shows itself here: its value never filled in.
    // (A blank-key metric is the user's to fill, and an extraction can seed a value from the
    // cited conversation — both count as held data, not an empty promise.)
    const cur = getDashboard(id);
    const added = (cur?.metrics ?? []).filter((m) => !(before?.metrics.has(m.id) ?? false));
    const empty = added.filter((m) => m.query.trim() !== '' && !m.blankKey && m.lastValue == null);
    if (empty.length === 0) return 'confirmed';
  }
  rollBack(id, before);
  if (outcome === 'no-model') return 'no-model';
  if (outcome === 'failed') return 'failed';
  return 'unverified';
}
