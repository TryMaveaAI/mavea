import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, formatValue, BlockEmpty } from '../../lib';
import type { SitePlanProps, SitePoint, SetbackLine, Easement } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SitePlanProps & { delay?: number };

// The frame every authored point (boundary + footprint + easement paths) is fitted into — a
// generous margin so a dashed setback ring never touches the card edge. Same auto-fit convention
// DimensionDrawing uses for a part profile: nothing here is fabricated, it's a uniform
// scale+offset of the real site-unit coordinates the caller supplied.
const VB_W = 200;
const VB_H = 140;
const MARGIN = 16;

const SETBACK_COLORS = ['var(--warning)', 'var(--presence)', 'var(--insight)', 'var(--danger)'];
const EASEMENT_COLORS = ['var(--danger)', 'var(--warning-soft)', 'var(--presence-soft)'];

function isPoint(p: unknown): p is SitePoint {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0] as number) &&
    Number.isFinite(p[1] as number)
  );
}

/** Only real, finite [x,y] pairs survive — a loose model reply (or a stray non-point entry)
 *  is dropped rather than plotted, the same call GeoMap makes for an out-of-range marker. */
function validPoints(pts: unknown): SitePoint[] {
  return Array.isArray(pts) ? pts.filter(isPoint) : [];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function centroid(pts: SitePoint[]): SitePoint {
  const n = pts.length;
  if (n === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / n, sy / n];
}

/** A dashed setback line is drawn as an inset copy of the boundary, each vertex pulled toward
 *  the parcel's centroid by the authored `offset` (in the boundary's own site units). This is a
 *  radial approximation, not a true perpendicular polygon offset (which needs a general
 *  polygon-offset algorithm well beyond what a calm reference figure needs) — accurate enough for
 *  the simple-to-mildly-irregular lots this block draws, and it can never self-intersect: every
 *  vertex moves along its own centroid ray, clamped to keep the ring inside a sane range of the
 *  vertex's own radius, so an oversized offset shrinks the ring to a small floor instead of
 *  flipping past the centroid or blowing off-frame. */
function insetRing(boundary: SitePoint[], offset: number): SitePoint[] {
  const [cx, cy] = centroid(boundary);
  return boundary.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const newDist = clamp(dist - offset, dist * 0.08, dist * 3);
    const scale = newDist / dist;
    return [cx + dx * scale, cy + dy * scale];
  });
}

interface ValidSetback {
  offset: number;
  label: string;
}
interface ValidEasement {
  path: SitePoint[];
  label: string;
}

