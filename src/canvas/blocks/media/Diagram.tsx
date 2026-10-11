import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DiagramProps, DiagShape } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';
import { useHostWidth } from '../../lib/useBoxSize';

type Props = DiagramProps & { delay?: number };

/** Callout size on screen, whatever the figure's scale. */
const LABEL_PX = 12;
/** A simple schematic gains nothing past this width or height — it only gets coarser. */
const MAX_FIG_PX = 600;
const MAX_FIG_H_PX = 380;
/** Width assumed before the card is measured (jsdom, the first frame). */
const FALLBACK_PX = 360;

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

  const [wrapRef, hostW] = useHostWidth<HTMLDivElement>();

  // Callout labels sit OUTSIDE the figure (a lead line plus text offset along the lead), so a
  // label near an edge — e.g. a `side: 'top'` label at y≈8 — paints above the 0–H box and
  // the card's overflow:hidden clips it. Grow the viewBox to enclose every label's extent
  // so nothing is ever cut.
  //
  // The figure is drawn in a 0–100 space and scaled to the card, so a label authored in those
  // units grows with the card: on a wide card it reached display size and the canvas held the
  // whole figure back to a thumbnail to keep it from shouting. Instead the label size is solved
  // for the figure's rendered width, so the drawing can fill the card while every callout stays
  // at LABEL_PX on screen. The viewBox depends on the label size and the size on the viewBox, so
  // the pair is settled by a few rounds of fixed-point iteration (it converges in two or three).
  const box = (fs: number) => {
    const off = fs * 2;
    const b = labels.reduce(
      (acc, l) => {
        const side = l.side ?? 'right';
        const w = estimateTextWidth(l.text, fs, true);
        if (side === 'top') {
          // Its baseline sits 0.3em over the lead's end and the face's ascent is ~1em above that.
          acc.top = Math.max(acc.top, off + fs * 1.3 - l.y);
          acc.x0 = Math.min(acc.x0, l.x - w / 2);
          acc.x1 = Math.max(acc.x1, l.x + w / 2);
        } else if (side === 'bottom') {
          acc.bottom = Math.max(acc.bottom, l.y + off + fs * 1.3 - H);
          acc.x0 = Math.min(acc.x0, l.x - w / 2);
          acc.x1 = Math.max(acc.x1, l.x + w / 2);
        } else if (side === 'left') {
          acc.x0 = Math.min(acc.x0, l.x - off - w - fs * 0.4);
        } else {
          acc.x1 = Math.max(acc.x1, l.x + off + w + fs * 0.4);
        }
        return acc;
      },
      { x0: 0, x1: 100, top: 0, bottom: 0 },
    );
    const minX = Math.min(0, b.x0);
    const minY = -Math.max(0, b.top);
    const vbW = Math.max(100, b.x1) - minX;
    const vbH = H + Math.max(0, b.bottom) - minY;
    const px = Math.min(hostW || FALLBACK_PX, MAX_FIG_PX, (MAX_FIG_H_PX * vbW) / vbH);
    return { minX, minY, vbW, vbH, px, off };
  };
  let fs = 3.4;
  let vb = box(fs);
  for (let i = 0; i < 3; i++) {
    fs = (LABEL_PX * vb.vbW) / vb.px;
    vb = box(fs);
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="med-diag" ref={wrapRef}>
        <svg
          viewBox={`${r1(vb.minX)} ${r1(vb.minY)} ${r1(vb.vbW)} ${r1(vb.vbH)}`}
          className="med-diag-svg"
          style={{ maxWidth: Math.round(vb.px) }}
          role="img"
        >
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={fs * 0.9}
              markerHeight={fs * 0.9}
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {shapes.map((s, i) => (
            <Shape key={i} s={s} arrowId={arrowId} />
          ))}

          {labels.map((l, i) => {
            const off = vb.off;
            const side = l.side ?? 'right';
            const tx = side === 'left' ? l.x - off : side === 'right' ? l.x + off : l.x;
            const ty = side === 'top' ? l.y - off : side === 'bottom' ? l.y + off : l.y;
            const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
            const col = l.color || 'var(--text-secondary)';
            // The baseline sits clear of the lead's end: below it for a bottom callout (the cap
            // height plus a gap), just above it for a top one, centred on it for a side one.
            // A baseline AT the lead's end drew the lead up through the word.
            const baseY =
              side === 'bottom' ? ty + fs * 1.05 : side === 'top' ? ty - fs * 0.3 : ty + fs * 0.35;
            return (
              <g key={`l${i}`}>
                <line x1={l.x} y1={l.y} x2={tx} y2={ty} className="med-diag-lead" />
                {/* First label is the authored lead callout; dot is ≤12px → point gesture. */}
                <circle
                  cx={l.x}
                  cy={l.y}
                  r={fs * 0.32}
                  fill={col}
                  {...(i === 0 ? { 'data-mark': 'point' } : {})}
                />
                <text
                  x={tx + (side === 'right' ? fs * 0.3 : side === 'left' ? -fs * 0.3 : 0)}
                  y={baseY}
                  textAnchor={anchor}
                  className="med-diag-lbl"
                  style={{ fontSize: fs }}
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
  // Strokes hold a constant screen weight however far the 0–100 figure is scaled.
  const sw = 1.5;
  switch (s.kind) {
    case 'circle':
      return (
        <circle
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
          vectorEffect="non-scaling-stroke"
        />
      );
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
          vectorEffect="non-scaling-stroke"
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
          vectorEffect="non-scaling-stroke"
          markerEnd={s.arrow ? `url(#${arrowId})` : undefined}
        />
      );
    case 'polygon':
      return (
        <polygon
          points={s.points}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
          vectorEffect="non-scaling-stroke"
        />
      );
    case 'path':
      return (
        <path
          d={s.d}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
          vectorEffect="non-scaling-stroke"
        />
      );
    default:
      return null;
  }
}
