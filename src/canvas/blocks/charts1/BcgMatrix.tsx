import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { BcgMatrixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';
import { placeClear, type Box } from '../charts2/chartMath';

type Props = BcgMatrixProps & { delay?: number };

const W = 400;
const H = 270;
const PAD = { l: 42, r: 16, t: 18, b: 32 };
const MIN_R = 7;
const MAX_R = 24;
const DEFAULT_R = 11;
const LABEL_FS = 9.5; // matches .c1-bcg-label
const CORNER_FS = 9; // .c1-bcg-corner's largest size
/** Height of the band along the plot's top and bottom edges that the quadrant names occupy. */
const CORNER_BAND = 16;

/** Widen a data extent so a bubble of radius `padPx` at either end clears the frame's edges by
 *  `padPx` (plus `bandPx` of reserved band) once the extent is mapped onto `px` pixels. */
function padExtent(
  lo: number,
  hi: number,
  px: number,
  padPx: number,
  bandPx = 0,
): [number, number] {
  const span = hi - lo || Math.abs(hi) || 1;
  const usable = Math.max(px - 2 * (padPx + bandPx), px * 0.4);
  const perPx = span / usable;
  return [lo - (padPx + bandPx) * perPx, hi + (padPx + bandPx) * perPx];
}

type Quad = 'star' | 'question' | 'cow' | 'dog';

// Star/Cash-Cow live on the high-share side (right) so the app's usual "bigger value sits
// further right/up" convention holds — the textbook BCG layout mirrors this on the x-axis,
// but flipping the axis direction would be the one chart in the family that reads backwards.
const QUAD_COLOR: Record<Quad, string> = {
  star: 'var(--presence)',
  question: 'var(--warning)',
  cow: 'var(--insight)',
  dog: 'var(--text-muted)',
};

/** A single well-formed numeric reading per item — never trust the model to have supplied
 *  every optional field, or supplied a number at all, on every entry. */
interface Reading {
  growth: number;
  share: number;
  revenue: number | null;
}

/** Median of a numeric list; 0 for an empty list so a stray empty portfolio can't divide by
 *  a NaN split point. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quadrantOf(growth: number, share: number, medGrowth: number, medShare: number): Quad {
  if (growth >= medGrowth) return share >= medShare ? 'star' : 'question';
  return share >= medShare ? 'cow' : 'dog';
}

// BCG growth-share matrix: a continuous XY scatter (not the four discrete buckets `quadrant`
// draws) split by dashed lines at the portfolio's own median growth/share — the classic tool
// has no universal "average market" line to threshold against, so the median of what's on the
// canvas is the honest stand-in. Bubble radius carries revenue when the caller gives it.
export function BcgMatrix({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  items,
  unit,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  // A generic-coerced block only guarantees `items` is a non-empty array — never that each
  // entry actually carries finite `growth`/`share`/`revenue` numbers.
  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const readings = useMemo<Reading[]>(
    () =>
      safeItems.map((it) => ({
        growth: Number.isFinite(it?.growth) ? it.growth : 0,
        share: Number.isFinite(it?.share) ? it.share : 0,
        revenue: Number.isFinite(it?.revenue) && it.revenue! > 0 ? it.revenue! : null,
      })),
    [safeItems],
  );

  const geom = useMemo(() => {
    const maxRevenue = Math.max(0, ...readings.map((r) => r.revenue ?? 0));
    const pr = (revenue: number | null) =>
      revenue == null || maxRevenue === 0
        ? DEFAULT_R
        : MIN_R + (revenue / maxRevenue) * (MAX_R - MIN_R);
    const maxR = Math.max(0, ...readings.map((r) => pr(r.revenue)));

    // The domain leaves room for the bubbles themselves: a nice domain fitted to the centres put
    // the top bubble's disc over the QUESTION MARK corner name and the bottom one under DOG.
    // Top and bottom also clear the band the quadrant names sit in.
    const xe = extent(readings.map((r) => r.share)) ?? [0, 1];
    const ye = extent(readings.map((r) => r.growth)) ?? [0, 1];
    const xPad = padExtent(xe[0], xe[1], W - PAD.l - PAD.r, maxR + 2);
    const yPad = padExtent(ye[0], ye[1], H - PAD.t - PAD.b, maxR + 2, CORNER_BAND);
    // Relative share is never negative: padding must not invent a "-0.5×" tick.
    const [xLo, xHi] = niceDomain(xe[0] >= 0 ? Math.max(0, xPad[0]) : xPad[0], xPad[1]);
    const [yLo, yHi] = niceDomain(yPad[0], yPad[1]);
    const sx = scaleLinear([xLo, xHi], [PAD.l, W - PAD.r]);
    const sy = scaleLinear([yLo, yHi], [H - PAD.b, PAD.t]);
    const medGrowth = median(readings.map((r) => r.growth));
    const medShare = median(readings.map((r) => r.share));

    // Names beside their bubbles: the reader (and the footer) refer to products by name, and a
    // field of unnamed discs made every one a hover hunt. Each takes the first clear spot around
    // its own disc, avoiding every disc, the quadrant names and the names already placed.
    const plot: Box = { x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };
    const cornerW = (t: string) => t.length * CORNER_FS * 0.72;
    const corners: Box[] = [
      { x: W - PAD.r - 4 - cornerW('Star'), y: PAD.t + 3, w: cornerW('Star'), h: 11 },
      { x: PAD.l + 4, y: PAD.t + 3, w: cornerW('Question Mark'), h: 11 },
      { x: W - PAD.r - 4 - cornerW('Cash Cow'), y: H - PAD.b - 15, w: cornerW('Cash Cow'), h: 11 },
      { x: PAD.l + 4, y: H - PAD.b - 15, w: cornerW('Dog'), h: 11 },
    ];
    const discs: Box[] = readings.map((r) => {
      const rr = pr(r.revenue);
      return { x: sx(r.share) - rr, y: sy(r.growth) - rr, w: rr * 2, h: rr * 2 };
    });
    const taken: Box[] = [...corners, ...discs];
    // A name straddling a median split reads as belonging to both quadrants; avoid it if possible.
    const mx = sx(medShare);
    const my = sy(medGrowth);
    const splits = [
      [
        { x: mx, y: PAD.t },
        { x: mx, y: H - PAD.b },
      ],
      [
        { x: PAD.l, y: my },
        { x: W - PAD.r, y: my },
      ],
    ];
    const labels = readings.map((r, i) => {
      const text = typeof safeItems[i]?.label === 'string' ? safeItems[i].label.trim() : '';
      if (!text) return null;
      const w = estimateTextWidth(text, LABEL_FS, true);
      const h = LABEL_FS + 3;
      const cx = sx(r.share);
      const cy = sy(r.growth);
      const g = pr(r.revenue) + 4;
      const d = g * Math.SQRT1_2;
      const candidates: Box[] = [
        { x: cx + g, y: cy - h / 2, w, h },
        { x: cx - g - w, y: cy - h / 2, w, h },
        { x: cx - w / 2, y: cy - g - h, w, h },
        { x: cx - w / 2, y: cy + g, w, h },
        { x: cx + d, y: cy - d - h, w, h },
        { x: cx - d - w, y: cy - d - h, w, h },
        { x: cx + d, y: cy + d, w, h },
        { x: cx - d - w, y: cy + d, w, h },
      ];
      const others = taken.filter((_, k) => k !== corners.length + i);
      const box = placeClear(candidates, plot, splits, others);
      taken.push(box);
      return { text, box };
    });
    return {
      labels,
      sx,
      sy,
      pr,
      medGrowth,
      medShare,
      medX: sx(medShare),
      medY: sy(medGrowth),
      xTicks: sx.ticks(4),
      yTicks: sy.ticks(4),
    };
  }, [readings, safeItems]);

  const { sx, sy, pr, medGrowth, medShare, medX, medY, xTicks, yTicks, labels } = geom;

  // The biggest bet in the portfolio (by revenue, when given) is what Mavéa's drawn gesture
  // circles; with no revenue anywhere it falls back to the first item rather than guessing.
  const salient = readings.reduce(
    (best, r, i) => ((r.revenue ?? 0) > (readings[best].revenue ?? 0) ? i : best),
    0,
  );

  if (!hasData(readings.flatMap((r) => [r.growth, r.share]))) {
    return (
      <div
        className="card reveal c1"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  const hotItem = hot != null ? safeItems[hot] : undefined;
  const hotReading = hot != null ? readings[hot] : undefined;

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c1-bcg" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="c1-bcg-svg" role="img" aria-label={title}>
          {/* quadrant tints, bounded by the data median rather than the geometric center */}
          <rect
            x={PAD.l}
            y={PAD.t}
            width={Math.max(0, medX - PAD.l)}
            height={Math.max(0, medY - PAD.t)}
            fill="color-mix(in oklab, var(--warning) 5%, transparent)"
          />
          <rect
            x={medX}
            y={PAD.t}
            width={Math.max(0, W - PAD.r - medX)}
            height={Math.max(0, medY - PAD.t)}
            fill="color-mix(in oklab, var(--presence) 5%, transparent)"
          />
          <rect
            x={PAD.l}
            y={medY}
            width={Math.max(0, medX - PAD.l)}
            height={Math.max(0, H - PAD.b - medY)}
            fill="color-mix(in oklab, var(--text-muted) 5%, transparent)"
          />
          <rect
            x={medX}
            y={medY}
            width={Math.max(0, W - PAD.r - medX)}
            height={Math.max(0, H - PAD.b - medY)}
            fill="color-mix(in oklab, var(--insight) 5%, transparent)"
          />

          {xTicks.map((t, i) => (
            <g key={`gx${i}`}>
              <line x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} className="cx-grid-l" />
              {/* Clear of the y-axis labels' band: ticks(4) puts the first x tick ON the axis, so
                  its centred label and the bottom y label meet in the corner. The y band's lowest
                  label descends to about 3px past the baseline, and an x label rises about 8px
                  above its own, so the two only miss each other from 15px down. */}
              <text x={sx(t)} y={H - PAD.b + 16} className="cx-tick" textAnchor="middle">
                {formatValue(t, { decimals: 1 })}×
              </text>
            </g>
          ))}
          {yTicks.map((t, i) => (
            <g key={`gy${i}`}>
              <line x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} className="cx-grid-l" />
              <text x={PAD.l - 5} y={sy(t) + 3} className="cx-tick" textAnchor="end">
                {formatValue(t, { decimals: 0 })}%
              </text>
            </g>
          ))}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="cx-axis-l" />
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="cx-axis-l" />

          {/* median split — dashed, the honest stand-in for an "average market" line */}
          <line x1={medX} y1={PAD.t} x2={medX} y2={H - PAD.b} className="c1-bcg-median" />
          <line x1={PAD.l} y1={medY} x2={W - PAD.r} y2={medY} className="c1-bcg-median" />

          {/* fixed corner labels — the quadrant names live at the plot's own corners, not
              at the (data-dependent) median split, so a lopsided portfolio never pushes a
              label off the card. */}
          <text x={W - PAD.r - 4} y={PAD.t + 12} textAnchor="end" className="c1-bcg-corner">
            Star
          </text>
          <text x={PAD.l + 4} y={PAD.t + 12} textAnchor="start" className="c1-bcg-corner">
            Question Mark
          </text>
          <text x={W - PAD.r - 4} y={H - PAD.b - 6} textAnchor="end" className="c1-bcg-corner">
            Cash Cow
          </text>
          <text x={PAD.l + 4} y={H - PAD.b - 6} textAnchor="start" className="c1-bcg-corner">
            Dog
          </text>

          {readings.map((r, i) => {
            const q = quadrantOf(r.growth, r.share, medGrowth, medShare);
            const col = QUAD_COLOR[q];
            const active = hot === i;
            return (
              <circle
                key={i}
                cx={sx(r.share)}
                cy={sy(r.growth)}
                r={pr(r.revenue)}
                fill={`color-mix(in oklab, ${col} ${active ? 45 : 28}%, transparent)`}
                stroke={col}
                strokeWidth={active ? 2 : 1.4}
                onMouseEnter={() => setHot(i)}
                style={{ transition: 'fill var(--m-fast)', cursor: 'pointer' }}
                data-mark={i === salient ? 'circle' : undefined}
              />
            );
          })}

          {labels.map(
            (l, i) =>
              l && (
                <text
                  key={`l${i}`}
                  x={l.box.x}
                  y={l.box.y + l.box.h - 3}
                  className={'c1-bcg-label' + (hot === i ? ' on' : '')}
                >
                  {l.text}
                </text>
              ),
          )}
        </svg>
        {hotItem && hotReading && (
          <div
            className="c1-bcg-tip"
            style={{
              left: `${(sx(hotReading.share) / W) * 100}%`,
              top: `${(sy(hotReading.growth) / H) * 100}%`,
            }}
          >
            <b>{hotItem.label}</b>
            <span className="faint tab-num">
              {formatValue(hotReading.growth, { decimals: 1 })}% growth ·{' '}
              {formatValue(hotReading.share, { decimals: 2 })}× share
              {hotReading.revenue != null
                ? ` · ${formatValue(hotReading.revenue, { unit, compact: true })}`
                : ''}
            </span>
            {hotItem.note && <span className="c1-bcg-tip-note">{hotItem.note}</span>}
          </div>
        )}
      </div>
      <div className="insight-summary" style={{ marginTop: 10 }}>
        {footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">
            Growth ↑ · relative share → — split at the portfolio's median
          </span>
        )}
      </div>
    </div>
  );
}
