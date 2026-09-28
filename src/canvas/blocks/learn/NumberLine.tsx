import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks as makeTicks, scaleLinear } from '../../lib/scale';
import { estimateTextWidth } from '../../lib/fitText';
import { formatValue } from '../../lib/format';
import type { NumberLineProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NumberLineProps & { delay?: number };

const W = 320;
const H = 92;
/** The axis's end inset when its end labels are narrow enough not to need more. */
const PADX_MIN = 18;
/** The most either end label may take: past this the axis would shrink to a stub. */
const PADX_MAX = W * 0.25;
const AXIS_Y = 54;
/** The label sizes in the stylesheet (.lr-nl-ticklbl, .lr-nl-plbl/.lr-nl-ivlbl), in user units. */
const TICK_FS = 9.5;
const LABEL_FS = 9.5;
/** Clear space kept between an end label and the edge of the viewBox. */
const EDGE_GAP = 2;
const LABEL_ROW_H = 12; // vertical offset between an alternated pair of label rows
const LABEL_GAP = 3; // minimum breathing room between two same-row label boxes

/** Assign each labelled point/interval a stacked "row" (0 = closest to the axis, 1 = one row
 *  further up, …) so that labels whose centred text boxes would overlap their nearest earlier
 *  neighbour on the same row get pushed to the next row instead — an alternating stack rather
 *  than letting densely packed points/intervals print illegible overlapping text. Items are
 *  visited in x-order so the greedy per-row "last box end" tracking only ever compares
 *  adjacent labels. Mirrors LineSpectrum's assignLabelRows. */
function tickLabel(v: number, unit: string | undefined): string {
  return formatValue(v, { unit: unit || undefined });
}

function labelWidth(text: string): number {
  return estimateTextWidth(text, LABEL_FS, true);
}

/** Slide a centred label's anchor inward just far enough that its whole box stays in the viewBox. */
function keepInside(x: number, width: number): number {
  const half = width / 2 + EDGE_GAP;
  return half * 2 >= W ? W / 2 : Math.min(W - half, Math.max(half, x));
}

function assignLabelRows(items: { x: number; text: string }[]): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].x - items[b].x);
  const rowEndX: number[] = []; // right edge of the last label placed on each row, in x-order
  const rows = new Array<number>(items.length).fill(0);
  for (const i of order) {
    const half = labelWidth(items[i].text) / 2;
    const left = items[i].x - half;
    let row = 0;
    while (rowEndX[row] !== undefined && left < rowEndX[row] + LABEL_GAP) row++;
    rows[i] = row;
    rowEndX[row] = items[i].x + half;
  }
  return rows;
}

