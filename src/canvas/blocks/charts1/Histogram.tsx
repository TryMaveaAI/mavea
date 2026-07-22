import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks as niceTicks } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { HistogramProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HistogramProps & { delay?: number };

const W = 540,
  H = 240,
  PAD = { l: 34, r: 35, t: 14, b: 34 };

export function Histogram({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  bins,
  unit = '',
  color = 'var(--presence)',
  marker,
  markerLabel,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const maxCount = Math.max(...bins.map((b) => b.count), 1);
    const x0 = bins[0]?.x0 ?? 0;
    const x1 = bins[bins.length - 1]?.x1 ?? 1;
    const plotW = W - PAD.l - PAD.r,
      plotH = H - PAD.t - PAD.b;
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * plotW;
    const total = bins.reduce((s, b) => s + b.count, 0);
    // Tallest bin is the mode — Mavéa's drawn gesture circles it.
    const salient = bins.reduce(
      (best, b, i) => (b.count > (bins[best]?.count ?? -1) ? i : best),
      0,
    );
    return { maxCount, sx, plotH, total, x0, x1, salient };
  }, [bins]);

  // Count axis at nice, round intervals (0, 5, 10…) instead of just thirds of the tallest bin.
  const fmtX = (v: number) => formatValue(v, { unit: unit || undefined });
  const ticks = niceTicks(0, model.maxCount, niceStep(model.maxCount, 4));

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
        {ticks.map((t, i) => {
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
        {bins.map((b, i) => {
          const x = model.sx(b.x0) + 1;
          const w = Math.max(1, model.sx(b.x1) - model.sx(b.x0) - 2);
          const h = (b.count / (model.maxCount || 1)) * model.plotH;
          const y = PAD.t + model.plotH - h;
          const active = hover === i;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={Math.max(0, h)}
              rx={3}
              fill={`color-mix(in oklab, ${color} ${active ? 80 : 48}%, transparent)`}
              stroke={color}
              strokeWidth={active ? 1.4 : 0.8}
              data-mark={i === model.salient ? 'circle' : undefined}
              style={{ cursor: 'pointer', transition: 'all var(--m-fast)' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {marker != null && (
          <g>
            <line
              x1={model.sx(marker)}
              x2={model.sx(marker)}
              y1={PAD.t}
              y2={PAD.t + model.plotH}
              stroke="var(--warning)"
              strokeWidth={1.6}
              strokeDasharray="4 4"
            />
            <text
              x={model.sx(marker)}
              y={PAD.t - 3}
              textAnchor="middle"
              fontSize="10"
              fill="var(--warning)"
            >
              {markerLabel || 'mean'}
            </text>
          </g>
        )}
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
            y={H - PAD.b + 18}
            textAnchor="middle"
            fontSize="10.5"
            fill="var(--text-muted)"
            className="tab-num"
          >
            {fmtX(Math.round(v))}
          </text>
        ))}
      </svg>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hover != null ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>
              {fmtX(bins[hover].x0)}–{fmtX(bins[hover].x1)}
            </strong>{' '}
            · {formatValue(bins[hover].count)} (
            {Math.round((bins[hover].count / (model.total || 1)) * 100)}%)
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">
            {model.total.toLocaleString()} samples · hover a bin for its range
          </span>
        )}
      </div>
    </div>
  );
}
