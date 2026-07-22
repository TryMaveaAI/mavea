// DashboardDetail — WidgetTile mounts a fresh, isolated TopicCanvas per tile with no lead time to
// preload (unlike a Live turn, which kicks off preloadBlockFamilies while the answer is still
// streaming). Without an explicit preload, a widget whose block type's family has never loaded in
// this session renders as a permanently empty tile on first paint — useBlockFamilies' own reactive
// load-on-mount effect exists as a fallback, but nothing exercises it early enough for the
// "reveal together" grid gate to unblock. This pins that DashboardDetail preloads every widget's
// block type up front.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Dashboard } from '../src/live/dashboards/types';

const dashboard: Dashboard = {
  id: 'd1',
  title: 'Weather in Denver',
  question: 'Weather in Denver',
  thesis: { text: 'Tracking the weather in Denver.', saidAt: 0 },
  tripwires: [],
  metrics: [
    {
      id: 'm1',
      label: 'Temperature in Denver',
      query: 'current temperature in Denver right now',
      unit: '°F',
      sourceQuote: { text: 'Temperature in Denver', saidAt: 0 },
      lastValue: null,
      origin: 'empty',
    },
  ],
  sources: [],
  widgets: [
    {
      id: 'w1',
      block: { type: 'insight', col: 4, id: 'wb1', num: '1', props: { stat: '—' } } as never,
      span: 1,
      metricId: 'm1',
      fromSource: 'template:weather',
    },
    {
      id: 'w2',
      block: {
        type: 'forecast',
        col: 8,
        id: 'wb2',
        props: { title: '5-day outlook', location: 'Denver', days: [] },
      } as never,
      span: 2,
      fromSource: 'template:weather',
    },
  ],
  cadence: { data: 'hourly', ai: 'on-change' },
  smartTrigger: false,
  alerts: { inApp: true, push: false },
  createdAt: 0,
  updatedAt: 0,
  nextDataAt: Number.MAX_SAFE_INTEGER,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
} as Dashboard;

const { preloadBlockFamilies } = vi.hoisted(() => ({ preloadBlockFamilies: vi.fn() }));
vi.mock('../src/canvas/blocks/loader', () => ({ preloadBlockFamilies }));
vi.mock('../src/live/dashboards/useDashboards', () => ({ useDashboards: () => [dashboard] }));
vi.mock('../src/live/dashboards/store', () => ({
  removeWidget: vi.fn(),
  setWidgetOrder: vi.fn(),
  setWidgetSpan: vi.fn(),
}));
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: vi.fn(),
  readDashboardNow: vi.fn(),
  useDataPending: () => false,
}));
vi.mock('../src/live/dashboards/WidgetTile', () => ({ WidgetTile: () => null }));
vi.mock('../src/live/dashboards/AddWidgetPalette', () => ({ AddWidgetPalette: () => null }));
vi.mock('../src/live/dashboards/MetricFill', () => ({ MetricFill: () => null }));
vi.mock('../src/live/dashboards/TalkToDashboard', () => ({ TalkToDashboard: () => null }));
vi.mock('../src/live/dashboards/DetailHero', () => ({ DetailHero: () => null }));
vi.mock('../src/live/dashboards/LastCheckCard', () => ({ LastCheckCard: () => null }));
vi.mock('../src/live/dashboards/CadenceCard', () => ({ CadenceCard: () => null }));
vi.mock('../src/live/dashboards/AlertCard', () => ({ AlertCard: () => null }));
vi.mock('../src/live/dashboards/CheckLogRail', () => ({ CheckLogRail: () => null }));

import { DashboardDetail } from '../src/live/dashboards/DashboardDetail';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardDetail — block-family preload', () => {
  it('preloads every widget block on mount, not just the metric-linked one', () => {
    render(<DashboardDetail id="d1" />);
    expect(preloadBlockFamilies).toHaveBeenCalledTimes(1);
    const blocks = preloadBlockFamilies.mock.calls[0][0] as Array<{ type: string }>;
    expect(blocks.map((b) => b.type)).toEqual(['insight', 'forecast']);
  });
});
