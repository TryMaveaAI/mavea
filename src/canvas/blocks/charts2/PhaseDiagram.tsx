import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceStep, ticks } from '../../lib/scale';
import type { PhaseDiagramProps, PhaseBoundary, PhasePoint } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';
import { boxHits, placeClear, ringCandidates, splitTwo } from './chartMath';
import type { Box, Pt } from './chartMath';

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

// Label type sizes, mirrored from styles.css (.phd-region-lbl / .phd-pt-lbl / .phd-pt-sub) so the
// placement below measures the text it will actually draw.
const REGION_FS = 11;
const PT_FS = 9.5;
const PT_SUB_FS = 8.5;

/** "(273.16 K, 0.006 atm)" — a special point's coordinates with their units. */
function coords(pt: PhasePoint, tUnit?: string, pUnit?: string): string {
  return `(${fmt(pt.t)}${tUnit ? ` ${tUnit}` : ''}, ${fmt(pt.p)}${pUnit ? ` ${pUnit}` : ''})`;
}

/** A special point's two-line label, hung in whichever corner around the point no boundary curve
 *  crosses — `prefer` names the corner tried first. A curve ending AT the point leaves at most
 *  three corners clear, and which three depends on the data, so no fixed corner is safe. */
function placePointLabel(
  at: Pt,
  title: string,
  sub: string,
  prefer: 'above-right' | 'below-left',
  bounds: Box,
  lines: Pt[][],
  avoid: Box[],
): Box {
  const w = Math.max(estimateTextWidth(title, PT_FS, true), estimateTextWidth(sub, PT_SUB_FS));
  const h = 24;
  const gap = 7;
  const ar = { x: at.x + gap, y: at.y - h - 2, w, h };
  const al = { x: at.x - gap - w, y: at.y - h - 2, w, h };
  const br = { x: at.x + gap, y: at.y + 4, w, h };
  const bl = { x: at.x - gap - w, y: at.y + 4, w, h };
  const corners = prefer === 'above-right' ? [ar, br, al, bl] : [bl, al, br, ar];
  // Then the same corners stepped further from the dot, for when a region name already sits in
  // the near corner (water's supercritical label crowds its critical point).
  const order = [12, 24, 36].reduce(
    (all, d) => [...all, ...corners.map((c) => ({ ...c, y: c.y < at.y ? c.y - d : c.y + d }))],
    corners,
  );
  return placeClear(order, bounds, lines, avoid);
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

    const regionLabels = regions.map((r) => ({
      ...project(r),
      text: r.label,
      tint: r.color || REGION_TINT[r.phase] || 'var(--text-secondary)',
      anchor: (r.anchor || 'middle') as 'start' | 'middle' | 'end',
    }));

    // Labels are placed against the curves they annotate. Each region name is nudged off any
    // boundary that runs through its authored spot, never across one: the anchor is the model's
    // guess at "somewhere inside the area", and a name centred on it is routinely cut by the very
    // line that bounds the area. The special points go last, since each has four corners to
    // choose from and a region name has only its own area.
    const plot = { x: PAD_L + 2, y: PAD_T, w: W - PAD_L - PAD_R - 4, h: H - PAD_T - PAD_B - 2 };
    const lines = curves.map((c) => c.pts);
    const dots: Box[] = [triplePoint, criticalPoint]
      .filter((pt): pt is PhasePoint => !!pt)
      .map((pt) => {
        const c = project(pt);
        return { x: c.x - 5, y: c.y - 5, w: 10, h: 10 };
      });
    const taken: Box[] = [...dots];
    const placedRegions = regionLabels.map((r) => {
      // One line first; when no spot near the anchor is clear (a narrow wedge such as ice, between
      // the axis and a steep fusion line), the name breaks onto two lines and tries again.
      const attempt = (rows: string[]) => {
        const w = Math.max(...rows.map((t) => estimateTextWidth(t, REGION_FS, true)));
        const h = rows.length * (REGION_FS + 2) + 1;
        const cx = r.anchor === 'start' ? r.x + w / 2 : r.anchor === 'end' ? r.x - w / 2 : r.x;
        const home = { x: r.x, y: r.y };
        const box = placeClear(
          ringCandidates({ x: cx, y: r.y }, w, h, 6, 12),
          plot,
          lines,
          taken,
          home,
        );
        return { rows, box, hits: boxHits(box, lines, taken) };
      };
      let best = attempt([r.text]);
      const split = splitTwo(r.text);
      if (best.hits > 0 && split) {
        const two = attempt(split);
        if (two.hits < best.hits) best = two;
      }
      taken.push(best.box);
      return {
        ...r,
        rows: best.rows,
        x: best.box.x + best.box.w / 2,
        y: best.box.y + best.box.h / 2,
      };
    });
    const triple = triplePoint
      ? (() => {
          const at = project(triplePoint);
          const sub = coords(triplePoint, tUnit, pUnit);
          const box = placePointLabel(at, 'Triple point', sub, 'above-right', plot, lines, taken);
          return { ...at, data: triplePoint, sub, box };
        })()
      : null;
    const critical = criticalPoint
      ? (() => {
          const at = project(criticalPoint);
          const sub = coords(criticalPoint, tUnit, pUnit);
          const avoid = triple ? [...taken, triple.box] : taken;
          const box = placePointLabel(at, 'Critical point', sub, 'below-left', plot, lines, avoid);
          return { ...at, data: criticalPoint, sub, box };
        })()
      : null;
    // Region tint patches are simple soft discs under each name — enough to colour-key the areas
    // without claiming a precise (and easily-wrong) closed-polygon fill. The disc follows the name
    // wherever it settled.
    const tintPatches = placedRegions.map((r) => ({ x: r.x, y: r.y, tint: r.tint }));

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
      regionLabels: placedRegions,
      triple,
      critical,
      tticks: ticks(tMin, tMax, tStep),
      pticks: ticks(pMin, pMax, pStep),
    };
  }, [boundaries, triplePoint, criticalPoint, regions, tDomain, pDomain, tUnit, pUnit]);

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
                y={r.y - ((r.rows.length - 1) * (REGION_FS + 2)) / 2}
                fill={r.tint}
                className="phd-region-lbl"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {r.rows.map((row, j) => (
                  <tspan key={j} x={r.x} dy={j ? REGION_FS + 2 : 0}>
                    {row}
                  </tspan>
                ))}
              </text>
            ))}

            {/* triple and critical points, each label in its clear corner */}
            {[
              { pt: model.triple, title: 'Triple point' },
              { pt: model.critical, title: 'Critical point' },
            ].map(({ pt, title: name }) =>
              pt ? (
                <g key={name} data-mark="point">
                  <circle cx={pt.x} cy={pt.y} r={4} className="phd-pt" />
                  <text x={pt.box.x} y={pt.box.y + 9} className="phd-pt-lbl">
                    {name}
                  </text>
                  <text x={pt.box.x} y={pt.box.y + 21} className="phd-pt-sub">
                    {pt.sub}
                  </text>
                </g>
              ) : null,
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
