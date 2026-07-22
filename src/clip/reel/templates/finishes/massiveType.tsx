// A kinetic-typography "concept" finish: the title runs oversized in a clipped palette gradient with a
// sheen sweeping across it, and the subtitle is broken into words that scroll past on a marquee strip
// below. No card — the type is the whole composition. The marquee motion is a local keyframe so it
// rides the reel palette without touching the shared sheet; the sheen reuses the shared `reel-sheen`.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS } from '../fitText';

export function MassiveTypeSlide({ slots }: SlideProps<'concept'>) {
  // Split the subtitle into words for the marquee, dropping blanks. Duplicate the run so the strip
  // loops seamlessly (the track translates by exactly one copy's width).
  const words = (slots.subtitle ?? '').split(/\s+/).filter(Boolean);
  const ticker = words.length ? [...words, ...words] : [];
  // Kinetic type lives or dies by scale, so the tier only steps down as the title grows — a short
  // term stays monumental, a bridged sentence re-sets as a multi-line block instead of a word tower.
  const head = fitText(slots.title, HERO_TIERS);

  return (
    <div
      style={{
        width: 'calc(var(--rw) * 92)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 4)',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes massiveType-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>

      {slots.tag && (
        <span
          style={{
            font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'var(--reel-accent)',
            // forwards, not both: zero delay, so this costs nothing visible and avoids the tag staying
            // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds
            // opacity 0).
            animation: 'reel-fade-up 0.5s cubic-bezier(0.2,0.7,0.3,1) forwards',
          }}
        >
          {slots.tag}
        </span>
      )}

      {/* The headline: a clipped accent→orb-1→accent-2 gradient with a moving sheen highlight. The
          200%-wide background lets `reel-sheen` slide a bright band across the letters. */}
      <h2
        data-fit-tier={head.tier}
        style={{
          margin: 0,
          fontWeight: 800,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.04em',
          backgroundImage:
            'linear-gradient(100deg, var(--reel-accent) 0%, var(--reel-orb-1) 42%, var(--reel-accent-2) 84%, rgba(255,255,255,0.95) 100%)',
          backgroundSize: '200% 100%',
          backgroundPosition: '0% 50%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          animation:
            'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) both, reel-sheen 3.6s ease-in-out infinite',
          ...head.style,
        }}
      >
        {slots.title}
      </h2>

      {/* The subtitle as a single-line marquee of words sliding leftward beneath the title. The track is
          wider than the frame by design, so it opts out of FitScale — otherwise the whole finish would
          shrink to fit the off-screen strip instead of sizing to the headline. */}
      {ticker.length > 0 && (
        <div
          aria-label={slots.subtitle}
          data-reel-marquee
          style={{
            overflow: 'hidden',
            maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
            borderBlock: '1px solid color-mix(in oklab, var(--reel-ink) 12%, transparent)',
            paddingBlock: 'calc(var(--ru) * 1.8)',
          }}
        >
          <div
            data-reel-marquee=""
            style={{
              display: 'flex',
              gap: 'calc(var(--rw) * 4)',
              width: 'max-content',
              animation: 'massiveType-marquee 14s linear infinite',
            }}
          >
            {ticker.map((w, i) => (
              <span
                key={i}
                style={{
                  font: '600 calc(var(--ru) * 3.4)/1 var(--reel-sans)',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  color:
                    i % 2 === 0
                      ? 'var(--reel-ink)'
                      : 'color-mix(in oklab, var(--reel-ink) 50%, transparent)',
                }}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
