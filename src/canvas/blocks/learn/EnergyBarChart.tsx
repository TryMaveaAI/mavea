import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { EnergyBarChartProps, EnergyBar, EnergySnapshot } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { niceDomain, scaleLinear } from '../../lib/scale';
import { fitText } from '../../lib/fitText';
import { BlockEmpty } from '../../lib/BlockEmpty';

type Props = EnergyBarChartProps & { delay?: number };

// A physics LOL chart is only honest if every group shares one vertical scale, so the geometry is
// laid out once for the whole scenario and each group draws against the same zero line.
const PLOT_TOP = 14;
const PLOT_H = 150; // bar plotting band height
const PLOT_BOTTOM = PLOT_TOP + PLOT_H;
const PAD_L = 46; // room for the rotated axis label + tick numbers (axis labels sit here)
const PAD_R = 12;
const GROUP_GAP = 26;
const BAR_W = 26;
const BAR_GAP = 8;
const KIND_Y = PLOT_BOTTOM + 14; // per-bar store labels
const LABEL_Y = PLOT_BOTTOM + 30; // snapshot label
const TOTAL_Y = PLOT_BOTTOM + 44; // per-group total
const SVG_H = TOTAL_Y + 8;

const MAX_SNAPSHOTS = 6;
const MAX_BARS = 8;

// Known energy stores map to a stable accent so "KE" reads the same colour across every group;
// anything the model invents falls through to a cycled accent instead of vanishing.
const KIND_COLOR: Record<string, string> = {
  KE: 'var(--presence)',
  PE: 'var(--insight)',
  UG: 'var(--insight)',
  PEG: 'var(--insight)',
  US: 'var(--insight-soft)',
  PES: 'var(--insight-soft)',
  ETH: 'var(--warning)',
  ETHERM: 'var(--warning)',
  ETHERMAL: 'var(--warning)',
  Q: 'var(--warning-soft)',
  W: 'var(--presence-deep)',
  ECHEM: 'var(--danger)',
};
const CYCLE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-deep)',
  'var(--insight-soft)',
] as const;

