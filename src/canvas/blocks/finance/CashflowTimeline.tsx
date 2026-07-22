import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import {
  BlockEmpty,
  densityPlan,
  formatValue,
  niceDomain,
  niceStep,
  ticks,
  useCountUp,
  usePathDraw,
} from '../../lib';
import { withUnit } from '../../lib/format';
import { fitText, type FitTextResult } from '../../lib/fitText';
import type { CashflowTimelineProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CashflowTimelineProps & { delay?: number };

const PAD_L = 46; // amount labels center on the first tick, so both sides need real margin
const PAD_R = 46;
const PAD_T = 6;
const ARROW_MAX = 104; // arrow length at the shared scale's nice top
const ARROW_MIN = 12; // a nonzero flow always reads as an arrow, never a speck
const HEAD = 6;
const TICK_DY = 14;

function fmtAmt(a: number, sym: string): string {
  return withUnit(a, sym, { compact: a >= 1e4 });
}

interface FlowNode {
  i: number;
  period: number;
  amount: number;
  label: string | undefined;
  x: number;
  /** 1 = inflow (up), -1 = outflow (down), 0 = a zero flow (a dot on the axis). */
  dir: 1 | -1 | 0;
  len: number;
  fit: FitTextResult | null;
}

// The textbook engineering-economics cash-flow diagram: a period axis with one arrow per
// flow — up for inflows, down for outflows — every arrow on ONE shared nice scale so a
// year-5 salvage value is visually comparable to the year-0 purchase. NPV, when a discount
// rate is given, is computed here from Σ amount/(1+r)^period, never authored.
export function CashflowTimeline({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  flows,
  periodLabel,
  discountRate,
  currency,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const axisRef = useRef<SVGLineElement>(null);
  usePathDraw(axisRef, { delay });

  const sym = typeof currency === 'string' && currency.trim() ? currency.trim() : '$';
  const periodLbl =
    typeof periodLabel === 'string' && periodLabel.trim() ? periodLabel.trim() : 'Year';

  const model = useMemo(() => {
    const raw = Array.isArray(flows) ? flows : [];
    const clean: { period: number; amount: number; label: string | undefined }[] = [];
    for (const f of raw) {
      if (!f || typeof f !== 'object') continue;
      const period = Number(f.period);
      const amount = Number(f.amount);
      if (!Number.isFinite(period) || !Number.isFinite(amount)) continue;
      const label = typeof f.label === 'string' && f.label.trim() ? f.label : undefined;
      clean.push({ period: Math.max(0, Math.round(period)), amount, label });
    }
    clean.sort((a, b) => a.period - b.period);
    if (!clean.length) return null;

    // Axis: every integer tick while that stays readable, else nice-stepped ticks — flows
    // still position at their exact period, ticked or not (and a huge maxP stays ~11 ticks).
    const maxP = clean[clean.length - 1].period;
    const step = maxP <= 24 ? 1 : niceStep(maxP, 12);
    const tickVals = ticks(0, maxP, step);
    if (!tickVals.length) tickVals.push(0);

    const distinct = [...new Set(clean.map((f) => f.period))];
    const slots = maxP <= 24 ? maxP + 1 : tickVals.length;
    const plotW = Math.min(1160, Math.max(320, (slots - 1) * 48, distinct.length * 18));
    const W = PAD_L + plotW + PAD_R;
    const xOf = (p: number) => (maxP === 0 ? PAD_L + plotW / 2 : PAD_L + (p / maxP) * plotW);

    // One shared nice scale for every arrow, so lengths compare across the whole diagram.
    const amtMax = clean.reduce((m, f) => Math.max(m, Math.abs(f.amount)), 0);
    const top = amtMax > 0 ? niceDomain(0, amtMax)[1] : 1;
    const lenOf = (a: number) =>
      a === 0 ? 0 : Math.max(ARROW_MIN, (Math.abs(a) / top) * ARROW_MAX);

    // Same-period flows fan out side by side, bounded so a stack never bleeds into the
    // neighboring period's slot.
    const xs = distinct.map(xOf).sort((a, b) => a - b);
    let minAdj = plotW;
    for (let i = 1; i < xs.length; i++) minAdj = Math.min(minAdj, xs[i] - xs[i - 1]);
    if (!(minAdj > 0)) minAdj = plotW;
    const counts = new Map<number, number>();
    for (const f of clean) counts.set(f.period, (counts.get(f.period) ?? 0) + 1);

    const seen = new Map<number, number>();
    const pre = clean.map((f) => {
      const count = counts.get(f.period) ?? 1;
      const k = seen.get(f.period) ?? 0;
      seen.set(f.period, k + 1);
      const gap = count > 1 ? Math.max(3, Math.min(10, (minAdj * 0.85) / (count - 1))) : 0;
      const dir: FlowNode['dir'] = f.amount > 0 ? 1 : f.amount < 0 ? -1 : 0;
      return { x: xOf(f.period) + (k - (count - 1) / 2) * gap, dir, len: lenOf(f.amount) };
    });

    // Label thinning, greedy by magnitude: a label is dropped only when it would land on an
    // already-kept one (same side of the axis, closer than a label's width horizontally AND a
    // line's height vertically — tips at clearly different heights can share an x). The width
    // budget caps the rest; every dropped amount stays reachable on hover.
    const maxLabels = Math.max(2, Math.floor(plotW / 40));
    const order = clean
      .map((_, i) => i)
      .filter((i) => clean[i].amount !== 0)
      .sort((a, b) => Math.abs(clean[b].amount) - Math.abs(clean[a].amount) || a - b);
    const kept: number[] = [];
    for (const i of order) {
      if (kept.length >= maxLabels) break;
      const clash = kept.some(
        (j) =>
          pre[j].dir === pre[i].dir &&
          Math.abs(pre[j].x - pre[i].x) < 34 &&
          Math.abs(pre[j].len - pre[i].len) < 12,
      );
      if (!clash) kept.push(i);
    }
    const labeled = new Set(kept);

    const nodes: FlowNode[] = clean.map((f, i) => ({
      ...f,
      i,
      ...pre[i],
      fit: labeled.has(i)
        ? fitText(fmtAmt(Math.abs(f.amount), sym), {
            maxWidth: 56,
            fontSize: 10,
            minFontSize: 8,
            maxLines: 2,
            lineHeight: 1.12,
          })
        : null,
    }));

    // Vertical room comes from what actually renders on each side of the axis, so a
    // one-sided diagram doesn't reserve dead space for arrows it doesn't have.
    let reserveUp = 16;
    let reserveDown = 24;
    for (const nd of nodes) {
      const blockH = nd.fit ? nd.fit.lines.length * nd.fit.lineHeightPx : 0;
      if (nd.dir === 1) reserveUp = Math.max(reserveUp, nd.len + (nd.fit ? blockH + 8 : 4));
      if (nd.dir === -1) reserveDown = Math.max(reserveDown, nd.len + (nd.fit ? blockH + 10 : 6));
    }
    const axisY = PAD_T + reserveUp;
    const H = Math.ceil(axisY + reserveDown + 6);

    const plan = densityPlan(tickVals.length, plotW);

    // NPV = Σ amount/(1+r)^period. r ≤ -1 has no meaning (a non-positive discount base), so
    // the row is simply omitted; an underflowed divisor poisons the sum to "—" over showing
    // a confidently wrong figure.
    const r =
      typeof discountRate === 'number' && Number.isFinite(discountRate) && discountRate > -1
        ? discountRate
        : null;
    let npv: number | null = null;
    if (r != null) {
      npv = 0;
      for (const f of clean) {
        const div = Math.pow(1 + r, f.period);
        npv += div > 0 ? f.amount / div : Number.NaN;
      }
    }

    return {
      nodes,
      tickVals,
      plan,
      W,
      H,
      plotW,
      axisY,
      xOf,
      maxP,
      rate: r,
      npv,
      hasIn: nodes.some((n) => n.dir === 1),
      hasOut: nodes.some((n) => n.dir === -1),
    };
  }, [flows, discountRate, sym]);

  const npvText = useCountUp(model?.npv ?? 0, {
    duration: 900,
    delay: (delay || 0) + 300,
    format: (n) => {
      const a = Math.abs(n);
      return (
        (n < 0 ? '−' : '') + withUnit(a, sym, { compact: a >= 1e6, decimals: a >= 1e6 ? 1 : 0 })
      );
    },
  });

  const tipYOf = (nd: FlowNode) =>
    model == null || nd.dir === 0 ? (model?.axisY ?? 0) : model.axisY - nd.dir * nd.len;
  const hotNode = hot != null ? (model?.nodes[hot] ?? null) : null;
  const rateText =
    model?.rate != null ? formatValue(Math.round(model.rate * 10000) / 100, { percent: true }) : '';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {!model ? (
        <BlockEmpty message="No cash flows to draw" />
      ) : (
        <>
          <div className="fin-cf-scroll">
            <div
              className="fin-cf-plot"
              style={{ minWidth: model.W, maxWidth: Math.round(model.W * 1.3) }}
              onMouseLeave={() => setHot(null)}
            >
              <svg
                viewBox={`0 0 ${model.W} ${model.H}`}
                className="fin-cf-svg"
                role="img"
                aria-label={title}
              >
                {model.nodes.map((nd) => {
                  const tipY = tipYOf(nd);
                  return (
                    <g
                      key={nd.i}
                      className={
                        'fin-cf-flow m-stagger-item m-fade-rise' + (hot === nd.i ? ' on' : '')
                      }
                      style={{ ['--i' as string]: nd.i } as CSSProperties}
                      onMouseEnter={() => setHot(nd.i)}
                    >
                      <title>
                        {(nd.label ? nd.label + ' — ' : '') +
                          `${periodLbl} ${nd.period}: ` +
                          (nd.amount < 0 ? '−' : nd.amount > 0 ? '+' : '') +
                          fmtAmt(Math.abs(nd.amount), sym)}
                      </title>
                      {nd.dir === 0 ? (
                        <circle cx={nd.x} cy={model.axisY} r={2.6} className="fin-cf-zero" />
                      ) : (
                        <g className={'fin-cf-arrow ' + (nd.dir === 1 ? 'in' : 'out')}>
                          <line x1={nd.x} y1={model.axisY} x2={nd.x} y2={tipY + nd.dir * HEAD} />
                          <path
                            d={`M${nd.x} ${tipY} L${nd.x - 3.6} ${tipY + nd.dir * HEAD} L${nd.x + 3.6} ${tipY + nd.dir * HEAD} Z`}
                          />
                        </g>
                      )}
                      {nd.fit && (
                        <text
                          className={'fin-cf-amt ' + (nd.dir === 1 ? 'in' : 'out')}
                          textAnchor="middle"
                          fontSize={nd.fit.fontSize}
                        >
                          {nd.fit.lines.map((ln, li) => (
                            <tspan
                              key={li}
                              x={nd.x}
                              y={
                                nd.dir === 1
                                  ? tipY -
                                    6 -
                                    (nd.fit!.lines.length - 1 - li) * nd.fit!.lineHeightPx
                                  : tipY + 12 + li * nd.fit!.lineHeightPx
                              }
                            >
                              {ln}
                            </tspan>
                          ))}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* axis + numbers paint AFTER the arrows: a down shaft passes behind the
                    haloed period number instead of cutting through it */}
                <line
                  ref={axisRef}
                  x1={PAD_L - 12}
                  y1={model.axisY}
                  x2={PAD_L + model.plotW + 12}
                  y2={model.axisY}
                  className="fin-cf-axis"
                />
                {model.tickVals.map((t, i) => (
                  <g key={i}>
                    <line
                      x1={model.xOf(t)}
                      y1={model.axisY - 3}
                      x2={model.xOf(t)}
                      y2={model.axisY + 3}
                      className="fin-cf-tickmark"
                    />
                    {i % model.plan.labelEvery === 0 && (
                      <text
                        className="fin-cf-tick"
                        x={model.xOf(t)}
                        y={model.axisY + TICK_DY}
                        textAnchor="middle"
                      >
                        {formatValue(t, { compact: t >= 1e4 })}
                      </text>
                    )}
                  </g>
                ))}
              </svg>

              {hotNode && (
                <div
                  className={'fin-cf-tip' + (hotNode.dir === -1 ? ' below' : '')}
                  style={{
                    left: `${(hotNode.x / model.W) * 100}%`,
                    top: `${(tipYOf(hotNode) / model.H) * 100}%`,
                  }}
                >
                  <b>{hotNode.label || (hotNode.dir >= 0 ? 'Inflow' : 'Outflow')}</b>
                  <span>
                    {periodLbl} {formatValue(hotNode.period, { compact: hotNode.period >= 1e4 })}
                  </span>
                  <span className="tab-num">
                    {(hotNode.amount < 0 ? '−' : hotNode.amount > 0 ? '+' : '') +
                      fmtAmt(Math.abs(hotNode.amount), sym)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="fin-cf-legend">
            {model.hasIn && (
              <span className="fin-cf-leg">
                <i className="in">↑</i> Inflow
              </span>
            )}
            {model.hasOut && (
              <span className="fin-cf-leg">
                <i className="out">↓</i> Outflow
              </span>
            )}
            <span className="fin-cf-axcap">
              {periodLbl}{' '}
              {model.maxP === 0
                ? '0'
                : `0–${formatValue(model.maxP, { compact: model.maxP >= 1e4 })}`}
            </span>
          </div>

          {model.rate != null && (
            <div className="fin-cf-npv">
              <span className="fin-cf-npv-lbl">
                Net present value{' '}
                <span className="fin-cf-npv-rate">
                  @ {rateText} per {periodLbl.toLowerCase()}
                </span>
              </span>
              <b className={'fin-cf-npv-val tab-num' + ((model.npv ?? 0) < 0 ? ' neg' : '')}>
                {npvText}
              </b>
            </div>
          )}
        </>
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
