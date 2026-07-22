import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceStep, ticks } from '../../lib/scale';
import type { PhaseDiagramProps, PhaseBoundary, PhasePoint } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PhaseDiagramProps & { delay?: number };

const W = 360;
const H = 264;
// Gutters: the left holds y-axis (pressure) ticks + a rotated axis title; the bottom holds the
// x-axis (temperature) ticks on one row and the axis title on a second row, so labels at the
// domain extremes never collide or clip against the card edge.
const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 18;
const PAD_B = 46;

// Each phase region tints faintly so the areas read at a glance without fighting the curves.
const REGION_TINT: Record<string, string> = {
  solid: 'var(--insight)',
  liquid: 'var(--presence)',
  gas: 'var(--warning)',
  supercritical: 'var(--danger)',
};

/** Trim float dust from a coordinate read-out so point labels stay clean. */
function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

/** Bounds of every supplied (t, p) — boundary vertices plus the two special points — so the
 *  axes auto-fit to exactly the data when the caller doesn't pin a domain. */
function dataExtent(
  boundaries: readonly PhaseBoundary[],
  pts: readonly (PhasePoint | undefined)[],
): { tLo: number; tHi: number; pLo: number; pHi: number } | null {
  let tLo = Infinity;
  let tHi = -Infinity;
  let pLo = Infinity;
  let pHi = -Infinity;
  const see = (t: number, p: number) => {
    if (!Number.isFinite(t) || !Number.isFinite(p)) return;
    if (t < tLo) tLo = t;
    if (t > tHi) tHi = t;
    if (p < pLo) pLo = p;
    if (p > pHi) pHi = p;
  };
  for (const b of boundaries) for (const v of b.points) see(v.t, v.p);
  for (const pt of pts) if (pt) see(pt.t, pt.p);
  return tLo === Infinity ? null : { tLo, tHi, pLo, pHi };
}