function barColor(kind: string, index: number): string {
  const key = String(kind ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return KIND_COLOR[key] ?? CYCLE[index % CYCLE.length];
}

/** Coerce a loose value to a finite number; a string like "12" is common from the model. */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fmt(v: number): string {
  // Trim trailing zeros so a whole number reads "8" not "8.00" but 7.5 survives.
  return parseFloat(v.toFixed(2)).toString();
}

export function EnergyBarChart({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  snapshots,
  system,
  unit = 'J',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chart;

  const model = useMemo(() => {
    const snaps: EnergySnapshot[] = Array.isArray(snapshots)
      ? snapshots.slice(0, MAX_SNAPSHOTS)
      : [];
    // Normalise each group's bars defensively — the model may send strings or objectified junk.
    const groups = snaps.map((s) => {
      const bars: EnergyBar[] = (Array.isArray(s?.bars) ? s.bars : [])
        .slice(0, MAX_BARS)
        .map((b) => ({ kind: String(b?.kind ?? ''), value: num(b?.value) }));
      const total = bars.reduce((a, b) => a + b.value, 0);
      return { label: typeof s?.label === 'string' ? s.label : '', bars, total };
    });

    // One shared domain across every bar in every group, always including zero.
    const all = groups.flatMap((g) => g.bars.map((b) => b.value));
    let lo = Math.min(0, ...all);
    let hi = Math.max(0, ...all);
    if (!all.length || lo === hi) {
      // All-zero (or no data): a valid unit domain so the scale is finite; bars render flat.
      lo = Math.min(0, lo);
      hi = lo === 0 ? 1 : Math.max(hi, lo + 1);
    }
    const [d0, d1] = niceDomain(lo, hi);
    const y = scaleLinear([d0, d1], [PLOT_BOTTOM, PLOT_TOP]);
    const zeroY = y(0);
    const tickVals = y.ticks(5).filter((t) => t >= d0 - 1e-9 && t <= d1 + 1e-9);

    // Lay groups out left→right; each group is as wide as its own bar count.
    let x = PAD_L;
    const placed = groups.map((g) => {
      const n = Math.max(1, g.bars.length);
      const gw = n * BAR_W + (n - 1) * BAR_GAP;
      const gx = x;
      x += gw + GROUP_GAP;
      return { ...g, gx, gw };
    });
    const svgW = Math.max(PAD_L + PAD_R + 40, x - GROUP_GAP + PAD_R);

    return { placed, y, zeroY, tickVals, svgW };
  }, [snapshots]);

  const hasData = model.placed.length > 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: `${delay ?? 0}ms` } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> <span>{title}</span>
      </div>

      {Array.isArray(system) && system.length > 0 && (
        <div className="ebc-system" aria-label="Objects in the system">
          <span className="ebc-system-lead">System</span>
          {system.slice(0, 6).map((obj, i) => (
            <span key={i} className="ebc-system-chip">
              {String(obj)}
            </span>
          ))}
        </div>
      )}

      {!hasData ? (
        <BlockEmpty message="No energy snapshots to chart" />
      ) : (
        <div className="ebc-wrap">
          <svg
            viewBox={`0 0 ${model.svgW} ${SVG_H}`}
            className="ebc-svg"
            role="img"
            aria-label={`Energy bar chart: ${title}`}
          >
            {/* Y grid + tick labels */}
            {model.tickVals.map((t, i) => {
              const yy = model.y(t);
              return (
                <g key={`t${i}`}>
                  <line x1={PAD_L} y1={yy} x2={model.svgW - PAD_R} y2={yy} className="ebc-grid" />
                  <text x={PAD_L - 6} y={yy + 3} className="ebc-tick" textAnchor="end">
                    {fmt(t)}
                  </text>
                </g>
              );
            })}

            {/* Zero line (heavier — the reference every store is measured from) */}
            <line
              x1={PAD_L}
              y1={model.zeroY}
              x2={model.svgW - PAD_R}
              y2={model.zeroY}
              className="ebc-zero"
            />

            {/* Rotated axis label */}
            <text
              transform={`translate(13,${PLOT_TOP + PLOT_H / 2}) rotate(-90)`}
              className="ebc-axis-label"
              textAnchor="middle"
            >
              Energy ({unit})
            </text>

            {model.placed.map((g, gi) => {
              // Snapshot labels are free-form model text ("just before impact"); fit each to its
              // group so a long phase name shrinks to one line instead of overrunning the neighbor.
              const labelFit = fitText(g.label || `State ${gi + 1}`, {
                maxWidth: g.gw + GROUP_GAP,
                fontSize: 10,
                minFontSize: 7,
                maxLines: 1,
              });
              return (
                <g key={`g${gi}`}>
                  {g.bars.map((b, bi) => {
                    const bx = g.gx + bi * (BAR_W + BAR_GAP);
                    const top = model.y(Math.max(0, b.value));
                    const bottom = model.y(Math.min(0, b.value));
                    const h = Math.max(0, bottom - top);
                    const color = barColor(b.kind, bi);
                    const positive = b.value >= 0;
                    // Value sits just outside the bar's free end; a zero bar labels at the line.
                    const valY = h < 1 ? model.zeroY - 3 : positive ? top - 3 : bottom + 10;
                    const kindFit = fitText(b.kind || '·', {
                      maxWidth: BAR_W + BAR_GAP - 2,
                      fontSize: 9,
                      minFontSize: 6,
                      maxLines: 1,
                    });
                    return (
                      <g key={`b${bi}`}>
                        <rect
                          x={bx}
                          y={top}
                          width={BAR_W}
                          height={h}
                          rx={2}
                          className="ebc-bar"
                          style={{ fill: color }}
                        />
                        <text x={bx + BAR_W / 2} y={valY} className="ebc-val" textAnchor="middle">
                          {fmt(b.value)}
                        </text>
                        <text
                          x={bx + BAR_W / 2}
                          y={KIND_Y}
                          className="ebc-kind"
                          textAnchor="middle"
                          style={{ fontSize: kindFit.fontSize }}
                        >
                          {kindFit.lines[0]}
                        </text>
                      </g>
                    );
                  })}

                  {/* Snapshot label + conservation total under the group */}
                  <text
                    x={g.gx + g.gw / 2}
                    y={LABEL_Y}
                    className="ebc-group-label"
                    textAnchor="middle"
                    style={{ fontSize: labelFit.fontSize }}
                  >
                    {labelFit.lines[0]}
                  </text>
                  <text x={g.gx + g.gw / 2} y={TOTAL_Y} className="ebc-total" textAnchor="middle">
                    Σ = {fmt(g.total)} {unit}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
