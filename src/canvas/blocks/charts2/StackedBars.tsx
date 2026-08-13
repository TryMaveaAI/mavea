import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, niceStep, scaleLinear, ticks as axisTicks } from '../../lib/scale';
import { estimateTextWidth } from '../../lib/fitText';
import { withUnit } from '../../lib/format';
import { Legend } from '../../lib/axis';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { StackedBarsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StackedBarsProps & { delay?: number };

// Eight token accents, so even a crowded stack keeps every band distinct.
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--insight-soft)',
  'var(--warning-soft)',
  'var(--text-muted)',
];

/** Every accent the design system allows on a block (the `AccentVar` union). Authored data is
 *  already typed to this set; the runtime check exists for loose model JSON, which must never
 *  reach an SVG `fill` we didn't author — a stray `#e11` or `red` would bypass the tokens and
 *  read wrong in one of the two themes. */
const ALLOWED_COLORS: ReadonlySet<string> = new Set([
  'var(--presence)',
  'var(--presence-soft)',
  'var(--presence-deep)',
  'var(--insight)',
  'var(--insight-soft)',
  'var(--warning)',
  'var(--warning-soft)',
  'var(--danger)',
  'var(--text-muted)',
]);

/** A series' band colour: the authored accent when it's one the design system defines, else the
 *  next palette accent so the stack still reads. */
function bandColor(color: string | undefined, i: number): string {
  const token = typeof color === 'string' ? color.trim() : '';
  return ALLOWED_COLORS.has(token) ? token : PALETTE[i % PALETTE.length];
}

const W = 380;
const H = 240;
const PAD_TOP = 18;
const PAD_RIGHT = 14;
const PAD_BOTTOM = 30;
/** Tilted category labels need the deeper gutter. */
const PAD_BOTTOM_TILTED = 54;
/** Floor for the value-axis gutter; the real width is measured from the widest tick label. */
const PAD_LEFT_MIN = 40;
/** Past this a unit-bearing tick would eat the plot, so the axis falls back to bare numbers. */
const PAD_LEFT_MAX = 96;
/** Gap between a tick label and the axis line (ticks are anchored at x = -6). */
const TICK_GAP = 10;
/** Room the rotated `yLabel` needs at the far left of the gutter. */
const AXIS_TITLE_W = 14;

/** Font sizes in user units, mirroring styles.css so the fit math measures what actually
 *  renders. `.cx-tick` clamps DOWN on a narrow card, so 9.5 is its worst case and every
 *  "does this fit" decision errs safe. */
const TICK_FS = 9.5;
const VAL_FS = 9.5;
const TOTAL_FS = 9;
/** One character's advance at the tick size, straight from the shared estimator — every fit
 *  decision measures through it rather than counting characters against a magic number. */
const TICK_ADV = estimateTextWidth('0', TICK_FS);

const LABEL_TILT = 40;
const TILT_SIN = Math.sin((LABEL_TILT * Math.PI) / 180);
const TILT_COS = Math.cos((LABEL_TILT * Math.PI) / 180);
/** Perpendicular clearance two tilted labels need before they smear into each other: one full
 *  line box at the tick size. */
const LABEL_MIN_SEP = TICK_FS * 1.15;
/** A segment shorter than this can't hold a value label legibly, so it doesn't get one — the
 *  classic stacked-bar failure is printing "3" across a two-pixel band. */
const MIN_LABEL_H = 13;
/** A lone column would otherwise stretch to the full plot width and read as a wall. */
const BAR_MAX_W = 46;

/** Shorten `label` until it MEASURES within `maxWidth`, ellipsis included. The full string stays
 *  in the label's `<title>`, so nothing is lost — only shortened. */
function fitLabel(label: string, maxWidth: number): string {
  if (estimateTextWidth(label, TICK_FS) <= maxWidth) return label;
  const room = Math.floor(maxWidth / TICK_ADV) - 1; // one character's worth for the ellipsis
  if (room < 1) return '…';
  const head = label.slice(0, room).trimEnd();
  return head ? `${head}…` : '…';
}

