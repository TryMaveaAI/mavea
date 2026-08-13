import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import type { SupplyDemandProps, SDLine } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SupplyDemandProps & { delay?: number };

const W = 340;
const H = 248;
const PAD_L = 38; // y-axis (price) tick gutter
const PAD_R = 18;
const PAD_T = 14;
const PAD_B = 44; // x-axis gutter: a row for quantity ticks + a row for the axis title

/** A line on the price(P)–quantity(Q) plane, expressed as P = intercept + slope·Q.
 *  The textbook convention plots price on the vertical axis as a function of quantity,
 *  so supply has slope > 0 and demand slope < 0. */
interface LineFn {
  intercept: number;
  slope: number;
}

/** Resolve a curve given either {intercept, slope} (price-on-quantity) or two points. */
function toLine(line: SDLine | undefined, fallback: LineFn): LineFn {
  if (!line) return fallback;
  if (line.points && line.points.length >= 2) {
    const [p0, p1] = line.points;
    const dq = p1.q - p0.q;
    if (dq === 0) return fallback; // vertical curve isn't expressible as P=f(Q)
    const slope = (p1.p - p0.p) / dq;
    return { intercept: p0.p - slope * p0.q, slope };
  }
  if (typeof line.intercept === 'number' && typeof line.slope === 'number') {
    return { intercept: line.intercept, slope: line.slope };
  }
  return fallback;
}

/** Equilibrium of two lines P = a + bQ and P = c + dQ: solve a + bQ = c + dQ. */
function intersect(s: LineFn, d: LineFn): { q: number; p: number } | null {
  const denom = s.slope - d.slope;
  if (denom === 0) return null; // parallel — no single crossing
  const q = (d.intercept - s.intercept) / denom;
  const p = s.intercept + s.slope * q;
  return { q, p };
}

/** Round to at most 2 decimals, dropping trailing zeros, for clean P-star / Q-star labels. */
function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

const SUPPLY = 'var(--presence)';
const DEMAND = 'var(--insight)';

