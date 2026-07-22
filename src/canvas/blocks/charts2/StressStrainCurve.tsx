// StressStrainCurve — the canonical materials-testing diagram: engineering stress plotted
// against strain from a real tensile-test trace, with the elastic region shaded up to the yield
// point (if given), yield/ultimate/fracture called out with an arrow-leader annotation, and a
// Young's-modulus readout computed from the curve's own first sample and the yield point — never
// a fitted slope. Every marker is independently optional and rendered only when finite.
import { useId, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import { usePathDraw } from '../../lib/motion';
import type { StressStrainCurveProps, StressStrainMarker } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StressStrainCurveProps & { delay?: number };

const W = 360;
const H = 240;
const M = { top: 18, right: 20, bottom: 36, left: 50 };

interface MarkerDef {
  key: 'yield' | 'ultimate' | 'fracture';
  point: StressStrainMarker | undefined;
  label: string;
  color: string;
}

function isFiniteMarker(p: StressStrainMarker | undefined): p is StressStrainMarker {
  return !!p && Number.isFinite(p.strain) && Number.isFinite(p.stress);
}

function fmtStrain(v: number): string {
  const pct = v * 100;
  return `${Math.abs(pct) < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}
function fmtStress(v: number): string {
  const av = Math.abs(v);
  if (av >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return av < 10 ? v.toFixed(2) : v.toFixed(1);
}
function fmtModulus(v: number): string {
  const av = Math.abs(v);
  if (av >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (av >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return av < 10 ? v.toFixed(2) : v.toFixed(0);
}

export function StressStrainCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  curve,
  yieldPoint,
  ultimatePoint,
  fracturePoint,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const uid = useId().replace(/:/g, '');
  const curveRef = useRef<SVGPathElement>(null);

  const geom = useMemo(() => {
    const pts = (Array.isArray(curve) ? curve : []).filter(
      (p): p is { strain: number; stress: number } =>
        !!p &&
        typeof p === 'object' &&
        Number.isFinite((p as { strain: unknown }).strain) &&
        Number.isFinite((p as { stress: unknown }).stress),
    );
    if (pts.length < 2) return null;

    const validYield = isFiniteMarker(yieldPoint) ? yieldPoint : undefined;
    const validUltimate = isFiniteMarker(ultimatePoint) ? ultimatePoint : undefined;
    const validFracture = isFiniteMarker(fracturePoint) ? fracturePoint : undefined;

    const extras = [validYield, validUltimate, validFracture].filter(
      (m): m is StressStrainMarker => !!m,
    );
    const exX = extent(pts.map((p) => p.strain).concat(extras.map((m) => m.strain)))!;
    const exY = extent(pts.map((p) => p.stress).concat(extras.map((m) => m.stress)))!;
    const [xMin, xMax] = niceDomain(Math.min(0, exX[0]), exX[1]);
    const [yMin, yMax] = niceDomain(Math.min(0, exY[0]), exY[1]);

    const plotL = M.left;
    const plotR = W - M.right;
    const plotT = M.top;
    const plotB = H - M.bottom;
    const sx = scaleLinear([xMin, xMax], [plotL, plotR]);
    const sy = scaleLinear([yMin, yMax], [plotB, plotT]);

    const screenPts = pts.map((p) => ({ x: sx(p.strain), y: sy(p.stress) }));
    const pathD = screenPts
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');

    // Elastic-region band: shade the REAL curve segment from its first sample up through the
    // point nearest the stated yield strain — never a fabricated straight "elastic line".
    let elasticD: string | null = null;
    let modulus: number | null = null;
    if (validYield) {
      let nearest = 0;
      let bestD = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = Math.abs(pts[i].strain - validYield.strain);
        if (d < bestD) {
          bestD = d;
          nearest = i;
        }
      }
      if (nearest > 0) {
        const seg = screenPts.slice(0, nearest + 1);
        const baseline = sy(0);
        elasticD =
          `M${seg[0].x.toFixed(2)},${baseline.toFixed(2)} ` +
          seg.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') +
          ` L${seg[seg.length - 1].x.toFixed(2)},${baseline.toFixed(2)} Z`;
      }
      // Slope between the trace's own first sample (the unloaded baseline) and the stated yield
      // point — real rise over real run, not a regression fit.
      const dStrain = validYield.strain - pts[0].strain;
      if (dStrain !== 0) {
        const e = (validYield.stress - pts[0].stress) / dStrain;
        if (Number.isFinite(e)) modulus = e;
      }
    }

    const markers: (MarkerDef & { point: StressStrainMarker })[] = (
      [
        { key: 'yield', point: validYield, label: 'Yield', color: 'var(--warning)' },
        { key: 'ultimate', point: validUltimate, label: 'UTS', color: 'var(--presence)' },
        { key: 'fracture', point: validFracture, label: 'Fracture', color: 'var(--danger)' },
      ] as MarkerDef[]
    ).filter((m): m is MarkerDef & { point: StressStrainMarker } => !!m.point);

    return {
      sx,
      sy,
      plotL,
      plotR,
      plotT,
      plotB,
      pathD,
      elasticD,
      modulus,
      markers,
      xTicks: sx.ticks(5),
      yTicks: sy.ticks(5),
    };
  }, [curve, yieldPoint, ultimatePoint, fracturePoint]);

  usePathDraw(curveRef, { delay: delay ?? 0 });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {geom ? (
        <div className="c2-ssc-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="c2-ssc-svg" role="img" aria-label={title}>
            <defs>
              {geom.markers.map((m) => (
                <marker
                  key={m.key}
                  id={`ssc-arrow-${m.key}-${uid}`}
                  markerWidth="7"
                  markerHeight="7"
                  refX="5.5"
                  refY="3.5"
                  orient="auto"
                >
                  <path
                    d="M1.2,1.2 L5.5,3.5 L1.2,5.8"
                    className="c2-ssc-arrowhead"
                    style={{ stroke: m.color }}
                  />
                </marker>
              ))}
            </defs>

            {geom.yTicks.map((t, i) => (
              <line
                key={`gy${i}`}
                x1={geom.plotL}
                y1={geom.sy(t)}
                x2={geom.plotR}
                y2={geom.sy(t)}
                className="c2-ssc-grid"
              />
            ))}

            {geom.elasticD && <path d={geom.elasticD} className="c2-ssc-elastic" />}

            <line
              x1={geom.plotL}
              y1={geom.plotB}
              x2={geom.plotR}
              y2={geom.plotB}
              className="c2-ssc-axis"
            />
            {geom.xTicks.map((t, i) => (
              <text
                key={`xt${i}`}
                x={geom.sx(t)}
                y={geom.plotB + 13}
                textAnchor="middle"
                className="c2-ssc-tick"
              >
                {fmtStrain(t)}
              </text>
            ))}
            <line
              x1={geom.plotL}
              y1={geom.plotT}
              x2={geom.plotL}
              y2={geom.plotB}
              className="c2-ssc-axis"
            />
            {geom.yTicks.map((t, i) => (
              <text
                key={`yt${i}`}
                x={geom.plotL - 5}
                y={geom.sy(t) + 3}
                textAnchor="end"
                className="c2-ssc-tick"
              >
                {fmtStress(t)}
              </text>
            ))}

            <path ref={curveRef} d={geom.pathD} className="c2-ssc-line" />

            {geom.markers.map((m, i) => {
              const px = geom.sx(m.point.strain);
              const py = geom.sy(m.point.stress);
              const goRight = px < (geom.plotL + geom.plotR) / 2;
              const lx = goRight
                ? Math.min(px + 30, geom.plotR - 4)
                : Math.max(px - 30, geom.plotL + 4);
              const ly = Math.max(geom.plotT + 8, py - 26);
              return (
                <g
                  key={m.key}
                  className="m-fade-rise m-stagger-item"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <circle cx={px} cy={py} r={3.2} fill={m.color} />
                  <line
                    x1={lx}
                    y1={ly}
                    x2={px}
                    y2={py}
                    className="c2-ssc-leader"
                    style={{ stroke: m.color }}
                    markerEnd={`url(#ssc-arrow-${m.key}-${uid})`}
                  />
                  <text
                    x={lx}
                    y={ly - 4}
                    textAnchor={goRight ? 'start' : 'end'}
                    className="c2-ssc-mk"
                    style={{ fill: m.color }}
                  >
                    {m.label} · {fmtStress(m.point.stress)}
                  </text>
                </g>
              );
            })}

            <text
              x={(geom.plotL + geom.plotR) / 2}
              y={H - 6}
              textAnchor="middle"
              className="c2-ssc-axlbl"
            >
              Strain
            </text>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              className="c2-ssc-axlbl"
              transform={`translate(13, ${(geom.plotT + geom.plotB) / 2}) rotate(-90)`}
            >
              Stress
            </text>
          </svg>

          {geom.modulus !== null && (
            <p className="c2-ssc-modulus">
              Young&rsquo;s modulus <em>E</em> ≈ {fmtModulus(geom.modulus)}
              <span className="faint"> (elastic slope, stress ÷ strain)</span>
            </p>
          )}
        </div>
      ) : (
        <div className="c2-ssc-empty faint">
          Provide a strain/stress curve with at least two points.
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
