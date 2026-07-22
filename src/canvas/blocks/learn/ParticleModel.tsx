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

/** A loose, roughly-circular cluster — particles close enough to touch and slip past one
 *  another, unlike the solid's fixed grid or the gas's full-area scatter. Uniform-disk sampling
 *  (sqrt on the radius draw) so particles don't bunch artificially at the centre. */
function clusterLayout(n: number, rand: () => number): Particle[] {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = SIZE * 0.32;
  return Array.from({ length: n }, () => {
    const a = rand() * 2 * Math.PI;
    const r = R * Math.sqrt(rand());
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, angle: rand() * 360 };
  });
}

/** Fully scattered across the panel — no clustering constraint, reflecting particles free to
 *  fill whatever volume they're given. */
function scatterLayout(n: number, rand: () => number): Particle[] {
  return Array.from({ length: n }, () => ({
    x: PAD + rand() * (SIZE - 2 * PAD),
    y: PAD + rand() * (SIZE - 2 * PAD),
    angle: rand() * 360,
  }));
}

/** One short mark per particle: a tiny arc in place (solid, vibrating), a short straight drift
 *  (liquid), or a longer straight trail (gas) — all rotated by the particle's own angle so a
 *  panel's marks don't all point one way. */
function motionMark(p: Particle, phase: ParticleModelPanel['phase']): { d: string } {
  if (phase === 'solid') {
    const r = 3.6;
    return { d: `M ${p.x - r} ${p.y} A ${r} ${r} 0 0 1 ${p.x + r} ${p.y}` };
  }
  const len = phase === 'gas' ? 8 : 4;
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
              <circle cx={p.x} cy={p.y} r={2.4} className="lr-pm-dot" />
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