/** How many columns to skip between drawn category labels.
 *
 *  A horizontal axis never needs thinning: labels only stay horizontal while the longest one
 *  fits inside its own band, so neighbours provably can't touch. A TILTED axis can still smear —
 *  two tilted labels are parallel lines, so their real separation is the horizontal gap ×
 *  sin(tilt), which at 24 monthly groups is ~8.7 units against a ~9.5-unit glyph. The stride
 *  comes from that MEASURED band, never from a column count. */
function labelStride(tilt: boolean, bandW: number): number {
  const sep = bandW * TILT_SIN;
  if (!tilt || !(sep > 0)) return 1;
  return Math.max(1, Math.ceil(LABEL_MIN_SEP / sep));
}

/** The category indices that actually get a label: every `stride`-th, plus the last one so the
 *  axis extent still reads. When forcing that last label would crowd its on-stride neighbour,
 *  the neighbour goes instead — pinning the end without that is how a thinned axis still
 *  overprints at the right edge. */
function labelIndices(count: number, stride: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += stride) out.push(i);
  const last = count - 1;
  if (last < 0 || out[out.length - 1] === last) return out;
  if (out.length > 1 && last - out[out.length - 1] < stride) out.pop();
  out.push(last);
  return out;
}

/** Compact past five digits so a tick, a value, or a total never outgrows its gutter.
 *  `withUnit` places the unit the way a person reads it — "$3,480", "62%", "9 hours". */
function short(value: number, unit?: string): string {
  return withUnit(value, unit, { compact: Math.abs(value) >= 10000 });
}

/**
 * Stacked columns: one bar per category, split bottom → top into segments that keep the same
 * color in every column, so the eye tracks one band across the whole chart. The everyday
 * part-to-whole-over-categories primitive — revenue by region per quarter, hours by activity
 * per day. `mode: 'percent'` normalises each column to 100% to compare mix alone; the real
 * total is then printed above the column so the magnitude isn't lost.
 */