export function NumberLine({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  min,
  max,
  step,
  unit,
  points = [],
  intervals = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const { x, lo, hi, tickVals, showEvery } = useMemo(() => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const st = step && step > 0 ? step : niceStep(hi - lo, 6);
    const tv = makeTicks(lo, hi, st);
    const widths = tv.map((t) => estimateTextWidth(tickLabel(t, unit), TICK_FS));
    // The end ticks' labels are centred on the axis ends, so each end is inset by half its own
    // label: a fixed inset sized for a bare number let "2.5 hours" run past the card's edge.
    const inset = (w: number | undefined) =>
      Math.min(PADX_MAX, Math.max(PADX_MIN, (w ?? 0) / 2 + EDGE_GAP));
    const padL = inset(widths[0]);
    const padR = inset(widths[widths.length - 1]);
    const sc = scaleLinear([lo, hi], [padL, W - padR]);
    // Thin the ticks by the widest label's MEASURED width (unit included), so labels never crowd.
    const labelW = Math.max(0, ...widths);
    const gap = tv.length > 1 ? (W - padL - padR) / (tv.length - 1) : W;
    const every = labelW > gap * 0.8 ? Math.ceil(labelW / (gap * 0.8)) : 1;
    return { x: sc, lo: padL, hi: W - padR, tickVals: tv, showEvery: every };
  }, [min, max, step, unit]);

  const clampX = (v: number) => Math.max(lo, Math.min(hi, x(v)));

  const ivLabelX = (iv: (typeof intervals)[number]) =>
    keepInside(
      (clampX(Math.min(iv.from, iv.to)) + clampX(Math.max(iv.from, iv.to))) / 2,
      labelWidth(iv.label ?? ''),
    );
  const ptLabelX = (p: (typeof points)[number]) =>
    keepInside(clampX(p.value), labelWidth(p.label ?? ''));

  // Interval labels and point labels both sit in the same band above the axis, so they're
  // collision-tested together (in axis order) — a point landing between two labelled interval
  // endpoints must still stack clear of them, not just of other points.
  const labelRows = useMemo(() => {
    const ivItems = intervals.map((iv) => ({
      x: ivLabelX(iv),
      text: iv.label ?? '',
    }));
    const ptItems = points.map((p) => ({ x: ptLabelX(p), text: p.label ?? '' }));
    const combined = [...ivItems, ...ptItems];
    const labelledIdx = combined.map((item, i) => ({ item, i })).filter(({ item }) => item.text);
    const rows = assignLabelRows(labelledIdx.map(({ item }) => item));
    const ivRows: number[] = new Array(intervals.length).fill(0);
    const ptRows: number[] = new Array(points.length).fill(0);
    labelledIdx.forEach(({ i }, k) => {
      if (i < ivItems.length) ivRows[i] = rows[k];
      else ptRows[i - ivItems.length] = rows[k];
    });
    return { ivRows, ptRows };
    // clampX only closes over `x` (from the tick memo above), so intervals/points/min/max/step
    // are the complete, stable dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals, points, x]);

  const maxLabelRow = Math.max(0, ...labelRows.ivRows, ...labelRows.ptRows);
  // Extra headroom above the axis for however many label rows stacked up.
  const vbH = H + maxLabelRow * LABEL_ROW_H;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="lr-nl">
        <svg viewBox={`0 0 ${W} ${vbH}`} className="lr-nl-svg" role="img" aria-label={title}>
          {/* shaded intervals (drawn under the axis) */}
          {intervals.map((iv, i) => {
            const col = iv.color || 'var(--presence)';
            const a = clampX(Math.min(iv.from, iv.to));
            const b = clampX(Math.max(iv.from, iv.to));
            return (
              <g key={`iv${i}`}>
                <rect
                  x={a}
                  y={AXIS_Y - 5}
                  width={Math.max(0, b - a)}
                  height={10}
                  rx={5}
                  fill={`color-mix(in oklab, ${col} 22%, transparent)`}
                />
                <Endpoint cx={a} open={iv.openFrom} color={col} />
                <Endpoint cx={b} open={iv.openTo} color={col} />
                {iv.label && (
                  <text
                    x={ivLabelX(iv)}
                    y={AXIS_Y - 12 - labelRows.ivRows[i] * LABEL_ROW_H}
                    className="lr-nl-ivlbl"
                    textAnchor="middle"
                  >
                    {iv.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* the axis with an arrowhead at each end */}
          <line x1={lo} y1={AXIS_Y} x2={hi} y2={AXIS_Y} className="lr-nl-axis" />
          <polyline
            points={`${lo + 6},${AXIS_Y - 4} ${lo},${AXIS_Y} ${lo + 6},${AXIS_Y + 4}`}
            className="lr-nl-arrow"
          />
          <polyline
            points={`${hi - 6},${AXIS_Y - 4} ${hi},${AXIS_Y} ${hi - 6},${AXIS_Y + 4}`}
            className="lr-nl-arrow"
          />

          {/* ticks + labels — labels thinned when they would crowd */}
          {tickVals.map((t, i) => (
            <g key={`t${i}`}>
              <line x1={x(t)} y1={AXIS_Y - 4} x2={x(t)} y2={AXIS_Y + 4} className="lr-nl-tick" />
              {i % showEvery === 0 && (
                <text x={x(t)} y={AXIS_Y + 18} className="lr-nl-ticklbl" textAnchor="middle">
                  {tickLabel(t, unit)}
                </text>
              )}
            </g>
          ))}

          {/* plotted points */}
          {points.map((p, i) => {
            const col = p.color || 'var(--insight)';
            const cx = clampX(p.value);
            return (
              <g key={`p${i}`}>
                <circle
                  cx={cx}
                  cy={AXIS_Y}
                  r={5}
                  fill={p.open ? 'var(--surface-default)' : col}
                  stroke={col}
                  strokeWidth={2}
                  // First author-listed point is the lead datum (r=5 → 10 px ≤ 12 px → point).
                  data-mark={i === 0 ? 'point' : undefined}
                />
                {p.label && (
                  <text
                    x={ptLabelX(p)}
                    y={AXIS_Y - 12 - labelRows.ptRows[i] * LABEL_ROW_H}
                    className="lr-nl-plbl"
                    textAnchor="middle"
                  >
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
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

/** An interval endpoint — a filled bracket-dot for closed, hollow for open (excluded). */
function Endpoint({ cx, open, color }: { cx: number; open?: boolean; color: string }) {
  return (
    <circle
      cx={cx}
      cy={AXIS_Y}
      r={4}
      fill={open ? 'var(--surface-default)' : color}
      stroke={color}
      strokeWidth={1.6}
    />
  );
}
