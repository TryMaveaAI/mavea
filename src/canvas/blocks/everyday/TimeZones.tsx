import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TimezonesProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TimezonesProps & { delay?: number };

// World-clock comparison card. The home row (isHome) is visually anchored with the
// accent color so the user's reference timezone reads at a glance. localTime is shown
// when provided; the timezone IANA key is shown as a fallback so the card never goes
// blank. Timezone abbreviation (derived from the offset string) sits between city and
// time, giving both human-readable context and numeric precision.
export function TimeZones({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  baseTime,
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const safeRows = rows ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {baseTime && <div className="tz-base">Reference: {baseTime}</div>}

      <div className="tz-rows">
        {safeRows.map((row, i) => {
          // Home row is explicitly flagged; fall back to first row when none is marked
          const homeIdx = safeRows.findIndex((r) => r.isHome);
          const isSalient = row.isHome || (homeIdx === -1 && i === 0);
          return (
            <div key={i} className={row.isHome ? 'tz-row home' : 'tz-row'}>
              <span className="tz-city">{row.city}</span>
              <span className="tz-offset">{row.offset}</span>
              <span className="tz-time" {...(isSalient ? { 'data-mark': 'underline' } : {})}>
                {row.localTime ?? row.timezone}
              </span>
            </div>
          );
        })}
      </div>

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
