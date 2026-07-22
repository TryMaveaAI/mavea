import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { UnitCircleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = UnitCircleProps & { delay?: number };

// Square viewBox; the circle is centred with margin for axis arrowheads and the coordinate label.
const VB = 240;
const CX = VB / 2;
const CY = VB / 2;
const R = 84; // circle radius in SVG units

const rad = (deg: number) => (deg * Math.PI) / 180;
// SVG y grows downward — negate the sine so a positive angle sweeps UP on screen.
const toX = (deg: number) => CX + Math.cos(rad(deg)) * R;
const toY = (deg: number) => CY - Math.sin(rad(deg)) * R;

const SPECIAL = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

/** Render an angle in radians as a tidy fraction of π (e.g. 135° → "3π/4"), falling back to a
 *  decimal multiple when it isn't a clean small-denominator fraction. Pure arithmetic. */
function radianLabel(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  if (norm === 0) return '0';
  // Reduce norm/180 to lowest terms → (num/den)·π.
  let num = norm;
  let den = 180;
  const g = gcd(num, den);
  num /= g;
  den /= g;
  const piNum = num === 1 ? 'π' : `${num}π`;
  return den === 1 ? piNum : `${piNum}/${den}`;
}
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A short, exact-looking coordinate component: snaps the common √-fraction values to their
 *  surd form (±√2/2, ±√3/2, ±1/2) so standard angles read exactly; else 2-dp. */
function coord(v: number): string {
  const known: [number, string][] = [
    [0, '0'],
    [1, '1'],
    [-1, '−1'],
    [0.5, '½'],
    [-0.5, '−½'],
    [Math.SQRT1_2, '√2/2'],
    [-Math.SQRT1_2, '−√2/2'],
    [Math.sqrt(3) / 2, '√3/2'],
    [-Math.sqrt(3) / 2, '−√3/2'],
  ];
  for (const [val, label] of known) if (Math.abs(v - val) < 1e-6) return label;
  return (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
}

// Rough advance width (SVG units) per glyph at the coord label's 11px bold font — wide enough
// for surd labels like "(−√2/2, −√2/2)" that the old fixed 8px offset never accounted for, so
// long strings pushed clean past the viewBox edge (the SVG paints with overflow: visible).
const COORD_CHAR_W = 6.4;
const COORD_MARGIN = 4; // keep the label's outer edge this far inside the viewBox

/** Anchored x for the coordinate label: starts from a base offset (scaled up a little for
 *  longer strings, since a nudge that clears a short "(1, 0)" is nowhere near enough for
 *  "(−√2/2, −√2/2)") and then clamps so the whole rendered string — estimated from its length —
 *  never crosses the viewBox bounds, regardless of where the terminal point sits. */
function coordLabelX(
  tx: number,
  cosSign: number,
  label: string,
): { x: number; anchor: 'start' | 'end' } {
  const anchor: 'start' | 'end' = cosSign >= 0 ? 'start' : 'end';
  const width = label.length * COORD_CHAR_W;
  const baseOffset = 8 + Math.min(width * 0.15, 10);
  let x = tx + (cosSign >= 0 ? baseOffset : -baseOffset);
  if (anchor === 'start') {
    x = Math.min(x, VB - COORD_MARGIN - width);
  } else {
    x = Math.max(x, COORD_MARGIN + width);
  }
  return { x, anchor };
}

export function UnitCircle({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  angleDeg,
  showSpecial = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const g = useMemo(() => {
    const deg = ((angleDeg % 360) + 360) % 360;
    const cos = Math.cos(rad(deg));
    const sin = Math.sin(rad(deg));
    const tx = CX + cos * R;
    const ty = CY - sin * R;
    // Arc from +x axis to the terminal angle. The large-arc flag trips past a half turn; sweep=0
    // because SVG's positive-angle sweep is clockwise while we draw CCW (y is flipped).
    const arcR = 26;
    const arcEnd = { x: CX + Math.cos(rad(deg)) * arcR, y: CY - Math.sin(rad(deg)) * arcR };
    const large = deg > 180 ? 1 : 0;
    const arcPath = `M ${CX + arcR},${CY} A ${arcR},${arcR} 0 ${large} 0 ${arcEnd.x},${arcEnd.y}`;
    const coordLabel = `(${coord(cos)}, ${coord(sin)})`;
    const { x: coordX, anchor: coordAnchor } = coordLabelX(tx, cos, coordLabel);
    // Vertical nudge scales the same way — a label sitting right at the top/bottom rim needs
    // more clearance than one near the equator, and must never cross the viewBox top/bottom.
    const coordY = Math.min(Math.max(ty + (sin >= 0 ? -8 : 16), 12), VB - 6);
    return { deg, cos, sin, tx, ty, arcPath, coordLabel, coordX, coordY, coordAnchor };
  }, [angleDeg]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-uc-wrap">
        <svg viewBox={`0 0 ${VB} ${VB}`} className="lr-uc-svg" role="img" aria-label={title}>
          {/* Axes with arrowheads. */}
          <line x1={12} y1={CY} x2={VB - 12} y2={CY} className="lr-uc-axis" />
          <line x1={CX} y1={VB - 12} x2={CX} y2={12} className="lr-uc-axis" />
          <polygon
            points={`${VB - 12},${CY} ${VB - 18},${CY - 3.5} ${VB - 18},${CY + 3.5}`}
            className="lr-uc-axis-arrow"
          />
          <polygon
            points={`${CX},${12} ${CX - 3.5},${18} ${CX + 3.5},${18}`}
            className="lr-uc-axis-arrow"
          />

          {/* The unit circle. */}
          <circle cx={CX} cy={CY} r={R} className="lr-uc-circle" />

          {/* Special-angle tick marks around the rim. */}
          {showSpecial &&
            SPECIAL.map((d) => (
              <line
                key={d}
                x1={CX + Math.cos(rad(d)) * (R - 4)}
                y1={CY - Math.sin(rad(d)) * (R - 4)}
                x2={toX(d)}
                y2={toY(d)}
                className="lr-uc-tick"
              />
            ))}

          {/* Reference triangle: cos leg along the axis, sin leg up to the point. */}
          <line x1={CX} y1={CY} x2={g.tx} y2={CY} className="lr-uc-leg lr-uc-leg--cos" />
          <line x1={g.tx} y1={CY} x2={g.tx} y2={g.ty} className="lr-uc-leg lr-uc-leg--sin" />

          {/* Swept angle arc + label. */}
          <path d={g.arcPath} className="lr-uc-arc" />
          <text
            x={CX + Math.cos(rad(g.deg / 2)) * 40}
            y={CY - Math.sin(rad(g.deg / 2)) * 40 + 3}
            className="lr-uc-angle-lbl"
            textAnchor="middle"
          >
            θ
          </text>

          {/* Terminal radius + the point on the circle. */}
          <line x1={CX} y1={CY} x2={g.tx} y2={g.ty} className="lr-uc-radius" />
          <circle cx={g.tx} cy={g.ty} r={4.5} className="lr-uc-point" />

          {/* Coordinate label, nudged away from the centre so it never sits on the arc, and
              clamped so the full string — however long — stays inside the viewBox. */}
          <text x={g.coordX} y={g.coordY} className="lr-uc-coord" textAnchor={g.coordAnchor}>
            {g.coordLabel}
          </text>
        </svg>
      </div>

      {/* Honest read-outs computed straight from the angle. */}
      <div className="lr-uc-stats">
        <span className="lr-uc-stat">
          <i className="lr-uc-stat-k">Angle</i>
          <b className="lr-uc-stat-v">{g.deg}°</b>
        </span>
        <span className="lr-uc-stat">
          <i className="lr-uc-stat-k">Radians</i>
          <b className="lr-uc-stat-v">{radianLabel(g.deg)}</b>
        </span>
        <span className="lr-uc-stat">
          <i className="lr-uc-stat-k">cos θ</i>
          <b className="lr-uc-stat-v">{coord(g.cos)}</b>
        </span>
        <span className="lr-uc-stat">
          <i className="lr-uc-stat-k">sin θ</i>
          <b className="lr-uc-stat-v">{coord(g.sin)}</b>
        </span>
      </div>

      {caption && <p className="lr-uc-cap">{caption}</p>}

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
