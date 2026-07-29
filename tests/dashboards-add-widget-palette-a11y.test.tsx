// AddWidgetPalette: the focus-trap a11y contract it shares with PinToDashboard, plus the new
// palette behaviours — typed builders actually landing widgets in the store, the AddWidgetButton
// trigger working outside edit mode, and the "Track a number" flow: key-gated with honest no-key
// copy, one planning call, a real MetricSpec plus a stat tile bound to it, an honest refusal when
// no single number can be planned.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import type { TrackerPlan } from '../src/live/dashboards/planTracker';

const h = vi.hoisted(() => ({
  apiKey: 'k' as string | undefined,
  plan: vi.fn<() => Promise<unknown>>(),
  refresh: vi.fn((_id: string) => Promise.resolve('done' as const)),
}));

vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => ({ provider: 'openai', models: {}, keys: {} }),
  toModelConfig: () => ({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: h.apiKey }),
}));
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: (id: string) => h.refresh(id),
}));
vi.mock('../src/live/dashboards/planTracker', () => ({
  planTracker: () => h.plan(),
}));

import { AddWidgetPalette, AddWidgetButton } from '../src/live/dashboards/AddWidgetPalette';
import {
  addDashboard,
  clearDashboards,
  createBlankDashboard,
  getDashboard,
  updateDashboard,
} from '../src/live/dashboards/store';
import type { Dashboard } from '../src/live/dashboards/types';

const numberPlan: TrackerPlan = {
  title: 'Bitcoin price',
  metrics: [{ label: 'BTC price', query: 'current bitcoin price in USD', unit: '$' }],
  widgets: [],
  cadence: 'hourly',
  kind: 'live',
};

const noNumberPlan: TrackerPlan = { ...numberPlan, metrics: [] };

function seedDashboard(): Dashboard {
  const dash = createBlankDashboard({ title: 'Test dashboard', now: 1000 });
  addDashboard(dash);
  return dash;
}

beforeEach(() => {
  h.apiKey = 'k';
  h.plan.mockReset();
  h.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  clearDashboards();
  localStorage.clear();
});

