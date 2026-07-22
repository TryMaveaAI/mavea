import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import { Legend } from '../../lib/axis';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { PieDonutProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PieDonutProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--text-muted)',
];
const R = 50;
const CX = 60;
const CY = 60;

// A point on the circle at the given fraction (0..1) of the way around, starting at 12 o'clock.
function polar(frac: number, radius: number) {
  const a = frac * 2 * Math.PI - Math.PI / 2;
  return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

export function PieDonut({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  slices,
  unit,
  hole = 0.58,
  centerValue,
  centerLabel,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const total = slices.reduce((s, sl) => s + Math.max(0, sl.value), 0);
  // The largest slice is the most salient datum — Mavéa's drawn gesture circles it.
  const salient = slices.reduce(
    (best, sl, i) => (sl.value > (slices[best]?.value ?? -1) ? i : best),
    0,
  );
  const arcs = useMemo(() => {
    let acc = 0;
    const innerR = R * Math.max(0, Math.min(0.9, hole));
    return slices.map((sl, i) => {
      const frac = total > 0 ? Math.max(0, sl.value) / total : 0;
      const start = acc;
      const end = acc + frac;
      acc = end;
      const [x0, y0] = polar(start, R);
      const [x1, y1] = polar(end, R);
      const [ix1, iy1] = polar(end, innerR);
      const [ix0, iy0] = polar(start, innerR);
      const large = frac > 0.5 ? 1 : 0;
      // Outer arc clockwise, then inner arc back — a donut wedge (or full pie when innerR≈0).
      const d =
        `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} ` +
        `L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix0} ${iy0} Z`;
      return { d, color: sl.color || PALETTE[i % PALETTE.length], frac };
    });
  }, [slices, total, hole]);

  if (!hasData(slices.map((s) => s.value)) || total <= 0) {
    return (
      <div className="card reveal c1">
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c1-pd" onMouseLeave={() => setHot(null)}>
        <svg viewBox="0 0 120 120" className="c1-pd-svg" role="img" aria-label={title}>
          {arcs.map((a, i) => (
            <path
              key={i}
              d={a.d}
              fill={a.color}
              className="c1-pd-arc"
              style={{ opacity: hot != null && hot !== i ? 0.35 : 1 }}
              onMouseEnter={() => setHot(i)}
            />
          ))}
          {(centerValue || hot != null) && hole > 0.2 && (
            <>
              <text x={CX} y={CY - 2} className="c1-pd-cval" textAnchor="middle">
                {hot != null
                  ? formatValue(slices[hot].value, { unit: unit || undefined })
                  : centerValue}
              </text>
              <text x={CX} y={CY + 12} className="c1-pd-clbl" textAnchor="middle">
                {hot != null ? slices[hot].label : centerLabel}
              </text>
            </>
          )}
        </svg>
      </div>
      <Legend
        items={slices.map((s, i) => ({
          label: `${s.label} · ${Math.round((Math.max(0, s.value) / total) * 100)}%`,
          color: s.color || PALETTE[i % PALETTE.length],
        }))}
        active={hot}
        onHover={setHot}
        markIndex={salient}
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
