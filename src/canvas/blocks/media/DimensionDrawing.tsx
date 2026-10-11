import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent } from '../../lib';
import type { DimensionDrawingProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { placeDimensions, type DimSide, type PlacedDimension } from './dimensionLayout';

type Props = DimensionDrawingProps & { delay?: number };

// The viewBox the part + its dimension callouts are fitted into. Each side's margin is sized from
// the dimensions actually stacked on it, so a bare profile is drawn large and a heavily
// dimensioned one still keeps every callout inside the frame.
const VB_W = 200;
const VB_H = 130;
const EDGE = 6;
/** Gap from the part to the first dimension line, and between stacked lines (viewBox units). */
const FIRST_OFF = 11;
const TIER_STEP = 11;
/** Room past the outermost dimension line for its text (.dim-text is 5 units, monospace). */
const TEXT_ROOM = 8;
const CHAR_W = 3.05;

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

  const placed = placeDimensions(outline, dimensions);

  // Fit every authored point (the profile + both ends of each dimension), leaving each side the
  // room its own stack of dimension lines and labels needs.
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
  const margin = (side: DimSide) => {
    const onSide = placed.filter((p) => p.side === side);
    if (!onSide.length) return EDGE;
    const outer = FIRST_OFF + Math.max(...onSide.map((p) => p.tier)) * TIER_STEP;
    // A side label runs across the margin, so it needs its full width; a top/bottom one a line.
    const text =
      side === 'left' || side === 'right'
        ? Math.max(...onSide.map((p) => p.d.label.length * CHAR_W)) + 3
        : TEXT_ROOM;
    return outer + text + EDGE;
  };
  const m = {
    top: margin('top'),
    bottom: margin('bottom'),
    left: margin('left'),
    right: margin('right'),
  };
  const ex = extent(xs);
  const ey = extent(ys);
  const [minX, maxX] = ex ?? [0, 1];
  const [minY, maxY] = ey ?? [0, 1];
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const k = Math.max(
    0.01,
    Math.min((VB_W - m.left - m.right) / spanX, (VB_H - m.top - m.bottom) / spanY),
  );
  // Centre the drawing in the room the margins leave. SVG y grows downward, drawing y grows
  // upward, so flip.
  const cw = spanX * k;
  const ch = spanY * k;
  const ox = m.left + (VB_W - m.left - m.right - cw) / 2;
  const oy = m.top + (VB_H - m.top - m.bottom - ch) / 2;
  const tx = (x: number) => ox + (x - minX) * k;
  const ty = (y: number) => oy + (maxY - y) * k;
  const box = { x0: tx(minX), x1: tx(maxX), y0: ty(maxY), y1: ty(minY) };

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

          {placed.map((p, i) => (
            <Dimension key={i} placed={p} tx={tx} ty={ty} box={box} arrowId={arrowId} />
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

// One dimension callout: a measurement line set off the part on its side, with extension lines
// back to the two measured points, double arrowheads, and the label beside the line on the side
// away from the part.
function Dimension({
  placed,
  tx,
  ty,
  box,
  arrowId,
}: {
  placed: PlacedDimension;
  tx: (x: number) => number;
  ty: (y: number) => number;
  box: { x0: number; x1: number; y0: number; y1: number };
  arrowId: string;
}) {
  const { d, side, tier } = placed;
  const p1 = { x: tx(d.from[0]), y: ty(d.from[1]) };
  const p2 = { x: tx(d.to[0]), y: ty(d.to[1]) };
  // Measured from the part's outer edge, not the span's own points, so a span on an inner edge
  // (the L's step) still clears the whole profile instead of cutting back across it.
  const off = FIRST_OFF + tier * TIER_STEP;
  const lineAt =
    side === 'top'
      ? box.y0 - off
      : side === 'bottom'
        ? box.y1 + off
        : side === 'left'
          ? box.x0 - off
          : box.x1 + off;
  const horizontal = side === 'top' || side === 'bottom';
  const a1 = horizontal ? { x: p1.x, y: lineAt } : { x: lineAt, y: p1.y };
  const a2 = horizontal ? { x: p2.x, y: lineAt } : { x: lineAt, y: p2.y };

  const textW = d.label.length * CHAR_W;
  const midX = (a1.x + a2.x) / 2;
  const textX = horizontal
    ? Math.min(Math.max(midX, textW / 2 + 2), VB_W - textW / 2 - 2)
    : side === 'left'
      ? lineAt - 2.5
      : lineAt + 2.5;
  const textY = horizontal ? (side === 'top' ? lineAt - 2 : lineAt + 6) : (a1.y + a2.y) / 2;
  const anchor = horizontal ? 'middle' : side === 'left' ? 'end' : 'start';

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
        y={textY}
        className="dim-text"
        textAnchor={anchor}
        dominantBaseline={horizontal ? 'auto' : 'middle'}
      >
        {d.label}
      </text>
    </g>
  );
}
