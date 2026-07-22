// ShipHotspots.tsx — "the story behind any line." A line of code rarely explains itself: the
// early-return that looks redundant is the fix for a breach, the magic number is an experiment's
// output. This section pairs a list of load-bearing lines with the memory behind the selected one —
// why it exists, the incident that birthed it, the decisions that shaped it, who actually knows it,
// and the risk signals that say "change with care." Reads only from the grounded model.
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { DecisionEvent, ShipHotspot } from '../model';
import type { SectionProps } from './types';
import './shiphotspots.css';

/** A hotspot's class maps onto the shared risk accents: a haunted (load-bearing) line is a hazard
 *  (danger), a hot (high-churn) line wants watching (warning), a tuned (experiment-set) line is a
 *  deliberate, healthy value (insight). Used for the badge tint and the incident-card accent. */
function clsVar(cls: ShipHotspot['cls']): string {
  return cls === 'haunted' ? 'var(--danger)' : cls === 'hot' ? 'var(--warning)' : 'var(--insight)';
}

/** The decision-trail dot color separates a real incident (danger) from the routine paper-trail
 *  of PRs, reviews, experiments, and the line's current state. */
function trailVar(kind: DecisionEvent['kind']): string {
  return kind === 'incident' ? 'var(--danger)' : 'var(--presence)';
}

export function ShipHotspots({ model }: SectionProps): ReactElement {
  const { hotspots } = model;
  const [selectedId, setSelectedId] = useState<string>(hotspots[0]?.id ?? '');
  const active = hotspots.find((h) => h.id === selectedId) ?? hotspots[0];

  if (!active) {
    return (
      <div className="ripple-hot-empty">
        <div className="ripple-eyebrow">The story behind any line</div>
        <p>No load-bearing lines surfaced for this change.</p>
      </div>
    );
  }

  const accent = clsVar(active.cls);

  return (
    <div className="ripple-hot">
      {/* LEFT — the load-bearing lines, selectable */}
      <div className="ripple-hot-list" role="tablist" aria-label="Load-bearing lines">
        <div className="ripple-eyebrow ripple-hot-list-head">The story behind any line</div>
        {hotspots.map((h) => {
          const isActive = h.id === active.id;
          return (
            <button
              type="button"
              key={h.id}
              role="tab"
              aria-selected={isActive}
              className="ripple-hot-item"
              data-active={isActive}
              onClick={() => setSelectedId(h.id)}
            >
              <span
                className="ripple-hot-cls"
                style={{
                  color: clsVar(h.cls),
                  background: `color-mix(in oklab, ${clsVar(h.cls)} 16%, transparent)`,
                  borderColor: `color-mix(in oklab, ${clsVar(h.cls)} 34%, transparent)`,
                }}
              >
                {h.cls}
              </span>
              <span className="ripple-hot-symbol">{h.symbol}</span>
              <span className="ripple-hot-file">{h.file}</span>
            </button>
          );
        })}
      </div>

      {/* RIGHT — the memory behind the selected line */}
      <div className="ripple-hot-detail" role="tabpanel">
        <div className="ripple-hot-detail-head">
          <code
            className="ripple-hot-chip"
            style={{
              color: accent,
              background: `color-mix(in oklab, ${accent} 14%, transparent)`,
              borderColor: `color-mix(in oklab, ${accent} 30%, transparent)`,
            }}
          >
            {active.symbol}
          </code>
          <span className="ripple-hot-detail-file">{active.file}</span>
        </div>

        <section className="ripple-hot-why">
          <div className="ripple-eyebrow">Why this line exists</div>
          <p>{active.whyExists}</p>
        </section>

        {active.incident && (
          <section
            className="ripple-hot-incident"
            style={{
              background: `color-mix(in oklab, ${accent} 9%, transparent)`,
              borderColor: `color-mix(in oklab, ${accent} 28%, transparent)`,
            }}
          >
            <div className="ripple-hot-incident-head">
              <span className="ripple-hot-sev" style={{ background: accent }}>
                {active.incident.severity}
              </span>
              <code className="ripple-hot-incident-id">{active.incident.id}</code>
            </div>
            <p>{active.incident.text}</p>
          </section>
        )}

        {active.decisionTrail && active.decisionTrail.length > 0 && (
          <section className="ripple-hot-trail">
            <div className="ripple-eyebrow">The decision trail</div>
            <ol className="ripple-hot-timeline">
              {active.decisionTrail.map((ev, i) => (
                <li className="ripple-hot-event" key={`${ev.date}-${i}`}>
                  <span
                    className="ripple-hot-event-dot"
                    style={{ background: trailVar(ev.kind) }}
                    aria-hidden="true"
                  />
                  <div className="ripple-hot-event-body">
                    <div className="ripple-hot-event-top">
                      <time className="ripple-hot-event-date">{ev.date}</time>
                      <span className="ripple-hot-event-kind">{ev.kind}</span>
                    </div>
                    <span className="ripple-hot-event-label">{ev.label}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="ripple-hot-cols">
          {active.ask && (
            <section className="ripple-hot-ask">
              <div className="ripple-eyebrow">Who to actually ask</div>
              <div className="ripple-hot-ask-card">
                <span className="ripple-hot-avatar" aria-hidden="true">
                  {active.ask.name.charAt(0)}
                </span>
                <div className="ripple-hot-ask-who">
                  <span className="ripple-hot-ask-name">{active.ask.name}</span>
                  <span className="ripple-hot-ask-team">{active.ask.team}</span>
                </div>
              </div>
              <p className="ripple-hot-ask-why">{active.ask.why}</p>
              {active.ask.note && <p className="ripple-hot-ask-note">{active.ask.note}</p>}
            </section>
          )}

          {active.riskSignals && active.riskSignals.length > 0 && (
            <section className="ripple-hot-signals">
              <div className="ripple-eyebrow">Risk signals</div>
              <dl className="ripple-hot-signal-grid">
                {active.riskSignals.map((sig, i) => (
                  <div className="ripple-hot-signal" key={`${sig.k}-${i}`}>
                    <dt>{sig.k}</dt>
                    <dd>{sig.v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
