import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VseprMoleculeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VseprMoleculeProps & { delay?: number };

// Square-ish viewBox; the central atom sits at the middle and bonds radiate to a fixed radius.
const W = 300;
const H = 270;
const CX = W / 2;
const CY = H / 2 + 6; // nudge down a touch to leave room for the shape label up top
const BOND_R = 80; // length of a bond from centre to substituent
const LP_R = 46; // radius at which lone pairs are parked

/** A substituent direction: an in-plane angle (degrees, 0 = right, CCW) plus a depth cue that
 *  selects a plain / wedge (toward viewer) / dash (away) bond — giving the figure 3-D feel without
 *  a real projection. */
interface Slot {
  angle: number;
  depth: 'flat' | 'wedge' | 'dash';
}

// Per-shape slot layouts (bond directions) and the lone-pair parking directions. Angles are in
// the standard math sense (0° = +x, CCW); depths fake the out-of-plane bonds. These are the
// canonical VSEPR arrangements, so the geometry is correct for the named shape, not eyeballed.
const SHAPES: Record<string, { bonds: Slot[]; lone: number[] }> = {
  linear: {
    bonds: [
      { angle: 0, depth: 'flat' },
      { angle: 180, depth: 'flat' },
    ],
    lone: [],
  },
  trigonal: {
    bonds: [
      { angle: 90, depth: 'flat' },
      { angle: 210, depth: 'flat' },
      { angle: 330, depth: 'flat' },
    ],
    lone: [],
  },
  bent: {
    bonds: [
      { angle: 235, depth: 'flat' },
      { angle: 305, depth: 'flat' },
    ],
    lone: [70, 110],
  },
  tetrahedral: {
    bonds: [
      { angle: 90, depth: 'flat' },
      { angle: 210, depth: 'dash' },
      { angle: 330, depth: 'wedge' },
      { angle: 270, depth: 'wedge' },
    ],
    lone: [],
  },
  pyramidal: {
    bonds: [
      { angle: 210, depth: 'flat' },
      { angle: 330, depth: 'flat' },
      { angle: 270, depth: 'wedge' },
    ],
    lone: [90],
  },
  octahedral: {
    bonds: [
      { angle: 90, depth: 'flat' },
      { angle: 270, depth: 'flat' },
      { angle: 0, depth: 'flat' },
      { angle: 180, depth: 'flat' },
      { angle: 45, depth: 'wedge' },
      { angle: 225, depth: 'dash' },
    ],
    lone: [],
  },
};

/** Best-guess geometry when `shape` is missing — from the steric number (bonds + lone pairs). */
function inferShape(nBonds: number, nLone: number): string {
  const steric = nBonds + nLone;
  if (steric <= 2) return 'linear';
  if (steric === 3) return nLone > 0 ? 'bent' : 'trigonal';
  if (steric === 4) return nLone >= 2 ? 'bent' : nLone === 1 ? 'pyramidal' : 'tetrahedral';
  return 'octahedral';
}

// SVG y grows downward, so subtract the sine to make a positive angle point UP on screen.
const rad = (deg: number) => (deg * Math.PI) / 180;
const px = (cx: number, r: number, deg: number) => cx + Math.cos(rad(deg)) * r;
const py = (cy: number, r: number, deg: number) => cy - Math.sin(rad(deg)) * r;

