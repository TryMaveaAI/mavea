import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { RayDiagramProps, RayOpticalElement } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RayDiagramProps & { delay?: number };

const W = 360;
const H = 230;
const PAD_X = 16; // left/right breathing room before the axis runs to the edge
const PAD_TOP = 18;
const PAD_BOT = 24; // room for the axis distance labels

const AXIS_COL = 'var(--text-secondary)';
const OBJ_COL = 'var(--insight)';
const IMG_COL = 'var(--presence)';
const RAY_COL = 'var(--warning)';
const F_COL = 'var(--text-muted)';

/** A converging element (convex lens / concave mirror) has positive focal length. */
function isConverging(el: RayOpticalElement): boolean {
  return el === 'convex-lens' || el === 'concave-mirror';
}
const isMirror = (el: RayOpticalElement): boolean =>
  el === 'concave-mirror' || el === 'convex-mirror';

/** Tiny arrowhead at (x,y) pointing along `angle` (SVG radians, y-down). */
function Head({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  const len = 8;
  const hw = 4;
  const bx = x - Math.cos(angle) * len;
  const by = y - Math.sin(angle) * len;
  const pa = angle + Math.PI / 2;
  return (
    <polygon
      points={[
        `${x},${y}`,
        `${bx + Math.cos(pa) * hw},${by + Math.sin(pa) * hw}`,
        `${bx - Math.cos(pa) * hw},${by - Math.sin(pa) * hw}`,
      ].join(' ')}
      fill={color}
    />
  );
}

/** A vertical object/image arrow standing on the axis at axis-x = `ax`, height = `h` axis units. */
function UprightArrow({
  ax,
  h,
  color,
  label,
  dashed,
  sx,
  sy,
}: {
  ax: number;
  h: number;
  color: string;
  label: string;
  dashed?: boolean;
  sx: (v: number) => number;
  sy: (v: number) => number;
}) {
  const x = sx(ax);
  const baseY = sy(0);
  const tipY = sy(h);
  const up = h >= 0;
  const angle = up ? -Math.PI / 2 : Math.PI / 2; // pointing toward the tip
  return (
    <g>
      <line
        x1={x}
        y1={baseY}
        x2={x}
        y2={tipY}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? '4,3' : undefined}
        strokeLinecap="round"
      />
      <Head x={x} y={tipY} angle={angle} color={color} />
      <text
        x={x}
        y={up ? tipY - 7 : tipY + 14}
        fill={color}
        className="ray-arrow-lbl"
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

export function RayDiagram({
  title,
  icon = 'eye',
  iconColor = 'var(--presence)',
  element = 'convex-lens',
  objectDistance,
  focalLength,
  objectHeight = 1,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.eye;

  const geom = useMemo(() => {
    // Signed focal length: converging elements are positive, diverging negative.
    const f = Math.abs(focalLength) * (isConverging(element) ? 1 : -1);
    const doDist = Math.abs(objectDistance); // object always drawn to the LEFT, so its x is -do
    const ho = Math.abs(objectHeight) || 1;

    // Thin-lens / mirror equation: 1/do + 1/di = 1/f  →  di = do·f / (do − f).
    const denom = doDist - f;
    // Object exactly at the focal point → image at infinity; clamp so the diagram stays sane.
    const atFocus = Math.abs(denom) < 1e-6;
    const di = atFocus ? Number.POSITIVE_INFINITY : (doDist * f) / denom;
    const m = atFocus ? Number.POSITIVE_INFINITY : -di / doDist; // magnification (sign = orientation)
    const hi = Number.isFinite(m) ? m * ho : Number.POSITIVE_INFINITY;

    // Image SIDE on the canvas. Lens: real image (di>0) forms on the RIGHT (opposite side, +x);
    // virtual image (di<0) sits on the LEFT (same side as object). Mirror reflects light back,
    // so a real image (di>0) forms on the LEFT (object side, −x) and virtual behind it (+x).
    const real = Number.isFinite(di) && di > 0;
    let imageX = Number.NaN;
    if (Number.isFinite(di)) {
      const mag = Math.abs(di);
      imageX = isMirror(element) ? (di > 0 ? -mag : mag) : di > 0 ? mag : -mag;
    }

    // Axis-x of every labelled feature so the scale can fit them all.
    const objX = -doDist;
    const fLeft = -Math.abs(f);
    const fRight = Math.abs(f);

    const xs = [0, objX, fLeft, fRight];
    if (Number.isFinite(imageX)) xs.push(imageX);
    const xMag = Math.max(...xs.map(Math.abs), 1);
    const xDom = xMag * 1.18; // a little margin past the outermost feature

    const ys = [ho, Number.isFinite(hi) ? Math.abs(hi) : ho];
    const yMag = Math.max(...ys, 0.5);
    const yDom = yMag * 1.35;

    const sx = scaleLinear([-xDom, xDom], [PAD_X, W - PAD_X]);
    const sy = scaleLinear([-yDom, yDom], [H - PAD_BOT, PAD_TOP]); // y-inverted for SVG

    return {
      f,
      doDist,
      di,
      m,
      ho,
      hi,
      real,
      atFocus,
      objX,
      imageX,
      fLeft,
      fRight,
      sx,
      sy,
      converging: isConverging(element),
      mirror: isMirror(element),
    };
  }, [element, objectDistance, focalLength, objectHeight]);

  const { sx, sy } = geom;
  const axisY = sy(0);
  const cx = sx(0); // element sits on the axis at x = 0
  // A stable id so each instance's clip-path is unique (multiple diagrams can share a page).
  const clipId = useId();

  // The three principal rays, drawn from the object tip. We extend each across the plot so the
  // intersection is visually obvious. SVG coords are derived only from the computed geometry.
  const rays = useMemo(() => {
    const tipX = sx(geom.objX);
    const tipY = sy(geom.ho);
    const out: Array<{ d: string; dash?: boolean; col: string }> = [];
    const xRight = W - PAD_X;
    const xLeft = PAD_X;

    if (!geom.mirror) {
      // ── LENS ──────────────────────────────────────────────────────────
      // Ray 1: parallel to the axis, then bent through the far focal point (F on the right).
      const fImgX = sx(geom.fRight);
      const slope1 = (axisY - tipY) / (fImgX - cx); // after refraction at the lens plane
      const y1End = tipY + slope1 * (xRight - cx);
      out.push({ d: `M ${tipX} ${tipY} L ${cx} ${tipY} L ${xRight} ${y1End}`, col: RAY_COL });

      // Ray 2: straight through the centre of the lens (undeviated).
      const slope2 = (sy(0) - tipY) / (cx - tipX);
      const y2End = tipY + slope2 * (xRight - tipX);
      out.push({ d: `M ${tipX} ${tipY} L ${xRight} ${y2End}`, col: RAY_COL });

      // For a virtual image (diverging lens, or object inside f) the refracted rays diverge;
      // dashed back-extensions on the OBJECT side meet at the upright virtual image.
      if (Number.isFinite(geom.di) && geom.di < 0) {
        const slope1L = (tipY - axisY) / (cx - fImgX);
        const y1L = tipY + slope1L * (xLeft - cx);
        out.push({ d: `M ${cx} ${tipY} L ${xLeft} ${y1L}`, dash: true, col: RAY_COL });
        const y2L = tipY + slope2 * (xLeft - tipX);
        out.push({ d: `M ${tipX} ${tipY} L ${xLeft} ${y2L}`, dash: true, col: RAY_COL });
      }
    } else {
      // ── MIRROR ────────────────────────────────────────────────────────
      // Ray 1: parallel to the axis, reflects through the focal point F (on the object/left side).
      const fX = sx(geom.fLeft);
      const slope1 = (axisY - tipY) / (fX - cx);
      const y1End = tipY + slope1 * (xLeft - cx);
      out.push({ d: `M ${tipX} ${tipY} L ${cx} ${tipY} L ${xLeft} ${y1End}`, col: RAY_COL });

      // Ray 2: through the centre of curvature direction — here, aimed at the focal point and
      // reflected parallel to the axis. Simpler stable pair: ray to the pole reflecting symmetrically.
      // Use the "ray through F reflects parallel": incoming aimed at F, leaves parallel to axis.
      const slopeIn = (axisY - tipY) / (fX - tipX);
      const yAtMirror = tipY + slopeIn * (cx - tipX);
      out.push({
        d: `M ${tipX} ${tipY} L ${cx} ${yAtMirror} L ${xLeft} ${yAtMirror}`,
        col: RAY_COL,
      });

      // Virtual image (convex mirror, or concave with object inside f): reflected rays diverge,
      // dashed back-extensions BEHIND the mirror (right side) meet at the upright virtual image.
      if (Number.isFinite(geom.di) && geom.di < 0) {
        const y1R = tipY + slope1 * (xRight - cx);
        out.push({ d: `M ${cx} ${tipY} L ${xRight} ${y1R}`, dash: true, col: RAY_COL });
        const y2R = yAtMirror; // already horizontal
        out.push({ d: `M ${cx} ${y2R} L ${xRight} ${y2R}`, dash: true, col: RAY_COL });
      }
    }
    return out;
  }, [geom, sx, sy, axisY, cx]);

  // Human-readable conclusion derived from the geometry (real data only).
  const verdict = useMemo(() => {
    if (geom.atFocus)
      return 'Object at F — rays emerge parallel, no image forms (image at infinity).';
    const nature = geom.real ? 'real' : 'virtual';
    const orient = geom.m > 0 ? 'upright' : 'inverted';
    const sizeRatio = Math.abs(geom.m);
    const size =
      Math.abs(sizeRatio - 1) < 0.02
        ? 'same size'
        : sizeRatio > 1
          ? `enlarged ${sizeRatio.toFixed(2)}×`
          : `reduced ${sizeRatio.toFixed(2)}×`;
    return `${nature}, ${orient}, ${size}`;
  }, [geom]);

  // Element glyph: lens = a tall double-arrow biconvex/biconcave hint; mirror = an arc.
  const elTop = sy(geom.ho > 0 ? Math.max(geom.ho, Math.abs(geom.hi) || 0) : 0);
  const elBot = sy(-(geom.ho > 0 ? Math.max(geom.ho, Math.abs(geom.hi) || 0) : 0));
  const elHalf = Math.min(Math.abs(axisY - elTop), Math.abs(elBot - axisY), 70) || 60;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="ray-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="ray-svg" role="img" aria-label={title}>
          {/* A ray is extrapolated along its true slope to the plot edge; a steep ray's far y can
              land well outside the box. Clip the rays to the plot rectangle so each ends cleanly at
              the edge — the optics stay correct, nothing spills past the SVG. */}
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD_X} y={PAD_TOP} width={W - 2 * PAD_X} height={H - PAD_TOP - PAD_BOT} />
            </clipPath>
          </defs>

          {/* Principal axis */}
          <line x1={PAD_X} y1={axisY} x2={W - PAD_X} y2={axisY} className="ray-axis" />

          {/* Optical element at x = 0 */}
          {!geom.mirror ? (
            <g>
              {/* Lens plane */}
              <line
                x1={cx}
                y1={axisY - elHalf}
                x2={cx}
                y2={axisY + elHalf}
                className="ray-element"
              />
              {/* Converging ↕ vs diverging ↑↓ tips that signal the lens type */}
              {geom.converging ? (
                <>
                  <Head x={cx} y={axisY - elHalf} angle={-Math.PI / 2} color="var(--line-strong)" />
                  <Head x={cx} y={axisY + elHalf} angle={Math.PI / 2} color="var(--line-strong)" />
                </>
              ) : (
                <>
                  <Head
                    x={cx}
                    y={axisY - elHalf + 9}
                    angle={Math.PI / 2}
                    color="var(--line-strong)"
                  />
                  <Head
                    x={cx}
                    y={axisY + elHalf - 9}
                    angle={-Math.PI / 2}
                    color="var(--line-strong)"
                  />
                </>
              )}
            </g>
          ) : (
            // Mirror arc: concave bows toward the object (opens left), convex bows away (opens right).
            <path
              d={
                geom.converging
                  ? `M ${cx + 9} ${axisY - elHalf} Q ${cx - 11} ${axisY} ${cx + 9} ${axisY + elHalf}`
                  : `M ${cx - 9} ${axisY - elHalf} Q ${cx + 11} ${axisY} ${cx - 9} ${axisY + elHalf}`
              }
              className="ray-element ray-mirror"
              fill="none"
            />
          )}

          {/* Focal points F on both sides */}
          {[geom.fLeft, geom.fRight].map((fx, i) => (
            <g key={`f${i}`}>
              <circle cx={sx(fx)} cy={axisY} r={2.6} fill={F_COL} />
              <text x={sx(fx)} y={axisY + 14} className="ray-f-lbl" textAnchor="middle">
                F
              </text>
            </g>
          ))}
          {/* Centre marker */}
          <circle cx={cx} cy={axisY} r={2} fill={AXIS_COL} />

          {/* Principal rays — clipped to the plot box so steep extrapolations never spill out */}
          <g clipPath={`url(#${clipId})`}>
            {rays.map((r, i) => (
              <path
                key={`ray${i}`}
                d={r.d}
                stroke={r.col}
                className={r.dash ? 'ray-ray ray-ray--dash' : 'ray-ray'}
                fill="none"
              />
            ))}
          </g>

          {/* Object arrow (upright, on the left) */}
          <UprightArrow ax={geom.objX} h={geom.ho} color={OBJ_COL} label="Object" sx={sx} sy={sy} />

          {/* Image arrow — only when a finite image forms */}
          {Number.isFinite(geom.imageX) && Number.isFinite(geom.hi) && (
            <UprightArrow
              ax={geom.imageX}
              h={geom.hi}
              color={IMG_COL}
              label={geom.real ? 'Image' : 'Image (virtual)'}
              dashed={!geom.real}
              sx={sx}
              sy={sy}
            />
          )}
        </svg>
      </div>

      {/* Verdict chip — the physical nature of the image, computed from the data */}
      <div className="ray-verdict">
        <span
          className="ray-verdict-dot"
          style={{ background: geom.real ? IMG_COL : 'var(--warning)' }}
        />
        {verdict}
      </div>

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
