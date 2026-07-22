// dashboardSeed.ts — the walkthrough's dashboard: a CURATED, finished board built from the same
// baked answers the tour replays (the $10k-at-7% ask and its $500-monthly follow-up), so every
// tile carries real numbers a viewer just watched Mavéa compute. Seeded idempotently into the real
// dashboards store and rendered by the real DashboardDetail — the feature, not a mock of it.
import { tourConversation } from './corpus';
import {
  addDashboard,
  createBlankDashboard,
  blockToWidget,
  getDashboards,
} from '../live/dashboards/store';
import { DATA_CADENCE_MIN, AI_CADENCE_MIN, nextDue } from '../live/dashboards/cadence';
import type { Block } from '../data/conversation';

const TOUR_DASH_QUESTION = 'How does $10,000 grow at 7% over 30 years?';

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
  const existing = getDashboards().find((d) => d.question === TOUR_DASH_QUESTION);
  if (existing) return existing.id;
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
  dash.widgets = blocks.map((b) => blockToWidget(b, 'tour'));
  // The chapter's coach line claims this dashboard "keeps itself up to date" — createBlankDashboard
  // defaults to a manual (off) cadence, which would show the opposite the moment its own Settings
  // panel is on screen. Give it a real, live cadence so that claim is actually true, not aspirational.
  dash.cadence = { data: 'hourly', ai: 'daily' };
  dash.nextDataAt = nextDue(dash.createdAt, DATA_CADENCE_MIN[dash.cadence.data]);
  dash.nextAiAt = nextDue(dash.createdAt, AI_CADENCE_MIN[dash.cadence.ai]);
  addDashboard(dash);
  return dash.id;
}
