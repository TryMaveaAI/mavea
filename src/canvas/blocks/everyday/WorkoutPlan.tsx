import { type CSSProperties, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { WorkoutPlanProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WorkoutPlanProps & { delay?: number };

export function WorkoutPlan({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  goal,
  weeks,
  sessions,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [active, setActive] = useState(0);

  const session = sessions[active];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(goal || weeks) && (
        <div className="wp-header">
          {goal && <span className="wp-goal">{goal}</span>}
          {weeks && <span className="wp-weeks">{weeks}-week plan</span>}
        </div>
      )}

      <div className="wp-tabs">
        {sessions.map((s, i) => (
          <button
            key={i}
            className={`wp-tab${i === active ? ' active' : ''}`}
            onClick={() => setActive(i)}
          >
            {s.day}
          </button>
        ))}
      </div>

      {session && (
        <div className="wp-session">
          {session.focus && <div className="wp-focus">{session.focus}</div>}
          <div className="wp-exercises">
            {(session.exercises ?? []).map((ex, i) => (
              <div key={i} className="wp-exercise">
                <div className="wp-ex-name">{ex.name}</div>
                <div className="wp-ex-badges">
                  {ex.sets !== undefined && <span className="wp-badge">{ex.sets} sets</span>}
                  {ex.reps && <span className="wp-badge">{ex.reps} reps</span>}
                  {ex.duration && <span className="wp-badge">{ex.duration}</span>}
                  {ex.rest && (
                    <span className="wp-badge wp-badge--rest">
                      <Icon.clock className="ic" style={{ width: 10, height: 10 }} /> {ex.rest}
                    </span>
                  )}
                </div>
                {ex.note && <div className="wp-ex-note">{ex.note}</div>}
              </div>
            ))}
          </div>
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
