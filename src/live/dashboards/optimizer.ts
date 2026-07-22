// dashboards/optimizer.ts — the cadence optimizer: "you check this hourly but only opened it
// twice this week — drop to daily?" Zero model cost, always. Every input is real: check counts
// come from the ledger (real grounded calls already paid for), open counts from real detail-page
// visits, and the projected savings is always an extrapolation from THOSE observed counts over
// the last 7 days — never a theoretical 24/7 rate, never invented. A user applying (or dismissing)
// the suggestion is the only thing that changes anything; the optimizer itself only proposes.
import { DATA_CADENCE_MIN } from './cadence';
import { hasLiveContent } from './format';
import { appendLedger, setSuggestionState } from './ledger';
import type { LedgerEntry, LedgerSuggestion } from './ledger';
import { updateCadence } from './store';
import type { Dashboard, DataCadenceMode } from './types';

const MIN_CHECKS_FOR_SUGGESTION = 14;
const MAX_OPENS_FOR_SUGGESTION = 2;
/** Don't re-suggest (or re-consider) a dashboard the user already saw a suggestion for recently,
 *  whether they applied it or dismissed it — a fresh nag every day would be the opposite of the
 *  "Mavéa proactively saves you money" trust signal this feature is for. */
const SUGGESTION_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const STEP_DOWN: Partial<Record<DataCadenceMode, (opens7d: number) => DataCadenceMode>> = {
  '15min': () => 'hourly',
  hourly: (opens7d) => (opens7d === 0 ? 'daily' : '6h'),
};

function cadenceLabel(mode: DataCadenceMode): string {
  switch (mode) {
    case '15min':
      return 'every 15 min';
    case 'hourly':
      return 'hourly';
    case '6h':
      return 'every 6 hours';
    case 'daily':
      return 'daily';
    case 'manual':
      return 'manual';
  }
}

export interface CadenceSuggestion {
  dashboardId: string;
  to: DataCadenceMode;
  savesPerMonth: number;
  checks7d: number;
  opens7d: number;
}

/** Pure rule: does this dashboard's REAL usage over the last week justify suggesting a slower
 *  cadence? `checks7d`/`opens7d` are plain numbers the caller already looked up (from the ledger
 *  and opens.ts respectively) — this function does no I/O, so the rule itself is trivially
 *  testable. Only ever suggests ONE step slower, never skips straight to manual. */
export function suggestCadence(
  d: Dashboard,
  checks7d: number,
  opens7d: number,
): CadenceSuggestion | null {
  if (!hasLiveContent(d)) return null;
  const step = STEP_DOWN[d.cadence.data];
  if (!step) return null;
  if (checks7d < MIN_CHECKS_FOR_SUGGESTION || opens7d > MAX_OPENS_FOR_SUGGESTION) return null;
  const to = step(opens7d);
  const oldMin = DATA_CADENCE_MIN[d.cadence.data];
  const newMin = DATA_CADENCE_MIN[to];
  if (!Number.isFinite(oldMin) || !Number.isFinite(newMin) || newMin <= oldMin) return null;
  // Extrapolated straight from the OBSERVED weekly check count — never a theoretical 24/7 rate.
  const savesPerMonth = Math.round(checks7d * (1 - oldMin / newMin) * (30 / 7));
  if (savesPerMonth <= 0) return null;
  return { dashboardId: d.id, to, savesPerMonth, checks7d, opens7d };
}

/** Has this dashboard already had a suggestion (open, applied, or dismissed) within the cooldown
 *  window? */
export function hasRecentSuggestion(
  ledger: LedgerEntry[],
  dashboardId: string,
  now: number,
): boolean {
  const cutoff = now - SUGGESTION_COOLDOWN_MS;
  return ledger.some(
    (e) => e.kind === 'savings' && e.at >= cutoff && e.suggestion?.dashboardId === dashboardId,
  );
}

/** The rule applied over every dashboard, skipping ones with a recent suggestion, capped at `max`
 *  new suggestions per run (the once-per-day caller below makes this cap largely academic, but it
 *  bounds worst-case output regardless). */
