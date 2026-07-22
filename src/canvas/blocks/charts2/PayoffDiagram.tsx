import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import type { PayoffDiagramProps, OptionLeg } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PayoffDiagramProps & { delay?: number };

const W = 340;
const H = 244;
const PAD_L = 46; // y-axis (P/L) tick gutter — room for a "-$120" style label
const PAD_R = 20;
const PAD_T = 16;
const PAD_B = 44; // x-axis gutter: a row for price ticks + a row for the axis title

/** Intrinsic value of one option at expiration price `s`: max(s−K,0) for a call,
 *  max(K−s,0) for a put. This is the only option-pricing identity the block needs —
 *  at expiration there is no time value, so payoff is purely intrinsic. */
function intrinsic(leg: OptionLeg, s: number): number {
  return leg.type === 'call' ? Math.max(s - leg.strike, 0) : Math.max(leg.strike - s, 0);
}

/** Profit/loss of one leg at expiration price `s`, per contract and scaled by qty.
 *  A long position pays (intrinsic − premium); a short position is its mirror,
 *  collecting the premium up front and paying out the intrinsic. */
function legPnl(leg: OptionLeg, s: number): number {
  const sign = leg.position === 'short' ? -1 : 1;
  const qty = leg.qty ?? 1;
  return sign * qty * (intrinsic(leg, s) - leg.premium);
}

/** Total P/L of the whole position at price `s` — the kinked payoff curve is just the
 *  sum of the per-leg lines, so it bends at every strike. */
function totalPnl(legs: readonly OptionLeg[], s: number): number {
  let sum = 0;
  for (const leg of legs) sum += legPnl(leg, s);
  return sum;
}

/** Format a signed money value with the prefix, trimming float dust to whole/2dp. */
function money(v: number, prefix: string): string {
  const abs = Math.abs(v);
  const n = abs >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  const sign = n < 0 ? '−' : '';
  return `${sign}${prefix}${Math.abs(n).toString()}`;
}

