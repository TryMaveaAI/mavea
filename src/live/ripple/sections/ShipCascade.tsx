// ShipCascade.tsx — "the cascade": how one line becomes a P0, hop by hop. Each cascade is a single
// causal chain — a trigger in this PR, the hops it sets off across other teams, and the incident at
// the far end — followed by the resolution that stops the chain before it ever starts. The point of
// the visual is foresight: you read left-to-right and watch a one-line edit turn into checkout going
// down, then see the one reorder that defuses it. Reads only from the grounded model.
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ShipCascade as Cascade, Severity, ShipModel } from '../model';
import { riskVar } from '../colors';
import './shipCascade.css';

/** Severity token for the incident badge — P0 is the worst, on --danger; everything else watches. */
function severityVar(s: Severity): string {
  return s === 'P0' ? 'var(--danger)' : 'var(--warning)';
}

/** A chevron between chain steps. Decorative — the chain order carries the meaning. */
function Chevron(): ReactElement {
  return (
    <svg className="ripple-casc-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M5.5 3.5 L10 8 L5.5 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A small check inside a circle for the resolution line. */
function CheckMark(): ReactElement {
  return (
    <svg className="ripple-casc-check" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.5 9.2 L8 11.6 L12.5 6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CascadeChain({ cascade }: { cascade: Cascade }): ReactElement {
  return (
    <div className="ripple-casc-row">
      {/* the trigger — the line in this PR that sets the whole thing off */}
      <article
        className="ripple-casc-card ripple-casc-trigger"
        style={{ ['--casc-tint' as string]: 'var(--presence)' }}
      >
        <div className="ripple-casc-eyebrow">
          <span className="ripple-eyebrow">Your change</span>
          {cascade.triggerRef?.ref && (
            <code className="ripple-casc-ref">{cascade.triggerRef.ref}</code>
          )}
        </div>
        <p className="ripple-casc-title">{cascade.trigger}</p>
      </article>

      {/* each hop outward — tinted by how badly it goes wrong at that distance */}
      {cascade.hops.map((hop, i) => (
        <div className="ripple-casc-step" key={`${hop.context}-${i}`}>
          <Chevron />
          <article
            className="ripple-casc-card ripple-casc-hop"
            style={{ ['--casc-tint' as string]: riskVar(hop.severity) }}
          >
            <div className="ripple-eyebrow ripple-casc-hop-eyebrow">{hop.context}</div>
            <p className="ripple-casc-title">{hop.label}</p>
          </article>
        </div>
      ))}

      {/* the incident at the end of the chain — the thing that pages someone */}
      <div className="ripple-casc-step">
        <Chevron />
        <article className="ripple-casc-card ripple-casc-incident">
          <div className="ripple-casc-incident-top">
            <span
              className="ripple-casc-sev"
              style={{ ['--casc-sev' as string]: severityVar(cascade.incidentSeverity) }}
            >
              {cascade.incidentSeverity}
            </span>
            <span className="ripple-eyebrow ripple-casc-incident-label">Incident</span>
          </div>
          <p className="ripple-casc-incident-text">{cascade.incident}</p>
        </article>
      </div>
    </div>
  );
}

export function ShipCascade({ model }: { model: ShipModel }): ReactElement {
  const { cascades } = model;

  // Let a reader collapse the chains they've absorbed, so a long incident list stays scannable.
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const toggle = (i: number): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (cascades.length === 0) {
    return (
      <div className="ripple-casc-empty" role="status">
        No cascade found — nothing in this change reaches far enough to page someone.
      </div>
    );
  }

  return (
    <section className="ripple-casc" aria-label="How one line becomes an incident">
      <header className="ripple-casc-intro">
        <div className="ripple-eyebrow">The cascade</div>
        <p className="ripple-casc-lede">
          Each chain is one line turning into a page — read it left to right, then read how it’s
          caught.
        </p>
      </header>

      {cascades.map((cascade, i) => {
        const isCollapsed = collapsed.has(i);
        const headingId = `ripple-casc-${i}`;
        return (
          <div className="ripple-casc-item" key={`${cascade.trigger}-${i}`}>
            {i > 0 && <div className="ripple-casc-divider" aria-hidden="true" />}

            <button
              type="button"
              className="ripple-casc-bar"
              aria-expanded={!isCollapsed}
              aria-controls={headingId}
              onClick={() => toggle(i)}
            >
              <span
                className="ripple-casc-bar-sev"
                style={{ ['--casc-sev' as string]: severityVar(cascade.incidentSeverity) }}
                aria-hidden="true"
              >
                {cascade.incidentSeverity}
              </span>
              <span className="ripple-casc-bar-text" id={headingId}>
                {cascade.trigger} <span className="ripple-casc-bar-arrow">→</span>{' '}
                <strong>{cascade.incident}</strong>
              </span>
              <span className="ripple-casc-bar-toggle" aria-hidden="true">
                {isCollapsed ? 'Show chain' : 'Hide chain'}
              </span>
            </button>

            {!isCollapsed && (
              <div className="ripple-casc-detail">
                <div className="ripple-casc-scroll">
                  <CascadeChain cascade={cascade} />
                </div>
                <p className="ripple-casc-resolution">
                  <span className="ripple-casc-resolution-icon" aria-hidden="true">
                    <CheckMark />
                  </span>
                  <span className="ripple-casc-resolution-text">
                    <strong>Caught before merge.</strong> {cascade.caughtBeforeMerge}
                  </span>
                </p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
