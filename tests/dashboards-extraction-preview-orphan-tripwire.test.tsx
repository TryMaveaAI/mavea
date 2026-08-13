// An extracted alert is bound to its metric by label at build time. Remove that metric in the review
// sheet and the alert used to be built anyway — bound to nothing, stuck in the standing-alerts card
// as AWAITING for the board's whole life: armed, and unable to ever evaluate, fire, or clear. An
// alert goes with its metric, and the row says so rather than reading "Included ✓" over a drop.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { setLiveConfigV2 } from '../src/live/useLiveConfig';
import type { Dashboard, DashboardDraft } from '../src/live/dashboards/types';

const draft: DashboardDraft = {
  title: 'Rates board',
  thesis: { text: 'rates fall, tech wins', saidAt: 1 },
  metrics: [
    {
      label: '10Y yield',
      query: 'us 10 year treasury yield',
      userSupplied: false,
      sourceQuote: { text: 'watch the 10Y', saidAt: 1 },
    },
    {
      label: 'AAPL price',
      query: 'AAPL current price',
      userSupplied: false,
      sourceQuote: { text: 'and Apple', saidAt: 1 },
    },
  ],
  tripwires: [
    {
      label: '10Y above 5%',
      comparator: 'gt',
      threshold: 5,
      metricLabel: '10Y yield',
      sourceQuote: { text: 'tell me if it breaks 5', saidAt: 1 },
    },
  ],
  suggestedWidgets: [],
};

vi.mock('../src/live/dashboards/extract', async () => {
  const actual = await vi.importActual<typeof import('../src/live/dashboards/extract')>(
    '../src/live/dashboards/extract',
  );
  // Real buildDashboard — the binding under test is its metricLabel → metricId lookup.
  return { ...actual, groundedDraft: () => draft, extractDashboard: () => Promise.resolve(null) };
});

vi.mock('../src/live/session/store', () => ({ loadSession: () => null }));

vi.mock('../src/live/library/store', () => ({
  getLibrary: () => [
    {
      id: 'lib1',
      question: 'Where are rates going?',
      title: 'Rates chat',
      savedAt: 1,
      lead: null,
      spec: { title: 'Rates chat', blocks: [] },
    },
  ],
}));

const added: Dashboard[] = [];
vi.mock('../src/live/dashboards/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/live/dashboards/store')>()),
  addDashboard: (d: Dashboard) => added.push(d),
  getDashboards: () => [],
  getDashboard: (id: string) => ({ id, title: 'Rates board', metrics: [], widgets: [] }),
  removeDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  ensureFirstCheck: vi.fn(),
}));

vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: () => Promise.resolve('done' as const),
}));

import { ExtractionPreview } from '../src/live/dashboards/ExtractionPreview';

beforeEach(() => {
  added.length = 0;
  setLiveConfigV2({ provider: 'gemini', keys: {} });
});

afterEach(() => {
  cleanup();
});

describe('ExtractionPreview — an alert never outlives the metric it watches', () => {
  it('removing a metric drops its dependent alert from the built dashboard', async () => {
    const { getAllByText, getByText } = render(<ExtractionPreview onClose={() => {}} />);
    await waitFor(() => expect(getByText('Alert: 10Y above 5%')).toBeTruthy());

    // Remove the 10Y METRIC — the first component row's toggle.
    fireEvent.click(getAllByText('Included ✓')[0]);

    // The alert row says why it can't come along, instead of claiming it's included.
    await waitFor(() => expect(getByText('Needs its metric')).toBeTruthy());
    expect((getByText('Needs its metric') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(getByText('Build dashboard →'));
    // Let the add-time confirm probe settle so the assertions run against a quiet component.
    await waitFor(() => expect(getByText('Build dashboard →')).toBeTruthy());

    expect(added).toHaveLength(1);
    expect(added[0].metrics.map((m) => m.label)).toEqual(['AAPL price']);
    expect(added[0].tripwires).toEqual([]);
  });

  it('keeps the alert when its metric stays', async () => {
    const { getByText } = render(<ExtractionPreview onClose={() => {}} />);
    await waitFor(() => expect(getByText('Alert: 10Y above 5%')).toBeTruthy());

    fireEvent.click(getByText('Build dashboard →'));
    await waitFor(() => expect(getByText('Build dashboard →')).toBeTruthy());

    expect(added).toHaveLength(1);
    expect(added[0].tripwires).toHaveLength(1);
    // Bound to a metric that is actually on the board — never the empty id evalDashboard can't resolve.
    const metricIds = new Set(added[0].metrics.map((m) => m.id));
    expect(metricIds.has(added[0].tripwires[0].metricId)).toBe(true);
  });
});
