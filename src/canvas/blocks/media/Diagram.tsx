import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DiagramProps, DiagShape } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DiagramProps & { delay?: number };

// One labeled-figure primitive for a lot of subjects: draw a figure from simple vector
// shapes in a 0–100 coordinate space (lines can be arrows for force vectors), then point
// callout labels at specific spots. Anatomy, geometry, physics free-body diagrams,
// geography, biology, engineering schematics — all the same component, no image required.
export function Diagram({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  shapes,
  labels,
  ratio = 1.6,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  // Per-instance marker id so two diagrams in one answer don't share `med-diag-arrow`.
  const arrowId = `med-diag-arrow-${useId().replace(/:/g, '')}`;
  const H = Math.round((100 / Math.max(0.4, ratio)) * 10) / 10;

  // Callout labels sit OUTSIDE the figure (a lead line plus text offset by `off`), so a
  // label near an edge — e.g. a `side: 'top'` label at y≈8 — paints above the 0–H box and
  // the card's overflow:hidden clips it. Grow the viewBox to enclose every label's extent
  // so nothing is ever cut. SVG can't measure text, so estimate the run's width from its
  // character count at the .lbl font size (a conservative per-glyph advance) and pad by
  // that plus the lead offset on whichever side the label leans.
  const OFF = 7; // lead-line length — must match the per-label `off` below
  // ≈ advance per glyph at font-size 3.4 in the 0–100 space. A flat multiplier tuned for a
  // short one-word tag underestimates a longer, sentence-like callout — proportional fonts
  // pack occasional wide glyphs (capitals, "m"/"w") that a short run is unlikely to hit but a
  // long one accumulates, so the estimate grows a little with length instead of staying flat.
  const charWidth = (len: number) => (len > 20 ? 2.1 : len > 10 ? 2.0 : 1.9);
  const bounds = labels.reduce(
    (b, l) => {
      const side = l.side ?? 'right';
      const w = l.text.length * charWidth(l.text.length);
      if (side === 'top') {
        b.top = Math.max(b.top, OFF - l.y + 2.5); // text ascends above the anchor
        b.x0 = Math.min(b.x0, l.x - w / 2);
        b.x1 = Math.max(b.x1, l.x + w / 2);
      } else if (side === 'bottom') {
        b.bottom = Math.max(b.bottom, l.y + OFF + 2.5 - H);
        b.x0 = Math.min(b.x0, l.x - w / 2);
        b.x1 = Math.max(b.x1, l.x + w / 2);
      } else if (side === 'left') {
        b.x0 = Math.min(b.x0, l.x - OFF - w - 1);
      } else {
        b.x1 = Math.max(b.x1, l.x + OFF + w + 1);
      }
      return b;
    },
    { x0: 0, x1: 100, top: 0, bottom: 0 },
  );
  const minX = Math.min(0, Math.round(bounds.x0 * 10) / 10);
  const minY = Math.round(-Math.max(0, bounds.top) * 10) / 10;
  const vbW = Math.round((Math.max(100, bounds.x1) - minX) * 10) / 10;
  const vbH = Math.round((H + Math.max(0, bounds.bottom) - minY) * 10) / 10;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="med-diag">
        <svg viewBox={`${minX} ${minY} ${vbW} ${vbH}`} className="med-diag-svg" role="img">
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {shapes.map((s, i) => (
            <Shape key={i} s={s} arrowId={arrowId} />
          ))}

          {labels.map((l, i) => {
            const off = OFF;
            const side = l.side ?? 'right';
            const tx = side === 'left' ? l.x - off : side === 'right' ? l.x + off : l.x;
            const ty = side === 'top' ? l.y - off : side === 'bottom' ? l.y + off : l.y;
            const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
            const col = l.color || 'var(--text-secondary)';
            return (
              <g key={`l${i}`}>
                <line x1={l.x} y1={l.y} x2={tx} y2={ty} className="med-diag-lead" />
                {/* First label is the authored lead callout; dot is ≤12px → point gesture. */}
                <circle
                  cx={l.x}
                  cy={l.y}
                  r={1.1}
                  fill={col}
                  {...(i === 0 ? { 'data-mark': 'point' } : {})}
                />
                <text
                  x={tx + (side === 'right' ? 1 : side === 'left' ? -1 : 0)}
                  y={ty + 1.1}
                  textAnchor={anchor}
                  className="med-diag-lbl"
                  fill={col}
                >
                  {l.text}
                </text>
              </g>
            );
          })}
        </svg>
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

function Shape({ s, arrowId }: { s: DiagShape; arrowId: string }) {
  const stroke = s.color || 'var(--text-muted)';
  const fill = s.fill || 'none';
  const sw = 0.7;
  switch (s.kind) {
    case 'circle':
      return <circle cx={s.cx} cy={s.cy} r={s.r} stroke={stroke} strokeWidth={sw} fill={fill} />;
    case 'rect':
      return (
        <rect
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          rx={1.5}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
        />
      );
    case 'line':
      return (
        <line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          markerEnd={s.arrow ? `url(#${arrowId})` : undefined}
        />
      );
    case 'polygon':
      return <polygon points={s.points} stroke={stroke} strokeWidth={sw} fill={fill} />;
    case 'path':
      return <path d={s.d} stroke={stroke} strokeWidth={sw} fill={fill} />;
    default:
      return null;
  }
}
