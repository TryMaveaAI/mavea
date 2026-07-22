import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DumbbellProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DumbbellProps & { delay?: number };

export function Dumbbell({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = '',
  startLabel = 'Start',
  endLabel = 'Now',
  startColor = 'var(--text-muted)',
  endColor = 'var(--presence)',
  domain,
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const all = rows.flatMap((r) => [r.start, r.end]);
  const lo = domain ? domain[0] : Math.min(...all, 0);
  const hi = domain ? domain[1] : Math.max(...all, 1);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  // The row with the largest absolute change between start and end is the headline movement.
  const salient = rows.reduce(
    (best, r, i) =>
      Math.abs(r.end - r.start) > Math.abs(rows[best].end - rows[best].start) ? i : best,
    0,
  );

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-db-legend">
        <span className="c2-db-leg">
          <i style={{ background: startColor }} /> {startLabel}
        </span>
        <span className="c2-db-leg">
          <i style={{ background: endColor }} /> {endLabel}
        </span>
      </div>
      <div className="c2-db">
        {rows.map((r, i) => {
          const a = pos(Math.min(r.start, r.end));
          const b = pos(Math.max(r.start, r.end));
          const gain = r.end >= r.start;
          const active = hot === i;
          return (
            <div
              key={i}
              className={'c2-db-row' + (active ? ' on' : '')}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
            >
              <div className="c2-db-name">
                <span className="c2-db-name-txt">{r.label}</span>
                {r.tag && <span className="c2-db-tag">{r.tag}</span>}
              </div>
              <div className="c2-db-track">
                <div className="c2-db-conn" style={{ left: `${a}%`, width: `${b - a}%` }} />
                <div
                  className="c2-db-dot"
                  style={{ left: `${pos(r.start)}%`, background: startColor }}
                />
                <div
                  className="c2-db-dot end"
                  style={{ left: `${pos(r.end)}%`, background: endColor }}
                  data-mark={i === salient ? 'point' : undefined}
                />
                {active && (
                  <div className="c2-db-tip" style={{ left: `${pos(r.end)}%` }}>
                    <span className="tab-num mono">
                      {r.start}
                      {unit}
                    </span>
                    <span
                      className="c2-db-arr"
                      style={{ color: gain ? 'var(--insight)' : 'var(--danger)' }}
                    >
                      →
                    </span>
                    <span
                      className="tab-num mono"
                      style={{ color: gain ? 'var(--insight)' : 'var(--danger)' }}
                    >
                      {r.end}
                      {unit}
                    </span>
                  </div>
                )}
              </div>
              <div
                className="c2-db-delta tab-num mono"
                style={{ color: gain ? 'var(--insight)' : 'var(--danger)' }}
              >
                {gain ? '+' : ''}
                {(r.end - r.start).toFixed(0)}
                {unit}
              </div>
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
