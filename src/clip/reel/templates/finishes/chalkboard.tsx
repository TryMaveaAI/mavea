// A concept finish set as a classroom chalkboard: the title in casual chalk-white lettering with a
// hand-drawn underline that sweeps in, a small chalk doodle sketched alongside, and the subtitle as a
// fainter chalk line below. The slate green, the wood frame and the two chalk tones are an intrinsic,
// non-palette identity (a real blackboard isn't tinted by the reel), so they live in a scoped <style>;
// only the soft drop shadow leans on the board's wash. The faint dotted texture is chalk dust the
// eraser never quite clears. The squeak keyframe gives the title a tiny settle, the way chalk catches.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function ChalkboardSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // A short chalk title shares the slate with the lightbulb doodle; a long one takes the full board
  // width instead — a teacher erases the sketch before writing a whole sentence. The measure below
  // is the slate's writing width WITHOUT the doodle, so the tier is picked for that full-width case.
  const head = fitText(title, HERO_TIERS, 56);
  const doodle = head.tier <= 1;
  const sub = subtitle ? fitText(subtitle, BODY_TIERS, 56) : undefined;
  return (
    <div
      style={{
        // The wood-ish frame: a warm border around the slate, lifted off the wash by a soft drop.
        background: 'var(--chalk-frame)',
        padding: 'calc(var(--ru) * 2.4)',
        borderRadius: 'calc(var(--ru) * 1.6)',
        boxShadow:
          '0 calc(var(--ru) * 7) calc(var(--ru) * 16) calc(var(--ru) * -6) rgba(20, 16, 44, 0.55)',
        width: 'calc(var(--rw) * 74)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the board staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-pop 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`
        .reel[data-palette] {
          --chalk-slate: #25372e;
          --chalk-frame: linear-gradient(160deg, #8a5a32 0%, #6f4424 52%, #855531 100%);
          --chalk-white: #f4f1e6;
          --chalk-yellow: #f2d36b;
        }
        @keyframes chalk-squeak {
          from { opacity: 0; transform: translateY(calc(var(--ru) * 1.4)) rotate(-0.4deg); }
          60% { transform: translateY(0) rotate(0.3deg); }
          to { opacity: 1; transform: translateY(0) rotate(0deg); }
        }
      `}</style>

      {/* The slate itself: deep green, a soft inner vignette, and faint dotted chalk dust. */}
      <div
        style={{
          position: 'relative',
          borderRadius: 'calc(var(--ru) * 0.8)',
          padding: 'calc(var(--ru) * 5) calc(var(--rw) * 4.6)',
          background:
            'radial-gradient(120% 100% at 30% 12%, color-mix(in oklab, var(--chalk-slate) 86%, #fff 14%) 0%, var(--chalk-slate) 60%), radial-gradient(rgba(244, 241, 230, 0.07) 1px, transparent 1.4px) 0 0 / calc(var(--ru) * 2.4) calc(var(--ru) * 2.4)',
          boxShadow: 'inset 0 0 calc(var(--ru) * 5) rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
        }}
      >
        {tag && (
          <span
            style={{
              font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--chalk-yellow)',
              opacity: 0.92,
            }}
          >
            {tag}
          </span>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'calc(var(--rw) * 3)',
            marginTop: tag ? 'calc(var(--ru) * 2.4)' : 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              data-fit-tier={head.tier}
              style={{
                margin: 0,
                // A casual hand: an italic serif in chalk-white with a soft chalk smudge for body.
                fontStyle: 'italic',
                fontWeight: 700,
                fontFamily: 'var(--reel-serif)',
                letterSpacing: '0.01em',
                color: 'var(--chalk-white)',
                textShadow: '0 0 calc(var(--ru) * 0.5) rgba(244, 241, 230, 0.35)',
                animation: 'chalk-squeak 0.7s cubic-bezier(0.2,0.7,0.3,1) 0.1s both',
                ...head.style,
              }}
            >
              {title}
            </h2>
            {/* A hand-drawn chalk underline that sweeps in under the headword. */}
            <svg
              viewBox="0 0 200 14"
              preserveAspectRatio="none"
              style={{
                width: '64%',
                height: 'calc(var(--ru) * 2.4)',
                marginTop: 'calc(var(--ru) * 1.2)',
                display: 'block',
              }}
            >
              <path
                d="M3 9 C 48 3, 96 12, 142 6 S 192 9, 197 5"
                fill="none"
                stroke="var(--chalk-yellow)"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                style={{ ['--len' as string]: 1, animation: 'reel-draw 0.9s ease-out 0.5s both' }}
              />
            </svg>
          </div>

          {/* A tiny chalk doodle — a lightbulb idea — drawn in as the teacher would sketch it. */}
          {doodle && (
            <svg
              viewBox="0 0 48 60"
              style={{
                width: 'calc(var(--ru) * 13)',
                flexShrink: 0,
                marginTop: 'calc(var(--ru) * 0.6)',
              }}
            >
              <g
                fill="none"
                stroke="var(--chalk-white)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                style={{ ['--len' as string]: 1, animation: 'reel-draw 1.1s ease-out 0.6s both' }}
              >
                <path d="M24 6 C 12 6, 6 16, 12 28 C 15 34, 18 36, 18 42 L 30 42 C 30 36, 33 34, 36 28 C 42 16, 36 6, 24 6 Z" />
                <path d="M19 47 L 29 47 M20 52 L 28 52" />
                <path d="M24 42 L 24 30 M19 33 L 24 36 L 29 33" stroke="var(--chalk-yellow)" />
              </g>
            </svg>
          )}
        </div>

        {subtitle && sub && (
          <p
            data-fit-tier={sub.tier}
            style={{
              margin: 'calc(var(--ru) * 3) 0 0',
              fontWeight: 500,
              fontFamily: 'var(--reel-serif)',
              color: 'color-mix(in oklab, var(--chalk-white) 70%, transparent)',
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
