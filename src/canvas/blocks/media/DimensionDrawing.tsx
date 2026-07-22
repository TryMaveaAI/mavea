import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent } from '../../lib';
import type { DimensionDrawingProps, DimensionLine } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DimensionDrawingProps & { delay?: number };

// The viewBox the part + its dimension callouts are fitted into. A generous margin leaves room
// for the dimension lines, which sit off the part edges, plus their measurement text.
const VB_W = 200;
const VB_H = 130;
const MARGIN = 30;

// A shop drawing: a part profile drawn to scale with proper dimension lines, fitted to the frame.
// We compute a single uniform transform (scale + offset) that maps the authored drawing-unit
// coordinates — outline AND dimension endpoints together — into the viewBox, so nothing clips and
// the part keeps its true proportions. Dimension lines get extension lines, arrowheads, and text.
export function DimensionDrawing({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  outline,
  dimensions,
  tolerance,
  titleBlock,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const arrowId = `med-dim-arrow-${useId().replace(/:/g, '')}`;

  // Fit every authored point (the profile + both ends of each dimension) so dimension callouts
  // that sit outside the part still land inside the frame.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of outline) {
    xs.push(p.x);
    ys.push(p.y);
  }
  for (const d of dimensions) {
    xs.push(d.from[0], d.to[0]);
    ys.push(d.from[1], d.to[1]);
  }
  const ex = extent(xs);
  const ey = extent(ys);
  const [minX, maxX] = ex ?? [0, 1];
  const [minY, maxY] = ey ?? [0, 1];
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const k = Math.min((VB_W - MARGIN * 2) / spanX, (VB_H - MARGIN * 2) / spanY);
  // Centre the drawing in the frame. SVG y grows downward, drawing y grows upward, so flip.
  const cw = spanX * k;
  const ch = spanY * k;
  const ox = (VB_W - cw) / 2;
  const oy = (VB_H - ch) / 2;
  const tx = (x: number) => ox + (x - minX) * k;
  const ty = (y: number) => oy + (maxY - y) * k;

  const path =
    outline.length >= 3
      ? outline.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.x)},${ty(p.y)}`).join(' ') + ' Z'
      : '';

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

      <div className="dim-wrap">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="dim-svg" role="img" aria-label={title}>
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {/* the part profile */}
          <path d={path} className="dim-part" data-mark="circle" />

          {dimensions.map((d, i) => (
            <Dimension key={i} d={d} tx={tx} ty={ty} k={k} arrowId={arrowId} />
          ))}
        </svg>
      </div>

      {(titleBlock || tolerance) && (
        <div className="dim-block">
          {titleBlock?.part && (
            <div className="dim-block-cell">
              <span className="dim-block-k">Part</span>
              <span className="dim-block-v">{titleBlock.part}</span>
            </div>
          )}
          {titleBlock?.scale && (
            <div className="dim-block-cell">
              <span className="dim-block-k">Scale</span>
              <span className="dim-block-v">{titleBlock.scale}</span>
            </div>
          )}
          {titleBlock?.units && (
            <div className="dim-block-cell">
              <span className="dim-block-k">Units</span>
              <span className="dim-block-v">{titleBlock.units}</span>
            </div>
          )}
          {tolerance && (
            <div className="dim-block-cell dim-block-tol">
              <span className="dim-block-k">Tol</span>
              <span className="dim-block-v">{tolerance}</span>
            </div>
          )}
        </div>
      )}

      {caption && <div className="dim-caption">{caption}</div>}

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

// One dimension callout: a measurement line offset off the part with extension lines back to the
// two measured points, double arrowheads, and the label centred on the dimension line. Horizontal
// spans offset vertically, vertical spans horizontally — the usual drafting convention.
function Dimension({
  d,
  tx,
  ty,
  k,
  arrowId,
}: {
  d: DimensionLine;
  tx: (x: number) => number;
  ty: (y: number) => number;
  k: number;
  arrowId: string;
}) {
  const [fx, fy] = d.from;
  const [gx, gy] = d.to;
  const horizontal = Math.abs(gx - fx) >= Math.abs(gy - fy);
  // Offset is in drawing units; scale it into viewBox units. Sign chooses the side.
  const off = (d.offset ?? 10) * k;

  // The two measured points on the part, in viewBox space.
  const p1 = { x: tx(fx), y: ty(fy) };
  const p2 = { x: tx(gx), y: ty(gy) };

  // The dimension line itself sits `off` away, perpendicular to the span.
  let a1, a2, mid;
  if (horizontal) {
    const dy = -Math.abs(off); // above the part by default (screen-up)
    a1 = { x: p1.x, y: Math.min(p1.y, p2.y) + dy };
    a2 = { x: p2.x, y: Math.min(p1.y, p2.y) + dy };
    mid = { x: (a1.x + a2.x) / 2, y: a1.y - 2 };
  } else {
    const dx = Math.abs(off); // right of the part by default
    a1 = { x: Math.max(p1.x, p2.x) + dx, y: p1.y };
    a2 = { x: Math.max(p1.x, p2.x) + dx, y: p2.y };
    mid = { x: a1.x + 3, y: (a1.y + a2.y) / 2 };
  }

  // The demo's dimension strings are short ("60", "18") and never approach the viewBox edge;
  // a longer label (a custom callout rather than a bare number) can. Estimate the label's
  // rendered half-width at .dim-text's 5px monospace font (~3 units/char) and, rather than
  // letting it run past the boundary, clamp a centred label back inside the margin or flip a
  // right-growing one to grow left instead.
  const halfW = (d.label.length * 3) / 2;
  const textAnchor = horizontal ? 'middle' : 'start';
  let textX = mid.x;
  if (horizontal) {
    textX = Math.min(Math.max(mid.x, halfW + 2), VB_W - halfW - 2);
  } else if (mid.x + d.label.length * 3 > VB_W - 2) {
    textX = a1.x - 3;
  }
  const flippedAnchor = !horizontal && textX !== mid.x ? 'end' : textAnchor;

  return (
    <g>
      {/* extension lines from each measured point out to the dimension line */}
      <line x1={p1.x} y1={p1.y} x2={a1.x} y2={a1.y} className="dim-ext" />
      <line x1={p2.x} y1={p2.y} x2={a2.x} y2={a2.y} className="dim-ext" />
      {/* the dimension line with arrowheads at both ends */}
      <line
        x1={a1.x}
        y1={a1.y}
        x2={a2.x}
        y2={a2.y}
        className="dim-line"
        markerStart={`url(#${arrowId})`}
        markerEnd={`url(#${arrowId})`}
      />
      <text
        x={textX}
        y={mid.y}
        className="dim-text"
        textAnchor={flippedAnchor}
        dominantBaseline={horizontal ? 'auto' : 'middle'}
      >
        {d.label}
      </text>
    </g>
  );
}
