import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RehearsalProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RehearsalProps & { delay?: number };

// A branching playbook for a hard talk: a quotable opener, then the likely reactions as
// branches — each with a coached response and why it works — and a graceful exit line.
// Framed as rehearsal, not prediction: it prepares the user for how it might go, never
// promises how it WILL. Distinct from dialogue (a fixed scripted exchange) and
// decisiontree (a logic flowchart): this is what to SAY when a real person reacts.
export function Rehearsal({
  title,
  icon = 'chat',
  iconColor = 'var(--presence)',
  opener,
  branches,
  exit,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chat;
  const list = branches ?? [];

  return (
    <div
      className="card reveal rh-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="rh-opener">
        <span className="rh-open-tag">Open with</span>
        <p className="rh-open-line" dangerouslySetInnerHTML={richInnerHtml(opener)} />
      </div>

      {list.length > 0 && (
        <ol className="rh-branches">
          {list.map((b, i) => (
            <li key={i} className="rh-branch">
              <div className="rh-reaction">
                <Icon.undo className="ic rh-reaction-ic" style={{ width: 13, height: 13 }} />
                <span className="rh-if">If they</span>{' '}
                <span dangerouslySetInnerHTML={richInnerHtml(b.reaction)} />
              </div>
              <div className="rh-say">
                <span className="rh-say-tag">Say</span>
                <span className="rh-say-line" dangerouslySetInnerHTML={richInnerHtml(b.say)} />
              </div>
              {b.why && (
                <div className="rh-why">
                  <Icon.spark className="ic rh-why-ic" style={{ width: 11, height: 11 }} />
                  <span dangerouslySetInnerHTML={richInnerHtml(b.why)} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {exit && (
        <div className="rh-exit">
          <Icon.check className="ic rh-exit-ic" style={{ width: 14, height: 14 }} />
          <span>
            <span className="rh-exit-tag">If you need to wrap it up</span>{' '}
            <span dangerouslySetInnerHTML={richInnerHtml(exit)} />
          </span>
        </div>
      )}

      <p className="rh-note">A rehearsal, not a prediction — say it your way.</p>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
