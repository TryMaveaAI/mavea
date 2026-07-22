import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, formatValue } from '../../lib';
import type { SpaceFitProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SpaceFitProps & { delay?: number };

// A walkway narrower than this (in the room's own unit) reads as tight — the recognised comfortable
// minimum for a clear path through furniture. A gap at or below it is flagged.
const COMFORT_FLOOR = 0.9; // metres-ish; the same number works for ft as a sane default

// The item label's font-size already shrinks with the item's own width (see `fs` below), but that
// heuristic is a character-count average, not real SVG text metrics — a wide-glyph label (or one
// that hits the shrink's own floor) can still run past the item's footprint. Truncate with an
// ellipsis as a hard backstop, sized the same way FloorPlan trims its room names, and keep the
// untruncated label as a native <title> tooltip so nothing is silently lost.
const SPF_CHAR_ADVANCE = 0.56;
function truncateItemLabel(text: string, boxW: number, fontSize: number): string {
  const max = Math.max(2, Math.floor(boxW / (fontSize * SPF_CHAR_ADVANCE)));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

const ITEM_FILLS = [
  'color-mix(in oklab, var(--presence) 16%, transparent)',
  'color-mix(in oklab, var(--insight) 16%, transparent)',
  'color-mix(in oklab, var(--warning) 18%, transparent)',
  'color-mix(in oklab, var(--presence) 9%, transparent)',
  'color-mix(in oklab, var(--insight) 9%, transparent)',
];
const ITEM_STROKES = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
];

// A to-scale top-down room layout with furniture. The room is drawn in its own units (a viewBox),
// so the furniture sits exactly to scale. Each item is placed at (x,y) and rotated about its
// centre — a 90° rotation swaps its footprint. A scale ruler reads off real distance, and named
// clearance gaps are listed with the tight ones flagged. Real-data-only: positions and the ruler
// are computed straight from the inputs; nothing is invented.
export function SpaceFit({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  room,
  items,
  clearances,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const unit = room.unit ?? 'm';

  const W = Math.max(1, room.w);
  const D = Math.max(1, room.d);
  const PAD = Math.max(W, D) * 0.06; // gutter for the wall stroke + ruler
  const vbW = W + PAD * 2;
  const vbH = D + PAD * 2;

  // A scale ruler: one nice step of the room's longer side, drawn along the bottom edge.
  const rulerLen = niceStep(Math.max(W, D), 4);

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

      <div className="spf-figwrap">
        <svg viewBox={`0 0 ${vbW} ${vbH}`} className="spf-svg" role="img" aria-label={title}>
          {/* the room — a walled rectangle */}
          <rect
            x={PAD}
            y={PAD}
            width={W}
            height={D}
            className="spf-room"
            strokeWidth={Math.max(W, D) * 0.012}
          />

          {items.map((it, i) => {
            const fill = ITEM_FILLS[i % ITEM_FILLS.length];
            const stroke = ITEM_STROKES[i % ITEM_STROKES.length];
            const cx = PAD + it.x + it.w / 2;
            const cy = PAD + it.y + it.d / 2;
            const rot = it.rot ?? 0;
            // Label size is a fixed fraction of the figure (so it reads ~the same on screen at any
            // room scale), then shrunk to fit within the item's own width so it never spills out.
            const baseFs = vbW * 0.027;
            const fs = Math.min(baseFs, (it.w * 0.84) / Math.max(it.label.length * 0.52, 1));
            // Hide the label when the footprint is too small to hold it.
            const showLabel = Math.min(it.w, it.d) > Math.max(W, D) * 0.12;
            const label = truncateItemLabel(it.label, it.w * 0.84, fs);
            const isTruncated = label !== it.label;
            return (
              <g key={i} transform={`rotate(${rot} ${cx} ${cy})`}>
                <rect
                  x={PAD + it.x}
                  y={PAD + it.y}
                  width={it.w}
                  height={it.d}
                  rx={Math.min(it.w, it.d) * 0.08}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={Math.max(W, D) * 0.005}
                  {...(i === 0 ? { 'data-mark': 'circle' } : {})}
                />
                {showLabel && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="spf-item-lbl"
                    style={{ fontSize: fs }}
                  >
                    {isTruncated && <title>{it.label}</title>}
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {/* scale ruler along the bottom */}
          <g className="spf-ruler">
            <line
              x1={PAD}
              y1={vbH - PAD * 0.4}
              x2={PAD + rulerLen}
              y2={vbH - PAD * 0.4}
              strokeWidth={Math.max(W, D) * 0.006}
            />
            <line
              x1={PAD}
              y1={vbH - PAD * 0.4 - PAD * 0.25}
              x2={PAD}
              y2={vbH - PAD * 0.4 + PAD * 0.25}
              strokeWidth={Math.max(W, D) * 0.006}
            />
            <line
              x1={PAD + rulerLen}
              y1={vbH - PAD * 0.4 - PAD * 0.25}
              x2={PAD + rulerLen}
              y2={vbH - PAD * 0.4 + PAD * 0.25}
              strokeWidth={Math.max(W, D) * 0.006}
            />
            <text
              x={PAD + rulerLen / 2}
              y={vbH - PAD * 0.4 - PAD * 0.35}
              textAnchor="middle"
              className="spf-ruler-lbl"
              style={{ fontSize: vbW * 0.026 }}
            >
              {formatValue(rulerLen)} {unit}
            </text>
          </g>
        </svg>
      </div>

      <div className="spf-dims">
        <span className="spf-dim">
          Room {formatValue(W)} × {formatValue(D)} {unit}
        </span>
      </div>

      {clearances && clearances.length > 0 && (
        <div className="spf-clear">
          {clearances.map((c, i) => {
            const tight = c.gap <= COMFORT_FLOOR;
            return (
              <div key={i} className={'spf-clear-row' + (tight ? ' tight' : '')}>
                <span className="spf-clear-dot" />
                <span className="spf-clear-label">{c.label}</span>
                <span className="spf-clear-gap">
                  {formatValue(c.gap)} {unit}
                </span>
                {tight && <span className="spf-clear-flag">tight</span>}
              </div>
            );
          })}
        </div>
      )}

      {caption && <div className="spf-caption">{caption}</div>}

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
