// DashboardSettings' two-tap delete needs the same accessibility guarantees the old gallery-card
// delete had before DashboardHome replaced the gallery and per-dashboard delete moved here: an
// aria-live announcement while armed, and an auto-disarm timeout so a keyboard user who tabs away
// doesn't leave it silently primed to delete forever.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import type { Dashboard } from '../src/live/dashboards/types';

const dashboard: Dashboard = {
  id: 'd1',
  title: 'Runway watch',
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
  nextDataAt: Number.MAX_SAFE_INTEGER,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
} as Dashboard;

const removeDashboard = vi.fn();
const updateDashboard = vi.fn();
const updateCadence = vi.fn();
vi.mock('../src/live/dashboards/store', () => ({
  removeDashboard: (id: string) => removeDashboard(id),
  updateDashboard: (...args: unknown[]) => updateDashboard(...args),
  updateCadence: (...args: unknown[]) => updateCadence(...args),
}));
vi.mock('../src/live/dashboards/useDashboards', () => ({
  useDashboards: () => [dashboard],
}));
vi.mock('../src/live/dashboards/notify', () => ({
  notifyTriggered: vi.fn(),
  pushSupported: () => false,
  requestPush: vi.fn(),
}));

import { DashboardSettings } from '../src/live/dashboards/DashboardSettings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('DashboardSettings — two-tap delete accessibility', () => {
  it('announces the armed state, then removes and navigates on the second tap', () => {
    // Unlike the old gallery card (which reset its own armed flag inline after removing), Settings
    // relies on navigating away from the page to clear the armed UI — real removal unmounts this
    // view via useDashboards() returning a shorter list. jsdom doesn't simulate that unmount, so
    // this asserts the two real, observable effects instead: the call and the navigation.
    const { getByText, container } = render(<DashboardSettings id="d1" />);
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toBe('');

    fireEvent.click(getByText('Delete dashboard'));
    expect(live.textContent).toBe('Tap again to delete Runway watch');

    fireEvent.click(getByText('Tap again to delete'));
    expect(removeDashboard).toHaveBeenCalledWith('d1');
    expect(window.location.hash).toBe('#/dashboards');
  });

  it('auto-disarms a few seconds after arming, with no further interaction', () => {
    vi.useFakeTimers();
    const { getByText, container } = render(<DashboardSettings id="d1" />);

    fireEvent.click(getByText('Delete dashboard'));
    expect(container.querySelector('.dash-del-btn.armed')).not.toBeNull();

    act(() => vi.advanceTimersByTime(5_000));

    expect(container.querySelector('.dash-del-btn.armed')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('');
    expect(removeDashboard).not.toHaveBeenCalled();
  });
});
