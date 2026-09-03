// dashboardSeed.ts — the walkthrough's dashboard: a CURATED, finished board built from the same
// baked answers the tour replays (the $10k-at-7% ask and its $500-monthly follow-up), so every
// tile carries real numbers a viewer just watched Mavéa compute. Seeded idempotently as a
// non-serialized dashboard and rendered by the real DashboardDetail — the feature, not a mock.
import { tourConversation } from './corpus';
import {
  addTemporaryDashboard,
  createBlankDashboard,
  blockToWidget,
  getDashboards,
  removeDashboard,
} from '../live/dashboards/store';
import { AI_CADENCE_MIN, nextDataDue, nextDue } from '../live/dashboards/cadence';
import type { Block } from '../data/conversation';

const TOUR_DASH_QUESTION = 'How does $10,000 grow at 7% over 30 years?';
let activeTourDashboardId: string | null = null;

/** The showpiece blocks, in render order: growth chart + split from the base answer, then the
 *  comparison + composition + summary from the follow-up. */
function pickBlocks(): Block[] {
  const money = tourConversation('money')?.frames[0]?.spec.blocks ?? [];
  const monthly = tourConversation('monthly')?.frames[0]?.spec.blocks ?? [];
  const wanted: Block[] = [];
  const take = (from: Block[], types: string[], n = 1): void => {
    for (const t of types) {
      for (const b of from) {
        if (b.type === t && b.id && !wanted.includes(b) && n-- > 0) wanted.push(b);
      }
    }
  };
  take(money, ['chart']);
  take(money, ['stacked', 'stack']);
  take(monthly, ['chart']);
  take(monthly, ['kpi', 'stack', 'stacked']);
  take(money, ['breakdown']);
  return wanted;
}

/** Seed (or find) the tour's dashboard and return its id — stable across replays. */
export function ensureTourDashboard(): string | null {
  const existing = activeTourDashboardId
    ? getDashboards().find((dashboard) => dashboard.id === activeTourDashboardId)
    : undefined;
  if (existing) return existing.id;
  activeTourDashboardId = null;
  const blocks = pickBlocks();
  if (blocks.length === 0) return null;
  const dash = createBlankDashboard({
    title: 'Investment growth · $10k at 7%',
    question: TOUR_DASH_QUESTION,
    topic: 'money',
  });
  dash.thesis = {
    text: 'Your initial $10,000 grows by more than 7.6× through the power of compounding interest.',
    saidAt: dash.createdAt,
  };
  dash.cadence = { data: 'hourly', ai: 'daily' };
  dash.nextDataAt = nextDataDue(dash.cadence, dash.createdAt);
  dash.nextAiAt = nextDue(dash.createdAt, AI_CADENCE_MIN[dash.cadence.ai]);
  dash.widgets = blocks.map((b) => blockToWidget(b, 'tour'));
  addTemporaryDashboard(dash);
  activeTourDashboardId = dash.id;
  return dash.id;
}

/** Remove the temporary walkthrough fixture when the replay leaves its chapter. */
export function releaseTourDashboard(id: string): void {
  if (id !== activeTourDashboardId) return;
  activeTourDashboardId = null;
  removeDashboard(id);
}
