// A concept finish staged like a theatre: a soft triangular beam of light spills from the top onto a
// glowing disc, with the term lit center-stage on the board's near-black wash. No card — the dark
// wash IS the darkened house, so the spotlit type is bright (white/glow) rather than ink, and the
// beam's opacity breathes the way a real lamp does.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function SpotlightStageSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // The spotlit term re-sets smaller as it lengthens, so a bridged quote stays lit in full under
  // the beam instead of getting cut off after two lines.
  const head = fitText(title, HERO_TIERS);
  const sub = subtitle ? fitText(subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3)',
        maxWidth: 'calc(var(--rw) * 82)',
        textAlign: 'center',
        paddingTop: 'calc(var(--ru) * 6)',
      }}
    >
      <style>{`
        @keyframes spotstage-beam {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.78; }
        }
        @keyframes spotstage-rise {
          from { opacity: 0; transform: translateY(calc(var(--ru) * 2.4)); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* The beam: a blurred CSS triangle widening downward from a point above the disc. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 'calc(var(--ru) * -9)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: 'calc(var(--rw) * 26) solid transparent',
          borderRight: 'calc(var(--rw) * 26) solid transparent',
          borderBottom: 'calc(var(--ru) * 48) solid var(--reel-glow)',
          filter: 'blur(calc(var(--ru) * 4))',
          opacity: 0.6,
          animation: 'spotstage-beam 4.5s ease-in-out infinite',
          zIndex: 0,
        }}
      />

      {/* The pooled light the term stands in. */}
      <span
        aria-hidden="true"
        style={{
          width: 'calc(var(--ru) * 17)',
          height: 'calc(var(--ru) * 17)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.92) 0%, var(--reel-accent) 44%, transparent 72%)',
          boxShadow: '0 0 calc(var(--ru) * 9) var(--reel-glow)',
          animation: 'reel-floaty 5.5s ease-in-out infinite',
          zIndex: 1,
        }}
      />

      <span
        style={{
          font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
          letterSpacing: '0.42em',
          textTransform: 'uppercase',
          color: 'var(--reel-accent-2)',
          zIndex: 1,
          animation: 'spotstage-rise 0.6s cubic-bezier(0.2,0.7,0.3,1) 0.1s both',
        }}
      >
        {tag || 'Presenting'}
      </span>

      <h2
        data-fit-tier={head.tier}
        style={{
          margin: 0,
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.02em',
          color: 'rgba(255,255,255,0.96)',
          textShadow:
            '0 0 calc(var(--ru) * 2) var(--reel-glow), 0 0 calc(var(--ru) * 5) var(--reel-glow)',
          zIndex: 1,
          animation: 'spotstage-rise 0.7s cubic-bezier(0.2,0.7,0.3,1) 0.22s both',
          ...head.style,
        }}
      >
        {title}
      </h2>

      {subtitle && sub && (
        <p
          data-fit-tier={sub.tier}
          style={{
            margin: 0,
            fontWeight: 500,
            fontFamily: 'var(--reel-sans)',
            color: 'rgba(255,255,255,0.66)',
            zIndex: 1,
            animation: 'spotstage-rise 0.7s cubic-bezier(0.2,0.7,0.3,1) 0.34s both',
            ...sub.style,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
