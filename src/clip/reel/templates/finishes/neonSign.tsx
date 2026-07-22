// A concept finish styled as a neon tube sign: the title glows inside a rounded-rect border whose
// box-shadow is layered to read as bloom, with a faint power-flicker on the whole sign. No card —
// the sign floats on the board's dark wash, the way real neon hangs against night.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function NeonSignSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // A sign only holds so much tube: the tier re-sets a long title smaller across more lines, so the
  // glass grows with the message instead of cutting the glow off mid-word.
  const head = fitText(title, HERO_TIERS);
  const sub = subtitle ? fitText(subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3.4)',
        maxWidth: 'calc(var(--rw) * 84)',
        textAlign: 'center',
      }}
    >
      <style>{`
        @keyframes neonsign-flicker {
          0%, 100% { opacity: 1; }
          43% { opacity: 1; }
          45% { opacity: 0.62; }
          47% { opacity: 1; }
          61% { opacity: 1; }
          62% { opacity: 0.78; }
          63% { opacity: 1; }
        }
        @keyframes neonsign-on {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {tag && (
        <span
          style={{
            font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--reel-accent-2)',
          }}
        >
          {tag}
        </span>
      )}
      <div
        style={{
          padding: 'calc(var(--ru) * 4.6) calc(var(--rw) * 6)',
          borderRadius: 'calc(var(--ru) * 4)',
          border: '3px solid var(--reel-accent-2)',
          // Layered shadows fake the bloom: a tight inner halo, a soft outer wash, and an inner-glow ring.
          boxShadow: `0 0 calc(var(--ru) * 1.4) var(--reel-glow), 0 0 calc(var(--ru) * 5) var(--reel-glow),
            inset 0 0 calc(var(--ru) * 1.6) color-mix(in oklab, var(--reel-accent-2) 60%, transparent)`,
          animation:
            'neonsign-on 0.5s cubic-bezier(0.2,0.7,0.3,1) both, neonsign-flicker 5.5s ease-in-out 0.5s infinite',
        }}
      >
        <h2
          data-fit-tier={head.tier}
          style={{
            margin: 0,
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--reel-ink)',
            textShadow:
              '0 0 calc(var(--ru) * 1.2) var(--reel-glow), 0 0 calc(var(--ru) * 3) var(--reel-glow)',
            ...head.style,
          }}
        >
          {title}
        </h2>
      </div>
      {subtitle && sub && (
        <p
          data-fit-tier={sub.tier}
          style={{
            margin: 0,
            fontWeight: 500,
            fontFamily: 'var(--reel-mono)',
            letterSpacing: '0.04em',
            color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)',
            ...sub.style,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
