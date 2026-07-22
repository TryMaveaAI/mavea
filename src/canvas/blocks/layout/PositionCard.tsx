import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PositionCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PositionCardProps & { delay?: number };

const TONE: Record<string, string> = {
  good: 'var(--insight)',
  caution: 'var(--warning)',
  bad: 'var(--danger)',
};

// "How bad is this / where does it fall." A calibrated low→high scale with the current position
// marked, an honest read of that level, and concrete escalation triggers. Merges the triage ladder,
// the normal↔concerning spectrum, and the reassure-and-watch card into one honest positioning
// surface — it shows a RANGE, never a fake-precise verdict.
export function PositionCard({
  title,
  icon = 'alert',
  iconColor,
  levels,
  atLevel,
  marker,
  reason,
  watchFor,
  caveat,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.alert;
  const lv = levels ?? [];
  const active = typeof atLevel === 'number' ? Math.max(0, Math.min(lv.length - 1, atLevel)) : -1;
  const cur = active >= 0 ? lv[active] : undefined;
  const curColor = cur?.tone ? TONE[cur.tone] : 'var(--presence)';
  const watch = watchFor ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor || curColor }} /> {title}
      </div>

      <div className="pc-track">
        {lv.map((l, i) => (
          <div
            key={i}
            className={'pc-seg' + (i === active ? ' on' : '')}
            style={
              { ['--pc' as string]: l.tone ? TONE[l.tone] : 'var(--text-muted)' } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="pc-labels">
        {lv.map((l, i) => (
          <span key={i} className={'pc-label' + (i === active ? ' on' : '')}>
            {l.label}
          </span>
        ))}
      </div>

      {cur && (
        <div className="pc-current" style={{ ['--pc' as string]: curColor } as CSSProperties}>
          <span className="pc-marker">{marker || 'Where this falls'}</span>
          <div className="pc-cur-label">{cur.label}</div>
          {cur.detail && <div className="pc-cur-detail">{cur.detail}</div>}
        </div>
      )}
      {reason && <div className="pc-reason">{reason}</div>}

      {watch.length > 0 && (
        <div className="pc-watch">
          <div className="pc-watch-h">
            <Icon.alert className="ic" /> Get it checked if
          </div>
          <ul className="pc-watch-list">
            {watch.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {caveat && <div className="pc-caveat">{caveat}</div>}

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