export function SupplyDemand({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  supply,
  demand,
  shift,
  region,
  qMax,
  pMax,
  priceLabel = 'Price',
  quantityLabel = 'Quantity',
  pricePrefix = '',
  showEquilibrium = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // Unique per-instance id so two diagrams on one canvas don't share the marker def.
  const arrowId = `sud-arrow-${useId()}`;

  const geom = useMemo(() => {
    // Resolve both curves; sensible defaults keep the diagram sane if a curve is partial.
    const sup = toLine(supply, { intercept: 0, slope: 1 });
    const dem = toLine(demand, { intercept: 10, slope: -1 });

    // The shifted curve (faded original → new), if any.
    const shifted = shift ? toLine(shift.to, shift.curve === 'supply' ? sup : dem) : null;

    const eq = intersect(sup, dem);
    const eqShift =
      shifted && shift
        ? intersect(
            shift.curve === 'supply' ? shifted : sup,
            shift.curve === 'demand' ? shifted : dem,
          )
        : null;

    // Auto-fit the visible window from the equilibria (so the crossing sits comfortably
    // inside the frame) unless the caller pins qMax/pMax. Origin is always (0,0).
    const eqQs = [eq?.q ?? 0, eqShift?.q ?? 0].filter((q) => q > 0);
    const eqPs = [eq?.p ?? 0, eqShift?.p ?? 0].filter((p) => p > 0);
    // Demand's price-intercept (Q=0) and quantity-intercept (P=0) anchor the natural extent.
    const demPriceIntercept = Math.max(
      dem.intercept,
      shifted && shift?.curve === 'demand' ? shifted.intercept : 0,
    );
    const supPriceIntercept = Math.max(0, sup.intercept);

    const qFit =
      qMax ??
      Math.max(
        eqQs.length ? Math.max(...eqQs) * 1.6 : 10,
        // demand hits P=0 at Q = -intercept/slope; show a bit past the equilibrium
        dem.slope !== 0 ? (-dem.intercept / dem.slope) * 0.95 : 10,
      );
    const pFit =
      pMax ??
      Math.max(
        eqPs.length ? Math.max(...eqPs) * 1.6 : 10,
        demPriceIntercept * 1.02,
        supPriceIntercept,
      );

    const qHi = qFit > 0 ? qFit : 10;
    const pHi = pFit > 0 ? pFit : 10;

    const sx = (q: number) => PAD_L + (q / qHi) * (W - PAD_L - PAD_R);
    const sy = (p: number) => H - PAD_B - (p / pHi) * (H - PAD_T - PAD_B);

    // Clip a line P = a + bQ to the visible [0, qHi]×[0, pHi] box, returning the two
    // on-screen endpoints so it spans the frame without escaping it.
    const clip = (ln: LineFn): { q1: number; p1: number; q2: number; p2: number } => {
      const cands: { q: number; p: number }[] = [];
      const add = (q: number, p: number) => {
        if (q >= -1e-6 && q <= qHi + 1e-6 && p >= -1e-6 && p <= pHi + 1e-6) cands.push({ q, p });
      };
      // crossings with the four box edges
      add(0, ln.intercept); // Q=0 edge
      add(qHi, ln.intercept + ln.slope * qHi); // Q=qHi edge
      if (ln.slope !== 0) {
        add(-ln.intercept / ln.slope, 0); // P=0 edge
        add((pHi - ln.intercept) / ln.slope, pHi); // P=pHi edge
      }
      // de-dupe near-identical corners, keep the two furthest apart
      const uniq: { q: number; p: number }[] = [];
      for (const c of cands) {
        if (!uniq.some((u) => Math.abs(u.q - c.q) < 1e-4 && Math.abs(u.p - c.p) < 1e-4))
          uniq.push(c);
      }
      uniq.sort((a, b) => a.q - b.q);
      const a = uniq[0] ?? { q: 0, p: ln.intercept };
      const b = uniq[uniq.length - 1] ?? { q: qHi, p: ln.intercept + ln.slope * qHi };
      return { q1: a.q, p1: a.p, q2: b.q, p2: b.p };
    };

    return {
      sup,
      dem,
      shifted,
      eq,
      eqShift,
      qHi,
      pHi,
      sx,
      sy,
      clip,
      qticks: ticks(0, qHi, niceStep(qHi)).filter((t) => t > 0),
      pticks: ticks(0, pHi, niceStep(pHi)).filter((t) => t > 0),
    };
  }, [supply, demand, shift, qMax, pMax]);

  const { sup, dem, shifted, eq, eqShift, sx, sy, clip, qticks, pticks } = geom;

  // Active equilibrium (post-shift if a shift is given, else the base crossing).
  const activeEq = shift && eqShift ? eqShift : eq;

  // Suppress the axis tick whose position coincides with the equilibrium, so its number
  // doesn't print on top of the P*/Q* readout (the gridline still draws). Compared in screen
  // space for a consistent gap regardless of the data's scale.
  const eqShown = showEquilibrium && !!activeEq && activeEq.q > 0 && activeEq.p > 0;
  const qLabelTicks =
    eqShown && activeEq ? qticks.filter((t) => Math.abs(sx(t) - sx(activeEq.q)) > 16) : qticks;
  const pLabelTicks =
    eqShown && activeEq ? pticks.filter((t) => Math.abs(sy(t) - sy(activeEq.p)) > 11) : pticks;

  // Surplus / deadweight shading is anchored on the BASE (pre-shift) equilibrium so the
  // textbook triangles read correctly. Computed only when a crossing exists.
  const regionPath = useMemo(() => {
    if (!region || region === 'none' || !eq) return null;
    const pStar = eq.p;
    const qStar = eq.q;
    // consumer surplus: triangle between demand curve and P* above the equilibrium,
    // from Q=0 to Q=Q* (demand's price-intercept down to P*).
    if (region === 'consumer') {
      const top = { q: 0, p: dem.intercept }; // demand at Q=0
      return [
        `M ${sx(0)},${sy(pStar)}`,
        `L ${sx(0)},${sy(top.p)}`,
        `L ${sx(qStar)},${sy(pStar)}`,
        'Z',
      ].join(' ');
    }
    // producer surplus: triangle between P* and the supply curve, Q=0 to Q*.
    if (region === 'producer') {
      const bottom = { q: 0, p: sup.intercept }; // supply at Q=0
      return [
        `M ${sx(0)},${sy(pStar)}`,
        `L ${sx(0)},${sy(bottom.p)}`,
        `L ${sx(qStar)},${sy(pStar)}`,
        'Z',
      ].join(' ');
    }
    return null;
  }, [region, eq, dem, sup, sx, sy]);

  const supClip = clip(sup);
  const demClip = clip(dem);
  const shiftClip = shifted ? clip(shifted) : null;
  // The original (faded) position of whichever curve shifted.
  const originalClip = shift ? (shift.curve === 'supply' ? supClip : demClip) : null;
  const movedClip = shift && shiftClip ? shiftClip : null;
  const shiftColor = shift?.curve === 'demand' ? DEMAND : SUPPLY;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sud-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="sud-svg" role="img" aria-label={title}>
          {/* gridlines */}
          {qticks.map((t) => (
            <line
              key={`gq${t}`}
              x1={sx(t)}
              y1={PAD_T}
              x2={sx(t)}
              y2={H - PAD_B}
              className="sud-grid"
            />
          ))}
          {pticks.map((t) => (
            <line
              key={`gp${t}`}
              x1={PAD_L}
              y1={sy(t)}
              x2={W - PAD_R}
              y2={sy(t)}
              className="sud-grid"
            />
          ))}

          {/* shaded surplus / region (under the curves) */}
          {regionPath && (
            <path
              d={regionPath}
              fill={`color-mix(in oklab, ${region === 'producer' ? SUPPLY : DEMAND} 16%, transparent)`}
              stroke="none"
            />
          )}

          {/* axes */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="sud-axis" />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="sud-axis" />

          {/* tick labels (the tick coinciding with the equilibrium is dropped above) */}
          {qLabelTicks.map((t) => (
            <text
              key={`qt${t}`}
              x={sx(t)}
              y={H - PAD_B + 12}
              className="sud-tick"
              textAnchor="middle"
            >
              {t}
            </text>
          ))}
          {pLabelTicks.map((t) => (
            <text key={`pt${t}`} x={PAD_L - 5} y={sy(t) + 3} className="sud-tick" textAnchor="end">
              {pricePrefix}
              {t}
            </text>
          ))}

          {/* faded ORIGINAL position of the shifting curve + shift arrow */}
          {originalClip && movedClip && (
            <>
              <line
                x1={sx(originalClip.q1)}
                y1={sy(originalClip.p1)}
                x2={sx(originalClip.q2)}
                y2={sy(originalClip.p2)}
                stroke={shiftColor}
                className="sud-curve sud-curve--ghost"
              />
              <line
                x1={(sx(originalClip.q1) + sx(originalClip.q2)) / 2}
                y1={(sy(originalClip.p1) + sy(originalClip.p2)) / 2}
                x2={(sx(movedClip.q1) + sx(movedClip.q2)) / 2}
                y2={(sy(movedClip.p1) + sy(movedClip.p2)) / 2}
                className="sud-shift-arrow"
                markerEnd={`url(#${arrowId})`}
              />
            </>
          )}

          {/* arrowhead marker for the shift */}
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--text-secondary)" />
            </marker>
          </defs>

          {/* supply curve (use the moved one if supply shifted) */}
          <line
            x1={sx((shift?.curve === 'supply' && movedClip ? movedClip : supClip).q1)}
            y1={sy((shift?.curve === 'supply' && movedClip ? movedClip : supClip).p1)}
            x2={sx((shift?.curve === 'supply' && movedClip ? movedClip : supClip).q2)}
            y2={sy((shift?.curve === 'supply' && movedClip ? movedClip : supClip).p2)}
            stroke={SUPPLY}
            className="sud-curve"
          />
          {/* demand curve (use the moved one if demand shifted) */}
          <line
            x1={sx((shift?.curve === 'demand' && movedClip ? movedClip : demClip).q1)}
            y1={sy((shift?.curve === 'demand' && movedClip ? movedClip : demClip).p1)}
            x2={sx((shift?.curve === 'demand' && movedClip ? movedClip : demClip).q2)}
            y2={sy((shift?.curve === 'demand' && movedClip ? movedClip : demClip).p2)}
            stroke={DEMAND}
            className="sud-curve"
          />

          {/* curve labels at the right/top end of each line */}
          <text
            x={sx((shift?.curve === 'supply' && movedClip ? movedClip : supClip).q2) - 3}
            y={sy((shift?.curve === 'supply' && movedClip ? movedClip : supClip).p2) - 5}
            fill={SUPPLY}
            className="sud-curve-lbl"
            textAnchor="end"
          >
            S{shift?.curve === 'supply' ? '₁' : ''}
          </text>
          <text
            x={sx((shift?.curve === 'demand' && movedClip ? movedClip : demClip).q2) - 3}
            y={sy((shift?.curve === 'demand' && movedClip ? movedClip : demClip).p2) - 5}
            fill={DEMAND}
            className="sud-curve-lbl"
            textAnchor="end"
          >
            D{shift?.curve === 'demand' ? '₁' : ''}
          </text>

          {/* equilibrium: dashed guide lines + point + P-star / Q-star labels */}
          {showEquilibrium && activeEq && activeEq.q > 0 && activeEq.p > 0 && (
            <g>
              <line
                x1={PAD_L}
                y1={sy(activeEq.p)}
                x2={sx(activeEq.q)}
                y2={sy(activeEq.p)}
                className="sud-guide"
              />
              <line
                x1={sx(activeEq.q)}
                y1={H - PAD_B}
                x2={sx(activeEq.q)}
                y2={sy(activeEq.p)}
                className="sud-guide"
              />
              <circle
                cx={sx(activeEq.q)}
                cy={sy(activeEq.p)}
                r={4}
                className="sud-eq"
                data-mark="point"
              />
              <text x={PAD_L + 6} y={sy(activeEq.p) - 4} className="sud-eq-lbl" textAnchor="start">
                P* {pricePrefix}
                {fmt(activeEq.p)}
              </text>
              <text
                x={sx(activeEq.q) + 4}
                y={H - PAD_B + 12}
                className="sud-eq-lbl"
                textAnchor="start"
              >
                Q* {fmt(activeEq.q)}
              </text>
            </g>
          )}

          {/* axis labels — quantity title on its own row below the ticks (centred), price
              title at the top of the y-axis */}
          <text
            x={PAD_L + (W - PAD_L - PAD_R) / 2}
            y={H - 6}
            className="sud-axis-lbl"
            textAnchor="middle"
          >
            {quantityLabel}
          </text>
          <text x={PAD_L + 3} y={PAD_T} className="sud-axis-lbl" textAnchor="start">
            {priceLabel}
          </text>
        </svg>
      </div>

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