// A property boundary plan: the parcel outline, an optional building footprint, dashed setback
// rings with distance callouts, and diagonally-hatched easement strips — FloorPlan's outdoor
// counterpart. Coordinates are arbitrary site units (any scale); the figure auto-fits the frame
// and every shape traces real caller-supplied points, never an invented outline.
export function SitePlan({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  boundary,
  structureFootprint,
  setbackLines,
  easements,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const uid = useId().replace(/:/g, '');

  const bound = validPoints(boundary);
  const footprint = validPoints(structureFootprint);
  const validEasements: ValidEasement[] = (Array.isArray(easements) ? easements : [])
    .map((e: Easement): ValidEasement | null => {
      const path = validPoints(e?.path);
      if (path.length < 3) return null;
      const label = typeof e?.label === 'string' ? e.label.trim() : '';
      return { path, label };
    })
    .filter((e): e is ValidEasement => e !== null);
  const validSetbacks: ValidSetback[] = (Array.isArray(setbackLines) ? setbackLines : [])
    .map((s: SetbackLine): ValidSetback | null => {
      if (!Number.isFinite(s?.offset)) return null;
      const label = typeof s?.label === 'string' ? s.label.trim() : '';
      return { offset: Math.max(0, s.offset), label };
    })
    .filter((s): s is ValidSetback => s !== null);

  if (bound.length < 3) {
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
        <BlockEmpty message="No property boundary to draw" />
      </div>
    );
  }

  // Fit every plotted point — the parcel, the footprint, and every easement strip — into one
  // shared transform, so nothing clips and everything stays to the same scale.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of bound) {
    xs.push(x);
    ys.push(y);
  }
  for (const [x, y] of footprint) {
    xs.push(x);
    ys.push(y);
  }
  for (const e of validEasements) {
    for (const [x, y] of e.path) {
      xs.push(x);
      ys.push(y);
    }
  }
  const ex = extent(xs);
  const ey = extent(ys);
  const [minX, maxX] = ex ?? [0, 1];
  const [minY, maxY] = ey ?? [0, 1];
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const k = Math.min((VB_W - MARGIN * 2) / spanX, (VB_H - MARGIN * 2) / spanY);
  const cw = spanX * k;
  const ch = spanY * k;
  const ox = (VB_W - cw) / 2;
  const oy = (VB_H - ch) / 2;
  // Site coordinates read top-down like a plot plat (larger y = further from the street edge at
  // y=0); no flip needed to land in SVG's own top-down space.
  const tx = (x: number) => ox + (x - minX) * k;
  const ty = (y: number) => oy + (y - minY) * k;
  const ptsAttr = (pts: SitePoint[]) => pts.map(([x, y]) => `${tx(x)},${ty(y)}`).join(' ');
  const [boundCx, boundCy] = centroid(bound);

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

      <div className="splan-wrap">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="splan-svg" role="img" aria-label={title}>
          <defs>
            {validEasements.map((_, i) => {
              const c = EASEMENT_COLORS[i % EASEMENT_COLORS.length];
              return (
                <pattern
                  key={i}
                  id={`splan-hatch-${uid}-${i}`}
                  width="4.5"
                  height="4.5"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="4.5" stroke={c} strokeWidth="1.1" />
                </pattern>
              );
            })}
          </defs>

          <rect
            x={ox - 2}
            y={oy - 2}
            width={cw + 4}
            height={ch + 4}
            fill="var(--surface-glass)"
            rx={2}
          />

          {/* dashed setback rings — behind everything else, a guide, not a real line. Every ring
              is inset from the SAME boundary, so anchoring every badge to (say) its topmost
              point would stack them on top of each other; cycling the anchor vertex by index
              instead spreads the badges around distinct corners. */}
          {validSetbacks.map((s, i) => {
            const ring = insetRing(bound, s.offset);
            const anchor = ring[i % ring.length];
            const [dx, dy] = [anchor[0] - boundCx, anchor[1] - boundCy];
            const dlen = Math.hypot(dx, dy) || 1e-6;
            // nudge the badge a touch further out along its own corner ray so it reads clear of
            // the dashed line instead of sitting astride it
            const badgeX = anchor[0] + (dx / dlen) * (dlen * 0.12);
            const badgeY = anchor[1] + (dy / dlen) * (dlen * 0.12);
            const color = SETBACK_COLORS[i % SETBACK_COLORS.length];
            return (
              <g key={i}>
                <polygon
                  points={ptsAttr(ring)}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.7}
                  strokeDasharray="3.2 2.2"
                />
                <circle
                  cx={tx(badgeX)}
                  cy={ty(badgeY)}
                  r={4.2}
                  className="splan-badge"
                  fill={color}
                />
                <text
                  x={tx(badgeX)}
                  y={ty(badgeY)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="splan-badge-text"
                >
                  {`S${i + 1}`}
                </text>
              </g>
            );
          })}

          {/* easement strips — hatched, dashed outline so they read as a legal overlay, not a wall */}
          {validEasements.map((e, i) => {
            const [ecx, ecy] = centroid(e.path);
            const color = EASEMENT_COLORS[i % EASEMENT_COLORS.length];
            return (
              <g key={i}>
                <polygon
                  points={ptsAttr(e.path)}
                  fill={`url(#splan-hatch-${uid}-${i})`}
                  fillOpacity={0.55}
                  stroke={color}
                  strokeWidth={0.6}
                  strokeDasharray="1.8 1.4"
                />
                <circle cx={tx(ecx)} cy={ty(ecy)} r={4.2} className="splan-badge" fill={color} />
                <text
                  x={tx(ecx)}
                  y={ty(ecy)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="splan-badge-text"
                >
                  {`E${i + 1}`}
                </text>
              </g>
            );
          })}

          {/* the structure footprint, filled solid so it reads as the built form */}
          {footprint.length >= 3 && (
            <polygon points={ptsAttr(footprint)} className="splan-structure" />
          )}

          {/* the parcel outline itself, bold, on top — the figure's one gesture target */}
          <polygon points={ptsAttr(bound)} className="splan-boundary" data-mark="circle" />
        </svg>
      </div>

      {(validSetbacks.length > 0 || validEasements.length > 0) && (
        <div className="splan-legend">
          {validSetbacks.map((s, i) => (
            <div className="splan-legend-row" key={`s${i}`}>
              <span
                className="splan-legend-dot"
                style={{ background: SETBACK_COLORS[i % SETBACK_COLORS.length] }}
              />
              <span className="splan-legend-label">{s.label || `Setback ${i + 1}`}</span>
              <span className="splan-legend-val tab-num">{formatValue(s.offset)}</span>
            </div>
          ))}
          {validEasements.map((e, i) => (
            <div className="splan-legend-row" key={`e${i}`}>
              <span
                className="splan-legend-dot hatched"
                style={{ background: EASEMENT_COLORS[i % EASEMENT_COLORS.length] }}
              />
              <span className="splan-legend-label">{e.label || `Easement ${i + 1}`}</span>
            </div>
          ))}
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
