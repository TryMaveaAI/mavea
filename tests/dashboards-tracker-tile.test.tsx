// The home grid's tile. Two honesty invariants live here: the red "live now" dot means a window is
// open RIGHT NOW (a match scheduled for tomorrow must not wear it), and a tapped "Check now" that
// comes back with nothing usable has to say so — the detail page surfaces those outcomes, the grid
// used to just stop its spinner and look untouched.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LiveScore } from '../src/live/dashboards/tiles/viz/LiveScore';
import type { CadenceWindow, Dashboard } from '../src/live/dashboards/types';

const refreshDashboardNow = vi.fn();
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: (id: string) => refreshDashboardNow(id),
}));

import { TrackerTile } from '../src/live/dashboards/tiles/TrackerTile';

const window_: CadenceWindow = {
  label: 'Arsenal vs Chelsea',
  startAt: 10_000,
  endAt: 20_000,
  origin: 'user',
};

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Match day',
    question: 'how is the match going?',
    thesis: { text: 'x', saidAt: 0 },
    tripwires: [],
    metrics: [
      {
        id: 'm1',
        label: 'Possession',
        query: 'arsenal possession',
        sourceQuote: { text: 'x', saidAt: 0 },
        lastValue: null,
        origin: 'empty',
      },
    ],
    sources: [],
    widgets: [],
    cadence: { data: 'hourly', ai: 'daily' },
    smartTrigger: false,
    alerts: { inApp: false, push: false },
    createdAt: 0,
    updatedAt: 0,
    nextDataAt: 0,
    nextAiAt: 0,
    lastRefreshedAt: null,
    ...over,
  }) as unknown as Dashboard;

beforeEach(() => {
  refreshDashboardNow.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('LiveScore — the red dot means the window is open now', () => {
  it('shows no live dot (and no elapsed fill) before the window starts', () => {
    const { container, getByText } = render(<LiveScore liveWindow={window_} now={5_000} />);
    expect(container.querySelector('.dash-live-dot')).toBeNull();
    expect(container.querySelector('.tile-live-fill')).toBeNull();
    // The upcoming window is still announced — it just isn't claimed as live.
    expect(getByText('Arsenal vs Chelsea')).toBeTruthy();
  });

  it('shows the dot and the elapsed fill once it has started', () => {
    const { container } = render(<LiveScore liveWindow={window_} now={15_000} />);
    expect(container.querySelector('.dash-live-dot')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('.tile-live-fill')?.style.width).toBe('50%');
  });
});

describe('TrackerTile — a check that got nowhere says so', () => {
  it('swaps the context line when the model could not be reached', async () => {
    refreshDashboardNow.mockResolvedValue('failed');
    const { getByTitle, getByText } = render(<TrackerTile dashboard={dash()} now={1_000} />);

    fireEvent.click(getByTitle('Check now'));

    await waitFor(() =>
      expect(
        getByText('Couldn’t reach your model — check its key or quota, then try again.'),
      ).toBeTruthy(),
    );
  });

  it('says a pass ran but grounded in nothing, rather than looking untouched', async () => {
    refreshDashboardNow.mockResolvedValue('unverified');
    const { getByTitle, getByText } = render(<TrackerTile dashboard={dash()} now={1_000} />);

    fireEvent.click(getByTitle('Check now'));

    await waitFor(() =>
      expect(
        getByText('Checked, but no source could verify new values — keeping the last real ones.'),
      ).toBeTruthy(),
    );
  });

  it('a rejected check reads as failed instead of escaping as an unhandled rejection', async () => {
    refreshDashboardNow.mockRejectedValue(new Error('chunk load failed'));
    const { getByTitle, getByText } = render(<TrackerTile dashboard={dash()} now={1_000} />);

    fireEvent.click(getByTitle('Check now'));

    await waitFor(() =>
      expect(
        getByText('Couldn’t reach your model — check its key or quota, then try again.'),
      ).toBeTruthy(),
    );
  });

  it('a check that landed leaves the tile reading its own subject', async () => {
    refreshDashboardNow.mockResolvedValue('done');
    const { getByTitle, getByText } = render(<TrackerTile dashboard={dash()} now={1_000} />);

    fireEvent.click(getByTitle('Check now'));

    await waitFor(() => expect(refreshDashboardNow).toHaveBeenCalledWith('d1'));
    expect(getByText('Possession')).toBeTruthy();
  });
});

// The pending flag the tile used to rely on is set by the refresh module, which is fetched on
// demand — so between the press and that chunk arriving the tile showed nothing at all. A second
// tap into that gap came back 'busy', an outcome the tile deliberately says nothing about, so the
// button read as broken.
describe('TrackerTile — Check now answers the press immediately', () => {
  it('shows it is checking from the first click, before the refresh module resolves', async () => {
    let release: (v: 'done') => void = () => {};
    refreshDashboardNow.mockReturnValue(
      new Promise<'done'>((resolve) => {
        release = resolve;
      }),
    );
    const { getByTitle, getByText } = render(<TrackerTile dashboard={dash()} now={1_000} />);

    fireEvent.click(getByTitle('Check now'));

    await waitFor(() => expect(getByText('Checking for live data…')).toBeTruthy());
    expect(getByTitle('Check now').getAttribute('aria-disabled')).toBe('true');

    release('done');
    await waitFor(() => expect(getByText('Possession')).toBeTruthy());
  });

  it('swallows a double tap instead of spending a second call', async () => {
    let release: (v: 'done') => void = () => {};
    refreshDashboardNow.mockReturnValue(
      new Promise<'done'>((resolve) => {
        release = resolve;
      }),
    );
    const { getByTitle, getByText } = render(<TrackerTile dashboard={dash()} now={1_000} />);

    fireEvent.click(getByTitle('Check now'));
    await waitFor(() => expect(getByText('Checking for live data…')).toBeTruthy());
    fireEvent.click(getByTitle('Check now'));

    release('done');
    await waitFor(() => expect(getByText('Possession')).toBeTruthy());
    expect(refreshDashboardNow).toHaveBeenCalledTimes(1);
  });
});
