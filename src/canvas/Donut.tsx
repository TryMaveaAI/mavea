// Composition donut with a labelled legend, in the card shell.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { DonutProps } from '../data/conversation';

type Props = DonutProps & { delay?: number };

export function Donut({
  title,
  icon = 'chart',
  iconColor = 'var(--presence-soft)',
  size = 132,
  thickness = 18,
  rows,
  footer,
  conf,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const arcs = rows.map((s) => {
    const len = (c * s.pct) / 100;
    const a = { len, off: -acc, color: s.color };
    acc += len;
    return a;
  });
  // The largest slice is the salient visual shape — Mavéa's gesture circles it.
  const biggestIdx = rows.reduce((best, s, i) => (s.pct > rows[best].pct ? i : best), 0);
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="donut-wrap">
        <svg className="donut" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--surface-glass-strong)"
              strokeWidth={thickness}
            />
            {arcs.map((a, i) => (
              <circle
                key={i}
                className="donut-seg"
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, a.len - 1.5)} ${c - Math.max(0, a.len - 1.5)}`}
                strokeDashoffset={a.off}
                data-mark={i === biggestIdx ? 'circle' : undefined}
              />
            ))}
          </g>
        </svg>
        <ul className="donut-legend">
          {rows.map((s, i) => (
            <li key={i}>
              <i className="sw" style={{ background: s.color }} />
              <span className="dl-label">{s.label}</span>
              <span className="dl-pct tab-num">{s.pct}%</span>
            </li>
          ))}
        </ul>
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
