// A "concept" finish that frames the term as something glimpsed in deep space: a scatter of twinkling
// stars, a floating orb haloed by an orbit ring, and the title set big underneath with a mono tag.
// No card — the term floats on the reel's own dark wash, which is what makes it read as cosmic.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

// Hand-placed star coordinates (left%, top%) so the field looks scattered rather than gridded; each
// twinkles on its own offset so the sky never pulses in unison.
const STARS = [
  [12, 9],
  [27, 18],
  [48, 6],
  [68, 14],
  [84, 11],
  [91, 26],
  [8, 31],
  [33, 38],
  [58, 33],
  [78, 42],
  [16, 52],
  [44, 88],
  [72, 80],
  [88, 64],
  [6, 72],
  [24, 82],
  [54, 94],
  [62, 58],
  [38, 66],
  [82, 90],
] as const;

export function CosmicSlide({ slots }: SlideProps<'concept'>) {
  // The term under the starfield can be a bridged sentence — the tier re-sets it smaller across
  // more lines so it never dwarfs the orb it's meant to caption.
  const head = fitText(slots.title, HERO_TIERS);
  const sub = slots.subtitle ? fitText(slots.subtitle, BODY_TIERS) : undefined;
  return (
    <div
      className="reel-fade"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 4)',
        width: 'calc(var(--rw) * 84)',
        textAlign: 'center',
      }}
    >
      <style>{`
        @keyframes cosmic-tw { 0%,100% { opacity: 0.2; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes cosmic-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* The starfield + orbiting orb live in one square so the stars frame the orb. */}
      <div
        style={{
          position: 'relative',
          width: 'calc(var(--ru) * 44)',
          height: 'calc(var(--ru) * 44)',
        }}
      >
        {STARS.map(([x, y], i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: i % 4 === 0 ? 'calc(var(--ru) * 1)' : 'calc(var(--ru) * 0.6)',
              height: i % 4 === 0 ? 'calc(var(--ru) * 1)' : 'calc(var(--ru) * 0.6)',
              borderRadius: '50%',
              background: 'var(--reel-ink)',
              boxShadow: '0 0 calc(var(--ru) * 1.4) var(--reel-glow)',
              animation: `cosmic-tw ${2.4 + (i % 5) * 0.5}s ease-in-out ${(i % 7) * 0.3}s infinite`,
            }}
          />
        ))}

        {/* The orbit ring, tilted and slowly turning, with a bright "moon" riding its edge. */}
        <div
          style={{
            position: 'absolute',
            inset: '9%',
            borderRadius: '50%',
            border: '1px solid color-mix(in oklab, var(--reel-ink) 38%, transparent)',
            transform: 'rotateX(64deg)',
            animation: 'cosmic-spin 16s linear infinite',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 'calc(var(--ru) * -0.9)',
              left: '50%',
              width: 'calc(var(--ru) * 1.8)',
              height: 'calc(var(--ru) * 1.8)',
              marginLeft: 'calc(var(--ru) * -0.9)',
              borderRadius: '50%',
              background: 'var(--reel-accent-2)',
              boxShadow: '0 0 calc(var(--ru) * 2) var(--reel-accent-2)',
            }}
          />
        </div>

        {/* The central orb, floating, glowing in the palette's orb colors. */}
        <div
          style={{
            position: 'absolute',
            inset: '30%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.95) 0%, var(--reel-orb-1) 46%, var(--reel-orb-2) 92%)',
            boxShadow: '0 0 calc(var(--ru) * 6) var(--reel-glow)',
            animation: 'reel-floaty 5.5s ease-in-out infinite',
          }}
        />
      </div>

      {slots.tag && (
        <span
          style={{
            font: '500 calc(var(--ru) * 2.4)/1 var(--reel-mono)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--reel-accent)',
          }}
        >
          {slots.tag}
        </span>
      )}

      <h2
        data-fit-tier={head.tier}
        style={{
          margin: 0,
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.02em',
          color: 'var(--reel-ink)',
          ...head.style,
        }}
      >
        {slots.title}
      </h2>

      {slots.subtitle && sub && (
        <p
          data-fit-tier={sub.tier}
          style={{
            margin: 0,
            fontWeight: 500,
            fontFamily: 'var(--reel-mono)',
            color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)',
            ...sub.style,
          }}
        >
          {slots.subtitle}
        </p>
      )}
    </div>
  );
}
