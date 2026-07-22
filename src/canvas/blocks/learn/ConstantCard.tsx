import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ConstantCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ConstantCardProps & { delay?: number };

const VIEWBOX = 100;
const PHI = (1 + Math.sqrt(5)) / 2;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
type CutSide = 'left' | 'top' | 'right' | 'bottom';
const CUT_ORDER: CutSide[] = ['left', 'top', 'right', 'bottom'];

/** Build the whirling-squares golden-ratio spiral: a fixed, deterministic construction from φ
 *  itself (never from caller data) — each square's side is the previous one's divided by φ, and
 *  the connecting curve is sampled point-by-point (rather than trusting SVG arc-flag derivation)
 *  so its center/direction is exactly the one the geometry calls for, with no ambiguity. Computed
 *  once at module load since nothing about it varies per render. */
function buildGoldenSpiral(iterations: number, size: number) {
  let rect: Rect = { x0: 0, y0: 0, x1: size, y1: size / PHI };
  const squares: Rect[] = [];
  const curvePts: { x: number; y: number }[] = [];
  const STEPS_PER_ARC = 10;

  for (let i = 0; i < iterations; i++) {
    const side = CUT_ORDER[i % 4];
    const rw = rect.x1 - rect.x0;
    const rh = rect.y1 - rect.y0;
    const s = Math.min(rw, rh);
    if (s < size * 0.02) break; // too small to read — stop before the squares vanish

    let sq: Rect;
    if (side === 'left') {
      sq = { x0: rect.x0, y0: rect.y0, x1: rect.x0 + s, y1: rect.y0 + s };
      rect = { x0: rect.x0 + s, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
    } else if (side === 'top') {
      sq = { x0: rect.x0, y0: rect.y0, x1: rect.x0 + s, y1: rect.y0 + s };
      rect = { x0: rect.x0, y0: rect.y0 + s, x1: rect.x1, y1: rect.y1 };
    } else if (side === 'right') {
      sq = { x0: rect.x1 - s, y0: rect.y0, x1: rect.x1, y1: rect.y0 + s };
      rect = { x0: rect.x0, y0: rect.y0, x1: rect.x1 - s, y1: rect.y1 };
    } else {
      sq = { x0: rect.x0, y0: rect.y1 - s, x1: rect.x0 + s, y1: rect.y1 };
      rect = { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 - s };
    }
    squares.push(sq);

    const TL = { x: sq.x0, y: sq.y0 };
    const TR = { x: sq.x1, y: sq.y0 };
    const BR = { x: sq.x1, y: sq.y1 };
    const BL = { x: sq.x0, y: sq.y1 };
    // Which corner anchors the quarter-circle, and which two corners it sweeps between, follows
    // the cut direction — this is what keeps consecutive squares' arcs meeting end to end.
    const arc =
      side === 'left'
        ? { center: TL, from: BL, to: TR }
        : side === 'top'
          ? { center: TR, from: TL, to: BR }
          : side === 'right'
            ? { center: BR, from: TR, to: BL }
            : { center: BL, from: BR, to: TL };

    const a0 = Math.atan2(arc.from.y - arc.center.y, arc.from.x - arc.center.x);
    const a1 = Math.atan2(arc.to.y - arc.center.y, arc.to.x - arc.center.x);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    for (let k = 0; k <= STEPS_PER_ARC; k++) {
      const a = a0 + (delta * k) / STEPS_PER_ARC;
      curvePts.push({ x: arc.center.x + s * Math.cos(a), y: arc.center.y + s * Math.sin(a) });
    }
  }

  const path = curvePts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  return { squares, path };
}

const GOLDEN_SPIRAL = buildGoldenSpiral(7, VIEWBOX);

/** Truncate the fractional part of a decimal-expansion string to `digitsShown` digits — never
 *  rounds and never pads with invented digits past what `value` actually supplies. */
function displayValue(value: string, digitsShown: number | undefined): string {
  if (typeof digitsShown !== 'number' || !Number.isFinite(digitsShown) || digitsShown < 0) {
    return value;
  }
  const dot = value.indexOf('.');
  if (dot === -1) return value; // no fractional part to trim (an integer, or a symbolic value)
  const capped = Math.min(Math.floor(digitsShown), value.length - dot - 1);
  return value.slice(0, dot + 1 + capped);
}

// A fact card for a mathematical constant: headline symbol + value, a short significance
// paragraph, and an optional illustrative diagram. The diagram is a fixed construction from the
// constant's own real math (φ for the spiral, the circumference/diameter relationship for the
// circle) — it never plots caller data, so it's identical every time a given `visual` is chosen.
export function ConstantCard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  symbol,
  value,
  digitsShown,
  significance,
  visual = 'none',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  // The model occasionally hands this a raw JS number instead of a string — accept either
  // rather than rendering nothing for an otherwise-fine reply.
  const valueRaw =
    typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : '';
  const valueText = valueRaw ? displayValue(valueRaw, digitsShown) : '';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-cst-head">
        <span className="lr-cst-symbol">{symbol || '—'}</span>
        {valueText && (
          <span className="lr-cst-value" data-semantic-ellipsis="true">
            {valueText}…
          </span>
        )}
      </div>

      {significance && <p className="lr-cst-sig">{significance}</p>}

      {visual === 'spiral' && (
        <div className="lr-cst-visual">
          <svg
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX / PHI}`}
            className="lr-cst-svg"
            role="img"
            aria-label="Golden-ratio spiral construction"
          >
            {GOLDEN_SPIRAL.squares.map((sq, i) => (
              <rect
                key={i}
                x={sq.x0}
                y={sq.y0}
                width={sq.x1 - sq.x0}
                height={sq.y1 - sq.y0}
                className="lr-cst-square m-fade-rise m-stagger-item"
                style={{ ['--i' as string]: i } as CSSProperties}
              />
            ))}
            <path d={GOLDEN_SPIRAL.path} className="lr-cst-spiral-path" fill="none" />
          </svg>
        </div>
      )}

      {visual === 'circle' && (
        <div className="lr-cst-visual">
          <svg
            viewBox="0 0 100 100"
            className="lr-cst-svg"
            role="img"
            aria-label="A circle with its diameter drawn through the center"
          >
            <circle cx="50" cy="50" r="38" className="lr-cst-circle" fill="none" />
            <line x1="12" y1="50" x2="88" y2="50" className="lr-cst-diameter" />
            <text x="50" y="44" className="lr-cst-circle-lbl" textAnchor="middle">
              d
            </text>
          </svg>
          <p className="lr-cst-visual-cap">Circumference = {symbol || '—'} × diameter</p>
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
