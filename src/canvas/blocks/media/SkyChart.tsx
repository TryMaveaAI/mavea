import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SkyChartProps, SkyStar } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SkyChartProps & { delay?: number };

// The sky dome lives in a 200×200 viewBox; the horizon ring is centred with this radius.
const CX = 100;
const CY = 100;
const RADIUS = 92;

// Map a 0..1 sky coordinate onto the dome's pixel space. The dome fills a square inset slightly
// inside the ring so a star at the very edge still sits on the visible disk, not on the rim line.
const px = (x: number): number => CX + (x - 0.5) * 2 * (RADIUS - 4);
const py = (y: number): number => CY + (y - 0.5) * 2 * (RADIUS - 4);

// Dot radius from apparent magnitude: brighter (lower mag) → bigger. Clamped so a bad value can't
// blow the dot up or vanish it. Magnitude ~ -1 (Sirius) → ~2.6; ~5 (naked-eye limit) → ~0.7.
const starR = (mag: number | undefined): number => {
  const m = Number.isFinite(mag) ? (mag as number) : 3;
  return Math.max(0.7, Math.min(2.8, 2.6 - m * 0.36));
};

// Keep a point inside the dome so a stray out-of-range coordinate never paints outside the ring.
const inDome = (s: { x: number; y: number }): boolean => {
  const dx = px(s.x) - CX;
  const dy = py(s.y) - CY;
  return Number.isFinite(s.x) && Number.isFinite(s.y) && dx * dx + dy * dy <= RADIUS * RADIUS;
};

// Star/planet labels sit beside their dot with a fixed offset, which only clears the 200×200
// viewBox for the demo's short names — a longer name on a dot near the right edge would run past
// x=200. Flip to end-anchored (grow left, into the dome) once the dot is past the midline, so a
// label always extends into the space that's actually free instead of off the edge.
const lblAnchor = (x: number): 'start' | 'end' => (x > CX ? 'end' : 'start');
const lblDx = (x: number, gap: number): number => (x > CX ? -gap : gap);

export function SkyChart({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  stars,
  constellations,
  planets,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const clipId = `sky-clip-${useId().replace(/:/g, '')}`;

  const pts: SkyStar[] = (stars || []).filter(inDome);
  const planetPts = (planets || []).filter(inDome);

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

      <div className="sky-wrap">
        <svg viewBox="0 0 200 200" className="sky-svg" role="img" aria-label={title || 'Night sky'}>
          <defs>
            {/* A radial fall-off from zenith to horizon so the dome reads as the night sky. */}
            <radialGradient id={`${clipId}-bg`} cx="50%" cy="42%" r="62%">
              <stop offset="0%" stopColor="var(--sky-zenith)" />
              <stop offset="100%" stopColor="var(--sky-horizon)" />
            </radialGradient>
            <clipPath id={clipId}>
              <circle cx={CX} cy={CY} r={RADIUS} />
            </clipPath>
          </defs>

          {/* the dome + horizon ring */}
          <circle cx={CX} cy={CY} r={RADIUS} fill={`url(#${clipId}-bg)`} className="sky-dome" />

          {/* cardinal tick ring + the two reference circles (altitude grid) */}
          <g clipPath={`url(#${clipId})`} className="sky-grid">
            <circle cx={CX} cy={CY} r={RADIUS * 0.66} />
            <circle cx={CX} cy={CY} r={RADIUS * 0.33} />
            <line x1={CX} y1={CY - RADIUS} x2={CX} y2={CY + RADIUS} />
            <line x1={CX - RADIUS} y1={CY} x2={CX + RADIUS} y2={CY} />
          </g>

          {/* constellation connect-the-dots, under the stars */}
          <g clipPath={`url(#${clipId})`}>
            {(constellations || []).map((c, ci) =>
              (c.lines || []).map(([a, b], li) => {
                const sa = stars?.[a];
                const sb = stars?.[b];
                if (!sa || !sb || !inDome(sa) || !inDome(sb)) return null;
                return (
                  <line
                    key={`${ci}-${li}`}
                    x1={px(sa.x)}
                    y1={py(sa.y)}
                    x2={px(sb.x)}
                    y2={py(sb.y)}
                    className="sky-line"
                  />
                );
              }),
            )}
          </g>

          {/* the stars, sized by magnitude */}
          <g clipPath={`url(#${clipId})`}>
            {pts.map((s, i) => {
              const r = starR(s.mag);
              return (
                <g key={i}>
                  {/* a soft glow for the bright ones */}
                  {r > 1.8 && <circle cx={px(s.x)} cy={py(s.y)} r={r * 2.4} className="sky-glow" />}
                  <circle
                    cx={px(s.x)}
                    cy={py(s.y)}
                    r={r}
                    className="sky-star"
                    {...(i === 0 ? { 'data-mark': 'point' } : {})}
                  />
                </g>
              );
            })}
          </g>

          {/* planets — a distinct accented marker + label */}
          {planetPts.map((p, i) => {
            const x = px(p.x);
            return (
              <g key={`p${i}`} className="sky-planet">
                <circle cx={x} cy={py(p.y)} r={2.4} className="sky-planet-dot" />
                <text
                  x={x + lblDx(x, 4)}
                  y={py(p.y) + 1.2}
                  textAnchor={lblAnchor(x)}
                  className="sky-planet-lbl"
                >
                  {p.name}
                </text>
              </g>
            );
          })}

          {/* bright-star labels, after the dots so text sits on top */}
          {pts.map((s, i) => {
            if (!s.name) return null;
            const x = px(s.x);
            return (
              <text
                key={`l${i}`}
                x={x + lblDx(x, 3.2)}
                y={py(s.y) - 2.4}
                textAnchor={lblAnchor(x)}
                className="sky-star-lbl"
              >
                {s.name}
              </text>
            );
          })}

          {/* cardinal directions on the rim */}
          <text x={CX} y={CY - RADIUS + 7} className="sky-card">
            N
          </text>
          <text x={CX} y={CY + RADIUS - 3} className="sky-card">
            S
          </text>
          <text x={CX - RADIUS + 4} y={CY + 2.5} className="sky-card">
            W
          </text>
          <text x={CX + RADIUS - 4} y={CY + 2.5} className="sky-card">
            E
          </text>
        </svg>
      </div>

      {caption && <p className="sky-caption">{caption}</p>}
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
