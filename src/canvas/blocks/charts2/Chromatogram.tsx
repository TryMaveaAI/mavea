// Chromatogram — an HPLC/GC readout: a detector baseline over retention time with each eluting
// peak apex called out (RT · compound · area%), and the integrated region under a peak shaded by
// finding the real valleys either side of it in the trace. The peak table is the block's floor:
// it renders on its own, straight from `peaks`, whenever no `trace` is supplied — nothing here
// invents a baseline shape the caller didn't hand it.
import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import { usePathDraw } from '../../lib/motion';
import { estimateTextWidth, fitText } from '../../lib/fitText';
import { placeClear, type Box } from './chartMath';
import type { ChromatogramProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ChromatogramProps & { delay?: number };

const W = 480;
const H = 220;
const M = { top: 26, right: 18, bottom: 30, left: 40 };
const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];
const MK_FS = 9; // .c2-chrom-mk
const MK_MAX_W = 130;

interface SafePeak {
  rt: number | null;
  label: string;
  areaPct: number | null;
  height: number | null;
}

/** Reads a peak's fields defensively — a generic-coerced prop this loose can arrive as
 *  anything from a well-formed object to a bare string, and every read here has to survive
 *  that without throwing or leaking a raw `undefined`/`NaN` into the card. */
function toSafePeak(raw: unknown, i: number): SafePeak {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rt = typeof o.rt === 'number' && Number.isFinite(o.rt) ? o.rt : null;
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : `Peak ${i + 1}`;
  const areaRaw = typeof o.areaPct === 'number' && Number.isFinite(o.areaPct) ? o.areaPct : null;
  const areaPct = areaRaw === null ? null : Math.max(0, Math.min(100, areaRaw));
  const height = typeof o.height === 'number' && Number.isFinite(o.height) ? o.height : null;
  return { rt, label, areaPct, height };
}

