import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { OrbitBody, OrbitDiagramProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = OrbitDiagramProps & { delay?: number };

// The system lives in a 200×200 viewBox with the central body at the centre.
const CX = 100;
const CY = 100;
// Orbit rings span from this inner radius (first body) to this outer radius (furthest body).
const R_INNER = 26;
const R_OUTER = 92;

// Body draw radius, from the optional 1..5 `size` (relative); defaults to a small disk.
const bodyR = (size: number | undefined): number => {
  const s = Number.isFinite(size) ? Math.min(5, Math.max(1, size as number)) : 2;
  return 2.6 + s * 1.2;
};

// Fixed angles (degrees, measured from "up") spreading the bodies around their rings so a label
// never lands on the one inside it. Cycles if there are more bodies than angles.
const ANGLES = [-58, 122, 28, 208, -126, 74, 160, 320];

// Body names are author-supplied and can run well past the "Mercury"/"Venus"-length demo fixture
// (e.g. "Trappist-1e") or pile up beyond the ANGLES cycle with 10+ bodies sharing a ring band —
// the fixed 4-unit offset used to push a label out from its body has no notion of text width, so
// a long name (or a crowded outer ring) reaches past its neighbor's position. Budget a character
// count and truncate with an ellipsis, keeping the full name as a native <title> tooltip.
const ORBIT_NAME_MAX = 9;
function truncateBodyName(text: string): string {
  return text.length > ORBIT_NAME_MAX ? text.slice(0, ORBIT_NAME_MAX - 1).trimEnd() + '…' : text;
}

interface PlacedBody extends OrbitBody {
  ring: number; // ring radius in viewBox units
  x: number;
  y: number;
  r: number; // body draw radius
}

export function OrbitDiagram({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  center,
  bodies,
  toScale = false,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  // Per-instance gradient id so two systems in one answer don't share `orb-star`.
  const starId = `orb-star-${useId().replace(/:/g, '')}`;

  // Order by orbit radius so the rings nest correctly even if the model lists them out of order.
  const valid = (bodies || [])
    .filter((b) => Number.isFinite(b.orbitRadius) && b.orbitRadius > 0)
    .slice()
    .sort((a, b) => a.orbitRadius - b.orbitRadius);

  // Map each orbit radius onto the ring band. Linear keeps true proportions when `toScale`;
  // otherwise a sqrt compression so a tight inner planet and a far outer one both stay legible.
  const radii = valid.map((b) => b.orbitRadius);
  const min = radii.length ? Math.min(...radii) : 0;
  const max = radii.length ? Math.max(...radii) : 1;
  const span = max - min || 1;
  const warp = (v: number): number => {
    const t = (v - min) / span; // 0..1
    return toScale ? t : Math.sqrt(t);
  };

  const placed: PlacedBody[] = valid.map((b, i) => {
    const ring =
      valid.length === 1
        ? (R_INNER + R_OUTER) / 2
        : R_INNER + warp(b.orbitRadius) * (R_OUTER - R_INNER);
    const ang = ((ANGLES[i % ANGLES.length] - 90) * Math.PI) / 180;
    return {
      ...b,
      ring,
      x: CX + ring * Math.cos(ang),
      y: CY + ring * Math.sin(ang),
      r: bodyR(b.size),
    };
  });

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

      <div className="orb-wrap">
        <svg viewBox="0 0 200 200" className="orb-svg" role="img" aria-label={title || center}>
          <defs>
            <radialGradient id={starId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--orb-star-hi)" />
              <stop offset="100%" stopColor="var(--orb-star)" />
            </radialGradient>
          </defs>

          {/* the orbit rings */}
          {placed.map((b, i) => (
            <circle key={`ring${i}`} cx={CX} cy={CY} r={b.ring} className="orb-ring" />
          ))}

          {/* the central body */}
          <circle cx={CX} cy={CY} r={11} fill={`url(#${starId})`} className="orb-center" />
          <text x={CX} y={CY + 0.6} className="orb-center-lbl">
            {center}
          </text>

          {/* each orbiting body + its annotation */}
          {placed.map((b, i) => {
            const fill = b.color || 'var(--presence)';
            // Push the label outward from the centre so it clears the body and the ring.
            const ux = (b.x - CX) / (b.ring || 1);
            const uy = (b.y - CY) / (b.ring || 1);
            const lx = b.x + ux * (b.r + 4);
            const ly = b.y + uy * (b.r + 4);
            const anchor = ux > 0.25 ? 'start' : ux < -0.25 ? 'end' : 'middle';
            const annot = [b.distance, b.period].filter(Boolean).join(' · ');
            const shortName = truncateBodyName(b.name);
            return (
              <g key={`b${i}`}>
                <circle
                  cx={b.x}
                  cy={b.y}
                  r={b.r}
                  fill={fill}
                  className="orb-body"
                  {...(i === 0 ? { 'data-mark': 'point' } : {})}
                />
                <text
                  x={lx}
                  y={ly - (annot ? 1.4 : -1.4)}
                  textAnchor={anchor}
                  className="orb-body-lbl"
                >
                  {shortName}
                  {shortName !== b.name && <title>{b.name}</title>}
                </text>
                {annot && (
                  <text x={lx} y={ly + 4.2} textAnchor={anchor} className="orb-body-annot">
                    {annot}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {caption && <p className="orb-caption">{caption}</p>}
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
