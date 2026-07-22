// A "stat" finish that frames the number as a holographic trading card: a gold-bordered card with the
// label as the creature's name, the value riding the top-right as its "HP", a glowing gradient emblem
// orb in the middle, and a couple of stat rows derived from the unit/prior context. A holo sheen sweeps
// across the foil with a screen blend so it reads like a chase card catching the light. Everything
// recolors from the palette; only the foil sheen and the orb's slow spin are local motion.
import type { SlideProps } from '../types';
import { fitLine, fitText, TITLE_TIERS, VALUE_TIERS, type Ladder } from '../fitText';

// The card is a fixed 64ru frame, so its type rides the shared ladders scaled to the frame: the
// name at 3.6/5.4 of the title ramp, the HP value at 5.4/16 of the stat ramp — long content steps
// down instead of pushing the plate apart (and a number never wraps or ellipsizes).
const NAME_TIERS: Ladder = TITLE_TIERS.map((t) => ({ ...t, size: t.size * (3.6 / 5.4) }));
const HP_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (5.4 / 16) }));

export function TradingCardSlide({ slots }: SlideProps<'stat'>) {
  const name = fitText(slots.label, NAME_TIERS);
  const hp = fitLine(slots.value, HP_TIERS);
  // The two stat rows: the unit (what the number measures) and the prior (where it came from). Both are
  // optional, so we keep only the rows we actually have — a card with one stat still reads cleanly.
  const stats = [
    slots.unit && { tag: 'Measure', text: slots.unit },
    slots.prior && { tag: 'Before', text: slots.prior },
  ].filter(Boolean) as { tag: string; text: string }[];

  return (
    <div
      className="reel-tc"
      style={{
        position: 'relative',
        width: 'calc(var(--ru) * 64)',
        padding: 'calc(var(--ru) * 3) calc(var(--ru) * 3.4) calc(var(--ru) * 3.4)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 2.4)',
        borderRadius: 'calc(var(--ru) * 4)',
        border: '2px solid color-mix(in oklab, var(--reel-accent-2) 70%, #d8b24a)',
        background:
          'linear-gradient(160deg, color-mix(in oklab, var(--reel-accent) 14%, rgba(255,255,255,0.72)), color-mix(in oklab, var(--reel-accent-2) 10%, rgba(255,255,255,0.6)))',
        boxShadow:
          '0 calc(var(--ru) * 6) calc(var(--ru) * 14) calc(var(--ru) * -6) var(--reel-glow), inset 0 0 calc(var(--ru) * 5) color-mix(in oklab, var(--reel-accent-2) 22%, transparent)',
        overflow: 'hidden',
        // `forwards` (not `both`): the deal animation must not hold its opacity:0 "from" frame before
        // it runs — a backgrounded tab throttles rAF, and a backwards fill would leave the whole card
        // invisible until refocus. With forwards the card renders at its natural opacity until the
        // animation actually plays (and the offscreen export pass always plays it).
        animation: 'card-deal 0.7s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      {/* DARK_BLEED finish on a LIGHT foil, so the board's near-white --reel-ink would wash out the
          name/HP/stats — scope a dark ink for the card's text (the foil is light on every palette). */}
      <style>{`
        .reel-tc { --tc-ink: #1c1a3a; }
        @keyframes card-deal {
          from { opacity: 0; transform: translateY(calc(var(--ru) * 3)) rotate(-2deg) scale(0.94); }
          to { opacity: 1; transform: translateY(0) rotate(0) scale(1); }
        }
        @keyframes card-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* The foil holo: a diagonal rainbow band that sweeps across with a screen blend, so the whole
          card glints as if tilted in the light. Purely decorative, so it sits above and ignores pointers. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: 0.5,
          background:
            'linear-gradient(115deg, transparent 30%, color-mix(in oklab, var(--reel-orb-1) 60%, transparent) 45%, rgba(255,255,255,0.55) 50%, color-mix(in oklab, var(--reel-orb-2) 60%, transparent) 55%, transparent 70%)',
          backgroundSize: '220% 100%',
          animation: 'reel-sheen 4.5s ease-in-out 0.6s infinite',
          zIndex: 2,
        }}
      />

      {/* Name plate: the label names the card, the value rides top-right as "HP" — the card's headline number. */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'baseline',
          gap: 'calc(var(--rw) * 3)',
        }}
      >
        <span
          data-fit-tier={name.tier}
          style={{
            flex: 1,
            minWidth: 0,
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--tc-ink)',
            ...name.style,
          }}
        >
          {slots.label}
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'calc(var(--rw) * 0.8)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              font: '600 calc(var(--ru) * 2.4)/1 var(--reel-mono)',
              letterSpacing: '0.06em',
              color: 'color-mix(in oklab, var(--tc-ink) 56%, transparent)',
            }}
          >
            HP
          </span>
          <span
            data-fit-tier={hp.tier}
            style={{
              fontWeight: 800,
              fontFamily: 'var(--reel-sans)',
              color: 'var(--reel-accent)',
              ...hp.style,
            }}
          >
            {slots.value}
          </span>
        </span>
      </div>

      {/* The emblem: a glowing gradient orb framed like the art window on a real card, the slow spin
          giving the foil a living shimmer. */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          aspectRatio: '4 / 3',
          borderRadius: 'calc(var(--ru) * 2.4)',
          border: '1px solid color-mix(in oklab, var(--reel-accent-2) 50%, transparent)',
          background: 'color-mix(in oklab, var(--tc-ink) 8%, transparent)',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: '60%',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            background:
              'conic-gradient(from 0deg, var(--reel-orb-1), var(--reel-accent), var(--reel-accent-2), var(--reel-orb-2), var(--reel-orb-1))',
            filter: 'blur(calc(var(--ru) * 0.4))',
            boxShadow: '0 0 calc(var(--ru) * 7) calc(var(--ru) * -1) var(--reel-glow)',
            animation: 'card-spin 14s linear infinite',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: '34%',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            background:
              'radial-gradient(circle at 36% 30%, rgba(255,255,255,0.95), color-mix(in oklab, var(--reel-orb-1) 70%, transparent) 70%)',
          }}
        />
      </div>

      {/* Stat block: each ability reads tag → value, like a card's move list. */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 1.4)',
        }}
      >
        {stats.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'calc(var(--rw) * 3)',
              paddingTop: 'calc(var(--ru) * 1.4)',
              borderTop: '1px solid color-mix(in oklab, var(--tc-ink) 14%, transparent)',
              animation: `reel-rise 0.5s cubic-bezier(0.2,0.7,0.3,1) ${0.3 + i * 0.12}s both`,
            }}
          >
            <span
              style={{
                font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--reel-accent-2)',
                flexShrink: 0,
              }}
            >
              {s.tag}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'right',
                font: '600 calc(var(--ru) * 2.8)/1.25 var(--reel-sans)',
                color: 'var(--tc-ink)',
              }}
            >
              {s.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
