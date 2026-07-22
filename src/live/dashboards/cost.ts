// dashboards/cost.ts — usage AWARENESS, not a price tag. We can't honestly quote a dollar figure or a
// call count: the real cost depends entirely on which model the user connected and that provider's
// pricing, which only they can verify on their own account. So this module never invents figures.
// Instead it gives a qualitative sense of how often a dashboard will reach for the user's key, the
// honest labels for each layer, and a clear warning to check their model's pricing and confirm the
// cadence is what they want.
//
// This estimate covers ONLY the AUTOMATIC cadence (the loop in useDashboardLoop.ts) — a dashboard
// with no live-fetched metrics and no scheduled AI never spends a call ON ITS OWN, and the expensive
// AI verdict, when enabled, fires only on an actual tripwire break (smart trigger) rather than a
// fixed schedule. It does NOT cover anything the user explicitly triggers: "Refresh now", asking the
// dashboard a question, or pulling a new conversation's content in are all real model calls on the
// user's key every time, independent of this band — every API call has a real cost, always; the UI
// says so explicitly rather than implying those actions are free.
import type { Cadence, UsageEstimate, UsageLevel } from './types';

const DATA_LABEL: Record<Cadence['data'], string> = {
  '15min': 'Every ~15 min while open',
  hourly: 'Hourly while open',
  '6h': 'Every 6 hours while open',
  daily: 'Daily while open',
  manual: 'Manual only',
};

// Relative "reaches for your key" weight per cadence — ordinal, never a rate.
const DATA_WEIGHT: Record<Cadence['data'], number> = {
  '15min': 4,
  hourly: 3,
  '6h': 2,
  daily: 1,
  manual: 0,
};

const WARNING =
  'You provide the API key and pay that provider directly. Data refreshes and AI analysis can ' +
  'consume quota or incur a third-party charge on every scheduled run. Check your provider’s ' +
  'pricing and make sure this cadence is what you want.';

const FREE_NOTE =
  'Nothing runs on its own with this cadence — it only updates when you supply a value yourself, or when you explicitly pull in a conversation (which does spend a call at that moment).';

export function usageEstimate(
  cadence: Cadence,
  smartTrigger: boolean,
  liveContentCount: number,
): UsageEstimate {
  // "Live content" = a search-tracked metric OR a refreshQuery-bearing widget (see
  // format.ts's hasLiveContent) — either kind reaches for the key on a data-refresh pass.
  const hasSearch = liveContentCount > 0;
  // Data layer only costs when there's something to live-fetch.
  const dataWeight = hasSearch ? DATA_WEIGHT[cadence.data] : 0;
  // AI layer: a fixed schedule is the heavier path; a smart trigger is an occasional, break-only call.
  const scheduleWeight = cadence.ai === 'daily' ? 2 : cadence.ai === 'weekly' ? 1 : 0;
  const smartWeight = smartTrigger ? 1 : 0;
  const aiWeight = scheduleWeight + smartWeight;

  const total = dataWeight + aiWeight;
  const usesKey = total > 0;

  let level: UsageLevel;
  if (total === 0) level = 'none';
  else if (total <= 1) level = 'minimal';
  else if (total <= 3) level = 'light';
  else if (total <= 5) level = 'moderate';
  else level = 'frequent';

  const dataLabel = hasSearch ? DATA_LABEL[cadence.data] : 'Free — no live-fetched metrics';

  let aiLabel: string;
  if (smartTrigger && scheduleWeight === 0) aiLabel = 'Only when a line is crossed';
  else if (smartTrigger) aiLabel = `${scheduleLabel(cadence.ai)} + when a line is crossed`;
  else if (scheduleWeight === 0) aiLabel = 'Only when you ask';
  else aiLabel = scheduleLabel(cadence.ai);

  return { level, usesKey, dataLabel, aiLabel, warning: usesKey ? WARNING : FREE_NOTE };
}

function scheduleLabel(mode: Cadence['ai']): string {
  if (mode === 'daily') return 'Daily';
  if (mode === 'weekly') return 'Weekly';
  return 'Manual';
}

/** Human label for a usage band — for the awareness chip/panel. Scoped to the AUTOMATIC
 *  cadence only ("none" = nothing runs on its own) — it is never a lifetime cost guarantee.
 *  Any manual action (Refresh now, Ask, pulling in a conversation) is a real call regardless
 *  of this band; the panel says so explicitly right below it. */
export const USAGE_LABEL: Record<UsageLevel, string> = {
  none: 'No automatic API usage',
  minimal: 'Minimal automatic API usage',
  light: 'Light automatic API usage',
  moderate: 'Moderate automatic API usage',
  frequent: 'Frequent automatic API usage',
};
