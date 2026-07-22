// A neutral, direction-agnostic trend line — used for a tracked number that isn't a price, where
// "up" carries no implied verdict, so nothing here is color-coded by direction.
import type { ReactElement } from 'react';

export interface SparklinePoint {
  at: number;
  value: number;
}

interface SparklineProps {
  points: SparklinePoint[];
}

const W = 200;
const H = 40;
const PAD = 3;

export function Sparkline({ points }: SparklineProps): ReactElement | null {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = PAD + i * stepX;
      const y = PAD + (1 - (p.value - min) / span) * (H - PAD * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      className="tile-viz-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="presentation"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--text-secondary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
