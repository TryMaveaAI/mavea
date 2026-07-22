import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ExplodedViewProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ExplodedViewProps & { delay?: number };

const VB_W = 100;
const VB_H = 150;

// An exploded assembly: the parts are spread evenly along an axis (a dashed centerline running
// through them all), each part a simple plate with a numbered balloon. The geometry — spacing,
// the centerline, the balloon + leader positions — is COMPUTED from the part order, so the model
// only supplies the parts list. The figure sits beside the numbered list (n · name · ×qty).
export function ExplodedView({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  parts,
  axis = 'vertical',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const diagonal = axis === 'diagonal';

  // Evenly space the parts down the frame (diagonal also drifts them across it). A top + bottom
  // inset keeps the first/last balloons clear of the edges.
  const n = Math.max(1, parts.length);
  const top = 14;
  const bottom = VB_H - 14;
  const step = n > 1 ? (bottom - top) / (n - 1) : 0;
  const cx0 = diagonal ? 36 : 50;
  const drift = diagonal ? 26 / Math.max(1, n - 1) : 0;

  const plateW = diagonal ? 34 : 46;
  const plateH = Math.min(16, (step || 24) * 0.62);
  // Balloon radius no longer carries a fixed 6.4 — past ~12 parts, `step` shrinks below that
  // fixed size and neighboring balloons collide. Scale it down with the available spacing
  // instead, clamped to a legible floor.
  const balloonR = Math.max(3.2, Math.min(6.4, (step || 24) * 0.4));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="exp-wrap">
        <div className="exp-fig">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="exp-svg" role="img" aria-label={title}>
            {/* the assembly centerline the parts thread onto */}
            <line
              x1={cx0 + (diagonal ? 0 : 0)}
              y1={top}
              x2={cx0 + drift * (n - 1)}
              y2={bottom}
              className="exp-axis"
            />

            {parts.map((p, i) => {
              const cy = top + step * i;
              const cx = cx0 + drift * i;
              const px = cx - plateW / 2;
              const py = cy - plateH / 2;
              return (
                <g key={i}>
                  {/* leader from the centerline node out to the balloon */}
                  <line x1={cx} y1={cy} x2={px - 6} y2={cy} className="exp-leader" />
                  {/* the part plate — a simple beveled slab so the stack reads as solid parts */}
                  <rect
                    x={px}
                    y={py}
                    width={plateW}
                    height={plateH}
                    rx={2}
                    className="exp-plate"
                    {...(i === 0 ? { 'data-mark': 'circle' } : {})}
                  />
                  <line
                    x1={px}
                    y1={py + plateH * 0.34}
                    x2={px + plateW}
                    y2={py + plateH * 0.34}
                    className="exp-plate-line"
                  />
                  {/* a node where the part meets the centerline */}
                  <circle cx={cx} cy={cy} r={1.4} className="exp-node" />
                  {/* numbered balloon — radius (and its digit) shrink together as parts pack in */}
                  <circle cx={px - 11} cy={cy} r={balloonR} className="exp-balloon" />
                  <text
                    x={px - 11}
                    y={cy}
                    className="exp-balloon-num"
                    style={{ fontSize: Math.min(6, balloonR * 0.94) }}
                  >
                    {p.n}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <ol className="exp-list">
          {parts.map((p, i) => (
            <li key={i} className="exp-row">
              <span className="exp-row-n">{p.n}</span>
              <span className="exp-row-name">{p.name}</span>
              {p.qty != null && p.qty > 1 && <span className="exp-row-qty">×{p.qty}</span>}
            </li>
          ))}
        </ol>
      </div>

      {caption && <div className="exp-caption">{caption}</div>}

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
