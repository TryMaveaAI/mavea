// GatingPlot — a flow-cytometry gating plot: the real event point-cloud (EmbedMap's
// scatter + cluster-legend/focus-toggle interaction, reused here) with translucent gate
// boundaries drawn over the populations they enclose, each labeled with its name and
// percent-of-parent. Axes support linear or log10 display, since fluorescence channels
// commonly span several decades.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import type { GatingPlotProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GatingPlotProps & { delay?: number };

const W = 480;
const H = 300;
const PAD = { l: 46, r: 20, t: 16, b: 38 };
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

interface SafeGate {
  name: string;
  shape: 'ellipse' | 'polygon' | null;
  region: [number, number][];
  pctOfParent: number | null;
  color: string;
}

function normalizeGate(raw: unknown, i: number): SafeGate {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `Gate ${i + 1}`;
  const shape = o.shape === 'ellipse' || o.shape === 'polygon' ? o.shape : null;
  const region: [number, number][] = (Array.isArray(o.region) ? o.region : [])
    .filter((r): r is unknown[] => Array.isArray(r) && r.length >= 2)
    .map((r) => [Number(r[0]), Number(r[1])] as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const pctRaw =
    typeof o.pctOfParent === 'number' && Number.isFinite(o.pctOfParent) ? o.pctOfParent : null;
  const pctOfParent = pctRaw === null ? null : Math.max(0, Math.min(100, pctRaw));
  const color =
    typeof o.color === 'string' && o.color.trim() ? o.color : PALETTE[i % PALETTE.length];
  return { name, shape, region, pctOfParent, color };
}

function gateDrawable(g: SafeGate): boolean {
  if (g.shape === 'ellipse') return g.region.length >= 2;
  if (g.shape === 'polygon') return g.region.length >= 3;
  return false;
}

interface AxisScale {
  fn: (v: number) => number;
  ticks: number[];
  ok: (v: number) => boolean;
}

/** A linear or log10 scale over `vals`, mapped onto `range`. Log domains only ever consider the
 *  positive readings in `vals` — a channel reading at or below zero has no place on a log axis,
 *  so it's excluded from the render rather than clamped to a made-up floor. */
function buildAxis(vals: number[], isLog: boolean, range: [number, number]): AxisScale | null {
  if (isLog) {
    const positive = vals.filter((v) => Number.isFinite(v) && v > 0);
    if (positive.length === 0) return null;
    const lo = Math.min(...positive);
    const hi = Math.max(...positive);
    const logLo = Math.log10(lo === hi ? lo * 0.5 : lo);
    const logHi = Math.log10(lo === hi ? hi * 2 : hi);
    const pad = (logHi - logLo) * 0.1 || 0.3;
    const dLo = logLo - pad;
    const dHi = logHi + pad;
    const span = dHi - dLo || 1;
    const fn = (v: number) => range[0] + ((Math.log10(v) - dLo) / span) * (range[1] - range[0]);
    // Only exponents strictly inside the padded domain — floor/ceil here (rather than the
    // inside bounds below) can round a tick to just past the domain edge, which then maps to a
    // screen position outside `range` and clips against the SVG's own boundary.
    const ticks: number[] = [];
    for (let e = Math.ceil(dLo); e <= Math.floor(dHi); e++) ticks.push(Math.pow(10, e));
    if (ticks.length === 0) ticks.push(Math.pow(10, Math.round((dLo + dHi) / 2)));
    return { fn, ticks, ok: (v: number) => Number.isFinite(v) && v > 0 };
  }
  const ex = extent(vals);
  if (!ex) return null;
  const [lo, hi] = niceDomain(Math.min(0, ex[0]), ex[1]);
  const scale = scaleLinear([lo, hi], range);
  return { fn: scale, ticks: scale.ticks(5), ok: (v: number) => Number.isFinite(v) };
}

function fmtTick(v: number, isLog: boolean): string {
  if (isLog)
    return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v.toLocaleString();
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString();
}

export function GatingPlot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  xLabel,
  yLabel,
  xScale = 'linear',
  yScale = 'linear',
  points,
  gates,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  const safeGates = useMemo(
    () => (Array.isArray(gates) ? gates : []).map((g, i) => normalizeGate(g, i)),
    [gates],
  );

  const validPoints = useMemo(
    () =>
      (Array.isArray(points) ? points : [])
        .map((p, i) => {
          const o = p && typeof p === 'object' ? (p as unknown as Record<string, unknown>) : {};
          const x = o.x;
          const y = o.y;
          if (
            typeof x !== 'number' ||
            typeof y !== 'number' ||
            !Number.isFinite(x) ||
            !Number.isFinite(y)
          )
            return null;
          const gateRaw = o.gate;
          const gate =
            typeof gateRaw === 'number' &&
            Number.isInteger(gateRaw) &&
            gateRaw >= 0 &&
            gateRaw < safeGates.length
              ? gateRaw
              : null;
          return { x, y, gate, srcIdx: i };
        })
        .filter(
          (p): p is { x: number; y: number; gate: number | null; srcIdx: number } => p !== null,
        ),
    [points, safeGates.length],
  );

  const geom = useMemo(() => {
    const xLog = xScale === 'log';
    const yLog = yScale === 'log';
    const regionXs = safeGates.flatMap((g) => g.region.map((r) => r[0]));
    const regionYs = safeGates.flatMap((g) => g.region.map((r) => r[1]));
    const xVals = validPoints.map((p) => p.x).concat(regionXs);
    const yVals = validPoints.map((p) => p.y).concat(regionYs);

    const plotL = PAD.l;
    const plotR = W - PAD.r;
    const plotT = PAD.t;
    const plotB = H - PAD.b;
    const xAxis = buildAxis(xVals, xLog, [plotL, plotR]);
    const yAxis = buildAxis(yVals, yLog, [plotB, plotT]);
    if (!xAxis || !yAxis) return null;

    const plotted = validPoints.filter((p) => xAxis.ok(p.x) && yAxis.ok(p.y));

    const shapes = safeGates
      .map((g, i) => {
        if (!gateDrawable(g)) return null;
        if (g.shape === 'ellipse') {
          const [cx, cy] = g.region[0];
          const [rxRaw, ryRaw] = g.region[1];
          if (!xAxis.ok(cx) || !yAxis.ok(cy)) return null;
          const cxS = xAxis.fn(cx);
          const cyS = yAxis.fn(cy);
          const rx = Math.abs(rxRaw);
          const ry = Math.abs(ryRaw);
          const flankX = [cx + rx, cx - rx]
            .filter((v) => xAxis.ok(v))
            .map((v) => Math.abs(xAxis.fn(v) - cxS));
          const flankY = [cy + ry, cy - ry]
            .filter((v) => yAxis.ok(v))
            .map((v) => Math.abs(yAxis.fn(v) - cyS));
          if (flankX.length === 0 || flankY.length === 0) return null;
          const rxS = flankX.reduce((a, b) => a + b, 0) / flankX.length;
          const ryS = flankY.reduce((a, b) => a + b, 0) / flankY.length;
          if (!(rxS > 0) || !(ryS > 0)) return null;
          return {
            idx: i,
            gate: g,
            kind: 'ellipse' as const,
            cx: cxS,
            cy: cyS,
            rx: rxS,
            ry: ryS,
            top: cyS - ryS,
          };
        }
        const pts = g.region
          .filter(([x, y]) => xAxis.ok(x) && yAxis.ok(y))
          .map(([x, y]) => ({ x: xAxis.fn(x), y: yAxis.fn(y) }));
        if (pts.length < 3) return null;
        const top = Math.min(...pts.map((p) => p.y));
        return { idx: i, gate: g, kind: 'polygon' as const, points: pts, top };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    return { xAxis, yAxis, plotL, plotR, plotT, plotB, plotted, shapes, xLog, yLog };
  }, [safeGates, validPoints, xScale, yScale]);

  const gateColor = (i: number | null) =>
    i !== null ? safeGates[i]?.color || PALETTE[i % PALETTE.length] : 'var(--text-faint)';
  const activePoint = hover !== null ? validPoints.find((p) => p.srcIdx === hover) : undefined;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {safeGates.length > 0 && (
        <div className="c2-gate-legend">
          {safeGates.map((g, i) => (
            <button
              key={i}
              type="button"
              className={
                'c2-gate-leg' +
                (focus === i ? ' is-on' : '') +
                (focus !== null && focus !== i ? ' muted' : '')
              }
              onClick={() => setFocus(focus === i ? null : i)}
            >
              <span className="c2-gate-swatch" style={{ background: g.color }} />
              {g.name}
              {g.pctOfParent !== null && (
                <span className="faint"> · {g.pctOfParent.toFixed(1)}%</span>
              )}
            </button>
          ))}
        </div>
      )}

      {geom ? (
        <div className="c2-gate-wrap" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="c2-gate-svg" role="img" aria-label={title}>
            {geom.xAxis.ticks.map((t, i) => (
              <line
                key={`gx${i}`}
                x1={geom.xAxis.fn(t)}
                y1={geom.plotT}
                x2={geom.xAxis.fn(t)}
                y2={geom.plotB}
                className="c2-gate-grid"
              />
            ))}
            {geom.yAxis.ticks.map((t, i) => (
              <line
                key={`gy${i}`}
                x1={geom.plotL}
                y1={geom.yAxis.fn(t)}
                x2={geom.plotR}
                y2={geom.yAxis.fn(t)}
                className="c2-gate-grid"
              />
            ))}

            <line
              x1={geom.plotL}
              y1={geom.plotB}
              x2={geom.plotR}
              y2={geom.plotB}
              className="c2-gate-axis"
            />
            <line
              x1={geom.plotL}
              y1={geom.plotT}
              x2={geom.plotL}
              y2={geom.plotB}
              className="c2-gate-axis"
            />
            {geom.xAxis.ticks.map((t, i) => (
              <text
                key={`xt${i}`}
                x={geom.xAxis.fn(t)}
                y={geom.plotB + 13}
                textAnchor="middle"
                className="c2-gate-tick"
              >
                {fmtTick(t, geom.xLog)}
              </text>
            ))}
            {geom.yAxis.ticks.map((t, i) => (
              <text
                key={`yt${i}`}
                x={geom.plotL - 6}
                y={geom.yAxis.fn(t) + 3}
                textAnchor="end"
                className="c2-gate-tick"
              >
                {fmtTick(t, geom.yLog)}
              </text>
            ))}

            {geom.plotted.map((p) => {
              const dim = focus !== null && p.gate !== focus;
              const on = hover === p.srcIdx;
              return (
                <circle
                  key={p.srcIdx}
                  cx={geom.xAxis.fn(p.x)}
                  cy={geom.yAxis.fn(p.y)}
                  r={on ? 3.6 : 2.2}
                  fill={gateColor(p.gate)}
                  opacity={dim ? 0.15 : on ? 1 : 0.75}
                  onMouseEnter={() => setHover(p.srcIdx)}
                  className="c2-gate-pt"
                />
              );
            })}

            {geom.shapes.map((s) => {
              const dim = focus !== null && focus !== s.idx;
              const label = [
                s.gate.name,
                s.gate.pctOfParent !== null ? `${s.gate.pctOfParent.toFixed(1)}%` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              const commonProps = {
                style: { opacity: dim ? 0.2 : 1, cursor: 'pointer' } as CSSProperties,
                onClick: () => setFocus(focus === s.idx ? null : s.idx),
              };
              return (
                <g
                  key={s.idx}
                  className="m-fade-rise m-stagger-item"
                  style={{ ['--i' as string]: s.idx } as CSSProperties}
                >
                  {s.kind === 'ellipse' ? (
                    <ellipse
                      cx={s.cx}
                      cy={s.cy}
                      rx={s.rx}
                      ry={s.ry}
                      className="c2-gate-region"
                      style={{ stroke: s.gate.color, fill: s.gate.color, ...commonProps.style }}
                      onClick={commonProps.onClick}
                    />
                  ) : (
                    <polygon
                      points={s.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                      className="c2-gate-region"
                      style={{ stroke: s.gate.color, fill: s.gate.color, ...commonProps.style }}
                      onClick={commonProps.onClick}
                    />
                  )}
                  <text
                    x={
                      s.kind === 'ellipse'
                        ? s.cx
                        : s.points.reduce((a, p) => a + p.x, 0) / s.points.length
                    }
                    y={Math.max(geom.plotT + 8, s.top - 6)}
                    textAnchor="middle"
                    className="c2-gate-label"
                    style={{ fill: s.gate.color, opacity: dim ? 0.3 : 1 }}
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            <text
              x={(geom.plotL + geom.plotR) / 2}
              y={H - 6}
              textAnchor="middle"
              className="c2-gate-axlbl"
            >
              {xLabel}
              {geom.xLog ? ' (log)' : ''}
            </text>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              className="c2-gate-axlbl"
              transform={`translate(13, ${(geom.plotT + geom.plotB) / 2}) rotate(-90)`}
            >
              {yLabel}
              {geom.yLog ? ' (log)' : ''}
            </text>
          </svg>
        </div>
      ) : (
        <div className="c2-gate-empty faint">
          No plottable events in {xLabel} × {yLabel}.
        </div>
      )}

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {activePoint ? (
          <span>
            <span
              className="c2-gate-swatch"
              style={{
                background: gateColor(activePoint.gate),
                display: 'inline-block',
                verticalAlign: 'middle',
                marginRight: 6,
              }}
            />
            {activePoint.gate !== null ? safeGates[activePoint.gate]?.name : 'Ungated'} · (
            {activePoint.x.toLocaleString()}, {activePoint.y.toLocaleString()})
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">
            Hover an event for its coordinates · click a gate to isolate it
          </span>
        )}
      </div>
    </div>
  );
}