export function runOptimizer(
  dashboards: Dashboard[],
  ledger: LedgerEntry[],
  checksSince: (dashboardId: string) => number,
  opensSince: (dashboardId: string) => number,
  now: number,
  max = 3,
): CadenceSuggestion[] {
  const out: CadenceSuggestion[] = [];
  for (const d of dashboards) {
    if (out.length >= max) break;
    if (hasRecentSuggestion(ledger, d.id, now)) continue;
    const suggestion = suggestCadence(d, checksSince(d.id), opensSince(d.id));
    if (suggestion) out.push(suggestion);
  }
  return out;
}

/** Human-readable suggestion text for the check-log rail entry. */
export function suggestionText(d: Dashboard, s: CadenceSuggestion): string {
  const opens = s.opens7d === 1 ? '1 time' : `${s.opens7d} times`;
  return (
    `You check ${d.title} ${cadenceLabel(d.cadence.data)} but only opened it ${opens} this week. ` +
    `Dropping to ${cadenceLabel(s.to)} would save about ${s.savesPerMonth} searches a month.`
  );
}

function toLedgerSuggestion(s: CadenceSuggestion): LedgerSuggestion {
  return {
    action: 'set-cadence',
    dashboardId: s.dashboardId,
    to: s.to,
    savesPerMonth: s.savesPerMonth,
    state: 'open',
  };
}

/** Record each new suggestion as an open 'savings' ledger entry — the check-log rail's Apply
 *  card. Pure side-effecting wrapper; the rule itself (runOptimizer) stays pure/testable above. */
export function recordSuggestions(dashboards: Dashboard[], suggestions: CadenceSuggestion[]): void {
  const byId = new Map(dashboards.map((d) => [d.id, d]));
  for (const s of suggestions) {
    const d = byId.get(s.dashboardId);
    if (!d) continue;
    appendLedger({
      kind: 'savings',
      text: suggestionText(d, s),
      dashboardIds: [s.dashboardId],
      searches: 0,
      suggestion: toLedgerSuggestion(s),
    });
  }
}

/** Apply an open suggestion — flips the cadence, marks it applied, and logs the change. Always a
 *  direct response to the user's own tap on the Apply button, never automatic. */
export function applySuggestion(
  entryId: string,
  dashboardId: string,
  to: DataCadenceMode,
  now: number = Date.now(),
): void {
  updateCadence(dashboardId, { data: to }, now);
  setSuggestionState(entryId, 'applied');
  appendLedger({
    kind: 'savings',
    text: `Applied — cadence dropped to ${cadenceLabel(to)}.`,
    dashboardIds: [dashboardId],
    searches: 0,
  });
}

export function dismissSuggestion(entryId: string): void {
  setSuggestionState(entryId, 'dismissed');
}

const OPTIMIZER_GATE_KEY = 'mavea-dash-optimizer-date';

function todayISO(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function optimizerAlreadyRanToday(now: number): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(OPTIMIZER_GATE_KEY) === todayISO(now);
  } catch {
    return false;
  }
}

function markOptimizerRan(now: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OPTIMIZER_GATE_KEY, todayISO(now));
    }
  } catch {
    /* quota / private mode — harmless, just risks re-running once today */
  }
}

/** Run the optimizer at most once per local day: check every dashboard's real usage, record any
 *  new suggestions to the ledger, and mark today done. A no-op on a day it's already run — cheap
 *  enough to call unconditionally from every tick. */
export function runOptimizerOnce(
  dashboards: Dashboard[],
  ledger: LedgerEntry[],
  checksSince: (dashboardId: string) => number,
  opensSince: (dashboardId: string) => number,
  now: number = Date.now(),
): void {
  if (optimizerAlreadyRanToday(now)) return;
  markOptimizerRan(now);
  const suggestions = runOptimizer(dashboards, ledger, checksSince, opensSince, now);
  recordSuggestions(dashboards, suggestions);
}
