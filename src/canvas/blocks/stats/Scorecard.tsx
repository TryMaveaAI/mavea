import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScorecardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScorecardProps & { delay?: number };

export function Scorecard({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  cols = 2,
  tiles,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sc-grid" style={{ ['--sc-cols' as string]: cols } as CSSProperties}>
        {tiles.map((t, i) => {
          const TileIc = t.icon ? Icon[t.icon] || Icon.spark : null;
          const c = t.color || 'var(--presence)';
          const on = hover === i;
          return (
            <div
              key={i}
              className={`sc-tile ${on ? 'on' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="sc-tile-top">
                {TileIc && <TileIc className="ic sc-tile-ic" style={{ color: c }} />}
                <span className="sc-tile-label">{t.label}</span>
              </div>
              <div className="sc-tile-val tab-num" style={{ color: c }}>
                {t.value}
              </div>
              {t.delta && (
                <div className={`sc-tile-delta delta ${t.deltaDir || 'up'}`}>
                  <Icon.arrowUp
                    className="ic"
                    style={{
                      width: 12,
                      height: 12,
                      transform: t.deltaDir === 'down' ? 'rotate(180deg)' : 'none',
                    }}
                  />
                  {t.delta}
                </div>
              )}
              {t.detail && (
                <div
                  className="sc-tile-detail"
                  data-open={on}
                  dangerouslySetInnerHTML={richInnerHtml(t.detail)}
                />
              )}
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
