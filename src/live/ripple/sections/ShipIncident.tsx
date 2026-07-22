// ShipIncident.tsx — Ripple in reverse: a paged alert traced back to its likely cause, with the
// rollback to copy and who to wake. The mirror of the forward cascade — here the chain runs from the
// symptom down to the root. STRICTLY READ-ONLY: the rollback is a draft you copy and run yourself;
// Ripple never reverts, deploys, or pages anyone.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { SectionProps } from './types';
import './shipincident.css';

export function ShipIncident({ model }: SectionProps): ReactElement {
  const inc = model.incident;
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const copyRollback = useCallback(() => {
    if (!inc?.rollback.length) return;
    void navigator.clipboard
      ?.writeText(inc.rollback.map((s, i) => `${i + 1}. ${s}`).join('\n'))
      .then(
        () => {
          setCopied(true);
          window.clearTimeout(copiedTimer.current);
          copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
        },
        () => undefined,
      );
  }, [inc]);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  if (!inc) return <div className="ripple-inc-empty">No incident loaded.</div>;

  return (
    <div className="ripple-inc">
      <div className="ripple-inc-symptom">
        {inc.severity && <span className="ripple-inc-sev">{inc.severity}</span>}
        <div className="ripple-inc-symptom-text">
          <div className="ripple-eyebrow">The page</div>
          <div className="ripple-inc-symptom-line">{inc.symptom}</div>
          {inc.service && <div className="ripple-inc-service">{inc.service}</div>}
        </div>
      </div>

      {inc.chain.length > 0 && (
        <div className="ripple-inc-block">
          <div className="ripple-eyebrow">The trace back</div>
          <div className="ripple-inc-chain">
            {inc.chain.map((h, i) => (
              <div className="ripple-inc-hop" key={i}>
                <span className="ripple-inc-hop-dot" aria-hidden="true" />
                <div className="ripple-inc-hop-body">
                  <div className="ripple-inc-hop-ctx">{h.context}</div>
                  <div className="ripple-inc-hop-label">{h.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ripple-inc-cause">
        <div className="ripple-eyebrow">Likely root cause</div>
        <p>{inc.rootCause}</p>
      </div>

      {inc.rollback.length > 0 && (
        <div className="ripple-inc-rollback">
          <div className="ripple-inc-rollback-head">
            <div className="ripple-eyebrow">Rollback — a draft you run</div>
            <button type="button" className="ripple-track-btn" onClick={copyRollback}>
              {copied ? 'Copied ✓' : 'Copy steps'}
            </button>
          </div>
          <ol className="ripple-inc-steps">
            {inc.rollback.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="ripple-inc-note">
            Ripple never reverts, deploys, or pages — this is yours to run.
          </div>
        </div>
      )}

      {inc.whoToWake.length > 0 && (
        <div className="ripple-inc-block">
          <div className="ripple-eyebrow">Who to wake</div>
          <div className="ripple-inc-people">
            {inc.whoToWake.map((p, i) => (
              <div className="ripple-inc-person" key={i}>
                <span className="ripple-inc-avatar" aria-hidden="true">
                  {p.name.charAt(0)}
                </span>
                <div>
                  <div className="ripple-inc-person-name">{p.name}</div>
                  <div className="ripple-inc-person-team">{p.team}</div>
                  <div className="ripple-inc-person-why">{p.why}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {inc.timeline.length > 0 && (
        <div className="ripple-inc-block">
          <div className="ripple-eyebrow">War-room timeline</div>
          <div className="ripple-inc-timeline">
            {inc.timeline.map((t, i) => (
              <div className="ripple-inc-tl-row" key={i}>
                <span className="ripple-inc-tl-time">{t.time}</span>
                <span className="ripple-inc-tl-label">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inc.evidence && <div className="ripple-inc-evidence">{inc.evidence}</div>}
    </div>
  );
}
