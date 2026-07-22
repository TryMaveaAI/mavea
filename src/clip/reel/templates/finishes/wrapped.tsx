// A year-in-review "finish" for a stat: the value slams in HUGE over a saturated accent gradient with
// confetti raining past it — the Wrapped beat that turns a single number into a celebration. No card,
// so the gradient goes full-bleed and the number owns the frame. Color is all palette vars so the wash
// recolors with the reel; the only bespoke motion is the confetti fall, scoped to a prefixed keyframe.
import type { SlideProps } from '../types';
import { fitLine, VALUE_TIERS, type Ladder } from '../fitText';

// The unit rides at 7/16 of the hero value, so it takes the stat ramp scaled to that size — a long
// unit steps down with its own length without ever outgrowing the number it annotates.
const UNIT_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (7 / 16) }));

// Hand-placed confetti seeds (left%, size in cqh, fall delay, drift sign) so the rain looks scattered
// rather than gridded; each dot falls on its own offset so the confetti never drops in unison.
const CONFETTI = [
  [8, 1.3, 0, 1],
  [21, 0.9, 0.7, -1],
  [34, 1.5, 0.3, 1],
  [47, 1, 1.1, -1],
  [59, 1.3, 0.5, 1],
  [71, 0.9, 0.1, -1],
  [83, 1.4, 0.9, 1],
  [92, 1, 0.4, -1],
  [15, 1, 1.4, 1],
  [40, 1.2, 1.8, -1],
  [66, 0.9, 1.6, 1],
  [88, 1.3, 1.2, -1],
] as const;

const CONFETTI_TINTS = ['var(--reel-orb-1)', 'rgba(255,255,255,0.9)', 'var(--reel-accent-2)'];

export function WrappedSlide({ slots }: SlideProps<'stat'>) {
  // The number is the whole beat, so it stays un-ellipsized: the tier shrinks it by length and
  // FitScale absorbs any remainder.
  const value = fitLine(slots.value + (slots.unit ?? ''), VALUE_TIERS);
  const unit = slots.unit ? fitLine(slots.unit, UNIT_TIERS) : undefined;
  return (
    <div
      className="reel-fade"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3)',
        width: 'calc(var(--rw) * 84)',
        padding: 'calc(var(--ru) * 7) calc(var(--rw) * 5)',
        borderRadius: 'calc(var(--ru) * 5)',
        textAlign: 'center',
        overflow: 'hidden',
        // The saturated full-bleed wash that makes the beat read as Wrapped.
        background: 'linear-gradient(150deg, var(--reel-accent) 0%, var(--reel-accent-2) 100%)',
        boxShadow:
          '0 calc(var(--ru) * 8) calc(var(--ru) * 18) calc(var(--ru) * -6) var(--reel-glow)',
        color: '#fff',
      }}
    >
      <style>{`@keyframes wrapped-fall{0%{transform:translateY(calc(var(--ru) * -12)) rotate(0);opacity:0}12%{opacity:1}100%{transform:translateY(calc(var(--ru) * 60)) rotate(240deg);opacity:0}}`}</style>

      {/* Confetti rains the full height behind the type, each dot on its own cadence and tint. */}
      {CONFETTI.map(([x, size, delay, drift], i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${x}%`,
            top: 0,
            width: `${size}cqh`,
            height: `${size}cqh`,
            borderRadius: i % 3 === 0 ? 'calc(var(--ru) * 0.3)' : '50%',
            background: CONFETTI_TINTS[i % CONFETTI_TINTS.length],
            marginLeft: `${drift * 1.4}cqw`,
            animation: `wrapped-fall ${3.2 + (i % 4) * 0.6}s ease-in ${delay}s infinite`,
          }}
        />
      ))}

      <span
        style={{
          font: '600 calc(var(--ru) * 2.3)/1 var(--reel-mono)',
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        You went deep on
      </span>

      {/* The hero value slams in, then settles — the celebratory pop that earns the number. */}
      <span
        data-fit-tier={value.tier}
        style={{
          position: 'relative',
          fontWeight: 800,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.03em',
          color: '#fff',
          textShadow: '0 calc(var(--ru) * 1.2) calc(var(--ru) * 3) rgba(0,0,0,0.22)',
          // forwards, not both: zero delay, so this costs nothing visible and avoids the hero number
          // staying blank if the tab was backgrounded when it mounted (a stalled `backwards` fill
          // holds opacity 0).
          animation: 'reel-pop 0.55s cubic-bezier(0.2,1.6,0.4,1) forwards',
          ...value.style,
        }}
      >
        {slots.value}
        {slots.unit && unit && (
          <span
            data-fit-tier={unit.tier}
            style={{
              fontWeight: 800,
              fontFamily: 'var(--reel-sans)',
              color: 'rgba(255,255,255,0.86)',
              ...unit.style,
            }}
          >
            {slots.unit}
          </span>
        )}
      </span>

      <span
        style={{
          maxWidth: 'calc(var(--rw) * 74)',
          font: '600 calc(var(--ru) * 3.4)/1.25 var(--reel-sans)',
          color: 'rgba(255,255,255,0.95)',
        }}
      >
        {slots.label}
      </span>

      {slots.prior && (
        <span
          style={{
            marginTop: 'calc(var(--ru) * 1.4)',
            font: '500 calc(var(--ru) * 2.6)/1.3 var(--reel-mono)',
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.78)',
          }}
        >
          {slots.prior}
        </span>
      )}
    </div>
  );
}
