import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VennProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VennProps & { delay?: number };

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)'];

// 2- or 3-circle set diagram. Circles use a translucent fill so intersections darken where
// they overlap; each exclusive region and each intersection carries an optional count.
// Centers are fixed per set-count; labels/values sit just outside each circle (exclusive)
// or at the mean of the involved centers (intersection) — a good-enough centroid that reads
// clearly without solving exact lens geometry. Hovering a set lifts it and dims the others.
export function Venn({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  sets,
  overlaps = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hot, setHot] = useState<number | null>(null);

  const n = Math.min(3, Math.max(2, sets.length));
  const W = 320;
  const H = n === 2 ? 190 : 216;

  const layout = useMemo(() => {
    const centers =
      n === 2
        ? [
            { x: 128, y: 96 },
            { x: 192, y: 96 },
          ]
        : [
            { x: 130, y: 86 },
            { x: 190, y: 86 },
            { x: 160, y: 146 },
          ];
    const r = n === 2 ? 60 : 54;
    const cx = centers.reduce((s, c) => s + c.x, 0) / n;
    const cy = centers.reduce((s, c) => s + c.y, 0) / n;
    return { centers, r, cx, cy };
  }, [n]);

  const { centers, r, cx, cy } = layout;

  // Push a set's exclusive label outward from the group centroid so it lands off the overlap.
  const exclusivePos = (i: number) => {
    const c = centers[i];
    let dx = c.x - cx,
      dy = c.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    return { x: c.x + dx * r * 0.52, y: c.y + dy * r * 0.52 };
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c1-venn" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="c1-venn-svg" role="img">
          {centers.slice(0, n).map((c, i) => {
            const col = sets[i]?.color || PALETTE[i % PALETTE.length];
            const active = hot === i;
            const dim = hot !== null && !active;
            return (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={r}
                fill={`color-mix(in oklab, ${col} ${active ? 42 : 26}%, transparent)`}
                stroke={col}
                strokeWidth={active ? 2.5 : 1.5}
                style={{ opacity: dim ? 0.35 : 1, transition: 'opacity var(--m-fast)' }}
                onMouseEnter={() => setHot(i)}
              />
            );
          })}

          {/* intersection counts */}
          {overlaps.map((o, k) => {
            const ids = o.sets.filter((i) => i < n);
            if (ids.length < 2) return null;
            const x = ids.reduce((s, i) => s + centers[i].x, 0) / ids.length;
            const y = ids.reduce((s, i) => s + centers[i].y, 0) / ids.length;
            return (
              <text key={`o${k}`} x={x} y={y} className="c1-venn-val" textAnchor="middle">
                {o.value ?? o.label ?? ''}
              </text>
            );
          })}

          {/* exclusive counts */}
          {sets.slice(0, n).map((s, i) =>
            s.value === undefined ? null : (
              <text
                key={`e${i}`}
                x={exclusivePos(i).x}
                y={exclusivePos(i).y}
                className="c1-venn-val"
                textAnchor="middle"
              >
                {s.value}
              </text>
            ),
          )}
        </svg>
      </div>

      <div className="c1-venn-legend">
        {sets.slice(0, n).map((s, i) => {
          const col = s.color || PALETTE[i % PALETTE.length];
          return (
            <button
              key={i}
              className={'c1-venn-leg' + (hot === i ? ' on' : '')}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
            >
              <i style={{ background: col }} />
              {s.label}
            </button>
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
