// A hype "countdown" finish for a stat: the value reads as a giant timer that pulses with glow, with
// any colon separator blinking like a real clock, and a thin bar draining beneath it — the tense beat
// right before a recap drops. Color is all palette vars; the bespoke pulse + blink are scoped to
// uniquely-prefixed keyframes so they never collide with the shared set.
import type { SlideProps } from '../types';
import { fitLine, VALUE_TIERS, type Ladder } from '../fitText';

// A countdown earns extra size, so the timer runs at 19/16 of the shared stat ramp (the unit at
// 8/16) — a long value steps down the same ladder instead of blowing past the stage. 19 is the
// most a four-digit timer can carry without its glyphs grazing the card edge.
const TIMER_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (19 / 16) }));
const UNIT_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (8 / 16) }));

export function CountdownSlide({ slots }: SlideProps<'stat'>) {
  // Split on the colon so the separator can blink independently, the way a clock's punctuation does.
  const parts = slots.value.includes(':') ? slots.value.split(/(:)/) : null;
  const value = fitLine(slots.value + (slots.unit ?? ''), TIMER_TIERS);
  const unit = slots.unit ? fitLine(slots.unit, UNIT_TIERS) : undefined;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3.4)',
        maxWidth: 'calc(var(--rw) * 86)',
        textAlign: 'center',
      }}
    >
      <style>{`
        @keyframes countdown-glow {
          0%, 100% { text-shadow: 0 0 calc(var(--ru) * 2) var(--reel-glow), 0 0 calc(var(--ru) * 5) var(--reel-glow); opacity: 1; }
          50% { text-shadow: 0 0 calc(var(--ru) * 3.2) var(--reel-glow), 0 0 calc(var(--ru) * 9) var(--reel-glow); opacity: 0.92; }
        }
        @keyframes countdown-tick {
          0%, 46%, 100% { opacity: 1; }
          50%, 96% { opacity: 0.12; }
        }
      `}</style>

      <span
        style={{
          font: '600 calc(var(--ru) * 2.4)/1 var(--reel-mono)',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'var(--reel-accent-2)',
          // forwards, not both: zero delay, so this costs nothing visible and avoids the eyebrow
          // staying blank if the tab was backgrounded when it mounted (a stalled `backwards` fill
          // holds opacity 0).
          animation: 'reel-fade-up 0.5s cubic-bezier(0.2,0.7,0.3,1) forwards',
        }}
      >
        Your recap in
      </span>

      {/* The timer itself: oversized, tabular figures so the digits hold their lane while it pulses. */}
      <div
        data-fit-tier={value.tier}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'calc(var(--rw) * 0.4)',
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          color: 'var(--reel-accent)',
          animation:
            'reel-pop 0.55s cubic-bezier(0.2,0.7,0.3,1) both, countdown-glow 1.4s ease-in-out 0.55s infinite',
          ...value.style,
        }}
      >
        {parts
          ? parts.map((p, i) =>
              p === ':' ? (
                <span key={i} style={{ animation: 'countdown-tick 1s step-end infinite' }}>
                  :
                </span>
              ) : (
                <span key={i}>{p}</span>
              ),
            )
          : slots.value}
        {slots.unit && unit && (
          <span
            data-fit-tier={unit.tier}
            style={{
              fontWeight: 700,
              fontFamily: 'var(--reel-sans)',
              color: 'var(--reel-accent-2)',
              ...unit.style,
            }}
          >
            {slots.unit}
          </span>
        )}
      </div>

      {/* The drain bar: a thin meter sweeping across to read as time running out. */}
      <div
        style={{
          width: 'calc(var(--rw) * 64)',
          height: 'calc(var(--ru) * 1.4)',
          borderRadius: 999,
          background: 'color-mix(in oklab, var(--reel-ink) 14%, transparent)',
          overflow: 'hidden',
        }}
      >
        <i
          style={{
            display: 'block',
            height: '100%',
            width: '100%',
            borderRadius: 'inherit',
            background: 'linear-gradient(90deg, var(--reel-accent), var(--reel-accent-2))',
            transformOrigin: 'left',
            animation: 'reel-grow-x 1.1s cubic-bezier(0.3,0.7,0.3,1) 0.3s both',
          }}
        />
      </div>

      <span
        style={{
          maxWidth: 'calc(var(--rw) * 82)',
          font: '600 calc(var(--ru) * 3)/1.3 var(--reel-sans)',
          color: 'var(--reel-ink)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) 0.18s both',
        }}
      >
        {slots.label}
      </span>
    </div>
  );
}
