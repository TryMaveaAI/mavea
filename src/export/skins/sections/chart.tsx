// A token-driven inline-SVG line/area chart for documents — the real trend a `figureGrid` carries
// when it came from a chart block. Drawn with a zero baseline, a few horizontal gridlines, x-axis
// category labels, one filled area under the primary series, and endpoint value readouts. No chart
// library (zero runtime deps); colours come through the skin tokens + the inherited --accent var so
// every template renders it in its own voice. Slides keep using the figure cells; this is doc-only.
import type { FigureChart } from '../../model/ExportDoc';
import type { TemplateSkin } from '../types';

const W = 720;
const H = 300;
const PAD = { l: 50, r: 20, t: 18, b: 36 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Compact value label: 1.25M / 920 / 4.2% — enough precision for an axis tick, no noise. */
function fmtVal(v: number, unit?: string): string {
  const abs = Math.abs(v);
  let s: string;
  if (abs >= 1_000_000) s = `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (abs >= 1_000) s = `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  else s = Number.isInteger(v) ? String(v) : v.toFixed(abs < 10 ? 1 : 0);
  return unit ? `${s}${unit}` : s;
}

export function TrendChart({ chart, skin }: { chart: FigureChart; skin: TemplateSkin }) {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const { labels, series, unit } = chart;
  const n = labels.length;
  const all = series.flatMap((s) => s.data).filter(num);
  if (n < 2 || !all.length) return null;

  const lo = Math.min(...all);
  const hi = Math.max(...all);
  let min = lo >= 0 ? 0 : lo; // zero baseline for non-negative data; else the true floor
  let max = hi;
  if (min === max) max = min + 1; // a perfectly flat series still gets a band
  max += (max - min) * 0.08 || 1; // headroom so the peak doesn't touch the top edge
  if (lo < 0) min -= (hi - lo) * 0.08;

  const x = (i: number) => PAD.l + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => PAD.t + PLOT_H - ((v - min) / (max - min)) * PLOT_H;
  const baseline = PAD.t + PLOT_H;

  // Series colours: the primary rides the accent; extras step down through the skin's inks.
  const stroke = (i: number) => (i === 0 ? 'var(--accent)' : i === 1 ? t.muted : t.faint);

  const points = (data: number[]) =>
    data.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => num(p.v));
  const linePath = (data: number[]) =>
    points(data)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`)
      .join(' ');

  // Y gridlines at four even steps across the domain.
  const ticks = Array.from({ length: 4 }, (_, k) => min + ((max - min) * k) / 3);
  // Thin out x labels when crowded; always keep the first and last.
  const step = Math.max(1, Math.ceil(n / 8));
  const showX = (i: number) => i === 0 || i === n - 1 || i % step === 0;

  const primary = points(series[0].data);
  const first = primary[0];
  const last = primary[primary.length - 1];
  const areaPath =
    primary.length >= 2
      ? `${linePath(series[0].data)} L ${x(last.i).toFixed(1)} ${baseline} L ${x(first.i).toFixed(1)} ${baseline} Z`
      : '';

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={series.map((s) => s.name).join(', ')}
        style={{ display: 'block', height: 'auto', overflow: 'visible' }}
      >
        {/* gridlines + y labels */}
        {ticks.map((v, k) => (
          <g key={k}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={t.rule} strokeWidth={1} />
            <text
              x={PAD.l - 8}
              y={y(v) + 3.5}
              textAnchor="end"
              style={{ font: `500 11px/1 ${mono}`, fill: t.faint }}
            >
              {fmtVal(v, unit)}
            </text>
          </g>
        ))}

        {/* area under the primary series */}
        {areaPath && <path d={areaPath} fill="var(--accent)" fillOpacity={0.12} stroke="none" />}

        {/* one line per series */}
        {series.map((s, si) => (
          <path
            key={si}
            d={linePath(s.data)}
            fill="none"
            stroke={stroke(si)}
            strokeWidth={si === 0 ? 2.5 : 1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={si > 1 ? '4 4' : undefined}
          />
        ))}

        {/* endpoint dots + readouts on the primary series */}
        {[first, last].map((p, k) =>
          p ? (
            <g key={k}>
              <circle cx={x(p.i)} cy={y(p.v)} r={3.5} fill="var(--accent)" />
              <text
                x={x(p.i)}
                y={y(p.v) - 9}
                textAnchor={k === 0 ? 'start' : 'end'}
                style={{
                  fontFamily: mono,
                  fontSize: 11.5,
                  fontWeight: 600,
                  lineHeight: 1,
                  fill: t.ink,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtVal(p.v, unit)}
              </text>
            </g>
          ) : null,
        )}

        {/* x-axis category labels */}
        {labels.map((label, i) =>
          showX(i) ? (
            <text
              key={i}
              x={x(i)}
              y={H - 12}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              style={{ font: `500 11px/1 ${mono}`, fill: t.muted }}
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>

      {/* legend (only when there's more than one series to tell apart) */}
      {series.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
          {series.map((s, si) => (
            <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 14,
                  height: 3,
                  borderRadius: 2,
                  background: si === 0 ? 'var(--accent)' : si === 1 ? t.muted : t.faint,
                }}
              />
              <span style={{ font: `500 11px/1 ${mono}`, color: t.muted }}>{s.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
