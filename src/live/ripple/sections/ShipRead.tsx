// ShipRead.tsx — "Mavéa's read": the whole change in plain language, risks pulled to the top. The
// calm opening that turns "I'm scared to touch this" into "I know what this does." The same grounded
// facts, but the FRAMING and depth move with the altitude — a new grad gets orientation and coaching,
// a principal gets the verdict first and the prose trimmed. Reads only from the model; cites or drops.
import type { ReactElement } from 'react';
import type { Altitude, RiskLevel, ShipModel } from '../model';

function riskVar(level: RiskLevel): string {
  return level === 'breaks'
    ? 'var(--danger)'
    : level === 'watch'
      ? 'var(--warning)'
      : 'var(--insight)';
}

export function ShipRead({
  model,
  altitude,
}: {
  model: ShipModel;
  altitude: Altitude;
}): ReactElement {
  const { pr, gate } = model;
  const isRepositoryRead = model.changes.length === 0 && model.modules.length > 0;
  const breaking = model.changes.filter((c) => c.risk === 'breaks').length;
  const fileCount = pr.files ?? model.changes.length;
  const fileWord = fileCount === 1 ? 'file' : 'files';
  const verdict =
    gate.decision === 'block'
      ? 'Hold'
      : gate.decision === 'watch'
        ? 'Review first'
        : gate.decision === 'pass'
          ? 'Clear to ship'
          : 'Exploring';

  // The altitude moves the framing, not the facts.
  const lead =
    altitude === 'principal'
      ? `${verdict}.` +
        (breaking ? ` ${breaking} breaking.` : '') +
        ` ${fileCount} ${fileWord} touched.`
      : altitude === 'newgrad'
        ? 'Here’s the lay of the land — take it one piece at a time, you don’t need the whole system in your head.'
        : null;

  const coaching =
    altitude === 'newgrad'
      ? pr.risks.length
        ? 'The “Before you merge” notes are the questions to raise in review — you don’t need every answer yet, just to ask.'
        : 'Nothing risky is pulling at the top, so this is a friendly one to read end to end.'
      : null;

  const busiestModules = model.modules.slice(0, 6);
  const largestArea = Math.max(
    1,
    ...busiestModules.map((module) => Number.parseInt(module.health, 10) || 1),
  );
  const startingPoints = model.onboarding?.firstWeek.slice(0, 3) ?? [];
  const boundedReadNote = model.provenance.notes?.find((note) =>
    /large repo|busiest areas/i.test(note),
  );

  return (
    <div
      className="ripple-read"
      data-altitude={altitude}
      data-repository={isRepositoryRead ? 'true' : undefined}
    >
      <div className="ripple-read-main">
        <div className="ripple-eyebrow">
          {isRepositoryRead ? 'How this repository is shaped' : 'What this change does'}
        </div>
        {lead && <p className="ripple-read-lead">{lead}</p>}
        <p className="ripple-read-summary">{pr.summary}</p>
        {/* No per-claim expander exists on this surface — the risks beside it are plain text — so
            the sentence stops at what the read actually is. */}
        {altitude !== 'principal' && pr.readScope && (
          <p className="ripple-read-scope">
            {pr.readScope} Mavéa paraphrases nothing it can’t cite.
          </p>
        )}
        {coaching && <p className="ripple-read-scope">{coaching}</p>}
        {isRepositoryRead && busiestModules.length > 0 && (
          <section className="ripple-read-spine" aria-labelledby="ripple-read-spine-title">
            <div className="ripple-read-section-heading">
              <div>
                <div className="ripple-eyebrow" id="ripple-read-spine-title">
                  Architecture spine
                </div>
                <span>The busiest real areas, sized by the files they contain.</span>
              </div>
              <strong>{model.modules.length} areas</strong>
            </div>
            <div className="ripple-read-modules">
              {busiestModules.map((module, index) => {
                const count = Number.parseInt(module.health, 10) || 1;
                return (
                  <article className="ripple-read-module" key={module.id}>
                    <span className="ripple-read-rank" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="ripple-read-module-copy">
                      <div className="ripple-read-module-title">
                        <strong>{module.name}</strong>
                        <span>{module.health}</span>
                      </div>
                      <div className="ripple-read-module-track" aria-hidden="true">
                        <span style={{ width: `${Math.max(12, (count / largestArea) * 100)}%` }} />
                      </div>
                      <p>{module.purpose}</p>
                      {module.entry && <code>{module.entry}</code>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <aside
        className="ripple-read-risks"
        aria-label={isRepositoryRead ? 'Start reading here' : 'Before you merge'}
      >
        <div className="ripple-eyebrow">
          {isRepositoryRead ? 'Start reading here' : 'Before you merge'}
        </div>
        {isRepositoryRead ? (
          <>
            <div className="ripple-read-starts">
              {startingPoints.map((point, index) => (
                <div className="ripple-read-start" key={`${point.file}-${index}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{point.title}</strong>
                    <p>{point.sub}</p>
                    {point.file && <code>{point.file}</code>}
                  </div>
                </div>
              ))}
            </div>
            <div className="ripple-read-budget">
              <div className="ripple-eyebrow">Bounded read</div>
              <p>
                {boundedReadNote ??
                  'The overview uses the repository tree first; deeper code is fetched only when a lesson or question needs it.'}
              </p>
            </div>
          </>
        ) : (
          <>
            {pr.risks.map((r, i) => (
              <div className="ripple-risk" key={i}>
                <span
                  className="ripple-risk-dot"
                  style={{ background: riskVar(r.level) }}
                  aria-hidden="true"
                />
                <span className="ripple-risk-text">{r.text}</span>
              </div>
            ))}
            {pr.risks.length === 0 && (
              <div className="ripple-risk-empty">
                Nothing is pulling at the top — this one reads clean.
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
