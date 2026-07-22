import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BulletkpiProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BulletkpiProps & { delay?: number };

export function Bulletkpi({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null);
  // the row with the highest value is the most salient bar Mavéa's drawn gesture circles
  const salient = (() => {
    let top = 0;
    rows.forEach((r, i) => {
      if (r.value > rows[top].value) top = i;
    });
    return top;
  })();

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="bk-list">
        {rows.map((r, i) => {
          const c = r.color || 'var(--presence)';
          // floor the full-scale max so a 0 max yields a finite 0% instead of NaN/Infinity width
          const scale = r.max || 1;
          const valPct = Math.max(0, Math.min(100, (r.value / scale) * 100));
          const tgtPct = Math.max(0, Math.min(100, (r.target / scale) * 100));
          const met = r.value >= r.target;
          const on = hover === i;
          const pctTarget = r.target === 0 ? 0 : Math.round((r.value / r.target) * 100);
          return (
            <div
              key={i}
              className={`bk-row ${on ? 'on' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="bk-head">
                <span className="bk-label">{r.label}</span>
                <span className="bk-val tab-num" style={{ color: c }}>
                  {r.display ?? r.value.toLocaleString()}
                </span>
              </div>
              <div className="bk-track">
                {/* qualitative band behind the bar */}
                <span className="bk-band" />
                <span
                  className="bk-fill"
                  data-mark={i === salient ? 'circle' : undefined}
                  style={{
                    width: valPct + '%',
                    background: met ? c : `color-mix(in oklab, ${c} 60%, var(--warning))`,
                  }}
                />
                <span
                  className="bk-target"
                  style={{ left: tgtPct + '%' }}
                  title={`target ${r.target}`}
                />
              </div>
              <div className="bk-meta faint tab-num" data-on={on}>
                {pctTarget}% of target{on ? ` · target ${r.target.toLocaleString()}` : ''}
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
