// AlertCard — the tripwires you set, named honestly by their current state. Replaces AlertBanner's
// dismissible-notification role with a persistent, settings-like card: TRIGGERED absorbs the old
// banner's "a line you set has been crossed" wording inline, on the one row that actually broke,
// rather than a separate banner covering the whole dashboard. Tripwires carry no per-line
// enable/disable flag in the data model, so the switch below is a status read (armed vs. still
// awaiting a real value), never a toggle that would fake a control the store can't back.
import { type ReactElement } from 'react';
import type { Dashboard, Tripwire, TripwireState } from './types';

const STATE_LABEL: Record<TripwireState, string> = {
  WATCHING: 'Watching',
  CLEAR: 'Clear',
  AWAITING: 'Awaiting data',
  TRIGGERED: 'Triggered',
};

function AlertRow({ tripwire }: { tripwire: Tripwire }): ReactElement {
  const triggered = tripwire.state === 'TRIGGERED';
  return (
    <li className={'dash-alertcard-row' + (triggered ? ' is-triggered' : '')}>
      <span
        className={'dash-switch' + (tripwire.state !== 'AWAITING' ? ' on' : '')}
        aria-hidden="true"
      >
        <span className="dash-switch-knob" />
      </span>
      <div className="dash-alertcard-body">
        <span className="dash-alertcard-line">{tripwire.sourceQuote.text || tripwire.label}</span>
        {triggered ? (
          <span className="dash-alertcard-crossed">A line you set has been crossed</span>
        ) : (
          <span className="dash-alertcard-state">{STATE_LABEL[tripwire.state]}</span>
        )}
      </div>
    </li>
  );
}

export function AlertCard({ dashboard }: { dashboard: Dashboard }): ReactElement | null {
  if (dashboard.tripwires.length === 0) return null;

  return (
    <section className="card dash-alertcard" aria-label="Your alerts">
      <div className="card-eyebrow">Your alerts</div>
      <ul className="dash-alertcard-list">
        {dashboard.tripwires.map((t) => (
          <AlertRow key={t.id} tripwire={t} />
        ))}
      </ul>
    </section>
  );
}