export function StackedBars({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = '',
  groups,
  series,
  mode = 'absolute',
  yLabel,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const percent = mode === 'percent';
    const bands = (Array.isArray(series) ? series : []).map((s, i) => ({
      name: typeof s?.name === 'string' && s.name.trim() ? s.name.trim() : `Series ${i + 1}`,
      color: bandColor(s?.color, i),
      data: Array.isArray(s?.data) ? s.data : [],
    }));
    const labels = (Array.isArray(groups) ? groups : []).map((g, i) =>
      typeof g === 'string' && g.trim() ? g.trim() : `#${i + 1}`,
    );

    // A stack has no baseline below zero, so a negative can't be drawn honestly: it counts as
    // zero and the drop is declared under the chart rather than silently swallowed.
    let dropped = 0;
    const rows = labels.map((_, gi) =>
      bands.map((b) => {
        const raw = b.data[gi];
        if (!Number.isFinite(raw)) return 0;
        if (raw < 0) {
          dropped += 1;
          return 0;
        }
        return raw;
      }),
    );
    const totals = rows.map((row) => row.reduce((sum, v) => sum + v, 0));

    const maxTotal = totals.reduce((m, t) => Math.max(m, t), 0);
    const top = percent ? 100 : niceDomain(0, Math.max(maxTotal, 1))[1];
    const tickValues = percent ? [0, 25, 50, 75, 100] : axisTicks(0, top, niceStep(top, 4));

    // The axis and the column caps must speak the same language: bare numbers on the axis beside
    // a "$3,480" cap read as two different scales. So ticks carry the unit exactly as the totals
    // do, and the gutter is MEASURED from the widest of them — a wordy unit ("hours") can't clip
    // against the card edge. A unit too wide even for that is dropped from the AXIS only; it
    // still reads on every column cap, in the tooltips, and in `yLabel`.
    const titleW = yLabel ? AXIS_TITLE_W : 0;
    const gutterFor = (texts: readonly string[]): number =>
      texts.reduce((m, t) => Math.max(m, estimateTextWidth(t, TICK_FS)), 0) + TICK_GAP + titleW;
    const united = tickValues.map((t) => (percent ? `${t}%` : short(t, unit)));
    const bare = tickValues.map((t) => (percent ? `${t}%` : short(t)));
    const tickText = gutterFor(united) <= PAD_LEFT_MAX ? united : bare;
    const padL = Math.min(PAD_LEFT_MAX, Math.max(PAD_LEFT_MIN, gutterFor(tickText)));

    const innerW = W - padL - PAD_RIGHT;
    const bandW = innerW / Math.max(1, labels.length);

    // Tilt when the longest REAL label can't sit horizontally under its own column — driven by
    // the data, never by a fixed column count.
    const widestLabel = labels.reduce((m, l) => Math.max(m, estimateTextWidth(l, TICK_FS)), 0);
    const tilt = widestLabel > bandW - 4;
    const padB = tilt ? PAD_BOTTOM_TILTED : PAD_BOTTOM;
    const innerH = H - PAD_TOP - padB;

    // How wide a category label may draw. Horizontal: its own band. Tilted: whichever runs out
    // first — the gutter it descends into (width × sin(tilt)), or the room to the LEFT of the
    // first column, which a tilted label reaches back into by width × cos(tilt) and where
    // `.c2-stk-wrap`'s overflow:hidden clips it against the card edge.
    const labelMaxW = Math.max(
      TICK_ADV * 2,
      tilt ? Math.min((padB - 12) / TILT_SIN, (padL + bandW / 2 - 2) / TILT_COS) : bandW - 4,
    );
    const labelled = new Set(labelIndices(labels.length, labelStride(tilt, bandW)));

    const sy = scaleLinear([0, top], [innerH, 0]);
    const barW = Math.min(bandW * 0.68, BAR_MAX_W);
    const cx = (i: number) => i * bandW + bandW / 2;

    // The single largest segment anywhere is the shape Mavéa's gesture should circle.
    let mark = { g: -1, s: -1, v: 0 };

    const columns = labels.map((label, gi) => {
      const total = totals[gi];
      let acc = 0;
      const segs = rows[gi].map((raw, si) => {
        const share = total > 0 ? raw / total : 0;
        // In percent mode the column is redrawn on a 0–100 axis; in absolute mode it keeps its
        // own units. Either way the running sum is what positions the next segment.
        const plotted = percent ? share * 100 : raw;
        const y0 = sy(acc);
        acc += plotted;
        const y1 = sy(acc);
        const h = Math.max(0, y0 - y1);
        if (raw > mark.v) mark = { g: gi, s: si, v: raw };
        const text = percent ? `${Math.round(share * 100)}%` : short(raw);
        return {
          raw,
          share,
          text,
          y: y1,
          h,
          // A label is drawn only where the segment can actually hold it, in BOTH axes.
          showText:
            raw > 0 && h >= MIN_LABEL_H && estimateTextWidth(text, VAL_FS, true) + 6 <= barW,
        };
      });
      const totalText = short(total, unit);
      return {
        label,
        labelText: fitLabel(label, labelMaxW),
        showLabel: labelled.has(gi),
        total,
        segs,
        x: cx(gi) - barW / 2,
        cx: cx(gi),
        topY: sy(percent ? 100 : total),
        totalText,
        showTotal: total > 0 && estimateTextWidth(totalText, TOTAL_FS) + 4 <= bandW,
      };
    });

    return {
      percent,
      bands,
      columns,
      padL,
      innerW,
      innerH,
      barW,
      sy,
      yTicks: tickValues.map((v, i) => ({ v, text: tickText[i] })),
      tilt,
      dropped,
      mark,
    };
  }, [groups, series, mode, unit, yLabel]);

  const shell = { ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties;
  const eyebrow = (
    <div className="card-eyebrow">
      <Ic className="ic" style={{ color: iconColor }} /> {title}
    </div>
  );

  if (!geom.columns.some((c) => c.total > 0)) {
    return (
      <div className="card reveal c2" style={shell}>
        {eyebrow}
        <BlockEmpty />
      </div>
    );
  }

  return (
    <div className="card reveal c2" style={shell}>
      {eyebrow}
      <div className="c2-stk-wrap" onMouseLeave={() => setHot(null)}>
        <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} className="c2-stk-svg">
          <g transform={`translate(${geom.padL},${PAD_TOP})`}>
            {geom.yTicks.map((t) => (
              <line
                key={t.v}
                x1={0}
                y1={geom.sy(t.v)}
                x2={geom.innerW}
                y2={geom.sy(t.v)}
                className="cx-grid-l"
              />
            ))}
            {geom.yTicks.map((t) => (
              <text key={t.v} x={-6} y={geom.sy(t.v) + 3} className="cx-tick" textAnchor="end">
                {t.text}
              </text>
            ))}
            {yLabel && (
              <text
                x={0}
                y={0}
                className="cx-axlbl"
                textAnchor="middle"
                transform={`translate(${11 - geom.padL},${geom.innerH / 2}) rotate(-90)`}
              >
                {yLabel}
              </text>
            )}

            {geom.columns.map((col, gi) => (
              <g
                key={gi}
                className="m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: gi } as CSSProperties}
              >
                {col.segs.map((sg, si) =>
                  sg.raw <= 0 ? null : (
                    <g
                      key={si}
                      className={'c2-stk-part' + (hot !== null && hot !== si ? ' dim' : '')}
                      onMouseEnter={() => setHot(si)}
                    >
                      <rect
                        x={col.x}
                        y={sg.y}
                        width={geom.barW}
                        height={sg.h}
                        fill={geom.bands[si].color}
                        data-mark={gi === geom.mark.g && si === geom.mark.s ? 'circle' : undefined}
                      >
                        <title>{`${col.label} · ${geom.bands[si].name}: ${short(sg.raw, unit)} (${Math.round(sg.share * 100)}%)`}</title>
                      </rect>
                      {sg.showText && (
                        <text
                          x={col.cx}
                          y={sg.y + sg.h / 2 + 3.4}
                          className="c2-stk-val"
                          textAnchor="middle"
                        >
                          {sg.text}
                        </text>
                      )}
                    </g>
                  ),
                )}
                {col.showTotal && (
                  <text x={col.cx} y={col.topY - 5} className="c2-stk-total" textAnchor="middle">
                    {col.totalText}
                  </text>
                )}
              </g>
            ))}

            <line x1={0} y1={geom.innerH} x2={geom.innerW} y2={geom.innerH} className="cx-axis-l" />
            {geom.columns.map((col, gi) => {
              if (!col.showLabel) return null;
              const ly = geom.innerH + (geom.tilt ? 8 : 14);
              return (
                <text
                  key={gi}
                  x={col.cx}
                  y={ly}
                  className="cx-tick c2-stk-cat"
                  textAnchor={geom.tilt ? 'end' : 'middle'}
                  transform={geom.tilt ? `rotate(-${LABEL_TILT}, ${col.cx}, ${ly})` : undefined}
                >
                  <title>{col.label}</title>
                  {col.labelText}
                </text>
              );
            })}
          </g>
        </svg>
      </div>

      {geom.dropped > 0 && (
        <p className="c2-stk-note">
          {geom.dropped === 1 ? '1 negative value' : `${geom.dropped} negative values`} counted as
          zero — a stack has no baseline below zero.
        </p>
      )}

      <Legend
        items={geom.bands.map((b) => ({ label: b.name, color: b.color }))}
        active={hot}
        onHover={setHot}
      />

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
