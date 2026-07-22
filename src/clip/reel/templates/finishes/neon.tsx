// A cyberpunk "concept" finish: a big title splits into two palette-tinted ghosts (chromatic
// aberration), a scan line sweeps top→bottom, and a faint ink grid sits behind it all. No card — the
// title IS the surface. The glitch and scan motions are local keyframes so they ride the reel palette
// without touching the shared sheet.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function NeonSlide({ slots }: SlideProps<'concept'>) {
  // The glitch title runs from a two-word term to a bridged quote — the tier trades size for lines
  // as it grows so the type never towers one word per line behind the scan.
  const head = fitText(slots.title, HERO_TIERS);
  const sub = slots.subtitle ? fitText(slots.subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 88)',
        padding: 'calc(var(--ru) * 7) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 3)',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes neon-glitch {
          0%, 92%, 100% { transform: translate(0, 0); }
          93% { transform: translate(calc(var(--rw) * -0.5), calc(var(--ru) * 0.2)); }
          95% { transform: translate(calc(var(--rw) * 0.6), calc(var(--ru) * -0.2)); }
          97% { transform: translate(calc(var(--rw) * -0.3), 0); }
        }
        @keyframes neon-scan {
          0% { transform: translateY(calc(var(--ru) * -8)); opacity: 0; }
          10%, 90% { opacity: 1; }
          100% { transform: translateY(calc(var(--ru) * 80)); opacity: 0; }
        }
      `}</style>

      {/* Faint grid: low-opacity ink lines, so it recolors with the palette and never competes. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 'calc(var(--ru) * -10) calc(var(--rw) * -10)',
          background:
            'repeating-linear-gradient(0deg, color-mix(in oklab, var(--reel-ink) 9%, transparent) 0 1px, transparent 1px calc(var(--ru) * 6)), repeating-linear-gradient(90deg, color-mix(in oklab, var(--reel-ink) 9%, transparent) 0 1px, transparent 1px calc(var(--ru) * 6))',
          maskImage: 'radial-gradient(120% 80% at 50% 45%, #000 35%, transparent 100%)',
          zIndex: 0,
        }}
      />
      {/* The scan line sweeping down the frame. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          insetInline: 'calc(var(--rw) * -10)',
          top: 0,
          height: 'calc(var(--ru) * 0.5)',
          background: 'var(--reel-accent-2)',
          boxShadow: '0 0 calc(var(--ru) * 3) calc(var(--ru) * 0.4) var(--reel-glow)',
          animation: 'neon-scan 3.4s linear infinite',
          zIndex: 1,
        }}
      />

      {slots.tag && (
        <span
          style={{
            position: 'relative',
            zIndex: 2,
            alignSelf: 'flex-start',
            font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
            letterSpacing: '0.24em',
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
          position: 'relative',
          zIndex: 2,
          margin: 0,
          fontWeight: 800,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.03em',
          color: 'var(--reel-ink)',
          // Two offset ghosts in accent + orb-1 read as a chromatic-aberration split.
          textShadow:
            'calc(var(--rw) * 0.5) 0 0 var(--reel-accent), calc(var(--rw) * -0.5) 0 0 var(--reel-orb-1)',
          animation: 'neon-glitch 2.6s steps(1) infinite',
          ...head.style,
        }}
      >
        {slots.title}
      </h2>
      {slots.subtitle && sub && (
        <p
          data-fit-tier={sub.tier}
          style={{
            position: 'relative',
            zIndex: 2,
            margin: 0,
            maxWidth: 'calc(var(--rw) * 78)',
            fontWeight: 500,
            fontFamily: 'var(--reel-mono)',
            color: 'color-mix(in oklab, var(--reel-ink) 70%, transparent)',
            ...sub.style,
          }}
        >
          {slots.subtitle}
        </p>
      )}
    </div>
  );
}
