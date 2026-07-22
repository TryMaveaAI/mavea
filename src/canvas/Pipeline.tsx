// Deal-stage funnel: a bar per stage, each scaled to the largest stage value.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { PipelineProps } from '../data/conversation';

type Props = PipelineProps & { delay?: number };

export function Pipeline({
  title = 'By stage',
  icon = 'layers',
  iconColor = 'var(--presence-soft)',
  headline,
  sub,
  unit = '$',
  suffix = 'M',
  stages,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const max = Math.max(1, ...stages.map((s) => s.v)); // 1 floor guards an empty/all-zero funnel
  // The biggest stage is the extreme value — Mavéa's gesture circles its bar fill.
  const topIdx = stages.reduce((best, s, i) => (s.v > stages[best].v ? i : best), 0);
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {(headline || sub) && (
        <div className="stat-row">
          {headline && (
            <div className="big-stat tab-num" style={{ color: 'var(--presence)' }}>
              {headline}
            </div>
          )}
          {sub && <span className="delta accent">{sub}</span>}
        </div>
      )}
      <ul className="funnel">
        {stages.map((s, i) => (
          <li key={i} className="funnel-row" style={{ '--ti': i } as CSSProperties}>
            <span className="funnel-label">{s.k}</span>
            <span className="funnel-track">
              <span
                className="funnel-fill"
                data-mark={i === topIdx ? 'circle' : undefined}
                style={{ width: (s.v / max) * 100 + '%' }}
              />
            </span>
            <span className="funnel-val tab-num">
              {unit}
              {s.v}
              {suffix}
            </span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
