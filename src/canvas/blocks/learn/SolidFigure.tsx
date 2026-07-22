import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SolidFigureProps, SolidKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SolidFigureProps & { delay?: number };

// Square-ish viewBox; the solid is built in an oblique (cabinet) projection — the depth axis runs
// up-and-right at 45° with a half-length, which reads as 3-D without a full perspective transform.
const W = 280;
const H = 240;
const OX = 0.5; // oblique depth: horizontal component (× depth)
const OY = -0.5; // oblique depth: vertical component (negative = up the page)

type Pt = { x: number; y: number };
const p = (x: number, y: number): Pt => ({ x, y });
const poly = (pts: Pt[]) => pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

/** Build the visible + hidden edge geometry for the chosen solid, centred in the viewBox. Sizes
 *  come from `dims` only to set proportions — the figure is schematic, not measured to scale. */
function buildSolid(solid: SolidKind, dims: SolidFigureProps['dims']) {
  const d = dims ?? {};
  // Clamp relative dimensions into a drawable band so any input renders sensibly.
  const clamp = (v: number | undefined, def: number) => Math.max(0.4, Math.min(2.4, v ?? def));
  const wU = clamp(d.w, 1.4);
  const hU = clamp(d.h, 1);
  const dU = clamp(d.d, 0.9);
  const rU = clamp(d.r, 1);

  const base = 58; // pixels per relative unit
  const w = wU * base;
  const h = hU * base;
  const depth = dU * base;
  const r = rU * base * 0.6;
  const dx = depth * OX;
  const dy = depth * OY;

  // Centre the bounding box of the projected front face + depth offset.
  const cx = W / 2 - (w + dx) / 2;
  const cy = H / 2 + (h - dy) / 2;

  const faces: { pts: Pt[]; hidden?: boolean }[] = [];
  const ellipses: { cx: number; cy: number; rx: number; ry: number; hidden?: boolean }[] = [];
  let apex: Pt | null = null;

  if (solid === 'cube' || solid === 'rectprism' || solid === 'prism') {
    const fl = p(cx, cy); // front bottom-left
    const fr = p(cx + w, cy);
    const tr = p(cx + w, cy - h);
    const tl = p(cx, cy - h);
    const off = (q: Pt) => p(q.x + dx, q.y + dy);
    faces.push({ pts: [off(fl), off(fr), off(tr), off(tl)], hidden: true }); // back (dashed)
    faces.push({ pts: [fl, fr, tr, tl] }); // front
    faces.push({ pts: [tl, tr, off(tr), off(tl)] }); // top
    faces.push({ pts: [fr, off(fr), off(tr), tr] }); // right side
  } else if (solid === 'pyramid') {
    const fl = p(cx, cy);
    const fr = p(cx + w, cy);
    const off = (q: Pt) => p(q.x + dx, q.y + dy);
    const br = off(fr);
    const bl = off(fl);
    apex = p(cx + w / 2 + dx / 2, cy - h + dy / 2);
    faces.push({ pts: [fl, fr, br, bl], hidden: true }); // base (dashed)
    faces.push({ pts: [fl, fr, apex] }); // front face
    faces.push({ pts: [fr, br, apex] }); // right face
  } else if (solid === 'cylinder') {
    const rx = w / 2;
    const ry = rx * 0.32;
    const topY = cy - h;
    ellipses.push({ cx: cx + rx, cy: cy, rx, ry, hidden: true }); // bottom (dashed back half implied)
    faces.push({ pts: [p(cx, topY), p(cx, cy), p(cx + w, cy), p(cx + w, topY)] }); // body
    ellipses.push({ cx: cx + rx, cy: topY, rx, ry }); // top rim
  } else if (solid === 'cone') {
    const rx = w / 2;
    const ry = rx * 0.32;
    apex = p(cx + rx, cy - h);
    ellipses.push({ cx: cx + rx, cy: cy, rx, ry }); // base rim
    faces.push({ pts: [p(cx, cy), apex] }); // left slant
    faces.push({ pts: [p(cx + w, cy), apex] }); // right slant
  } else {
    // sphere — a circle with a great-circle ellipse for solidity.
    ellipses.push({ cx: W / 2, cy: H / 2, rx: r, ry: r });
    ellipses.push({ cx: W / 2, cy: H / 2, rx: r, ry: r * 0.34, hidden: true });
  }

  return { faces, ellipses, apex };
}

export function SolidFigure({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  solid,
  dims,
  labels,
  surfaceArea,
  volume,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const figure = useMemo(() => buildSolid(solid, dims), [solid, dims]);

  const chips: { k: string; v: number }[] = [];
  if (labels?.v !== undefined) chips.push({ k: 'V', v: labels.v });
  if (labels?.e !== undefined) chips.push({ k: 'E', v: labels.e });
  if (labels?.f !== undefined) chips.push({ k: 'F', v: labels.f });
  // Euler characteristic — a quiet correctness check on the V/E/F counts (= 2 for any convex solid).
  const euler =
    labels?.v !== undefined && labels?.e !== undefined && labels?.f !== undefined
      ? labels.v - labels.e + labels.f
      : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-sf-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="lr-sf-svg" role="img" aria-label={title}>
          {/* Faces — hidden ones dashed and drawn first so visible faces sit on top. */}
          {figure.faces
            .map((f, i) => ({ f, i }))
            .sort((a, b) => Number(b.f.hidden) - Number(a.f.hidden))
            .map(({ f, i }) =>
              f.pts.length === 2 ? (
                <line
                  key={`f${i}`}
                  x1={f.pts[0].x}
                  y1={f.pts[0].y}
                  x2={f.pts[1].x}
                  y2={f.pts[1].y}
                  className={f.hidden ? 'lr-sf-edge lr-sf-edge--hidden' : 'lr-sf-edge'}
                />
              ) : (
                <polygon
                  key={`f${i}`}
                  points={poly(f.pts)}
                  className={f.hidden ? 'lr-sf-face lr-sf-face--hidden' : 'lr-sf-face'}
                />
              ),
            )}

          {/* Ellipses (cylinder/cone rims, sphere outline). */}
          {figure.ellipses.map((e, i) => (
            <ellipse
              key={`e${i}`}
              cx={e.cx}
              cy={e.cy}
              rx={e.rx}
              ry={e.ry}
              className={e.hidden ? 'lr-sf-rim lr-sf-rim--hidden' : 'lr-sf-rim'}
            />
          ))}
        </svg>
      </div>

      {/* V/E/F count chips + an honest Euler check. */}
      {(chips.length > 0 || surfaceArea || volume) && (
        <div className="lr-sf-stats">
          {chips.map((c) => (
            <span key={c.k} className="lr-sf-chip">
              <i className="lr-sf-chip-k">{c.k}</i>
              <b className="lr-sf-chip-v">{c.v}</b>
            </span>
          ))}
          {euler !== null && (
            <span className="lr-sf-euler">
              V − E + F = <b>{euler}</b>
            </span>
          )}
          {surfaceArea && (
            <span className="lr-sf-chip lr-sf-chip--measure">
              <i className="lr-sf-chip-k">SA</i>
              <b className="lr-sf-chip-v">{surfaceArea}</b>
            </span>
          )}
          {volume && (
            <span className="lr-sf-chip lr-sf-chip--measure">
              <i className="lr-sf-chip-k">Vol</i>
              <b className="lr-sf-chip-v">{volume}</b>
            </span>
          )}
        </div>
      )}

      {caption && <p className="lr-sf-cap">{caption}</p>}

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
