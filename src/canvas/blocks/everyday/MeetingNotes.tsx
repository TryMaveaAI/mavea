import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MeetingNotesProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MeetingNotesProps & { delay?: number };

// A post-meeting summary — distinct from agenda (pre-meeting scheduling): attendees, what was
// discussed, what got decided, and a checklist of who owns what next. Every section but the
// action items is optional, so a quick recap with just decisions or just action items still
// renders cleanly instead of showing empty headers.
export function MeetingNotes({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  meetingDate,
  attendees,
  discussionPoints,
  decisions,
  actionItems,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const safeAttendees = attendees ?? [];
  const safePoints = discussionPoints ?? [];
  const safeDecisions = decisions ?? [];
  const safeActions = actionItems ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {meetingDate && <div className="mn-date">{meetingDate}</div>}

      {safeAttendees.length > 0 && (
        <div className="mn-attendees">
          {safeAttendees.map((name, i) => (
            <span key={i} className="mn-attendee">
              {name}
            </span>
          ))}
        </div>
      )}

      {safePoints.length > 0 && (
        <div className="mn-section">
          <div className="mn-section-label">Discussion</div>
          <ul className="mn-bullets">
            {safePoints.map((pt, i) => (
              <li key={i} className="mn-bullet">
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {safeDecisions.length > 0 && (
        <div className="mn-section">
          <div className="mn-section-label">Decisions</div>
          <ul className="mn-bullets mn-bullets--decided">
            {safeDecisions.map((d, i) => (
              <li key={i} className="mn-bullet mn-bullet--decided">
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {safeActions.length > 0 && (
        <div className="mn-section">
          <div className="mn-section-label">Action items</div>
          <ul className="mn-actions">
            {safeActions.map((a, i) => (
              <li
                key={i}
                className={`mn-action m-stagger-item m-fade-rise${a.done ? ' done' : ''}`}
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span className="mn-action-check" aria-hidden="true">
                  {a.done ? <Icon.check className="ic" /> : null}
                </span>
                <span className="mn-action-task">{a.task}</span>
                {(a.owner || a.dueDate) && (
                  <span className="mn-action-badges">
                    {a.owner && <span className="mn-badge mn-badge--owner">{a.owner}</span>}
                    {a.dueDate && <span className="mn-badge mn-badge--due">{a.dueDate}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
