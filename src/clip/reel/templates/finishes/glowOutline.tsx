// A bold, minimal concept finish: the title rendered as a hollow outline (text-stroke in the accent,
// transparent fill) so it reads as pure form, lit by a soft glow-pulse and a lazy orb drifting behind
// it. No card — the title sits straight on the board's dark wash, with an optional mono kicker and a
// quiet subtitle beneath.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function GlowOutlineSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // Hollow strokes turn to mush when a long title is forced huge, so the tier trades size for lines
  // as the title grows — the outline stays legible from a two-word term to a bridged quote.
  const head = fitText(title, HERO_TIERS);
  const sub = subtitle ? fitText(subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'calc(var(--ru) * 2.6)',
        padding: 'calc(var(--ru) * 2) calc(var(--rw) * 6)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the title staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.7s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`
        @keyframes glow-outline-pulse {
          0%, 100% { filter: drop-shadow(0 0 calc(var(--ru) * 2.4) var(--reel-glow)); }
          50% { filter: drop-shadow(0 0 calc(var(--ru) * 5.2) var(--reel-glow)); }
        }
      `}</style>

      {/* A soft orb loitering behind the title to give the flat outline some depth. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 'calc(var(--ru) * 6)',
          width: 'calc(var(--ru) * 34)',
          height: 'calc(var(--ru) * 34)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--reel-orb-1) 0%, transparent 68%)',
          opacity: 0.32,
          filter: 'blur(calc(var(--ru) * 2))',
          animation: 'reel-floaty 6s ease-in-out infinite',
        }}
      />

      {tag && (
        <span
          style={{
            position: 'relative',
            font: '500 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'color-mix(in oklab, var(--reel-ink) 56%, transparent)',
          }}
        >
          {tag}
        </span>
      )}

      <h2
        data-fit-tier={head.tier}
        style={{
          position: 'relative',
          margin: 0,
          fontWeight: 800,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.02em',
          color: 'transparent',
          WebkitTextStroke: 'calc(var(--ru) * 0.32) var(--reel-accent)',
          animation: 'glow-outline-pulse 3.4s ease-in-out infinite',
          ...head.style,
        }}
      >
        {title}
      </h2>

      {subtitle && sub && (
        <p
          data-fit-tier={sub.tier}
          style={{
            position: 'relative',
            maxWidth: 'calc(var(--rw) * 78)',
            margin: 0,
            fontWeight: 500,
            fontFamily: 'var(--reel-sans)',
            color: 'color-mix(in oklab, var(--reel-ink) 70%, transparent)',
            ...sub.style,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
