// PlanReview's cadence ask — manual is the default everywhere now (Q&A decision), and the plan's
// own suggestion (from planTracker) is offered as a labeled option, never applied silently.
// Rendered through NewFromTemplate (same harness dashboards-new-from-template.test.tsx uses) since
// PlanReview has no standalone mount point of its own outside a creation flow.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react';
import type { Dashboard } from '../src/live/dashboards/types';
import type { TrackerPlan } from '../src/live/dashboards/planTracker';

const addDashboard = vi.fn();
vi.mock('../src/live/dashboards/store', () => ({
  addDashboard: (d: Dashboard) => addDashboard(d),
  getDashboards: () => [],
  // The add-time reality gate (confirmAdd) reads the persisted board back and rolls back on an
  // unverified probe — hand it whatever the component just added (with the array fields the
  // template stub here doesn't bother building), and let removal be a no-op.
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
  cadence: 'hourly',
  kind: 'live',
};
const planTracker = vi.fn((..._args: unknown[]) => Promise.resolve(plan));
vi.mock('../src/live/dashboards/planTracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/dashboards/planTracker')>();
  return { ...actual, planTracker: (...args: unknown[]) => planTracker(...args) };
});

vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => ({ provider: 'openai', models: {}, keys: { openai: 'k' } }),
  hasModelConfigured: () => true,
  toModelConfig: () => ({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' }),
}));

const newDashboardFromTemplate = vi.fn();
vi.mock('../src/live/dashboards/templates/instantiate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/live/dashboards/templates/instantiate')>();
  return {
    ...actual,
    newDashboardFromTemplate: (...args: unknown[]) => newDashboardFromTemplate(...args),
  };
});

import { NewFromTemplate } from '../src/live/dashboards/NewFromTemplate';

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
  newDashboardFromTemplate.mockReturnValue({
    id: 'new-dash-id',
    title: 'AAPL',
    question: 'AAPL stock price',
  } as Dashboard);
});
afterEach(() => cleanup());

describe('PlanReview cadence picker', () => {
  it('defaults to Manual, and Create passes manual cadence even though the plan suggested hourly', async () => {
    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');

    const manualChip = screen.getByRole('button', { name: 'Manual — only when you ask' });
    expect(manualChip.getAttribute('aria-pressed')).toBe('true');
    const suggestedChip = screen.getByRole('button', { name: /Suggested/ });
    expect(suggestedChip.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByText('Create dashboard →'));
    expect(newDashboardFromTemplate).toHaveBeenCalledWith(
      expect.anything(),
      'AAPL stock price',
      expect.objectContaining({ cadence: { data: 'manual', ai: 'manual' } }),
    );
  });

  it('picking the suggested chip drives the cadence actually passed to the builder', async () => {
    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');

    fireEvent.click(screen.getByRole('button', { name: /Suggested/ }));
    expect(
      screen
        .getByRole('button', { name: 'Manual — only when you ask' })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    fireEvent.click(screen.getByText('Create dashboard →'));
    expect(newDashboardFromTemplate).toHaveBeenCalledWith(
      expect.anything(),
      'AAPL stock price',
      expect.objectContaining({ cadence: { data: 'hourly', ai: 'manual' } }),
    );
  });

  it('the searches/mo estimate tracks the selected cadence, not the plan suggestion', async () => {
    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');

    expect(screen.getByText(/No standing searches/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Suggested/));
    expect(screen.getByText(/≈ 720 searches\/mo/)).toBeTruthy(); // hourly = 720/mo
  });
});

// The reality probe runs a real web search, which routinely takes tens of seconds. A button frozen
// at "Confirming live data…" for that long, with nothing else on screen, is indistinguishable from
// a hang — so the sheet says what it is waiting on, that it can be left, and where the answer lands.
// Creating a tracker does not wait for its first check. The gate used to hold the sheet open for
// the length of a real web search — routinely 30-60s — while the board the user had just described
// sat finished and invisible underneath. It can hand over immediately because it no longer needs
// the probe's answer to be honest: the board opens `pending`, showing nothing is verified yet.
describe('PlanReview — creating is instant, the check runs behind it', () => {
  it('hands the board over without waiting for the probe to resolve', async () => {
    // A probe that never settles: if creation awaited it, onDone could never fire.
    refreshDashboardNow.mockReturnValue(new Promise(() => {}));
    render(<NewFromTemplate onClose={() => {}} />);
    await planIt('AAPL stock price');

    fireEvent.click(screen.getByText(/Create dashboard/));

    // The board was persisted and handed over even though the check is still in flight — the
    // sheet never enters the blocking "Confirming live data…" state on the create path.
    await vi.waitFor(() => expect(addDashboard).toHaveBeenCalled());
    expect(screen.queryByText(/Confirming live data/)).toBeNull();
    expect(screen.queryByText(/can take up to a minute/)).toBeNull();
  });
});
