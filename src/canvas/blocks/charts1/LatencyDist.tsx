import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks as niceTicks } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { LatencyDistProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LatencyDistProps & { delay?: number };

const W = 560,
  H = 260,
  // Extra top room for the percentile labels that ride above the plot, and bottom room for the axis.
  PAD = { l: 36, r: 14, t: 30, b: 36 };

// A percentile marker: its x value, short label, and which stacked row its label prints on so
// adjacent labels (p90/p95/p99 cluster in the tail) don't overlap.
interface Marker {
  x: number;
  label: string;
  row: number;
}

// Labels are short ("p50".."p99") — budget enough pixel width that two of them can't
// touch even at the widest plausible glyphs.
const LABEL_W = 20;

// Rows are assigned by horizontal proximity, not by array position: the old `i % 2` formula
// alternated a fixed two-row pattern regardless of where the markers actually landed, so three
// percentiles crowding the tail (p90/p95/p99 all within a few px of each other) could still
// collide within the same row. Sweeping left→right and dropping each label into the lowest row
// that's clear of every label already placed there — recursing into a third+ row once two rows
// fill up — keeps every label legible no matter how the markers cluster. Same "normalize
// regardless of count" idiom as TamSam's ring spacing (TamSam.tsx lines 41-47).
function stackRows(xs: { x: number; i: number }[]): number[] {
  const rows: number[][] = []; // rows[r] = x positions already placed on row r
  const rowOf = new Array<number>(xs.length);
  for (const { x, i } of [...xs].sort((a, b) => a.x - b.x)) {
    let r = 0;
    while (rows[r]?.some((placedX) => Math.abs(placedX - x) < LABEL_W)) r++;
    (rows[r] ??= []).push(x);
    rowOf[i] = r;
  }
  return rowOf;
}

export function LatencyDist({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  bins,
  unit = 'ms',
  p50,
  p90,
  p95,
  p99,
  slo,
  sloLabel,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const maxCount = Math.max(...bins.map((b) => b.count), 1);
    const x0 = bins[0]?.from ?? 0;
    // The tail can extend past the last bin's upper edge (a percentile may sit beyond it); widen
    // the domain to the furthest of the bin edges, the percentiles, and the SLO so every marker lands.
    const candidates = [bins[bins.length - 1]?.to ?? 1, p50, p90, p95, p99, slo].filter(
      (v): v is number => Number.isFinite(v as number),
    );
    const x1 = Math.max(x0 + 1, ...candidates);
    const plotW = W - PAD.l - PAD.r,
      plotH = H - PAD.t - PAD.b;
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * plotW;
    const total = bins.reduce((s, b) => s + b.count, 0);
    return { maxCount, sx, plotH, total, x0, x1 };
  }, [bins, p50, p90, p95, p99, slo]);

  const fmt = (v: number) => formatValue(v, { unit, decimals: 0 });
  const countTicks = niceTicks(0, model.maxCount, niceStep(model.maxCount, 4));

  // SLO is breached when the tail (prefer p99, fall back to the highest known percentile) exceeds it.
  const tail = [p99, p95, p90, p50].find((v) => Number.isFinite(v as number));
  const breached = slo != null && tail != null && tail > slo;
  const sloColor = breached ? 'var(--danger)' : 'var(--insight)';

  const markers = useMemo<Marker[]>(() => {
    const defs: [number | undefined, string][] = [
      [p50, 'p50'],
      [p90, 'p90'],
      [p95, 'p95'],
      [p99, 'p99'],
    ];
    const present = defs
      .filter(([v]) => Number.isFinite(v as number))
      .map(([v, label]) => ({ x: v as number, label }));
    // Stack by pixel position (not raw value) so proximity reflects what the eye actually sees.
    const rows = stackRows(present.map((m, i) => ({ x: model.sx(m.x), i })));
    return present.map((m, i) => ({ ...m, row: rows[i] }));
  }, [p50, p90, p95, p99, model]);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* count gridlines + axis */}
        {countTicks.map((t, i) => {
          const yy = PAD.t + (1 - t / (model.maxCount || 1)) * model.plotH;
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} stroke="var(--grid-line)" />
              <text
                x={PAD.l - 6}
                y={yy + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--text-muted)"
                className="tab-num"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* bins — grow in on mount staggered by --i, reusing the treemap's .c1-tm-cell /
            c1CellGrow entrance (scale 0.85→1 + fade, gated behind prefers-reduced-motion — see
            styles.css) rather than a bespoke keyframe, and lift slightly on hover so the active
            bin reads as raised, not just recoloured. */}
        {bins.map((b, i) => {
          const x = model.sx(b.from) + 1;
          const w = Math.max(1, model.sx(b.to) - model.sx(b.from) - 2);
          const h = (b.count / (model.maxCount || 1)) * model.plotH;
          const y = PAD.t + model.plotH - h;
          const active = hover === i;
          // Bins past the SLO are tinted toward the breach colour so the slow tail reads at a glance.
          const overSlo = slo != null && b.from >= slo;
          const fill = overSlo ? sloColor : 'var(--presence)';
          const cx = x + w / 2,
            cy = y + Math.max(0, h) / 2;
          return (
            // The entrance animation lives on this wrapper (like treemap's cell <g>) so it
            // doesn't fight the inner rect's own hover-lift transform below.
            <g
              key={i}
              className="c1-tm-cell"
              style={{ ['--i' as string]: i, transformOrigin: `${cx}px ${cy}px` } as CSSProperties}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={Math.max(0, h)}
                rx={2.5}
                fill={`color-mix(in oklab, ${fill} ${active ? 82 : overSlo ? 40 : 46}%, transparent)`}
                stroke={fill}
                strokeWidth={active ? 1.4 : 0.8}
                style={
                  {
                    cursor: 'pointer',
                    transition:
                      'fill var(--m-fast), stroke-width var(--m-fast), transform var(--m-fast)',
                    transform: active ? 'scale(1.03)' : undefined,
                    transformOrigin: `${cx}px ${cy}px`,
                  } as CSSProperties
                }
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        {/* percentile markers — thin verticals with a label tab above the plot. --i is threaded
            through for a future staggered fade-in (none is wired yet; see styles.css c1-ld-pct). */}
        {markers.map((m, i) => {
          const mx = model.sx(m.x);
          return (
            <g
              key={m.label}
              className="c1-ld-pct"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <line
                x1={mx}
                x2={mx}
                y1={PAD.t}
                y2={PAD.t + model.plotH}
                stroke="var(--text-secondary)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.7}
              />
              <text
                x={mx}
                y={PAD.t - 16 - m.row * 11}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight={600}
                fill="var(--text-secondary)"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* SLO threshold — a bolder, coloured line */}
        {slo != null && (
          <g>
            <line
              x1={model.sx(slo)}
              x2={model.sx(slo)}
              y1={PAD.t - 4}
              y2={PAD.t + model.plotH}
              stroke={sloColor}
              strokeWidth={2}
            />
            <text
              x={model.sx(slo)}
              y={PAD.t + model.plotH + 14}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight={700}
              fill={sloColor}
            >
              {sloLabel || `SLO ${fmt(slo)}`}
            </text>
          </g>
        )}

        {/* x baseline */}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={PAD.t + model.plotH}
          y2={PAD.t + model.plotH}
          stroke="var(--grid-strong)"
        />
        {[model.x0, (model.x0 + model.x1) / 2, model.x1].map((v, i) => (
          <text
            key={i}
            x={model.sx(v)}
            y={H - PAD.b + 24}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fontSize="10.5"
            fill="var(--text-muted)"
            className="tab-num"
          >
            {fmt(Math.round(v))}
          </text>
        ))}
      </svg>

      {/* headline stat — the tail value and its SLO verdict */}
      {p99 != null && (
        <div className="c1-ld-head">
          <span
            className="c1-ld-stat"
            style={{ color: breached ? 'var(--danger)' : 'var(--text-primary)' }}
          >
            p99 {fmt(p99)}
          </span>
          {slo != null && (
            <span
              className="c1-ld-verdict"
              style={{
                color: sloColor,
                background: `color-mix(in oklab, ${sloColor} 14%, transparent)`,
              }}
            >
              {breached ? `breaches SLO by ${fmt(p99 - slo)}` : `within SLO by ${fmt(slo - p99)}`}
            </span>
          )}
        </div>
      )}

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hover != null ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>
              {fmt(bins[hover].from)}–{fmt(bins[hover].to)}
            </strong>{' '}
            · {formatValue(bins[hover].count)} (
            {Math.round((bins[hover].count / (model.total || 1)) * 100)}%)
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">
            {caption || `${model.total.toLocaleString()} requests · hover a bin for its range`}
          </span>
        )}
      </div>
    </div>
  );
}
