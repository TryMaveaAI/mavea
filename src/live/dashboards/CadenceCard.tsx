// CadenceCard — the dashboard's own data-refresh clock, moved here from Settings so the control
// sits next to the metrics it governs (AI-analysis cadence stays on Settings). Cost is shown as an
// honest per-day search estimate derived straight from the cadence's real interval (cadence.ts),
// never a dollar figure or a fabricated call count.
import { type ReactElement } from 'react';
import { clearOneShot, setCadenceWindow, updateCadence } from './store';
import { DATA_CADENCE_MIN } from './cadence';
import { Countdown } from './tiles/viz/Countdown';
import type { DataCadenceMode, Dashboard } from './types';
import './tiles/tiles.css';

const DATA_OPTS: { v: DataCadenceMode; label: string }[] = [
  { v: '15min', label: '15M' },
  { v: 'hourly', label: '1H' },
  { v: '6h', label: '6H' },
  { v: 'daily', label: 'DAILY' },
  { v: 'manual', label: 'MANUAL' },
];

// Prose labels for the cost sentence — distinct from the compact chip labels above, which mirror
// the tile chip convention (tileModel.ts's CADENCE_LABEL) for cross-surface consistency.
const PROSE_LABEL: Record<DataCadenceMode, string> = {
  '15min': 'Every 15 minutes',
  hourly: 'Hourly',
  '6h': 'Every 6 hours',
  daily: 'Daily',
  manual: 'Manual',
};

function costLine(mode: DataCadenceMode): string {
  if (mode === 'manual') return 'Refreshes only when you ask — no automatic searches.';
  const perDay = Math.round((24 * 60) / DATA_CADENCE_MIN[mode]);
  return (
    `${PROSE_LABEL[mode]} ≈ up to ~${perDay} searches/day while Mavéa is open. ` +
    'You provide the key and pay the search provider; a faster cadence can increase those charges. ' +
    'This is never real-time — each check is a snapshot.'
  );
}

function windowClock(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CadenceCard({
  dashboard,
  now,
}: {
  dashboard: Dashboard;
  now: number;
}): ReactElement {
  const mode = dashboard.cadence.data;
  const liveWindow = dashboard.cadence.window;

  return (
    <section className="card dash-cadence-card" aria-label="Check cadence">
      <div className="card-eyebrow">Check cadence</div>
      <div className="dash-seg" role="group" aria-label="Data refresh cadence">
        {DATA_OPTS.map((o) => (
          <button
            key={o.v}
            type="button"
            className={'dash-seg-opt' + (o.v === mode ? ' is-active' : '')}
            aria-pressed={o.v === mode}
            onClick={() => updateCadence(dashboard.id, { data: o.v })}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="dash-cadence-cost">{costLine(mode)}</p>

      {liveWindow && (
        <div className="dash-cadence-window">
          <p className="dash-cadence-window-text">
            Live window: <strong>{liveWindow.label}</strong> · {windowClock(liveWindow.startAt)}–
            {windowClock(liveWindow.endAt)}
          </p>
          <button
            type="button"
            className="dash-cadence-clear"
            onClick={() => setCadenceWindow(dashboard.id, null)}
          >
            Clear
          </button>
        </div>
      )}

      {dashboard.oneShotAt !== undefined && (
        <div className="dash-cadence-oneshot">
          <Countdown targetAt={dashboard.oneShotAt} now={now} label={dashboard.oneShotLabel} />
          <button
            type="button"
            className="dash-cadence-clear"
            onClick={() => clearOneShot(dashboard.id)}
          >
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
