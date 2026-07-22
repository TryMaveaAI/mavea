// ShipOnboarding.tsx — Ripple with no PR attached: the service as a set of modules you can actually
// learn (concept 08 §8). Where the other sections answer "is this change safe to ship?", this one
// answers "I just joined — what is this service, and where do I start?" A module list on the left, the
// chosen module's shape on the right (what it is, who owns it, what it leans on, who leans on it), then
// an ordered first-week path and the life of a single request through the system. Reads only from the
// grounded model — every entry point and dependency is a real ref, nothing is invented.
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { SectionProps } from './types';
import './shiponboarding.css';

export function ShipOnboarding({ model }: SectionProps): ReactElement {
  const { modules, onboarding } = model;
  // Default to the first module so the detail pane is never empty on open.
  const [selectedId, setSelectedId] = useState(modules[0]?.id);
  const selected = modules.find((m) => m.id === selectedId) ?? modules[0];

  return (
    <div className="ripple-onb">
      <header className="ripple-onb-head">
        <span className="ripple-onb-pill">No PR needed</span>
        <h2 className="ripple-onb-title">Understand the whole service</h2>
      </header>

      {/* The clearest orientation comes first: trace a request end to end before the area reference. */}
      {onboarding && onboarding.requestLife.length > 0 && (
        <section className="ripple-onb-life ripple-onb-life-top">
          <div className="ripple-eyebrow">A request&rsquo;s life</div>
          <div className="ripple-onb-trace">
            {onboarding.requestLife.map((stop, i) => (
              <span className="ripple-onb-trace-step" key={`${stop}-${i}`}>
                <code className="ripple-onb-chip">{stop}</code>
                {i < onboarding.requestLife.length - 1 && (
                  <span className="ripple-onb-chevron" aria-hidden="true">
                    ›
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="ripple-onb-panes">
        {/* LEFT — the module list, one selectable row each */}
        <nav className="ripple-onb-list" aria-label="Service modules">
          {modules.map((m) => {
            const active = m.id === selected?.id;
            return (
              <button
                key={m.id}
                type="button"
                className="ripple-onb-item"
                data-active={active}
                aria-pressed={active}
                onClick={() => setSelectedId(m.id)}
              >
                <span className="ripple-onb-item-name">{m.name}</span>
                <span className="ripple-onb-item-purpose">{m.purpose}</span>
                <span className="ripple-onb-item-foot">
                  <span className="ripple-onb-item-owner">{m.owner}</span>
                  <span className="ripple-onb-item-health">{m.health}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* RIGHT — the selected module, in full */}
        {selected && (
          <article className="ripple-onb-detail" aria-live="polite">
            <div className="ripple-onb-detail-head">
              <h3 className="ripple-onb-detail-name">{selected.name}</h3>
              <p className="ripple-onb-detail-purpose">{selected.purpose}</p>
              <div className="ripple-onb-detail-meta">
                <code className="ripple-onb-entry">{selected.entry}</code>
                <span className="ripple-onb-detail-owner">
                  {selected.owner} · {selected.health}
                </span>
              </div>
            </div>

            <div className="ripple-onb-explain">
              <div className="ripple-eyebrow">Mavéa explains</div>
              <p>{selected.explain}</p>
            </div>

            {selected.startHere.length > 0 && (
              <section className="ripple-onb-group">
                <div className="ripple-eyebrow">Start here</div>
                <div className="ripple-onb-chips">
                  {selected.startHere.map((ref) => (
                    <code className="ripple-onb-chip ripple-onb-chip-go" key={ref}>
                      {ref}
                    </code>
                  ))}
                </div>
              </section>
            )}

            {selected.depends.length > 0 && (
              <section className="ripple-onb-group">
                <div className="ripple-eyebrow">Depends on</div>
                <div className="ripple-onb-chips">
                  {selected.depends.map((dep) => (
                    <span className="ripple-onb-chip" key={dep}>
                      {dep}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {selected.usedBy.length > 0 && (
              <section className="ripple-onb-group">
                <div className="ripple-eyebrow">Used by</div>
                <div className="ripple-onb-chips">
                  {selected.usedBy.map((u) => (
                    <span className="ripple-onb-chip" key={u}>
                      {u}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </article>
        )}
      </div>

      {onboarding && (
        <footer className="ripple-onb-foot">
          <section>
            <div className="ripple-eyebrow">Your first week, in order</div>
            <ol className="ripple-onb-week">
              {onboarding.firstWeek.map((step, i) => (
                <li className="ripple-onb-step" key={`${step.title}-${i}`}>
                  <span className="ripple-onb-step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="ripple-onb-step-body">
                    <span className="ripple-eyebrow ripple-onb-step-team">{step.team}</span>
                    <span className="ripple-onb-step-title">{step.title}</span>
                    <span className="ripple-onb-step-sub">{step.sub}</span>
                    <code className="ripple-onb-step-file">{step.file}</code>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </footer>
      )}
    </div>
  );
}
