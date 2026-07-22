// A glassmorphism "concept" finish: a frosted card floats over a slowly shifting mesh of palette
// colors with two blurred orbs drifting behind it. The mesh is an oversized multi-stop gradient whose
// background-position animates, so the colors breathe without re-painting; the card's translucency +
// blur let that motion glow through the glass. The card is the focus, the mesh is atmosphere.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function AuroraGlassSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // The frosted pane is fixed-width, so both text slots pick their tier by length — a bridged quote
  // takes more, smaller lines instead of getting cut mid-sentence by a hard clamp.
  const head = fitText(title, HERO_TIERS, 68);
  const sub = subtitle ? fitText(subtitle, BODY_TIERS, 68) : undefined;
  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 86)',
        padding: 'calc(var(--ru) * 8) 0',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        borderRadius: 'calc(var(--ru) * 5)',
      }}
    >
      <style>{`
        @keyframes auroraglass-mesh {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes auroraglass-orb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(calc(var(--rw) * 6), calc(var(--ru) * -4)) scale(1.18); }
        }
        @keyframes auroraglass-orb-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(calc(var(--rw) * -5), calc(var(--ru) * 5)) scale(0.86); }
        }
      `}</style>

      {/* The breathing mesh: an oversized gradient whose position drifts, so the wash never sits still. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(120deg, var(--reel-orb-2), var(--reel-accent), var(--reel-accent-2), var(--reel-orb-1), var(--reel-accent))',
          backgroundSize: '240% 240%',
          animation: 'auroraglass-mesh 14s ease-in-out infinite',
          opacity: 0.92,
          zIndex: 0,
        }}
      />
      {/* Two blurred orbs drift behind the glass, catching the eye through the frost. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 'calc(var(--ru) * -6)',
          left: 'calc(var(--rw) * -4)',
          width: 'calc(var(--ru) * 40)',
          height: 'calc(var(--ru) * 40)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--reel-orb-1) 0%, transparent 68%)',
          filter: 'blur(calc(var(--ru) * 2.4))',
          animation: 'auroraglass-orb 11s ease-in-out infinite',
          zIndex: 1,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 'calc(var(--ru) * -8)',
          right: 'calc(var(--rw) * -6)',
          width: 'calc(var(--ru) * 44)',
          height: 'calc(var(--ru) * 44)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--reel-accent-2) 0%, transparent 70%)',
          filter: 'blur(calc(var(--ru) * 2.8))',
          animation: 'auroraglass-orb-2 13s ease-in-out infinite',
          zIndex: 1,
        }}
      />

      {/* The frosted card — the focus — riding above the mesh on its own fade-up. */}
      <div
        className="reel-fade"
        style={{
          position: 'relative',
          zIndex: 2,
          width: 'calc(var(--rw) * 74)',
          padding: 'calc(var(--ru) * 6) calc(var(--rw) * 6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'calc(var(--ru) * 2.8)',
          textAlign: 'center',
          borderRadius: 'calc(var(--ru) * 4)',
          background: 'rgba(255, 255, 255, 0.16)',
          border: '1px solid rgba(255, 255, 255, 0.42)',
          boxShadow:
            '0 calc(var(--ru) * 6) calc(var(--ru) * 16) calc(var(--ru) * -6) rgba(20, 16, 44, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        {tag && (
          <span
            style={{
              font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#fff',
              textShadow: '0 calc(var(--ru) * 0.2) calc(var(--ru) * 1.2) rgba(20, 16, 44, 0.45)',
            }}
          >
            {tag}
          </span>
        )}
        <h2
          data-fit-tier={head.tier}
          style={{
            margin: 0,
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.02em',
            color: '#fff',
            textShadow: '0 calc(var(--ru) * 0.3) calc(var(--ru) * 2) rgba(20, 16, 44, 0.5)',
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
              maxWidth: 'calc(var(--rw) * 62)',
              fontWeight: 500,
              fontFamily: 'var(--reel-sans)',
              color: 'rgba(255, 255, 255, 0.86)',
              textShadow: '0 calc(var(--ru) * 0.2) calc(var(--ru) * 1.4) rgba(20, 16, 44, 0.4)',
              ...sub.style,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
