// Small shared building blocks every finish composes from: the card shell (a mono eyebrow), an
// animated SVG progress ring, a labeled bar, and a sparkline. Each is pure and sized in container
// units, so finishes stay short and visually consistent.
import type { ReactNode } from 'react';

/** The glass card a content finish lives in: a mono eyebrow row above the finish's content. */
export function Card({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div className="reel-card reel-fade">
      <div className="reel-eyebrow">
        <span>{kicker}</span>
      </div>
      {children}
    </div>
  );
}

/** A circular progress ring (0–100), drawn with an accent stroke that sweeps in. */
export function Ring({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: 'calc(var(--ru) * 11)', height: 'calc(var(--ru) * 11)', flexShrink: 0 }}
    >
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
        strokeDasharray={c}
        style={{
          // Animate from empty to the target sweep when the slide mounts.
          ['--len' as string]: c,
          ['--to' as string]: off,
          strokeDashoffset: off,
          animation: `reel-ring 1.1s cubic-bezier(0.3,0.7,0.3,1) ${delay}s both`,
        }}
      />
    </svg>
  );
}

/** A labeled horizontal bar that grows in from the left. */
export function Bar({
  label,
  value,
  pct,
  color,
  delay = 0,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  delay?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--ru) * 0.9)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: '600 calc(var(--ru) * 2.7)/1 var(--reel-sans)',
          color: 'var(--reel-ink)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ color }}>{value}</span>
      </div>
      <div
        style={{
          height: 'calc(var(--ru) * 1.6)',
          borderRadius: 999,
          background: 'color-mix(in oklab, var(--reel-ink) 8%, transparent)',
          overflow: 'hidden',
        }}
      >
        <i
          style={{
            display: 'block',
            height: '100%',
            width: `${Math.max(2, Math.min(100, pct))}%`,
            background: color,
            borderRadius: 'inherit',
            transformOrigin: 'left',
            animation: `reel-grow-x 0.9s cubic-bezier(0.3,0.7,0.3,1) ${delay}s both`,
          }}
        />
      </div>
    </div>
  );
}

/** A sparkline trend that draws itself in. `points` are y-values in [0,1]; the line is normalized to the box. */
export function Spark({ points, color }: { points: number[]; color: string }) {
  const pts = points.length >= 2 ? points : [0.2, 0.5, 0.4, 0.8, 1];
  const w = 100;
  const h = 36;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const path = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', height: 'calc(var(--ru) * 8)' }}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        style={{ ['--len' as string]: 1, animation: 'reel-draw 1.2s ease-out both' }}
      />
    </svg>
  );
}
