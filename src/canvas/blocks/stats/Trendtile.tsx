import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TrendtileProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TrendtileProps & { delay?: number };

// Logical sparkbar canvas — drawn in a viewBox and scaled to the slot by CSS, so any
// number of bars fits the tile width (the column slot is a fraction of TT_W, never a fixed px).
const TT_W = 130;
const TT_H = 56;
const TT_GAP = 1.5; // gap between bars, in the same logical units as the slot

export function Trendtile({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  value,
  delta,
  deltaDir = 'up',
  color = 'var(--presence)',
  bars,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // cap the rendered bars so a long series can't overflow the fixed-width sparkbar slot;
  // keep the most-recent ones (the last bar is "current")
  const shown = bars.length > 40 ? bars.slice(-40) : bars;
  // clamp at 0 so an empty series doesn't seed a -1 index
  const [hover, setHover] = useState<number>(Math.max(0, shown.length - 1));
  const max = Math.max(...shown, 1);

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="tt-body">
        <div className="tt-left">
          {/* the headline value is the one datum Mavéa's drawn gesture underlines */}
          <div className="tt-value tab-num" data-mark="underline" style={{ color }}>
            {value}
          </div>
          <div className={`tt-delta delta ${deltaDir}`}>
            <Icon.arrowUp
              className="ic"
              style={{
                width: 14,
                height: 14,
                transform: deltaDir === 'down' ? 'rotate(180deg)' : 'none',
              }}
            />
            {delta}
          </div>
        </div>

        {/* Sparkbars in a scaling viewBox: column slots are computed as a fraction of the
            logical width, so the whole series fits at any tile width — fixed-px bars + gaps
            would accumulate past a narrow slot and clip every bar after the first couple. */}
        {/* Explicit width/height pin the SVG box to the viewBox's own units (1:1 height),
            so a full-height bar can't render taller than the 56px slot and clip top/bottom —
            without them the SVG falls back to its intrinsic size inside the flex row. */}
        <svg
          className="tt-bars"
          viewBox={`0 0 ${TT_W} ${TT_H}`}
          width="100%"
          height={TT_H}
          preserveAspectRatio="none"
          role="group"
          aria-label="recent trend"
        >
          {shown.map((b, i) => {
            const slot = TT_W / shown.length;
            const bw = Math.max(1, slot - TT_GAP);
            // clamp into [floor, TT_H] so the tallest bar fills — but never exceeds — the plot
            const bh = Math.min(TT_H, Math.max(TT_H * 0.08, (b / max) * TT_H));
            return (
              <rect
                key={i}
                className={`tt-bar ${i === hover ? 'on' : ''}`}
                x={i * slot + (slot - bw) / 2}
                y={TT_H - bh}
                width={bw}
                height={bh}
                rx={1.5}
                fill={i === hover ? color : 'var(--track)'}
                onMouseEnter={() => setHover(i)}
              >
                <title>{String(b)}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
