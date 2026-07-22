// A concept finish styled as a tarot card: a double border frame (a gold-ish color-mix off accent-2),
// the tag set as the card's "numeral" at top and bottom (mirrored, the way a real card reads upside-
// down too), a glowing emblem orb ringed at the center, an elegant serif title and a small italic
// line. No glass card — the frame IS the surface, floating on the board's wash. The orb's slow pulse
// is a local keyframe so it rides the reel palette without touching the shared sheet.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS, BODY_TIERS } from '../fitText';

export function MysticCardSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // The gilt the double frame is drawn in: accent-2 warmed toward white so it reads as leaf, not ink.
  const gilt = 'color-mix(in oklab, var(--reel-accent-2) 70%, white 30%)';
  // The double frame is a fixed-width card, so the serif title steps down by length to stay inside
  // it and the italic line reflows on the body ramp.
  const head = fitText(title, TITLE_TIERS, 50);
  const sub = subtitle ? fitText(subtitle, BODY_TIERS, 50) : undefined;
  return (
    <div
      className="reel-fade"
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 70)',
        padding: 'calc(var(--ru) * 3) calc(var(--rw) * 3)',
        // The outer 2px rule and a soft gild glow; the inner 1px rule is the nested div below.
        border: `2px solid ${gilt}`,
        borderRadius: 'calc(var(--ru) * 2.2)',
        boxShadow: `0 0 calc(var(--ru) * 4) calc(var(--ru) * -1) var(--reel-glow), inset 0 0 calc(var(--ru) * 6) calc(var(--ru) * -2) ${gilt}`,
      }}
    >
      <style>{`
        @keyframes mystic-emblem {
          0%, 100% { transform: scale(1); box-shadow: 0 0 calc(var(--ru) * 5) calc(var(--ru) * 0.4) var(--reel-glow); }
          50% { transform: scale(1.045); box-shadow: 0 0 calc(var(--ru) * 8) calc(var(--ru) * 1.2) var(--reel-glow); }
        }
      `}</style>
      <div
        style={{
          border: `1px solid ${gilt}`,
          borderRadius: 'calc(var(--ru) * 1.4)',
          padding: 'calc(var(--ru) * 4) calc(var(--rw) * 5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'calc(var(--ru) * 3)',
          textAlign: 'center',
        }}
      >
        {tag && <span style={numeral}>{tag}</span>}

        {/* The emblem: a glowing orb sitting inside a thin gilt ring, breathing on a slow loop. */}
        <div
          style={{
            position: 'relative',
            width: 'calc(var(--ru) * 20)',
            height: 'calc(var(--ru) * 20)',
            flexShrink: 0,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `1px solid ${gilt}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 'calc(var(--ru) * 2.4)',
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 36% 30%, rgba(255,255,255,0.95) 0%, var(--reel-orb-1) 48%, var(--reel-orb-2) 96%)',
              animation: 'mystic-emblem 4.6s ease-in-out infinite',
            }}
          />
        </div>

        <h2
          data-fit-tier={head.tier}
          style={{
            margin: 0,
            fontWeight: 600,
            fontFamily: 'var(--reel-serif)',
            letterSpacing: '0.01em',
            color: 'var(--reel-ink)',
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
              fontStyle: 'italic',
              fontWeight: 500,
              fontFamily: 'var(--reel-serif)',
              color: 'color-mix(in oklab, var(--reel-ink) 66%, transparent)',
              ...sub.style,
            }}
          >
            {subtitle}
          </p>
        )}

        {/* The numeral mirrored at the foot, rotated like the bottom index on a playing card. */}
        {tag && (
          <span style={{ ...numeral, transform: 'rotate(180deg)' }} aria-hidden="true">
            {tag}
          </span>
        )}
      </div>
    </div>
  );
}

const numeral = {
  font: '600 calc(var(--ru) * 2.4)/1 var(--reel-mono)',
  letterSpacing: '0.34em',
  textTransform: 'uppercase' as const,
  color: 'color-mix(in oklab, var(--reel-accent-2) 80%, white 20%)',
};
