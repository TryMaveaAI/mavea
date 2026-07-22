import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { PatternPieceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PatternPieceProps & { delay?: number };

// A piece label is centered in a rect sized by the author's own w/h, so a long name ("Left Front
// Bodice Lining") on a narrow piece runs past its edges — the same overrun CutList/FloorPlan hit
// with author-supplied text. Budget a character count from the piece's own width at the label's
// actual font-size (~0.6 × font-size average glyph advance) and truncate with an ellipsis,
// keeping the full label as a native <title> tooltip so it's never silently lost, only shortened.
const PIECE_LABEL_CHAR_ADVANCE = 0.6;
function truncatePieceLabel(text: string, boxW: number, fontSize: number): string {
  const max = Math.max(3, Math.floor(boxW / (fontSize * PIECE_LABEL_CHAR_ADVANCE)));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// The same calm family cycle CutList/FloorPlan use, so the three rect-on-sheet figures read as one.
const PIECE_FILLS = [
  'color-mix(in oklab, var(--presence) 13%, transparent)',
  'color-mix(in oklab, var(--insight) 13%, transparent)',
  'color-mix(in oklab, var(--warning) 15%, transparent)',
  'color-mix(in oklab, var(--presence) 7%, transparent)',
  'color-mix(in oklab, var(--insight) 7%, transparent)',
];
const PIECE_STROKES = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
];

// A sewing-pattern / fabric cutting layout. The fabric rectangle is drawn to scale; each pattern
// piece is a labeled rectangle placed by its x/y, carrying a grainline arrow (the run of the weave)
// and — when its edge sits on the fold — a fold line in place of a cut edge. The yield (placed area
// × qty ÷ fabric area) is COMPUTED, so the efficiency note honestly reflects the layout.
export function PatternPiece({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  fabric,
  pieces,
  unit = 'cm',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const uid = useId().replace(/:/g, '');

  const fabW = Math.max(1, fabric.w);
  const fabH = Math.max(1, fabric.h);

  // The figure is drawn in fabric units (a viewBox), so the layout is exactly to scale. The fold
  // runs down the left edge of the fabric — the convention this layout marks pieces against.
  const PAD = Math.max(fabW, fabH) * 0.04;
  const vbW = fabW + PAD * 2;
  const vbH = fabH + PAD * 2;

  // Yield: every piece's footprint × its quantity over the fabric area. A piece is counted only for
  // the area that lands on the fabric, so an overhang never inflates the number past 100%.
  const usedArea = pieces.reduce((sum, p) => {
    const w = Math.max(0, Math.min(p.w, fabW - p.x));
    const h = Math.max(0, Math.min(p.h, fabH - p.y));
    return sum + w * h * Math.max(1, p.qty ?? 1);
  }, 0);
  const yieldPct = Math.min(100, Math.round((usedArea / (fabW * fabH)) * 100));

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

      <div className="pat-figwrap">
        <svg viewBox={`0 0 ${vbW} ${vbH}`} className="pat-svg" role="img" aria-label={title}>
          <defs>
            {/* a double-ended grainline arrowhead, reused by every piece */}
            <marker
              id={`pat-grain-${uid}`}
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path d="M0,3 L5,0.5 L4,3 L5,5.5 Z" className="pat-grain-head" />
            </marker>
          </defs>

          {/* the fabric, folded along its left edge */}
          <rect x={PAD} y={PAD} width={fabW} height={fabH} className="pat-fabric" />
          <line
            x1={PAD}
            y1={PAD}
            x2={PAD}
            y2={PAD + fabH}
            className="pat-foldedge"
            strokeWidth={Math.max(0.4, fabW * 0.006)}
          />
          <text
            className="pat-foldlabel"
            transform={`translate(${PAD + fabW * 0.022},${PAD + fabH / 2}) rotate(-90)`}
          >
            <tspan x={0} y={0}>
              FOLD
            </tspan>
          </text>
          {fabric.label && (
            <text
              x={PAD + fabW - 1}
              y={PAD - PAD * 0.35}
              textAnchor="end"
              className="pat-fabriclabel"
            >
              {fabric.label}
            </text>
          )}

          {pieces.map((p, i) => {
            const stroke = PIECE_STROKES[i % PIECE_STROKES.length];
            const fill = PIECE_FILLS[i % PIECE_FILLS.length];
            const x = PAD + p.x;
            const y = PAD + p.y;
            const midX = x + p.w / 2;
            const midY = y + p.h / 2;
            // The grainline runs the height of the piece, down its centre, inset off the edges.
            const gInset = p.h * 0.14;
            const small = Math.min(p.w, p.h) < Math.max(fabW, fabH) * 0.1;
            const qty = Math.max(1, p.qty ?? 1);

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={p.w}
                  height={p.h}
                  rx={Math.min(1.5, fabW * 0.005)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={fabW * 0.004}
                  strokeDasharray={p.fold ? undefined : `${fabW * 0.012} ${fabW * 0.008}`}
                />
                {/* an "on fold" mark replaces the cut edge on the piece's left side */}
                {p.fold && (
                  <line
                    x1={x}
                    y1={y}
                    x2={x}
                    y2={y + p.h}
                    className="pat-onfold"
                    strokeWidth={fabW * 0.006}
                  />
                )}
                {/* grainline arrow — the straight grain the piece must be cut along */}
                <line
                  x1={midX}
                  y1={y + gInset}
                  x2={midX}
                  y2={y + p.h - gInset}
                  className="pat-grain"
                  strokeWidth={Math.max(0.3, fabW * 0.0035)}
                  markerStart={`url(#pat-grain-${uid})`}
                  markerEnd={`url(#pat-grain-${uid})`}
                />
                {!small &&
                  (() => {
                    const fontSize = Math.max(fabW * 0.026, 2.4);
                    const shortLabel = truncatePieceLabel(p.label, p.w - fontSize, fontSize);
                    const isTruncated = shortLabel !== p.label;
                    return (
                      <text
                        x={midX}
                        y={midY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="pat-piece-lbl"
                        style={{ fontSize }}
                      >
                        {isTruncated && <title>{p.label}</title>}
                        <tspan x={midX} dy="-0.5em">
                          {shortLabel}
                        </tspan>
                        {(qty > 1 || p.fold) && (
                          <tspan x={midX} dy="1.4em" className="pat-piece-sub">
                            {p.fold ? 'cut 1 on fold' : `cut ${qty}`}
                          </tspan>
                        )}
                      </text>
                    );
                  })()}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="pat-stats">
        <div className="pat-stat">
          <span className="pat-stat-k">Fabric</span>
          <span className="pat-stat-v">
            {formatValue(fabW)} × {formatValue(fabH)} {unit}
          </span>
        </div>
        <div className="pat-stat">
          <span className="pat-stat-k">Yield</span>
          <span className="pat-stat-v pat-yield" data-low={yieldPct < 55 ? '' : undefined}>
            {yieldPct}%
          </span>
        </div>
      </div>

      {caption && <div className="pat-caption">{caption}</div>}

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
