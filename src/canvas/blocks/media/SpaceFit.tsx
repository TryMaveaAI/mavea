import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, formatValue } from '../../lib';
import type { SpaceFitProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { fitItemLabel } from './itemLabel';

type Props = SpaceFitProps & { delay?: number };

// A walkway narrower than this (in the room's own unit) reads as tight — the recognised comfortable
// minimum for a clear path through furniture. A gap at or below it is flagged.
const COMFORT_FLOOR = 0.9; // metres-ish; the same number works for ft as a sane default

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
  // The wall is drawn OUTSIDE the room's footprint: centred on the edge it took half its thickness
  // out of the floor, so a piece placed honestly against the wall was drawn running into it.
  const wall = Math.max(W, D) * 0.012;
  const baseFs = vbW * 0.027;
  const minFs = vbW * 0.019;
  const rulerY = PAD + D + wall + PAD * 0.45;

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
            x={PAD - wall / 2}
            y={PAD - wall / 2}
            width={W + wall}
            height={D + wall}
            className="spf-room"
            strokeWidth={wall}
          />

          {items.map((it, i) => {
            const fill = ITEM_FILLS[i % ITEM_FILLS.length];
            const stroke = ITEM_STROKES[i % ITEM_STROKES.length];
            const cx = PAD + it.x + it.w / 2;
            const cy = PAD + it.y + it.d / 2;
            const rot = it.rot ?? 0;
            // Label size is a fixed fraction of the figure (so it reads ~the same on screen at any
            // room scale), shrunk or wrapped to sit inside the piece's own footprint.
            const fit = fitItemLabel(it.label, { w: it.w * 0.84, h: it.d * 0.8 }, baseFs, minFs);
            const isTruncated = !!fit && fit.lines.join(' ') !== it.label;
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
                {fit ? (
                  <text
                    x={cx}
                    y={cy - ((fit.lines.length - 1) * fit.fs * 1.2) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="spf-item-lbl"
                    style={{ fontSize: fit.fs }}
                  >
                    {isTruncated && <title>{it.label}</title>}
                    {fit.lines.map((line, k) => (
                      <tspan key={k} x={cx} dy={k === 0 ? 0 : fit.fs * 1.2}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                ) : (
                  <title>{it.label}</title>
                )}
              </g>
            );
          })}

          {/* scale ruler along the bottom, below the wall, its length named at its right end */}
          <g className="spf-ruler">
            <line
              x1={PAD}
              y1={rulerY}
              x2={PAD + rulerLen}
              y2={rulerY}
              strokeWidth={Math.max(W, D) * 0.006}
            />
            {[PAD, PAD + rulerLen].map((x) => (
              <line
                key={x}
                x1={x}
                y1={rulerY - PAD * 0.22}
                x2={x}
                y2={rulerY + PAD * 0.22}
                strokeWidth={Math.max(W, D) * 0.006}
              />
            ))}
            <text
              x={PAD + rulerLen + PAD * 0.3}
              y={rulerY}
              dominantBaseline="middle"
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
