// ShipRollout.tsx — "Safe rollout order": the deploy sequence that ships this change without an
// outage, plus the one trap that makes the instinctive order break everything. The order matters
// because the change crosses a contract boundary — consumers must learn the new shape before the
// producer drops the old one. The grid reads the model's rollout steps in order; the callout below
// names the trap step and explains why Mavéa inverts the obvious sequence. Reads only the grounded
// model; it invents no steps.
import type { ReactElement } from 'react';
import type { SectionProps } from './types';
import './shiprollout.css';

/** A small warning triangle for the trap callout — inline so it inherits currentColor and needs no
 *  asset pipeline. */
function WarningTriangle(): ReactElement {
  return (
    <svg
      className="ripple-roll-tri"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3.2 22 20.4H2L12 3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 9.4v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17.4" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function ShipRollout({ model }: SectionProps): ReactElement {
  const { rollout } = model;
  const trap = rollout.find((step) => step.trap);

  return (
    <div className="ripple-roll">
      <div className="ripple-roll-intro">
        <div className="ripple-eyebrow">Safe rollout order</div>
        <p className="ripple-roll-lead">
          Ship in this sequence and the change never breaks a caller — every consumer learns the new
          contract before the producer drops the old one.
        </p>
      </div>

      <ol className="ripple-roll-grid">
        {rollout.map((step) => (
          <li
            className="ripple-roll-step"
            key={step.order}
            data-trap={step.trap ? 'true' : undefined}
          >
            <div className="ripple-roll-head">
              <span
                className="ripple-roll-order"
                data-trap={step.trap ? 'true' : undefined}
                aria-hidden="true"
              >
                {step.order}
              </span>
              <span className="ripple-eyebrow ripple-roll-team">{step.team}</span>
            </div>
            <div className="ripple-roll-deploy">{step.deploy}</div>
            <p className="ripple-roll-note">{step.note}</p>
          </li>
        ))}
      </ol>

      {trap && (
        <aside className="ripple-roll-trap" aria-label="The trap in this rollout">
          <div className="ripple-roll-trap-head">
            <WarningTriangle />
            <span className="ripple-eyebrow ripple-roll-trap-eyebrow">The trap</span>
          </div>
          <p className="ripple-roll-trap-body">
            Step {trap.order} — <strong>{trap.deploy.toLowerCase()}</strong> ({trap.team}) — is the
            one you instinctively do first. Drop the old contract before its consumers are ready and
            every one of them breaks the moment it ships. Mavéa puts the consumer upgrades ahead of
            the producer: the old path stays alive until the last caller can speak the new one, then
            it’s removed.
          </p>
        </aside>
      )}
    </div>
  );
}
