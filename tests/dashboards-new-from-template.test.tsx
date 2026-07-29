// NewFromTemplate — the "track anything" path onto a dashboard. Mirrors
// dashboards-extraction-preview-race.test.tsx's own build() coverage for this sibling flow: a
// create runs the add-time reality gate (confirmAdd's grounded probe) before closing, and a
// related-dashboard match must always surface as an explicit choice, never a silent fold. The
// planner itself (planTracker) is mocked — its coercion honesty has its own unit tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen, act, waitFor } from '@testing-library/react';
import type { Dashboard } from '../src/live/dashboards/types';
import type { TrackerPlan } from '../src/live/dashboards/planTracker';

const addDashboard = vi.fn();
let dashboardsList: Dashboard[] = [];
vi.mock('../src/live/dashboards/store', () => ({
  addDashboard: (d: Dashboard) => addDashboard(d),
  getDashboards: () => dashboardsList,
  // The reality gate reads the just-persisted board back before probing it — hand it whatever
  // the component last added (with the array fields the template stub doesn't build), and let
  // rollback be a no-op.
  getDashboard: () => {
    const d = addDashboard.mock.calls.at(-1)?.[0] as Partial<Dashboard> | undefined;
    return d ? { ...d, metrics: d.metrics ?? [], widgets: d.widgets ?? [] } : null;
  },
  removeDashboard: () => {},
  updateDashboard: () => {},
  ensureFirstCheck: () => {},
}));

const refreshDashboardNow = vi.fn((_id: string) => Promise.resolve('done' as const));
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: (id: string) => refreshDashboardNow(id),
}));

const plan: TrackerPlan = {
  title: 'AAPL',
  metrics: [{ label: 'AAPL price', query: 'current AAPL stock price', unit: '$' }],
  widgets: [{ blockType: 'chart', query: 'AAPL price history', span: 2 }],
  cadence: '15min',
  kind: 'live',
};
const planTracker = vi.fn((..._args: unknown[]) => Promise.resolve(plan));
vi.mock('../src/live/dashboards/planTracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/dashboards/planTracker')>();
  return { ...actual, planTracker: (...args: unknown[]) => planTracker(...args) };
});

vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => ({ provider: 'openai', models: {}, keys: { openai: 'k' } }),
  toModelConfig: () => ({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' }),
}));

const newDashboardFromTemplate = vi.fn();
const foldTemplateIntoDashboard = vi.fn();
vi.mock('../src/live/dashboards/templates/instantiate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/live/dashboards/templates/instantiate')>();
  return {
    ...actual,
    newDashboardFromTemplate: (...args: unknown[]) => newDashboardFromTemplate(...args),
    foldTemplateIntoDashboard: (...args: unknown[]) => foldTemplateIntoDashboard(...args),
  };
});

import { NewFromTemplate } from '../src/live/dashboards/NewFromTemplate';

/** A minimal-but-real Dashboard for relate.ts's own (unmocked) matching logic to chew on — only
 *  the fields relatedDashboard actually reads. */
function stubDashboard(over: Partial<Dashboard>): Dashboard {
  return {
    id: 'existing-1',
    title: 'Untitled',
    question: '',
    thesis: { text: '', saidAt: 0 },
    tripwires: [],
    metrics: [],
    sources: [],
    widgets: [],
    cadence: { data: 'manual', ai: 'manual' },
    smartTrigger: false,
    alerts: { inApp: true, push: false },
    createdAt: 0,
    updatedAt: 0,
    nextDataAt: 0,
    nextAiAt: 0,
    lastRefreshedAt: null,
    ...over,
  } as Dashboard;
}

/** Type an ask and run the planner through to the review step. */
async function planIt(ask: string): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText('What do you want to track?'), {
    target: { value: ask },
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Plan it →'));
    await Promise.resolve();
  });
}

beforeEach(() => {
  addDashboard.mockClear();
  refreshDashboardNow.mockClear();
  planTracker.mockClear();
  newDashboardFromTemplate.mockReset();
  foldTemplateIntoDashboard.mockClear();
  dashboardsList = [];
});

afterEach(() => {
  cleanup();
});

describe('NewFromTemplate — plan → review → create', () => {
  it('plans the ask, persists the board, and probes it for real data through the reality gate', async () => {
    newDashboardFromTemplate.mockReturnValue({
      id: 'new-dash-id',
      title: 'AAPL',
      question: 'AAPL stock price',
      // A search-tracked metric makes the board "live", so the gate must actually probe it; the
      // grounded value stands in for what the (mocked) probe pass would have filled.
      metrics: [
        { id: 'm1', label: 'AAPL price', query: 'current AAPL stock price', lastValue: 190 },
      ],
      widgets: [],
    } as unknown as Dashboard);

    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');

    expect(planTracker).toHaveBeenCalled();
    // The plan is reviewable: its metric and live card both appear as toggle chips.
    expect(screen.getByText('AAPL price')).toBeTruthy();
    expect(screen.getByText('AAPL price history')).toBeTruthy();

    fireEvent.click(screen.getByText('Create dashboard →'));

    expect(newDashboardFromTemplate).toHaveBeenCalled();
    expect(addDashboard).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-dash-id' }));
    // The confirm probe IS the first refresh — the same grounded engine the refresh loop runs —
    // and create() deliberately awaits it before closing, so a board that can't ground never
    // silently joins the list (confirmAdd rolls it back instead).
    await waitFor(() => expect(refreshDashboardNow).toHaveBeenCalledWith('new-dash-id'));
  });

  it('a chip toggled off is excluded and create disables when nothing is left', async () => {
    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');

    fireEvent.click(screen.getByText('AAPL price')); // metric off
    fireEvent.click(screen.getByText('AAPL price history')); // card off
    expect((screen.getByText('Create dashboard →') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('NewFromTemplate — a related dashboard is always an explicit choice, never a silent fold', () => {
  it('shows the fold-suggestion interstitial when an existing dashboard plausibly matches', async () => {
    dashboardsList = [
      stubDashboard({
        id: 'existing-1',
        title: 'AAPL price watch',
        thesis: { text: 'Watching the AAPL stock price.', saidAt: 1 },
      }),
    ];

    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');
    fireEvent.click(screen.getByText('Create dashboard →'));

    expect(screen.getByText(/fold this in instead of creating a new one/)).toBeTruthy();
    expect(screen.getByText('Fold into “AAPL price watch”')).toBeTruthy();
    expect(newDashboardFromTemplate).not.toHaveBeenCalled();
  });

  it('does not show the interstitial when nothing plausibly matches', async () => {
    dashboardsList = [
      stubDashboard({
        id: 'existing-2',
        title: 'Weather in Tokyo',
        thesis: { text: 'Tracking the weather in Tokyo.', saidAt: 1 },
      }),
    ];
    newDashboardFromTemplate.mockReturnValue({
      id: 'new-dash-id',
      title: 'AAPL',
      question: 'AAPL stock price',
    } as Dashboard);

    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');
    await act(async () => {
      fireEvent.click(screen.getByText('Create dashboard →'));
      await Promise.resolve();
    });

    expect(screen.queryByText(/fold this in instead of creating a new one/)).toBeNull();
    expect(newDashboardFromTemplate).toHaveBeenCalled();
  });
});
