// A gamified XP "finish" for a stat: a floaty badge ring holds the value as the level you just hit,
// and a progress bar fills toward the next one — the same celebratory beat a game uses to make a
// number feel earned. Color is all palette vars so the badge recolors with the reel; the only
// bespoke motion is the badge bob, scoped to a uniquely-prefixed keyframe.
import { Card } from '../primitives';
import type { SlideProps } from '../types';
import { fitLine, VALUE_TIERS, type Ladder } from '../fitText';

// The badge ring is a fixed 34ru circle, so the value runs at 9/16 of the shared stat ramp (the
// unit at 4/16) — a long value steps down the same ladder instead of spilling past the ring.
const BADGE_VALUE_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (9 / 16) }));
const BADGE_UNIT_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (4 / 16) }));

export function LevelUpSlide({ slots }: SlideProps<'stat'>) {
  const value = fitLine(slots.value + (slots.unit ?? ''), BADGE_VALUE_TIERS);
  const unit = slots.unit ? fitLine(slots.unit, BADGE_UNIT_TIERS) : undefined;
  return (
    <Card kicker="XP gained">
      <style>{`@keyframes levelup-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--ru) * -1.8))}}`}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'calc(var(--ru) * 3)',
          marginTop: 'calc(var(--ru) * 2)',
        }}
      >
        {/* The badge: a glowing ring whose gradient face carries the value, bobbing like a reward pop. */}
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 'calc(var(--ru) * 34)',
            height: 'calc(var(--ru) * 34)',
            borderRadius: '50%',
            padding: 'calc(var(--ru) * 1.6)',
            background:
              'conic-gradient(from 210deg, var(--reel-accent), var(--reel-accent-2), var(--reel-accent))',
            boxShadow: '0 0 calc(var(--ru) * 9) calc(var(--ru) * -1) var(--reel-glow)',
            animation:
              'reel-pop 0.6s cubic-bezier(0.2,0.7,0.3,1) both, levelup-bob 4.5s ease-in-out 0.6s infinite',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'calc(var(--ru) * 0.4)',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'var(--reel-bg)',
            }}
          >
            <span
              style={{
                font: '600 calc(var(--ru) * 2)/1 var(--reel-mono)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--reel-accent)',
              }}
            >
              Level up!
            </span>
            <span
              data-fit-tier={value.tier}
              style={{
                fontWeight: 700,
                fontFamily: 'var(--reel-sans)',
                color: 'var(--reel-ink)',
                ...value.style,
              }}
            >
              {slots.value}
              {slots.unit && unit && (
                <span
                  data-fit-tier={unit.tier}
                  style={{
                    fontWeight: 700,
                    fontFamily: 'var(--reel-sans)',
                    color: 'var(--reel-accent)',
                    ...unit.style,
                  }}
                >
                  {slots.unit}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* The next-level meter: nearly full to read as "almost there", growing in from the left. */}
        <div style={{ width: '100%' }}>
          <div
            style={{
              height: 'calc(var(--ru) * 2.2)',
              borderRadius: 999,
              background: 'color-mix(in oklab, var(--reel-ink) 10%, transparent)',
              overflow: 'hidden',
            }}
          >
            <i
              style={{
                display: 'block',
                height: '100%',
                width: '88%',
                borderRadius: 'inherit',
                background: 'linear-gradient(90deg, var(--reel-accent), var(--reel-accent-2))',
                transformOrigin: 'left',
                animation: 'reel-grow-x 1s cubic-bezier(0.3,0.7,0.3,1) 0.3s both',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 'calc(var(--rw) * 3)',
              marginTop: 'calc(var(--ru) * 1.6)',
              font: '500 calc(var(--ru) * 2.7)/1.3 var(--reel-sans)',
              color: 'var(--reel-ink)',
            }}
          >
            {/* Both sides are free text up to a real length (label 24 chars, prior 56) — neither is
                a short bounded value, so both need to shrink and ellipsize together. `overflow:
                hidden` alone lets a flex item's auto min-width collapse clean to 0; without a floor
                on each, the row would rather erase one span than let both keep a few characters. */}
            <span
              style={{
                flex: '1 1 auto',
                minWidth: 'calc(var(--rw) * 10)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {slots.label}
            </span>
            {slots.prior && (
              <span
                style={{
                  flex: '0 1 auto',
                  minWidth: 'calc(var(--rw) * 10)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'color-mix(in oklab, var(--reel-ink) 60%, transparent)',
                }}
              >
                {slots.prior}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