export function VseprMolecule({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  central,
  bonds = [],
  lonePairs = 0,
  shape,
  bondAngle,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  const geom = useMemo(() => {
    const key = (shape || inferShape(bonds.length, lonePairs)).toLowerCase();
    const layout = SHAPES[key] ?? SHAPES[inferShape(bonds.length, lonePairs)];

    // Pair each supplied bond with a slot; if the model passed more bonds than the shape has
    // canonical slots, fan the extras evenly so nothing is dropped.
    const slots: Slot[] = bonds.map((_, i) => {
      if (layout.bonds[i]) return layout.bonds[i];
      const a = (i / Math.max(bonds.length, 1)) * 360;
      return { angle: a, depth: 'flat' };
    });

    const placed = bonds.map((b, i) => {
      const s = slots[i];
      return {
        atom: b.atom,
        order: b.order ?? 1,
        depth: s.depth,
        x: px(CX, BOND_R, s.angle),
        y: py(CY, BOND_R, s.angle),
        angle: s.angle,
      };
    });

    // Lone pairs sit in their parked directions (or evenly when the shape doesn't pin them).
    const lone: { x: number; y: number; angle: number }[] = [];
    for (let i = 0; i < lonePairs; i++) {
      const a = layout.lone[i] ?? 90 + (i * 360) / Math.max(lonePairs, 1);
      lone.push({ x: px(CX, LP_R, a), y: py(CY, LP_R, a), angle: a });
    }

    return { key, placed, lone };
  }, [shape, bonds, lonePairs]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-vse-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="lr-vse-svg" role="img" aria-label={title}>
          {/* Bonds first, so atom discs sit on top of the line ends. */}
          {geom.placed.map((p, i) => {
            // Perpendicular offset for double/triple parallel lines.
            const dx = p.x - CX;
            const dy = p.y - CY;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * 3.2;
            const ny = (dx / len) * 3.2;
            const lines = p.order === 3 ? [-1, 0, 1] : p.order === 2 ? [-1, 1] : [0];

            if (p.depth === 'wedge') {
              // A solid filled triangle — bond toward the viewer.
              const wHalf = 5;
              return (
                <polygon
                  key={`b${i}`}
                  className="lr-vse-wedge"
                  points={`${CX},${CY} ${p.x + nx * (wHalf / 3.2)},${p.y + ny * (wHalf / 3.2)} ${p.x - nx * (wHalf / 3.2)},${p.y - ny * (wHalf / 3.2)}`}
                />
              );
            }
            if (p.depth === 'dash') {
              // A series of widening dashes — bond away from the viewer.
              const segs = 5;
              return (
                <g key={`b${i}`} className="lr-vse-dash">
                  {Array.from({ length: segs }, (_, s) => {
                    const t = (s + 0.5) / segs;
                    const cx = CX + dx * t;
                    const cy = CY + dy * t;
                    const wn = (t * 5) / 3.2;
                    return (
                      <line
                        key={s}
                        x1={cx + nx * wn}
                        y1={cy + ny * wn}
                        x2={cx - nx * wn}
                        y2={cy - ny * wn}
                      />
                    );
                  })}
                </g>
              );
            }
            return (
              <g key={`b${i}`}>
                {lines.map((o, j) => (
                  <line
                    key={j}
                    className="lr-vse-bond"
                    x1={CX + nx * o}
                    y1={CY + ny * o}
                    x2={p.x + nx * o}
                    y2={p.y + ny * o}
                  />
                ))}
              </g>
            );
          })}

          {/* Lone pairs — two dots, oriented across the parked direction. */}
          {geom.lone.map((lp, i) => {
            const perp = lp.angle + 90;
            const ox = Math.cos(rad(perp)) * 4;
            const oy = -Math.sin(rad(perp)) * 4;
            return (
              <g key={`lp${i}`} className="lr-vse-lone">
                <circle cx={lp.x + ox} cy={lp.y + oy} r={2.4} />
                <circle cx={lp.x - ox} cy={lp.y - oy} r={2.4} />
              </g>
            );
          })}

          {/* Substituent atoms. */}
          {geom.placed.map((p, i) => (
            <g key={`a${i}`}>
              <circle cx={p.x} cy={p.y} r={15} className="lr-vse-atom-bg" />
              <text x={p.x} y={p.y + 4} className="lr-vse-atom" textAnchor="middle">
                {p.atom}
              </text>
            </g>
          ))}

          {/* Central atom — drawn last, on top, with the accent ring. */}
          <circle cx={CX} cy={CY} r={19} className="lr-vse-central-bg" />
          <text x={CX} y={CY + 5} className="lr-vse-central" textAnchor="middle">
            {central}
          </text>
        </svg>
      </div>

      {/* Honest read-outs: the shape name and ideal bond angle. */}
      <div className="lr-vse-stats">
        <span className="lr-vse-stat">
          <i className="lr-vse-stat-k">Shape</i>
          <b className="lr-vse-stat-v">{shape || geom.key}</b>
        </span>
        {bondAngle && (
          <span className="lr-vse-stat">
            <i className="lr-vse-stat-k">Bond angle</i>
            <b className="lr-vse-stat-v">{bondAngle}</b>
          </span>
        )}
        {lonePairs > 0 && (
          <span className="lr-vse-stat">
            <i className="lr-vse-stat-k">Lone pairs</i>
            <b className="lr-vse-stat-v">{lonePairs}</b>
          </span>
        )}
      </div>

      {caption && <p className="lr-vse-cap">{caption}</p>}

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
