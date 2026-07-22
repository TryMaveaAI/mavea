// The filled, direction-tinted trend chart for a price-shaped metric — the familiar ticker read
// (green climbing, red falling) that a plain Sparkline deliberately withholds for a number whose
// "good direction" we don't actually know.
import { useId, type ReactElement } from 'react';

export interface AreaChartPoint {
  at: number;
  value: number;
}

interface AreaChartProps {
  points: AreaChartPoint[];
  tone?: 'up' | 'down' | 'flat';
}

const W = 200;
const H = 40;
const PAD = 3;

export function AreaChart({ points, tone = 'flat' }: AreaChartProps): ReactElement | null {
  const gradId = useId();
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: PAD + (1 - (p.value - min) / span) * (H - PAD * 2),
  }));
  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${H - PAD} L${first.x.toFixed(1)},${H - PAD} Z`;
  const stroke =
    tone === 'up' ? 'var(--insight)' : tone === 'down' ? 'var(--danger)' : 'var(--text-secondary)';
  return (
    <svg
      className="tile-viz-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="presentation"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
