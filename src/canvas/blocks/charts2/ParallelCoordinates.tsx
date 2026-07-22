import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { Legend } from '../../lib/axis';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { ParallelCoordinatesProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ParallelCoordinatesProps & { delay?: number };

const W = 380;
const H = 220;
const PAD = { top: 22, right: 16, bottom: 30, left: 16 };
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
  'var(--danger)',
];

interface Axis {
  key: string;
  label: string;
  x: number;
  lo: number;
  hi: number;
}

export function ParallelCoordinates({
  title,
  icon = 'sliders',
  iconColor = 'var(--presence)',
  axes,
  lines,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const lineList = Array.isArray(lines) ? lines : [];
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const rawAxes = (Array.isArray(axes) ? axes : []).filter(
      (a): a is { key: string; label: string; domain?: [number, number] } =>
        typeof a?.key === 'string' && a.key.trim().length > 0,
    );
    const n = rawAxes.length;

    const axisList: Axis[] = rawAxes.map((a, i) => {
      const x = PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
      const fixedDomain =
        Array.isArray(a.domain) &&
        a.domain.length === 2 &&
        Number.isFinite(a.domain[0]) &&
        Number.isFinite(a.domain[1]) &&
        a.domain[1] > a.domain[0]
          ? a.domain
          : null;
      let lo: number;
      let hi: number;
      if (fixedDomain) {
        [lo, hi] = fixedDomain;
      } else {
        const values = lineList
          .map((l) => l?.values?.[a.key])
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
        const ex = extent(values);
        [lo, hi] = niceDomain(ex ? ex[0] : 0, ex ? ex[1] : 1);
      }
      const label = typeof a.label === 'string' && a.label.trim() ? a.label.trim() : a.key;
      return { key: a.key, label, x, lo, hi };
    });

    const scaleFor = (a: Axis) => scaleLinear([a.lo, a.hi], [innerH, 0]);

    const paths = lineList.map((l, li) => {
      const color = l?.color || PALETTE[li % PALETTE.length];
      const label = typeof l?.label === 'string' && l.label.trim() ? l.label.trim() : 'Series';
      const points = axisList
        .map((a) => {
          const v = l?.values?.[a.key];
          if (typeof v !== 'number' || !Number.isFinite(v)) return null;
          return { x: a.x, y: scaleFor(a)(v) };
        })
        .filter((p): p is { x: number; y: number } => p !== null);
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      return { label, color, d, hasPoints: points.length > 0 };
    });

    return { innerH, axisList, paths };
  }, [axes, lines]);

  if (geom.axisList.length === 0 || !geom.paths.some((p) => p.hasPoints)) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-pc-wrap">
        <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} className="c2-pc-svg">
          <g transform={`translate(0,${PAD.top})`}>
            {geom.axisList.map((a, i) => (
              <g key={i}>
                <line x1={a.x} y1={0} x2={a.x} y2={geom.innerH} className="c2-pc-axis" />
                <text x={a.x} y={-15} className="c2-pc-alabel" textAnchor="middle">
                  {a.label}
                </text>
                <text x={a.x} y={-4} className="c2-pc-atick" textAnchor="middle">
                  {formatValue(a.hi)}
                </text>
                <text x={a.x} y={geom.innerH + 12} className="c2-pc-atick" textAnchor="middle">
                  {formatValue(a.lo)}
                </text>
              </g>
            ))}
            {geom.paths.map((p, i) => {
              const active = hot === i;
              const dimmed = hot !== null && !active;
              return (
                <path
                  key={i}
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={active ? 2.75 : 1.75}
                  strokeLinejoin="round"
                  strokeOpacity={dimmed ? 0.18 : 0.85}
                  className="c2-pc-line m-fade-rise m-stagger-item"
                  style={{ ['--i' as string]: i } as CSSProperties}
                  onMouseEnter={() => setHot(i)}
                  onMouseLeave={() => setHot(null)}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <Legend
        items={geom.paths.map((p) => ({ label: p.label, color: p.color }))}
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
