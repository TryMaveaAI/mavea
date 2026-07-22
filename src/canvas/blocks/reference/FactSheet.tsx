import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FactSheetProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FactSheetProps & { delay?: number };

// Structured fact card for a topic, person, place, or thing. The subject line acts
// as the headline, the fact rows carry label/value pairs with optional clarifying
// notes, and an optional prose section handles anything that doesn't fit a row.
export function FactSheet({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  subject,
  tagline,
  facts,
  body,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  const safeRows = facts ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fs-subject">{subject}</div>
      {tagline && <div className="fs-tagline">{tagline}</div>}

      {safeRows.length > 0 && (
        <div className="fs-facts">
          {safeRows.map((row, i) => (
            <div key={i} className="fs-row">
              <span className="fs-label">{row.label}</span>
              {/* first row is the author's lead fact (authored order); underline gesture
                  points at that value */}
              <span className="fs-value" {...(i === 0 ? { 'data-mark': 'underline' } : {})}>
                {row.value}
                {row.note && <span className="fs-note"> {row.note}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {body && <div className="fs-body" dangerouslySetInnerHTML={richInnerHtml(body)} />}

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