// A pressure–temperature phase diagram: temperature (x) against pressure (y), the solid / liquid /
// gas (and supercritical-fluid) regions separated by phase-boundary curves (sublimation, fusion,
// vaporization), with the triple point and critical point marked. Everything is plotted from the
// supplied data — boundary polylines and the two special points — through the shared linear scale,
// so the geometry is faithful (water's negative-slope fusion line, for instance, comes straight out
// of its boundary points). For chemistry, thermodynamics, and materials.
export function PhaseDiagram({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  boundaries,
  triplePoint,
  criticalPoint,
  regions = [],
  tLabel = 'Temperature',
  pLabel = 'Pressure',
  tUnit,
  pUnit,
  tDomain,
  pDomain,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  const model = useMemo(() => {
    const ext = dataExtent(boundaries, [triplePoint, criticalPoint]);
    if (!ext) return null;

    // Domain: pin if given, else a small symmetric pad around the data so curves and the special
    // points sit comfortably inside the frame instead of touching an edge.
    const padTo = (lo: number, hi: number): [number, number] => {
      if (lo === hi) return [lo - 1, hi + 1];
      const m = (hi - lo) * 0.08;
      return [lo - m, hi + m];
    };
    const [tMin, tMax] = tDomain ?? padTo(ext.tLo, ext.tHi);
    const [pMin, pMax] = pDomain ?? padTo(ext.pLo, ext.pHi);

    // Pressure axis inverted (higher pressure higher on screen); temperature left→right.
    const sx = scaleLinear([tMin, tMax], [PAD_L, W - PAD_R]);
    const sy = scaleLinear([pMin, pMax], [H - PAD_B, PAD_T]);

    const clampX = (x: number) => Math.max(PAD_L, Math.min(W - PAD_R, x));
    const clampY = (y: number) => Math.max(PAD_T, Math.min(H - PAD_B, y));
    const project = (pt: PhasePoint) => ({ x: clampX(sx(pt.t)), y: clampY(sy(pt.p)) });

    // Each boundary becomes a screen-space polyline of its sampled vertices.
    const curves = boundaries.map((b) => ({
      kind: b.kind,
      label: b.label,
      color: b.color || 'var(--line-strong)',
      pts: b.points.map(project),
    }));

    // Region tint patches are simple soft discs centred on each label's anchor — enough to
    // colour-key the areas without claiming a precise (and easily-wrong) closed-polygon fill.
    const tintPatches = regions.map((r) => ({
      ...project(r),
      tint: r.color || REGION_TINT[r.phase] || 'var(--text-muted)',
    }));

    const regionLabels = regions.map((r) => ({
      ...project(r),
      text: r.label,
      tint: r.color || REGION_TINT[r.phase] || 'var(--text-secondary)',
      anchor: (r.anchor || 'middle') as 'start' | 'middle' | 'end',
    }));

    const tStep = niceStep(tMax - tMin);
    const pStep = niceStep(pMax - pMin);

    return {
      sx,
      sy,
      tMin,
      tMax,
      pMin,
      pMax,
      curves,
      tintPatches,
      regionLabels,
      triple: triplePoint ? { ...project(triplePoint), data: triplePoint } : null,
      critical: criticalPoint ? { ...project(criticalPoint), data: criticalPoint } : null,
      tticks: ticks(tMin, tMax, tStep),
      pticks: ticks(pMin, pMax, pStep),
    };
  }, [boundaries, triplePoint, criticalPoint, regions, tDomain, pDomain]);

  const xTitle = tUnit ? `${tLabel} (${tUnit})` : tLabel;
  const yTitle = pUnit ? `${pLabel} (${pUnit})` : pLabel;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {model && (
        <div className="phd-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="phd-svg" role="img" aria-label={title}>
            {/* gridlines */}
            {model.tticks.map((t, i) => (
              <line
                key={`gt${i}`}
                x1={model.sx(t)}
                y1={PAD_T}
                x2={model.sx(t)}
                y2={H - PAD_B}
                className="phd-grid"
              />
            ))}
            {model.pticks.map((p, i) => (
              <line
                key={`gp${i}`}
                x1={PAD_L}
                y1={model.sy(p)}
                x2={W - PAD_R}
                y2={model.sy(p)}
                className="phd-grid"
              />
            ))}

            {/* region colour-key patches (under the curves) */}
            {model.tintPatches.map((r, i) => (
              <circle
                key={`tint${i}`}
                cx={r.x}
                cy={r.y}
                r={26}
                fill={`color-mix(in oklab, ${r.tint} 16%, transparent)`}
                className="phd-tint"
              />
            ))}

            {/* axes */}
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="phd-axis" />
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="phd-axis" />

            {/* x-axis ticks + labels */}
            {model.tticks.map((t, i) => (
              <g key={`tt${i}`}>
                <line
                  x1={model.sx(t)}
                  y1={H - PAD_B}
                  x2={model.sx(t)}
                  y2={H - PAD_B + 4}
                  className="phd-axis"
                />
                <text x={model.sx(t)} y={H - PAD_B + 14} className="phd-tick" textAnchor="middle">
                  {t}
                </text>
              </g>
            ))}
            {/* y-axis ticks + labels */}
            {model.pticks.map((p, i) => (
              <g key={`pt${i}`}>
                <line
                  x1={PAD_L - 4}
                  y1={model.sy(p)}
                  x2={PAD_L}
                  y2={model.sy(p)}
                  className="phd-axis"
                />
                <text x={PAD_L - 7} y={model.sy(p) + 3} className="phd-tick" textAnchor="end">
                  {p}
                </text>
              </g>
            ))}

            {/* axis titles — each on its own row, never on the tick baseline */}
            <text
              x={PAD_L + (W - PAD_L - PAD_R) / 2}
              y={H - 8}
              className="phd-axis-lbl"
              textAnchor="middle"
            >
              {xTitle}
            </text>
            <text
              x={0}
              y={0}
              transform={`translate(14, ${(PAD_T + H - PAD_B) / 2}) rotate(-90)`}
              className="phd-axis-lbl"
              textAnchor="middle"
            >
              {yTitle}
            </text>

            {/* phase-boundary curves */}
            {model.curves.map((c, i) => (
              <polyline
                key={`b${i}`}
                points={c.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={c.color}
                className="phd-curve"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {/* region labels */}
            {model.regionLabels.map((r, i) => (
              <text
                key={`rl${i}`}
                x={r.x}
                y={r.y}
                fill={r.tint}
                className="phd-region-lbl"
                textAnchor={r.anchor}
                dominantBaseline="middle"
              >
                {r.text}
              </text>
            ))}

            {/* triple point */}
            {model.triple && (
              <g data-mark="point">
                <circle cx={model.triple.x} cy={model.triple.y} r={4} className="phd-pt" />
                <text
                  x={model.triple.x + 7}
                  y={model.triple.y - 15}
                  className="phd-pt-lbl"
                  textAnchor="start"
                >
                  Triple point
                </text>
                <text
                  x={model.triple.x + 7}
                  y={model.triple.y - 4}
                  className="phd-pt-sub"
                  textAnchor="start"
                >
                  ({fmt(model.triple.data.t)}
                  {tUnit ? ` ${tUnit}` : ''}, {fmt(model.triple.data.p)}
                  {pUnit ? ` ${pUnit}` : ''})
                </text>
              </g>
            )}

            {/* critical point */}
            {model.critical && (
              <g data-mark="point">
                <circle cx={model.critical.x} cy={model.critical.y} r={4} className="phd-pt" />
                <text
                  x={model.critical.x - 7}
                  y={model.critical.y + 15}
                  className="phd-pt-lbl"
                  textAnchor="end"
                >
                  Critical point
                </text>
                <text
                  x={model.critical.x - 7}
                  y={model.critical.y + 26}
                  className="phd-pt-sub"
                  textAnchor="end"
                >
                  ({fmt(model.critical.data.t)}
                  {tUnit ? ` ${tUnit}` : ''}, {fmt(model.critical.data.p)}
                  {pUnit ? ` ${pUnit}` : ''})
                </text>
              </g>
            )}
          </svg>
        </div>
      )}

      {!model && (
        <div className="phd-empty">Provide phase-boundary curves to draw the diagram.</div>
      )}

      {/* boundary legend (when curves carry their own labels) */}
      {model && model.curves.some((c) => c.label) && (
        <div className="phd-legend">
          {model.curves.map((c, i) =>
            c.label ? (
              <span key={`leg${i}`} className="phd-leg">
                <i style={{ background: c.color }} />
                {c.label}
              </span>
            ) : null,
          )}
        </div>
      )}

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
