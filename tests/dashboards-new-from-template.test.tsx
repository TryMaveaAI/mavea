// NewFromTemplate — the "track anything" path onto a dashboard. Mirrors
// dashboards-extraction-preview-race.test.tsx's own build() coverage for this sibling flow: a
// create must fire its first refresh WITHOUT waiting on it before navigating away, and a
// related-dashboard match must always surface as an explicit choice, never a silent fold. The
// planner itself (planTracker) is mocked — its coercion honesty has its own unit tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react';
import type { Dashboard } from '../src/live/dashboards/types';
import type { TrackerPlan } from '../src/live/dashboards/planTracker';

const addDashboard = vi.fn();
let dashboardsList: Dashboard[] = [];
vi.mock('../src/live/dashboards/store', () => ({
  addDashboard: (d: Dashboard) => addDashboard(d),
  getDashboards: () => dashboardsList,
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
  it('plans the ask, shows the plan for review, and creates without waiting on the first refresh', async () => {
    newDashboardFromTemplate.mockReturnValue({
      id: 'new-dash-id',
      title: 'AAPL',
      question: 'AAPL stock price',
    } as Dashboard);

    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');

    expect(planTracker).toHaveBeenCalled();
    // The plan is reviewable: its metric and live card both appear as toggle chips.
    expect(screen.getByText('AAPL price')).toBeTruthy();
    expect(screen.getByText('AAPL price history')).toBeTruthy();

    fireEvent.click(screen.getByText('Create dashboard →'));

    expect(newDashboardFromTemplate).toHaveBeenCalled();
    expect(addDashboard).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-dash-id' }));
    // refreshDashboardNow was invoked (a real promise it returns), but nothing in create() awaits
    // it — the assertion above already ran synchronously past the click, proving navigation/close
    // didn't sit around for that promise to settle first.
    expect(refreshDashboardNow).toHaveBeenCalledWith('new-dash-id');
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
    fireEvent.click(screen.getByText('Create dashboard →'));

    expect(screen.queryByText(/fold this in instead of creating a new one/)).toBeNull();
    expect(newDashboardFromTemplate).toHaveBeenCalled();
  });
});
