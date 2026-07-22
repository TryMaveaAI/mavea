// Radial dial with a center value and an optional driver note —
// covers risk scores, NPS, readiness, and similar single-number gauges.
import type { CSSProperties } from 'react';
import { richInnerHtml } from '../lib/richText';
import { Icon } from '../icons/icons';
import { ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { GaugeProps } from '../data/conversation';

type Props = GaugeProps & { delay?: number };

export function Gauge({
  title,
  icon = 'spark',
  iconColor = 'var(--insight)',
  value,
  max = 100,
  size = 116,
  color,
  band,
  driver,
  footer,
  conf,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const r = size / 2 - 10;
  const frac = Math.max(0, Math.min(1, value / max));
  const col = color || (value >= 40 ? 'var(--warning)' : 'var(--insight)');
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="risk-wrap">
        <div className="gauge-host">
          <svg className="gauge" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--surface-glass-strong)"
              strokeWidth="9"
            />
            <circle
              className="gauge-arc"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={col}
              strokeWidth="9"
              strokeLinecap="round"
              // pathLength normalises the arc to 0–1 so it reads as a percent directly and the
              // bloom layer can sweep it closed on first paint with a CSS keyframe.
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - frac}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="gauge-center">
            {/* the dial's center readout is the one datum Mavéa's drawn gesture underlines */}
            <div className="gauge-num tab-num" data-mark="underline" style={{ color: col }}>
              {value}
            </div>
            {band && <div className="gauge-band">{band}</div>}
          </div>
        </div>
        {driver && <p className="risk-driver" dangerouslySetInnerHTML={richInnerHtml(driver)} />}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
      {conf && (
        <div className="card-foot">
          <div className="card-foot-l" />
          <ConfidenceBadge level={conf} title={CONF_TITLE_UNVERIFIED} />
        </div>
      )}
    </div>
  );
}