describe('AddWidgetPalette accessibility', () => {
  it('exposes a labelled menu', () => {
    const { getByRole } = render(
      <AddWidgetPalette dashboard={seedDashboard()} onClose={() => {}} />,
    );
    const menu = getByRole('menu');
    expect(menu.getAttribute('aria-label')).toBe('Add a widget');
  });

  it('moves focus into the menu on open', () => {
    const { getByRole } = render(
      <AddWidgetPalette dashboard={seedDashboard()} onClose={() => {}} />,
    );
    const menu = getByRole('menu');
    expect(menu.contains(document.activeElement) || document.activeElement === menu).toBe(true);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <AddWidgetPalette dashboard={seedDashboard()} onClose={onClose} />,
    );
    fireEvent.keyDown(getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the trigger when it unmounts', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<AddWidgetPalette dashboard={seedDashboard()} onClose={() => {}} />);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe('AddWidgetPalette — typed builders land real widgets', () => {
  it('adds a Note and closes', () => {
    const dash = seedDashboard();
    const onClose = vi.fn();
    const { getByText } = render(<AddWidgetPalette dashboard={dash} onClose={onClose} />);
    fireEvent.click(getByText('+ Note'));
    const saved = getDashboard(dash.id)!;
    expect(saved.widgets).toHaveLength(1);
    expect(saved.widgets[0].block.type).toBe('list');
    expect(saved.widgets[0].fromSource).toBe('manual');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers a chrome widget only while the board lacks it', () => {
    const dash = seedDashboard();
    const first = render(<AddWidgetPalette dashboard={dash} onClose={() => {}} />);
    fireEvent.click(first.getByText('+ Alignment gauge'));
    first.unmount();
    const again = render(
      <AddWidgetPalette dashboard={getDashboard(dash.id)!} onClose={() => {}} />,
    );
    expect(again.queryByText('+ Alignment gauge')).toBeNull();
  });
});

describe('AddWidgetPalette — Track a number', () => {
  it('is honestly gated without a key: no input, plain copy, a path to Live', () => {
    h.apiKey = undefined;
    const { getByText, queryByLabelText, getByRole } = render(
      <AddWidgetPalette dashboard={seedDashboard()} onClose={() => {}} />,
    );
    fireEvent.click(getByText('+ Track a number'));
    expect(queryByLabelText('What number to track')).toBeNull();
    expect(getByText(/on your own key/)).toBeInTheDocument();
    expect(getByRole('link', { name: 'Connect a model in Live' }).getAttribute('href')).toBe(
      '#/live',
    );
    expect(h.plan).not.toHaveBeenCalled();
  });

  it('one planning call → a real MetricSpec plus a stat tile bound to it, then the first search', async () => {
    h.plan.mockResolvedValue(numberPlan);
    const dash = seedDashboard();
    const onClose = vi.fn();
    // The reality gate keeps only tiles the probe actually fills. Capture what the probe sees
    // (never a seeded guess) and fill the metric the way a grounded pass does.
    let atProbe: Dashboard['metrics'] = [];
    h.refresh.mockImplementationOnce((id: string) => {
      const cur = getDashboard(id)!;
      atProbe = cur.metrics;
      updateDashboard(id, {
        metrics: cur.metrics.map((m) => ({ ...m, lastValue: 67000, origin: 'search' as const })),
      });
      return Promise.resolve('done' as const);
    });
    const { getByText, getByLabelText } = render(
      <AddWidgetPalette dashboard={dash} onClose={onClose} />,
    );
    fireEvent.click(getByText('+ Track a number'));
    fireEvent.change(getByLabelText('What number to track'), {
      target: { value: 'bitcoin price' },
    });
    await act(async () => {
      fireEvent.click(getByText('Track · 1 call + 1 search'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(atProbe).toHaveLength(1);
    expect(atProbe[0]).toMatchObject({
      label: 'BTC price',
      query: 'current bitcoin price in USD',
      unit: '$',
      lastValue: null, // never seeded with a guess — only the grounded probe fills it
      origin: 'empty',
    });
    const saved = getDashboard(dash.id)!;
    expect(saved.metrics).toHaveLength(1);
    expect(saved.metrics[0].lastValue).toBe(67000); // the confirmed tile keeps its grounded read
    expect(saved.widgets).toHaveLength(1);
    expect(saved.widgets[0].metricId).toBe(saved.metrics[0].id);
    expect(saved.widgets[0].block.type).toBe('insight');
    expect(h.refresh).toHaveBeenCalledWith(dash.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('refuses honestly when the plan finds no single number — nothing is added', async () => {
    h.plan.mockResolvedValue(noNumberPlan);
    const dash = seedDashboard();
    const { getByText, getByLabelText } = render(
      <AddWidgetPalette dashboard={dash} onClose={() => {}} />,
    );
    fireEvent.click(getByText('+ Track a number'));
    fireEvent.change(getByLabelText('What number to track'), { target: { value: 'the news' } });
    await act(async () => {
      fireEvent.click(getByText('Track · 1 call + 1 search'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getByText(/No single number found/)).toBeInTheDocument();
    expect(getDashboard(dash.id)!.metrics).toHaveLength(0);
    expect(getDashboard(dash.id)!.widgets).toHaveLength(0);
    expect(h.refresh).not.toHaveBeenCalled();
  });
});

describe('AddWidgetButton — the header trigger outside edit mode', () => {
  it('opens the palette on click and closes it via Escape, focus back on the trigger', () => {
    const dash = seedDashboard();
    const { getByRole, queryByRole } = render(<AddWidgetButton dashboard={dash} />);
    const trigger = getByRole('button', { name: '+ Add card' });
    expect(queryByRole('menu')).toBeNull();
    trigger.focus(); // a real click focuses the button; jsdom's fireEvent doesn't
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = getByRole('menu');
    expect(menu.getAttribute('aria-label')).toBe('Add a widget');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