function fmtRt(rt: number | null): string {
  return rt === null ? '—' : `${rt.toFixed(2)} min`;
}
function fmtPct(pct: number | null): string {
  return pct === null ? '—' : `${pct.toFixed(1)}%`;
}
function fmtHeight(h: number | null): string {
  return h === null ? '—' : h.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function Chromatogram({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  method,
  trace,
  peaks,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hotPeak, setHotPeak] = useState<number | null>(null);
  const traceRef = useRef<SVGPathElement>(null);

  const safePeaks = useMemo(
    () => (Array.isArray(peaks) ? peaks : []).map((p, i) => toSafePeak(p, i)),
    [peaks],
  );

  const geom = useMemo(() => {
    const validTrace = (Array.isArray(trace) ? trace : [])
      .filter(
        (s): s is { t: number; signal: number } =>
          !!s &&
          typeof s === 'object' &&
          Number.isFinite((s as { t: unknown }).t) &&
          Number.isFinite((s as { signal: unknown }).signal),
      )
      .map((s) => ({ t: s.t, signal: s.signal }))
      .sort((a, b) => a.t - b.t);
    if (validTrace.length < 2) return null;

    const exT = extent(validTrace.map((s) => s.t))!;
    const exS = extent(validTrace.map((s) => s.signal))!;
    const [xMin, xMax] = niceDomain(exT[0], exT[1]);
    const sSpan = exS[1] - exS[0] || 1;
    // Extra headroom above the tallest sample so an apex label never collides with the peak it
    // names — the label sits above the dot, not beside it, on this scaffold.
    const yMin = Math.min(0, exS[0]);
    const yMax = exS[1] + sSpan * 0.34;

    const plotL = M.left;
    const plotR = W - M.right;
    const plotT = M.top;
    const plotB = H - M.bottom;
    const sx = scaleLinear([xMin, xMax], [plotL, plotR]);
    const sy = scaleLinear([yMin, yMax], [plotB, plotT]);

    const tracePts = validTrace.map((s) => ({ x: sx(s.t), y: sy(s.signal) }));
    const traceD = tracePts
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');

    // Nearest real trace sample to each labeled peak's stated RT — the apex marker sits on the
    // actual curve, never at a fabricated (rt, height) coordinate.
    const nearestIdx = (rt: number) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < validTrace.length; i++) {
        const d = Math.abs(validTrace[i].t - rt);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    const plottable = safePeaks
      .map((p, i) => (p.rt !== null ? { ...p, srcIdx: i, apexIdx: nearestIdx(p.rt) } : null))
      .filter((p): p is SafePeak & { srcIdx: number; apexIdx: number } => p !== null)
      .sort((a, b) => a.apexIdx - b.apexIdx);

    // Integration boundaries: the valley (local minimum signal) between two consecutive apexes
    // is the real, data-derived split point — the first peak's left edge and the last peak's
    // right edge just run to the ends of the sampled trace.
    const bounds = [0];
    for (let k = 0; k < plottable.length - 1; k++) {
      const lo = Math.min(plottable[k].apexIdx, plottable[k + 1].apexIdx);
      const hi = Math.max(plottable[k].apexIdx, plottable[k + 1].apexIdx);
      let valley = lo;
      for (let i = lo; i <= hi; i++) {
        if (validTrace[i].signal < validTrace[valley].signal) valley = i;
      }
      bounds.push(valley);
    }
    bounds.push(validTrace.length - 1);

    const shaded = plottable
      .map((p, k) => {
        const left = bounds[k];
        const right = bounds[k + 1];
        if (right <= left) return null;
        const seg = tracePts.slice(left, right + 1);
        const d =
          `M${seg[0].x.toFixed(2)},${plotB.toFixed(2)} ` +
          seg.map((pt) => `L${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ') +
          ` L${seg[seg.length - 1].x.toFixed(2)},${plotB.toFixed(2)} Z`;
        return { d, apexIdx: p.apexIdx };
      })
      .filter((x): x is { d: string; apexIdx: number } => x !== null);

    // Each apex is named by its compound alone — retention time and area share are the table's
    // columns right below, and carrying all three in one line is what cut "Acetylsalicylic acid"
    // to "Acetylsalicylic ac…". The name wraps to two lines before it is cut, and takes the
    // nearest spot around its apex that the trace and the other names leave clear.
    const taken: Box[] = [];
    const labels = plottable.map((p) => {
      const pt = tracePts[p.apexIdx];
      const fit = fitText(p.label, {
        maxWidth: MK_MAX_W,
        fontSize: MK_FS,
        minFontSize: MK_FS,
        maxLines: 2,
        bold: true,
      });
      const w = Math.max(...fit.lines.map((l) => estimateTextWidth(l, fit.fontSize, true)));
      const h = fit.lines.length * fit.lineHeightPx;
      const cands: Box[] = [];
      for (const lift of [0, 1, 2]) {
        const y = pt.y - 7 - h - lift * (h + 3);
        cands.push(
          { x: pt.x - w / 2, y, w, h },
          { x: pt.x + 6, y, w, h },
          { x: pt.x - 6 - w, y, w, h },
        );
      }
      cands.push(
        { x: pt.x + 7, y: pt.y - h / 2, w, h },
        { x: pt.x - 7 - w, y: pt.y - h / 2, w, h },
      );
      const box = placeClear(
        cands,
        { x: plotL, y: 2, w: plotR - plotL, h: plotB - 2 },
        [tracePts],
        [...taken, { x: pt.x - 4, y: pt.y - 4, w: 8, h: 8 }],
      );
      taken.push(box);
      return { box, lines: fit.lines, lh: fit.lineHeightPx };
    });

    return {
      sx,
      sy,
      plotL,
      plotR,
      plotT,
      plotB,
      traceD,
      tracePts,
      plottable,
      labels,
      shaded,
      xTicks: sx.ticks(5),
      yTicks: sy.ticks(4),
    };
  }, [trace, safePeaks]);

  usePathDraw(traceRef, { delay: delay ?? 0 });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {method && <p className="c2-chrom-method">{method}</p>}

      {geom && (
        <div className="c2-chrom-wrap" onMouseLeave={() => setHotPeak(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="c2-chrom-svg" role="img" aria-label={title}>
            {geom.yTicks.map((t, i) => (
              <line
                key={`gy${i}`}
                x1={geom.plotL}
                y1={geom.sy(t)}
                x2={geom.plotR}
                y2={geom.sy(t)}
                className="c2-chrom-grid"
              />
            ))}

            {geom.shaded.map((s, i) => (
              <path
                key={`fill${i}`}
                d={s.d}
                className="c2-chrom-fill m-fade-rise m-stagger-item"
                style={
                  {
                    fill: PALETTE[i % PALETTE.length],
                    ['--i' as string]: i,
                  } as CSSProperties
                }
              />
            ))}

            <line
              x1={geom.plotL}
              y1={geom.plotB}
              x2={geom.plotR}
              y2={geom.plotB}
              className="c2-chrom-axis"
            />
            {geom.xTicks.map((t, i) => (
              <text
                key={`xt${i}`}
                x={geom.sx(t)}
                y={geom.plotB + 13}
                textAnchor="middle"
                className="c2-chrom-tick"
              >
                {t}
              </text>
            ))}
            <line
              x1={geom.plotL}
              y1={geom.plotT}
              x2={geom.plotL}
              y2={geom.plotB}
              className="c2-chrom-axis"
            />
            {geom.yTicks.map((t, i) => (
              <text
                key={`yt${i}`}
                x={geom.plotL - 5}
                y={geom.sy(t) + 3}
                textAnchor="end"
                className="c2-chrom-tick"
              >
                {t}
              </text>
            ))}

            <path ref={traceRef} d={geom.traceD} className="c2-chrom-line" />

            {geom.plottable.map((p, i) => {
              const pt = geom.tracePts[p.apexIdx];
              const lbl = geom.labels[i];
              const color = PALETTE[i % PALETTE.length];
              const hot = hotPeak === p.srcIdx;
              return (
                <g key={`pk${p.srcIdx}`}>
                  <line
                    x1={pt.x}
                    y1={pt.y}
                    x2={pt.x}
                    y2={geom.plotB}
                    className="c2-chrom-guide"
                    style={{ opacity: hot ? 0.55 : 0.22 }}
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hot ? 4 : 3}
                    fill={color}
                    className="m-scale-in"
                    style={
                      { ['--delay' as string]: `${(delay ?? 0) + 260 + i * 40}ms` } as CSSProperties
                    }
                    onMouseEnter={() => setHotPeak(p.srcIdx)}
                  />
                  <text
                    x={lbl.box.x}
                    y={lbl.box.y + lbl.lh * 0.8}
                    className="c2-chrom-mk"
                    style={{ fill: hot ? color : undefined }}
                  >
                    {lbl.lines.map((line, li) => (
                      <tspan key={li} x={lbl.box.x} dy={li ? lbl.lh : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}

            <text
              x={(geom.plotL + geom.plotR) / 2}
              y={H - 6}
              textAnchor="middle"
              className="c2-chrom-axlbl"
            >
              Retention time
            </text>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              className="c2-chrom-axlbl"
              transform={`translate(11, ${(geom.plotT + geom.plotB) / 2}) rotate(-90)`}
            >
              Signal
            </text>
          </svg>
        </div>
      )}

      {safePeaks.length === 0 ? (
        <p className="c2-chrom-empty faint">No peaks reported.</p>
      ) : (
        <div className="c2-chrom-table-wrap">
          <table className="c2-chrom-table">
            <thead>
              <tr>
                <th className="r">RT</th>
                <th>Compound</th>
                <th className="r">Area %</th>
                <th className="r">Height</th>
              </tr>
            </thead>
            <tbody>
              {safePeaks.map((p, i) => (
                <tr
                  key={i}
                  className="m-fade-rise m-stagger-item"
                  style={{ ['--i' as string]: i } as CSSProperties}
                  onMouseEnter={() => setHotPeak(i)}
                  onMouseLeave={() => setHotPeak(null)}
                >
                  <td className="r tab-num">{fmtRt(p.rt)}</td>
                  <td>{p.label}</td>
                  <td className="r tab-num">{fmtPct(p.areaPct)}</td>
                  <td className="r tab-num">{fmtHeight(p.height)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
