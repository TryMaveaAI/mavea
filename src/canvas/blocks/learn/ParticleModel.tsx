import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ParticleModelPanel, ParticleModelProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ParticleModelProps & { delay?: number };

const SIZE = 100;
const PAD = 14;
const MIN_PARTICLES = 4;
const MAX_PARTICLES = 40;
const DEFAULT_PARTICLES = 12;

const PHASE_LABEL: Record<ParticleModelPanel['phase'], string> = {
  solid: 'Solid',
  liquid: 'Liquid',
  gas: 'Gas',
};

// Deterministic substitute for Math.random — same seed always draws the same layout, so a panel
// never reshuffles itself between renders. Identical construction to SamplingDistribution's lcg.
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

interface Particle {
  x: number;
  y: number;
  /** Vibration-arc / drift-line / motion-trail rotation, in degrees — per-particle so the marks
   *  don't all point the same way. */
  angle: number;
}

/** A tight, regular lattice — the solid's defining feature. Any leftover particles in a
 *  non-square count simply trail off on a ragged final row, never invented into a fake full one. */
function latticeLayout(n: number, rand: () => number): Particle[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const stepX = cols > 1 ? (SIZE - 2 * PAD) / (cols - 1) : 0;
  const stepY = rows > 1 ? (SIZE - 2 * PAD) / (rows - 1) : 0;
  return Array.from({ length: n }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: cols > 1 ? PAD + col * stepX : SIZE / 2,
      y: rows > 1 ? PAD + row * stepY : SIZE / 2,
      angle: rand() * 360,
    };
  });
}

const DOT_R = 2.4;
const TRAIL = { liquid: 4, gas: 8 } as const;
/** Best-candidate tries per particle: enough that the spread reads even, cheap at 40 particles. */
const TRIES = 24;

type Point = [number, number];

/** Distance from point p to the segment a–b. */
function toSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Particles drawn from `sample`, each the candidate farthest from those already placed
 *  (Mitchell's best-candidate). Independent random draws pile particles onto one another and
 *  their trails, which reads as clumping no phase has; this spreads them evenly at any count
 *  while staying random-looking, and a fixed seed still always draws the same picture. */
function spreadLayout(
  n: number,
  rand: () => number,
  sample: () => Point,
  trail: number,
): Particle[] {
  const placed: Point[] = [];
  for (let i = 0; i < n; i++) {
    let best = sample();
    let bestD = -1;
    for (let k = 0; k < TRIES && placed.length; k++) {
      const c = k === 0 ? best : sample();
      const d = Math.min(...placed.map((q) => Math.hypot(c[0] - q[0], c[1] - q[1])));
      if (d > bestD) {
        best = c;
        bestD = d;
      }
    }
    placed.push(best);
  }
  // Each trail turns to whichever of a ring of headings stays farthest from every other
  // particle and from the tips of the trails already drawn, starting from a random heading so
  // the panel's trails don't all align.
  const ends: Point[] = [];
  return placed.map((p, i) => {
    const start = rand() * 360;
    let best = { angle: start, clear: -Infinity };
    for (let k = 0; k < 12; k++) {
      const angle = (start + k * 30) % 360;
      const rad = (angle * Math.PI) / 180;
      const end: Point = [p[0] + Math.cos(rad) * trail, p[1] + Math.sin(rad) * trail];
      const others = placed.filter((_, j) => j !== i);
      const clear = Math.min(
        ...others.map((q) => toSegment(q, p, end) - DOT_R),
        ...ends.map((e) => toSegment(e, p, end)),
      );
      if (clear > best.clear) best = { angle, clear };
    }
    const rad = (best.angle * Math.PI) / 180;
    ends.push([p[0] + Math.cos(rad) * trail, p[1] + Math.sin(rad) * trail]);
    return { x: p[0], y: p[1], angle: best.angle };
  });
}

/** A loose, roughly-circular cluster — particles close enough to touch and slip past one
 *  another, unlike the solid's fixed grid or the gas's full-area scatter. Uniform-disk sampling
 *  (sqrt on the radius draw) so the cluster has no artificial dense core. */
function clusterLayout(n: number, rand: () => number): Particle[] {
  const R = SIZE * 0.32;
  return spreadLayout(
    n,
    rand,
    () => {
      const a = rand() * 2 * Math.PI;
      const r = R * Math.sqrt(rand());
      return [SIZE / 2 + Math.cos(a) * r, SIZE / 2 + Math.sin(a) * r];
    },
    TRAIL.liquid,
  );
}

/** Fully scattered across the panel — particles free to fill whatever volume they're given. */
function scatterLayout(n: number, rand: () => number): Particle[] {
  return spreadLayout(
    n,
    rand,
    () => [PAD + rand() * (SIZE - 2 * PAD), PAD + rand() * (SIZE - 2 * PAD)],
    TRAIL.gas,
  );
}

/** One short mark per particle: a tiny arc in place (solid, vibrating), a short straight drift
 *  (liquid), or a longer straight trail (gas) — all rotated by the particle's own angle so a
 *  panel's marks don't all point one way. */
function motionMark(p: Particle, phase: ParticleModelPanel['phase']): { d: string } {
  if (phase === 'solid') {
    const r = 3.6;
    return { d: `M ${p.x - r} ${p.y} A ${r} ${r} 0 0 1 ${p.x + r} ${p.y}` };
  }
  const len = TRAIL[phase];
  const rad = (p.angle * Math.PI) / 180;
  const x2 = p.x + Math.cos(rad) * len;
  const y2 = p.y + Math.sin(rad) * len;
  return { d: `M ${p.x} ${p.y} L ${x2} ${y2}` };
}

function Panel({ panel, seed }: { panel: ParticleModelPanel; seed: number }) {
  const count = Number.isFinite(panel.particleCount)
    ? Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.floor(panel.particleCount as number)))
    : DEFAULT_PARTICLES;

  const particles = useMemo(() => {
    const rand = lcg(seed);
    if (panel.phase === 'solid') return latticeLayout(count, rand);
    if (panel.phase === 'liquid') return clusterLayout(count, rand);
    return scatterLayout(count, rand);
  }, [panel.phase, count, seed]);

  return (
    <div className="lr-pm-panel">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="lr-pm-svg" role="img" aria-hidden="true">
        {particles.map((p, i) => {
          const mark = motionMark(p, panel.phase);
          return (
            <g key={i} className={`lr-pm-mark lr-pm-mark--${panel.phase}`}>
              <path
                d={mark.d}
                className="lr-pm-motion"
                transform={panel.phase === 'solid' ? `rotate(${p.angle} ${p.x} ${p.y})` : undefined}
              />
              <circle cx={p.x} cy={p.y} r={DOT_R} className="lr-pm-dot" />
            </g>
          );
        })}
      </svg>
      <div className="lr-pm-caption">
        <span className="lr-pm-phase">{PHASE_LABEL[panel.phase]}</span>
        {panel.label && <span className="lr-pm-panel-label">{panel.label}</span>}
      </div>
    </div>
  );
}

export function ParticleModel({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  panels,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const valid = (Array.isArray(panels) ? panels : []).filter(
    (p): p is ParticleModelPanel =>
      !!p && (p.phase === 'solid' || p.phase === 'liquid' || p.phase === 'gas'),
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {valid.length === 0 ? (
        <div className="lr-pm-empty">No phase panels to draw.</div>
      ) : (
        <div className="lr-pm-panels">
          {valid.map((p, i) => (
            <Panel key={i} panel={p} seed={1000 + i * 977} />
          ))}
        </div>
      )}

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
