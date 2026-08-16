// MetricFill re-evaluates tripwires the instant a user types a value in, so a Blank-Space metric's
// alerts react without waiting for the next refresh tick. That re-evaluation needs the metric's REAL
// previous value: a transition comparator (crosses_up/crosses_down/pct_rise/pct_drop) can only fire on
// the MOVE, and evalDashboard treats a metric absent from prevValues as "unchanged" — so a fill that
// doesn't pass the prior reading can never trip a transition tripwire, silently breaking the "reconsider
// if…" promise for every self-supplied metric.
import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MetricFill } from '../src/live/dashboards/MetricFill';
import { addDashboard, getDashboard } from '../src/live/dashboards/store';
import type { Dashboard, MetricSpec, Tripwire } from '../src/live/dashboards/types';

const metric = (lastValue: number | null): MetricSpec => ({
  id: 'm1',
  label: 'Weekly mileage',
  query: '',
  unit: 'mi',
  sourceQuote: { text: 'my own weekly mileage', saidAt: 1 },
  lastValue,
  origin: lastValue === null ? 'empty' : 'user',
  blankKey: 'm1',
});

const crossesUpTripwire: Tripwire = {
  id: 't1',
  label: 'Mileage above 10mi',
  metricId: 'm1',
  comparator: 'crosses_up',
  threshold: 10,
  sourceQuote: { text: 'reconsider once it crosses 10mi', saidAt: 1 },
  state: 'WATCHING',
};

function seedDash(over: Partial<Dashboard> = {}): Dashboard {
  const dash: Dashboard = {
    id: 'd1',
    title: 'Training thesis',
    question: 'am I on track?',
    thesis: { text: 'weekly mileage keeps climbing', saidAt: 1 },
    tripwires: [crossesUpTripwire],
    metrics: [metric(5)],
    sources: [
      {
        kind: 'ORIGIN',
        conversationId: 'c1',
        title: 'Training chat',
        contributed: 'created',
        at: 1,
      },
    ],
    widgets: [],
    cadence: { data: 'manual', ai: 'manual' },
    smartTrigger: true,
    alerts: { inApp: true, push: false },
    createdAt: 1,
    updatedAt: 1,
    nextDataAt: Number.MAX_SAFE_INTEGER,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    ...over,
  };
  addDashboard(dash);
  return dash;
}

beforeEach(() => {
  localStorage.clear();
});

describe('MetricFill — re-evaluates tripwires against the real previous value', () => {
  it('fires a crosses_up tripwire when the new fill actually crosses the threshold', () => {
    seedDash();
    const { getByRole } = render(<MetricFill dashboardId="d1" metric={metric(5)} />);

    fireEvent.change(getByRole('textbox'), { target: { value: '15' } });
    fireEvent.click(getByRole('button', { name: 'Save' }));

    const fresh = getDashboard('d1')!;
    expect(fresh.metrics[0]!.lastValue).toBe(15);
    expect(fresh.tripwires[0]!.state).toBe('TRIGGERED');
  });

  it('does not fire when the new fill never crosses the threshold', () => {
    seedDash();
    const { getByRole } = render(<MetricFill dashboardId="d1" metric={metric(5)} />);

    fireEvent.change(getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(getByRole('button', { name: 'Save' }));

    expect(getDashboard('d1')!.tripwires[0]!.state).toBe('WATCHING');
  });

  it('a first-ever fill (no prior value) cannot fire a transition tripwire', () => {
    seedDash({ metrics: [metric(null)] });
    const { getByRole } = render(<MetricFill dashboardId="d1" metric={metric(null)} />);

    fireEvent.change(getByRole('textbox'), { target: { value: '15' } });
    fireEvent.click(getByRole('button', { name: 'Save' }));

    // No previous reading to transition FROM — honestly still just watching, not a false trigger.
    expect(getDashboard('d1')!.tripwires[0]!.state).toBe('WATCHING');
  });
});

// The input seeds itself from the stored value, and its host tile is keyed by widget id — a key
// that never changes, so the component never remounts. Without a re-sync the box kept displaying
// the number it was born with while the card above it showed the refreshed one.
describe('MetricFill — follows the stored value', () => {
  it('shows the new number after the stored value changes underneath it', () => {
    seedDash();
    const { getByRole, rerender } = render(<MetricFill dashboardId="d1" metric={metric(5)} />);
    expect(getByRole('textbox')).toHaveValue('5');

    rerender(<MetricFill dashboardId="d1" metric={metric(8)} />);
    expect(getByRole('textbox')).toHaveValue('8');
  });

  it('leaves a half-typed entry alone while the stored value holds still', () => {
    seedDash();
    const { getByRole, rerender } = render(<MetricFill dashboardId="d1" metric={metric(5)} />);

    fireEvent.change(getByRole('textbox'), { target: { value: '12' } });
    rerender(<MetricFill dashboardId="d1" metric={metric(5)} />);

    expect(getByRole('textbox')).toHaveValue('12');
  });
});
