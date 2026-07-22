// Ridge plot (joyplot) — one density curve per category, stacked with a slight vertical
// overlap so each ridge's peak can rise into the row above it. Each curve is a caller-supplied
// sequence of real y-values plotted at evenly-spaced x positions (the same honest, no-fabricated-
// domain approach every bare number[] sparkline in this family already uses) and normalized to
// its OWN peak, the standard ridge-plot convention for comparing shape across categories whose
// raw magnitudes may live on very different scales.
import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { usePathDraw } from '../../lib/motion';
import type { RidgeplotProps, RidgeCategory } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RidgeplotProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

const W = 320;
const LEFT = 90;
const RIGHT = 14;
const TOP = 12;
const BOTTOM = 12;
const ROW_H = 30; // baseline-to-baseline spacing
const LABEL_BOX = LEFT - 10; // gutter a row label is right-aligned into
const RP_CHARS_PER_PX = 1 / 5.4; // budget at the .rp-label font-size, same idiom as ConfusionMatrix

/** A label that outgrows its fixed gutter would otherwise run past x=0 and get clipped by the
 *  viewBox with no visual cue — truncate to what actually fits and keep the full string as a
 *  native <title> tooltip, the same fallback ConfusionMatrix uses for its class labels. */
function truncateLabel(text: string): string {
  const max = Math.max(3, Math.floor(LABEL_BOX * RP_CHARS_PER_PX));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface RowModel {
  key: string;
  label: string;
  color: string;
  d: string; // filled area path (baseline → curve → baseline)
  strokeD: string; // the curve outline only, for the draw-on stroke
  baselineY: number;
}

/** Normalize one category into safe plot geometry, or null when there aren't at least two real
 *  points to draw a line through. Negative/non-finite samples are dropped rather than plotted as
 *  a fabricated dip — a density curve is never negative in real data. */
function buildRow(
  raw: RidgeCategory | null | undefined,
  i: number,
  baselineY: number,
  peakRise: number,
  plotW: number,
): RowModel | null {
  if (!raw) return null;
  const label =
    typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : `Series ${i + 1}`;
  const vals = (Array.isArray(raw.curve) ? raw.curve : []).filter(
    (v): v is number => Number.isFinite(v) && v >= 0,
  );
  if (vals.length < 2) return null;

  const peak = Math.max(...vals) || 1;
  const n = vals.length;
  const x = (j: number) => LEFT + (j / (n - 1)) * plotW;
  const y = (v: number) => baselineY - (v / peak) * peakRise;

  const pts = vals.map((v, j) => `${x(j).toFixed(2)},${y(v).toFixed(2)}`);
  const strokeD = `M${pts.join('L')}`;
  const d = `M${x(0).toFixed(2)},${baselineY} L${pts.join('L')} L${x(n - 1).toFixed(2)},${baselineY} Z`;
  const color = raw.color || PALETTE[i % PALETTE.length];

  return { key: `${label}-${i}`, label, color, d, strokeD, baselineY };
}

/** One ridge's curve outline, owning its own path ref so usePathDraw measures and draws THIS
 *  row's real length — a shared ref across rows would only ever animate the last one mounted. */
function RidgeStroke({ d, color, delay }: { d: string; color: string; delay: number }) {
  const ref = useRef<SVGPathElement>(null);
  usePathDraw(ref, { delay });
  return <path ref={ref} d={d} fill="none" stroke={color} className="rp-stroke" />;
}

export function RidgePlot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  categories,
  overlap,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const overlapAmt = Number.isFinite(overlap) ? Math.max(0, Math.min(1, overlap as number)) : 0.55;
  const peakRise = ROW_H * (1 + overlapAmt * 1.8);
  const plotW = W - LEFT - RIGHT;

  const raw = Array.isArray(categories) ? categories : [];
  const rows: RowModel[] = [];
  raw.forEach((c, i) => {
    const baselineY = TOP + peakRise + rows.length * ROW_H;
    const row = buildRow(c, i, baselineY, peakRise, plotW);
    if (row) rows.push(row);
  });

  const H = rows.length > 0 ? TOP + peakRise + (rows.length - 1) * ROW_H + BOTTOM : 0;

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {rows.length === 0 && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Provide at least one category with two or more curve values.
        </p>
      )}

      {rows.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="rp-svg" role="img" aria-label={title}>
          {rows.map((r, i) => (
            <g
              key={r.key}
              className="m-fade-rise m-stagger-item"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <line
                x1={LEFT}
                y1={r.baselineY}
                x2={W - RIGHT}
                y2={r.baselineY}
                className="rp-baseline"
              />
              <path d={r.d} fill={r.color} className="rp-area" />
              <RidgeStroke d={r.strokeD} color={r.color} delay={(delay || 0) + i * 60} />
              <text x={LEFT - 8} y={r.baselineY + 3} className="rp-label" textAnchor="end">
                {truncateLabel(r.label) !== r.label && <title>{r.label}</title>}
                {truncateLabel(r.label)}
              </text>
            </g>
          ))}
        </svg>
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