// An options / derivatives payoff diagram: profit-and-loss (y) versus the underlying's price
// at expiration (x). The kinked payoff line is COMPUTED from the position's legs — each leg's
// payoff is summed across a fine price grid, so the curve bends at every strike with no
// hand-placed points. Breakeven prices (where P/L crosses zero) are found by scanning the grid
// and refined by linear interpolation; profit and loss zones are shaded; max profit / max loss
// are derived (and reported as "unlimited" when an unhedged tail runs off). Covers single
// calls/puts, spreads, straddles, and any multi-leg combination.
export function PayoffDiagram({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  legs,
  priceMin,
  priceMax,
  pricePrefix = '$',
  underlyingLabel = 'Underlying price at expiration',
  pnlLabel = 'Profit / loss',
  spot,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const geom = useMemo(() => {
    const strikes = legs.map((l) => l.strike);
    const kLo = Math.min(...strikes);
    const kHi = Math.max(...strikes);
    const kSpan = kHi - kLo || kHi * 0.2 || 10;

    // Default the visible price window to a comfortable margin around the strikes so every
    // kink and both breakeven flanks sit inside the frame.
    const xLo = priceMin ?? Math.max(0, kLo - kSpan * 0.6 - kHi * 0.05);
    const xHi = priceMax ?? kHi + kSpan * 0.6 + kHi * 0.05;

    // Sample the payoff on a fine grid; the polyline + zero-crossings come from these samples.
    const N = 240;
    const samples: { s: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const s = xLo + ((xHi - xLo) * i) / N;
      samples.push({ s, y: totalPnl(legs, s) });
    }

    // Y-domain from the realized P/L over the window, always including 0, with a little headroom.
    const ys = samples.map((p) => p.y);
    let yLo = Math.min(0, ...ys);
    let yHi = Math.max(0, ...ys);
    if (yLo === yHi) {
      yLo -= 1;
      yHi += 1;
    }
    const yMargin = (yHi - yLo) * 0.12;
    yLo -= yMargin;
    yHi += yMargin;

    const sx = (s: number) => PAD_L + ((s - xLo) / (xHi - xLo || 1)) * (W - PAD_L - PAD_R);
    const sy = (y: number) => PAD_T + (1 - (y - yLo) / (yHi - yLo || 1)) * (H - PAD_T - PAD_B);

    // Breakevens: sign changes between adjacent samples, located by linear interpolation.
    const breakevens: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (a.y === 0) {
        if (!breakevens.some((x) => Math.abs(x - a.s) < 1e-6)) breakevens.push(a.s);
        continue;
      }
      if ((a.y < 0 && b.y > 0) || (a.y > 0 && b.y < 0)) {
        const t = a.y / (a.y - b.y); // fraction along [a,b] where y = 0
        breakevens.push(a.s + t * (b.s - a.s));
      }
    }

    // Max profit / max loss. The realized extremes over the window are exact for the
    // interior; the tails decide whether a value is truly bounded or runs to infinity.
    // A long call (or a net-long uncapped upside) climbs forever as S→∞; a naked short
    // call's loss is unbounded above. Below, an uncovered long/short put bounds at S=0.
    const tailSlopeHi = totalPnl(legs, xHi + kSpan) - totalPnl(legs, xHi); // sign of upside tail
    const tailSlopeLo = totalPnl(legs, xLo) - totalPnl(legs, xLo - kSpan); // sign at left edge

    const realizedHi = Math.max(...ys);
    const realizedLo = Math.min(...ys);
    // Profit is unlimited if the curve still rises past the right edge (upside) — for puts the
    // downside is naturally capped at S=0, so only the right tail can be unbounded in profit.
    const maxProfitUnlimited = tailSlopeHi > 1e-9;
    // Loss is unlimited if the curve still falls past the right edge (a naked short call).
    const maxLossUnlimited = tailSlopeHi < -1e-9;

    return {
      xLo,
      xHi,
      yLo,
      yHi,
      sx,
      sy,
      samples,
      breakevens,
      strikes: Array.from(new Set(strikes)).sort((a, b) => a - b),
      xticks: ticks(xLo, xHi, niceStep(xHi - xLo)),
      yticks: ticks(yLo, yHi, niceStep(yHi - yLo)),
      maxProfit: realizedHi,
      maxLoss: realizedLo,
      maxProfitUnlimited,
      maxLossUnlimited,
      tailSlopeLo,
    };
  }, [legs, priceMin, priceMax]);

  const {
    sx,
    sy,
    samples,
    breakevens,
    strikes,
    xticks,
    yticks,
    maxProfit,
    maxLoss,
    maxProfitUnlimited,
    maxLossUnlimited,
  } = geom;

  const zeroY = sy(0);
  const plotL = PAD_L;
  const plotR = W - PAD_R;

  // The payoff polyline as screen-space points.
  const linePts = useMemo(
    () => samples.map((p) => `${sx(p.s)},${sy(p.y)}`).join(' '),
    [samples, sx, sy],
  );

  // Profit/loss shaded polygons: the area between the payoff line and the y=0 axis, split
  // by sign. Built by walking the samples, clamping each to the zero line and inserting the
  // exact crossing where the sign flips, so the green and red regions meet precisely at 0.
  const fills = useMemo(() => {
    const profit: string[] = []; // boundary points of the "above zero" band
    const loss: string[] = [];
    for (let i = 0; i < samples.length; i++) {
      const cur = samples[i];
      const px = sx(cur.s);
      // crossing with the previous point: add the exact zero point to both bands
      if (i > 0) {
        const prev = samples[i - 1];
        if ((prev.y < 0 && cur.y > 0) || (prev.y > 0 && cur.y < 0)) {
          const t = prev.y / (prev.y - cur.y);
          const xc = sx(prev.s + t * (cur.s - prev.s));
          profit.push(`${xc},${zeroY}`);
          loss.push(`${xc},${zeroY}`);
        }
      }
      profit.push(`${px},${cur.y > 0 ? sy(cur.y) : zeroY}`);
      loss.push(`${px},${cur.y < 0 ? sy(cur.y) : zeroY}`);
    }
    const x0 = sx(samples[0].s);
    const x1 = sx(samples[samples.length - 1].s);
    // close each band back along the zero line
    const profitPoly = `${x0},${zeroY} ${profit.join(' ')} ${x1},${zeroY}`;
    const lossPoly = `${x0},${zeroY} ${loss.join(' ')} ${x1},${zeroY}`;
    return { profitPoly, lossPoly };
  }, [samples, sx, sy, zeroY]);

  const maxProfitText = maxProfitUnlimited ? 'unlimited' : money(maxProfit, pricePrefix);
  const maxLossText = maxLossUnlimited ? 'unlimited' : money(maxLoss, pricePrefix);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="pay-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="pay-svg" role="img" aria-label={title}>
          {/* gridlines */}
          {xticks.map((t, i) => (
            <line
              key={`gx${i}`}
              x1={sx(t)}
              y1={PAD_T}
              x2={sx(t)}
              y2={H - PAD_B}
              className="pay-grid"
            />
          ))}
          {yticks.map((t, i) => (
            <line key={`gy${i}`} x1={plotL} y1={sy(t)} x2={plotR} y2={sy(t)} className="pay-grid" />
          ))}

          {/* profit (green) and loss (red) zones, drawn under the line */}
          <polygon points={fills.lossPoly} className="pay-loss" />
          <polygon points={fills.profitPoly} className="pay-profit" />

          {/* strike guide lines (the kinks of the payoff) */}
          {strikes.map((k, i) => (
            <line
              key={`k${i}`}
              x1={sx(k)}
              y1={PAD_T}
              x2={sx(k)}
              y2={H - PAD_B}
              className="pay-strike"
            />
          ))}

          {/* zero P/L reference line (the break-even level) */}
          <line x1={plotL} y1={zeroY} x2={plotR} y2={zeroY} className="pay-zero" />

          {/* axes: y-axis on the left edge, x-axis at the frame bottom */}
          <line x1={plotL} y1={PAD_T} x2={plotL} y2={H - PAD_B} className="pay-axis" />
          <line x1={plotL} y1={H - PAD_B} x2={plotR} y2={H - PAD_B} className="pay-axis" />

          {/* y tick labels (P/L) */}
          {yticks.map((t, i) => (
            <text key={`yt${i}`} x={plotL - 5} y={sy(t) + 3} className="pay-tick" textAnchor="end">
              {money(t, pricePrefix)}
            </text>
          ))}
          {/* x tick labels (price) */}
          {xticks.map((t, i) => (
            <text
              key={`xt${i}`}
              x={sx(t)}
              y={H - PAD_B + 13}
              className="pay-tick"
              textAnchor="middle"
            >
              {pricePrefix}
              {t}
            </text>
          ))}

          {/* the payoff line */}
          <polyline points={linePts} className="pay-line" data-mark="line" />

          {/* breakeven markers on the zero line — a strategy with more than one breakeven
              (a spread, a butterfly) can land two of them close enough on screen that a label
              fixed just above the line every time collides with its neighbour; alternate the
              label above/below whenever consecutive breakevens are closer than that. */}
          {breakevens.map((be, i) => {
            const px = sx(be);
            const below = i > 0 && Math.abs(px - sx(breakevens[i - 1])) < 44 && i % 2 === 1;
            return (
              <g key={`be${i}`}>
                <circle cx={px} cy={zeroY} r={3.5} className="pay-be-dot" data-mark="point" />
                <text
                  x={px}
                  y={below ? zeroY + 15 : zeroY - 7}
                  className="pay-be-lbl"
                  textAnchor="middle"
                >
                  BE {pricePrefix}
                  {Math.round(be * 100) / 100}
                </text>
              </g>
            );
          })}

          {/* spot price marker (today's underlying), if given */}
          {typeof spot === 'number' && spot >= geom.xLo && spot <= geom.xHi && (
            <g>
              <line x1={sx(spot)} y1={PAD_T} x2={sx(spot)} y2={H - PAD_B} className="pay-spot" />
              <text x={sx(spot)} y={PAD_T + 9} className="pay-spot-lbl" textAnchor="middle">
                spot {pricePrefix}
                {spot}
              </text>
            </g>
          )}

          {/* axis titles, each on its own row clear of the tick baseline */}
          <text
            x={plotL + (plotR - plotL) / 2}
            y={H - 6}
            className="pay-axis-lbl"
            textAnchor="middle"
          >
            {underlyingLabel}
          </text>
          <text x={plotL + 3} y={PAD_T - 5} className="pay-axis-lbl" textAnchor="start">
            {pnlLabel}
          </text>
        </svg>
      </div>

      {/* derived read-outs: max profit, max loss, and breakeven(s) */}
      <div className="pay-stats">
        <span className="pay-stat">
          <i className="pay-stat-dot pay-stat-dot--up" />
          <span className="pay-stat-k">Max profit</span>
          <span className="pay-stat-v">{maxProfitText}</span>
        </span>
        <span className="pay-stat">
          <i className="pay-stat-dot pay-stat-dot--down" />
          <span className="pay-stat-k">Max loss</span>
          <span className="pay-stat-v">{maxLossText}</span>
        </span>
        <span className="pay-stat">
          <i className="pay-stat-dot pay-stat-dot--be" />
          <span className="pay-stat-k">Break-even</span>
          <span className="pay-stat-v">
            {breakevens.length
              ? breakevens.map((be) => `${pricePrefix}${Math.round(be * 100) / 100}`).join(', ')
              : 'none'}
          </span>
        </span>
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
