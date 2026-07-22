// A single horizontal composition bar with a labelled legend.
// Segment widths are derived from their share of the total.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { StackedBarProps } from '../data/conversation';

type Props = StackedBarProps & { delay?: number };

export function StackedBar({
  title,
  icon = 'layers',
  iconColor = 'var(--presence-soft)',
  total,
  segments,
  footer,
  conf,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1; // guard all-zero segments
  // The widest segment is the extreme value — Mavéa's gesture circles it.
  const bigIdx = segments.reduce((best, s, i) => (s.value > segments[best].value ? i : best), 0);
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {total && <div className="stack-total tab-num">{total}</div>}
      <div className="stack-bar">
        {segments.map((s, i) => (
          <div
            className="stack-seg"
            key={i}
            title={`${s.label} · ${s.display}`}
            data-mark={i === bigIdx ? 'circle' : undefined}
            style={{ width: `${(s.value / sum) * 100}%`, background: s.color }}
          ></div>
        ))}
      </div>
      <div className="stack-legend">
        {segments.map((s, i) => (
          <div className="stack-leg" key={i}>
            <span className="sw" style={{ background: s.color }}></span>
            <span className="stack-leg-name">{s.label}</span>
            <span className="stack-leg-val tab-num">{s.display}</span>
          </div>
        ))}
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
