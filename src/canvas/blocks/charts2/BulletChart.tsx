import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BulletChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BulletChartProps & { delay?: number };

export function BulletChart({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  // A missed-target row is more urgent than a hit; among misses (or all hits) the largest
  // value bar is the most visually dominant — that's the one the gesture circles.
  const salient = (() => {
    const misses = rows.map((r, i) => ({ i, miss: r.value < r.target }));
    const candidates = misses.filter((m) => m.miss);
    const pool = candidates.length ? candidates.map((m) => m.i) : rows.map((_, i) => i);
    return pool.reduce((best, i) => (rows[i].value > rows[best].value ? i : best), pool[0]);
  })();

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-bul" onMouseLeave={() => setHot(null)}>
        {rows.map((r, i) => {
          const col = r.color || 'var(--presence)';
          const bands = r.bands && r.bands.length ? r.bands : [r.max * 0.5, r.max * 0.8];
          const pct = (v: number) => Math.min(100, (v / (r.max || 1)) * 100);
          const hit = r.value >= r.target;
          const active = hot === i;
          return (
            <div
              key={i}
              className={'c2-bul-row' + (active ? ' on' : '')}
              onMouseEnter={() => setHot(i)}
            >
              <div className="c2-bul-head">
                <span className="c2-bul-name">{r.label}</span>
                <span
                  className="c2-bul-num tab-num mono"
                  style={{ color: hit ? 'var(--insight)' : 'var(--warning)' }}
                >
                  {r.value}
                  {r.unit || ''}
                  <span className="faint">
                    {' '}
                    / {r.target}
                    {r.unit || ''}
                  </span>
                </span>
              </div>
              <div className="c2-bul-track">
                {[...bands, r.max].map((b, bi) => {
                  const start = bi === 0 ? 0 : pct(bands[bi - 1]);
                  const w = pct(b) - start;
                  const op = 0.12 + bi * 0.1;
                  return (
                    <div
                      key={bi}
                      className="c2-bul-band"
                      style={{
                        left: `${start}%`,
                        width: `${w}%`,
                        background: `color-mix(in oklab, var(--text-muted) ${op * 100}%, transparent)`,
                      }}
                    />
                  );
                })}
                <div
                  className="c2-bul-measure"
                  style={{ width: `${pct(r.value)}%`, background: col }}
                  data-mark={i === salient ? 'circle' : undefined}
                />
                <div
                  className="c2-bul-target"
                  style={{ left: `${pct(r.target)}%` }}
                  title={`Target ${r.target}`}
                />
                {active && (
                  <div className="c2-bul-tip" style={{ left: `${Math.min(pct(r.value), 88)}%` }}>
                    <span className="tab-num mono" style={{ color: col }}>
                      {r.value}
                      {r.unit || ''}
                    </span>
                    <span className="faint">
                      vs goal {r.target}
                      {r.unit || ''}
                    </span>
                    <span
                      className="tab-num mono"
                      style={{ color: hit ? 'var(--insight)' : 'var(--danger)' }}
                    >
                      {hit ? '✓ met' : `${(r.target - r.value).toFixed(0)} short`}
                    </span>
                  </div>
                )}
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
