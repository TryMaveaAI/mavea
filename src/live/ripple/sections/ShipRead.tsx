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

  return (
    <div className="ripple-read" data-altitude={altitude}>
      <div className="ripple-read-main">
        <div className="ripple-eyebrow">What this change does</div>
        {lead && <p className="ripple-read-lead">{lead}</p>}
        <p className="ripple-read-summary">{pr.summary}</p>
        {altitude !== 'principal' && pr.readScope && (
          <p className="ripple-read-scope">
            {pr.readScope} Mavéa paraphrases nothing it can’t cite — expand any claim to its line.
          </p>
        )}
        {coaching && <p className="ripple-read-scope">{coaching}</p>}
      </div>
      <aside className="ripple-read-risks" aria-label="Before you merge">
        <div className="ripple-eyebrow">Before you merge</div>
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
      </aside>
    </div>
  );
}
