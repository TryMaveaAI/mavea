// Up to three circular progress gauges, each rendered as a glowing SVG arc.
import { useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { RingStatProps } from '../data/conversation';

type Props = RingStatProps & { delay?: number };

export function RingStat({
  title,
  icon = 'spark',
  iconColor = 'var(--insight)',
  rings,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  // Stable, collision-free id for the gradient/filter refs (colons stripped for url() safety).
  const uid = 'rs' + useId().replace(/:/g, '');
  const R = 52,
    C = 2 * Math.PI * R;
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="ring-row">
        {rings.map((r, i) => {
          const pct = Math.max(0, Math.min(1, r.pct));
          const col = r.color || 'var(--presence)';
          return (
            <div className="ring-item" key={i}>
              <svg viewBox="0 0 130 130" className="ring-svg">
                <defs>
                  <linearGradient id={`${uid}g${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={col} stopOpacity="0.65" />
                    <stop offset="100%" stopColor={col} />
                  </linearGradient>
                  <filter id={`${uid}f${i}`} x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="3" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <circle cx="65" cy="65" r={R} fill="none" stroke="var(--track)" strokeWidth="11" />
                {/* the first ring is the authored lead — Mavéa's gesture circles its arc */}
                <circle
                  cx="65"
                  cy="65"
                  r={R}
                  fill="none"
                  stroke={`url(#${uid}g${i})`}
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - pct)}
                  filter={`url(#${uid}f${i})`}
                  transform="rotate(-90 65 65)"
                  className="ring-arc"
                  data-mark={i === 0 ? 'circle' : undefined}
                />
                {(() => {
                  // The center value must FIT inside the ring — scale it down as it gets
                  // longer (a number stays big; a phrase shrinks), and hard-clamp a very long
                  // one to the inner width so it can never spill past the arc and clip.
                  const display = String(r.display ?? '');
                  const len = display.length;
                  const fontSize = Math.max(9, Math.min(25, Math.round(155 / Math.max(1, len))));
                  const long = len > 10;
                  return (
                    <text
                      x="65"
                      y={r.unit ? 61 : 70}
                      textAnchor="middle"
                      className="ring-val"
                      style={{ fontSize }}
                      {...(long ? { textLength: 92, lengthAdjust: 'spacingAndGlyphs' } : {})}
                    >
                      {display}
                    </text>
                  );
                })()}
                {r.unit && (
                  <text x="65" y="80" textAnchor="middle" className="ring-unit">
                    {r.unit}
                  </text>
                )}
              </svg>
              <div className="ring-label">{r.label}</div>
              {r.hint && <div className="ring-hint">{r.hint}</div>}
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 6 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
