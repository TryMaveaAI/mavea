// MetricFill — the "your numbers" input for a metric whose value is yours to give (a Blank-Space
// metric). Without this the card just reads "—" forever; here you type the value, it's stored as a
// user-supplied value, and the dashboard's tripwires re-evaluate immediately so the alignment gauge
// and alerts reflect it right away (rather than waiting for the next refresh tick).
import { useState, type ReactElement } from 'react';
import { valueWithUnit } from './format';
import { evalDashboard } from './refresh';
import { getDashboard, updateMetricValue, updateTripwireStates } from './store';
import type { MetricSpec } from './types';

export function MetricFill({
  dashboardId,
  metric,
}: {
  dashboardId: string;
  metric: MetricSpec;
}): ReactElement {
  const [val, setVal] = useState(metric.lastValue === null ? '' : String(metric.lastValue));

  const save = (): void => {
    const n = Number(val.replace(/[^0-9.+-]/g, ''));
    if (val.trim() === '' || !Number.isFinite(n)) return;
    const now = Date.now();
    // Capture the value BEFORE overwriting it — evalDashboard needs the real previous reading to
    // catch a crosses_up/crosses_down/pct_rise/pct_drop tripwire on a refill (a transition
    // comparator can never fire if prev is left to default to the just-written current value).
    const prevValue = metric.lastValue;
    updateMetricValue(
      dashboardId,
      metric.id,
      n,
      valueWithUnit(String(n), metric.unit),
      'user',
      now,
    );
    // Re-evaluate tripwires now so the gauge + alerts react immediately, not on the next loop tick.
    const fresh = getDashboard(dashboardId);
    if (fresh) {
      const { tripwires } = evalDashboard(fresh, { [metric.id]: prevValue });
      updateTripwireStates(dashboardId, tripwires, now);
    }
  };

  return (
    <form
      className="dash-fill"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        className="dash-fill-input"
        value={val}
        inputMode="decimal"
        placeholder={`Set ${metric.label}…`}
        aria-label={`Set ${metric.label}`}
        onChange={(e) => setVal(e.target.value)}
      />
      {metric.unit && <span className="dash-fill-unit">{metric.unit}</span>}
      <button type="submit" className="dash-fill-save" disabled={val.trim() === ''}>
        Save
      </button>
    </form>
  );
}
