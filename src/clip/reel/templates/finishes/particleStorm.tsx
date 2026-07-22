// A "stat" finish that frames the number as order pulled from chaos: a ring of small glowing particles
// swirls inside a slowly rotating container while a central orb breathes in and out, and the value sits
// dead-center where the swarm resolves. No card — the swarm floats on the reel's own wash, which is what
// lets the particles read as free-flying rather than penned in. Color is all palette vars; the breathing
// orb, the swarm rotation and the per-particle twinkle are bespoke motions scoped to prefixed keyframes.
import type { CSSProperties } from 'react';
import type { SlideProps } from '../types';
import { fitLine, VALUE_TIERS, type Ladder } from '../fitText';

// The value sits inside the swarm's fixed 52ru square, so it runs at 11/16 of the shared stat ramp
// (the unit at 5/16) — a long value steps down the same ladder instead of spilling past the orbit.
const EYE_VALUE_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (11 / 16) }));
const EYE_UNIT_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (5 / 16) }));

// A ring of particles, evenly spaced so the swarm reads as a deliberate orbit rather than a random
// scatter — the rotation does the "alive" work; the even spacing does the "order" work.
const COUNT = 10;
const PARTICLES = Array.from({ length: COUNT }, (_, i) => {
  const angle = (i / COUNT) * Math.PI * 2;
  // Radius leaves room for the large particles' own half-width past the ring itself — at 38 the
  // orbit's largest dots could clip the board edge for an instant mid-swirl on a narrow board.
  return { x: 50 + Math.cos(angle) * 29, y: 50 + Math.sin(angle) * 29, delay: i * 0.18 };
});

const ORB_COLORS = ['var(--reel-orb-1)', 'var(--reel-accent)', 'var(--reel-accent-2)'];

export function ParticleStormSlide({ slots }: SlideProps<'stat'>) {
  const value = fitLine(slots.value + (slots.unit ?? ''), EYE_VALUE_TIERS);
  const unit = slots.unit ? fitLine(slots.unit, EYE_UNIT_TIERS) : undefined;
  return (
    <div
      className="reel-fade"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3.4)',
        width: 'calc(var(--rw) * 84)',
        textAlign: 'center',
      }}
    >
      <style>{`
        @keyframes storm-breathe { 0%,100% { transform: scale(0.82); opacity: 0.78; } 50% { transform: scale(1.12); opacity: 1; } }
        @keyframes storm-swirl { to { transform: rotate(360deg); } }
        @keyframes storm-twinkle { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
      `}</style>

      {/* The swarm + value share one square so the particles ring the number. Sized in --ru for
          both axes (matching the ring math above, which works in one unitless percentage space) —
          on a tall, narrow board --ru runs proportionally wider than --rw, so cap it to the rw-based
          outer column's own width rather than let the square (and the ring riding it) outrun it. */}
      <div
        style={{
          position: 'relative',
          width: 'calc(var(--ru) * 52)',
          height: 'calc(var(--ru) * 52)',
          maxWidth: '100%',
        }}
      >
        {/* The rotating container: the particles ride it as one body so the whole ring orbits. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: 'storm-swirl 18s linear infinite',
          }}
        >
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: i % 3 === 0 ? 'calc(var(--ru) * 2.2)' : 'calc(var(--ru) * 1.4)',
                height: i % 3 === 0 ? 'calc(var(--ru) * 2.2)' : 'calc(var(--ru) * 1.4)',
                marginLeft: i % 3 === 0 ? 'calc(var(--ru) * -1.1)' : 'calc(var(--ru) * -0.7)',
                marginTop: i % 3 === 0 ? 'calc(var(--ru) * -1.1)' : 'calc(var(--ru) * -0.7)',
                borderRadius: '50%',
                background: ORB_COLORS[i % ORB_COLORS.length],
                boxShadow: '0 0 calc(var(--ru) * 2) var(--reel-glow)',
                animation: `storm-twinkle ${2.2 + (i % 4) * 0.5}s ease-in-out ${p.delay}s infinite`,
              }}
            />
          ))}
        </div>

        {/* The breathing orb at the eye of the storm — the calm center the swarm resolves into. */}
        <div
          style={{
            position: 'absolute',
            inset: '30%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.92) 0%, var(--reel-orb-1) 46%, var(--reel-orb-2) 92%)',
            boxShadow: '0 0 calc(var(--ru) * 7) var(--reel-glow)',
            animation: 'storm-breathe 4.5s ease-in-out infinite',
          }}
        />

        {/* The value rides above the orb, dead-center — the order that emerged from the swarm. */}
        <div style={centerStack}>
          <span
            data-fit-tier={value.tier}
            style={{
              fontWeight: 700,
              fontFamily: 'var(--reel-sans)',
              color: 'var(--reel-ink)',
              ...value.style,
            }}
          >
            {slots.value}
            {slots.unit && unit && (
              <span
                data-fit-tier={unit.tier}
                style={{
                  fontWeight: 700,
                  fontFamily: 'var(--reel-sans)',
                  color: 'var(--reel-accent)',
                  ...unit.style,
                }}
              >
                {slots.unit}
              </span>
            )}
          </span>
        </div>
      </div>

      <span
        style={{
          font: '500 calc(var(--ru) * 2.8)/1.3 var(--reel-mono)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--reel-accent)',
          maxWidth: 'calc(var(--rw) * 76)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {slots.label}
      </span>

      {slots.prior && (
        <span
          style={{
            font: '500 calc(var(--ru) * 2.6)/1.4 var(--reel-sans)',
            color: 'color-mix(in oklab, var(--reel-ink) 60%, transparent)',
          }}
        >
          {slots.prior}
        </span>
      )}
    </div>
  );
}

// The value sits in its own absolutely-centered layer so the orb's breathing scale never nudges it.
const centerStack: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
