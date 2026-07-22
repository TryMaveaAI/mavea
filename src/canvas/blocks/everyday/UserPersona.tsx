import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { UserPersonaProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = UserPersonaProps & { delay?: number };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

// A UX research persona card: a portrait-left header, goals and frustrations as two tinted
// bullet columns (insight for what they want, warning for what's in their way), an italic
// pull-quote, and optional observed behaviors.
export function UserPersona({
  title,
  icon = 'eye',
  iconColor = 'var(--presence)',
  name,
  role,
  goals,
  frustrations,
  quote,
  behaviors,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.eye;
  const safeGoals = Array.isArray(goals) ? goals : [];
  const safeFrustrations = Array.isArray(frustrations) ? frustrations : [];
  const safeBehaviors = Array.isArray(behaviors) ? behaviors : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="up-header">
        <span className="up-portrait" aria-hidden="true">
          {initials(name || '?')}
        </span>
        <div className="up-identity">
          <span className="up-name">{name}</span>
          {role && <span className="up-role">{role}</span>}
        </div>
      </div>

      {quote && <div className="up-quote">“{quote}”</div>}

      {(safeGoals.length > 0 || safeFrustrations.length > 0) && (
        <div className="up-columns">
          {safeGoals.length > 0 && (
            <div className="up-col up-col--goals">
              <div className="up-col-label">
                <Icon.check className="ic" style={{ width: 12, height: 12 }} /> Goals
              </div>
              <ul className="up-list">
                {safeGoals.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {safeFrustrations.length > 0 && (
            <div className="up-col up-col--frustrations">
              <div className="up-col-label">
                <Icon.alert className="ic" style={{ width: 12, height: 12 }} /> Frustrations
              </div>
              <ul className="up-list">
                {safeFrustrations.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {safeBehaviors.length > 0 && (
        <div className="up-behaviors">
          <div className="up-col-label">Observed behaviors</div>
          <div className="up-behavior-chips">
            {safeBehaviors.map((b, i) => (
              <span key={i} className="up-behavior-chip">
                {b}
              </span>
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
