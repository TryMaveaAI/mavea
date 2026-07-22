// A "quote" finish as kinetic typography: the quote splits into words that stagger-slide-and-fade
// in one by one, each sized off the HERO ladder scaled down for a flowing paragraph (honestly
// measured by length, not guessed — a short filler word runs bigger, a long one steps down, same
// idea as every other fitText call in this module), alternating weight so the line reads with
// motion, with one word lit in the accent. The LAST word's entrance animation ends at the complete,
// fully-assembled quote at rest — reduced motion (reel.css's stage-wide `.reel-stage *` override)
// collapses every stagger to near-zero duration, so it lands straight on that same at-rest frame
// with no visible staggering, exactly the contract this finish needs.
import type { SlideProps } from '../types';
import { fitLine, HERO_TIERS, BODY_TIERS, fitText, type Ladder } from '../fitText';

// Scaled down from the display-headline ladder so a whole sentence of words reads as a flowing
// paragraph instead of stacking hero-sized words into an unreadable tower.
const KINETIC_TIERS: Ladder = HERO_TIERS.map((t) => ({ ...t, size: t.size * 0.56, maxLines: 1 }));

const bareWord = (w: string): string => w.replace(/[^\w']/g, '');

/** The single word to light in the accent: the first real word of the model's own highlight (which
 *  may be a whole phrase) when one is given, else the longest word in the quote — a deterministic,
 *  non-fabricated stand-in, never a random pick. */
function pickHighlight(quote: string, highlight?: string): string {
  if (highlight) {
    const first = highlight.split(/\s+/).map(bareWord).find(Boolean);
    if (first) return first;
  }
  return quote
    .split(/\s+/)
    .map(bareWord)
    .reduce((a, b) => (b.length > a.length ? b : a), '');
}

export function KineticStackSlide({ slots }: SlideProps<'quote'>) {
  const words = slots.quote.split(/\s+/).filter(Boolean);
  const hot = pickHighlight(slots.quote, slots.highlight);
  const attribution = slots.attribution ? fitText(slots.attribution, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 88)',
        maxWidth: '92%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'baseline',
          rowGap: 'calc(var(--ru) * 0.6)',
          columnGap: 'calc(var(--rw) * 1.6)',
        }}
      >
        {words.map((w, i) => {
          const bare = bareWord(w);
          const size = fitLine(w, KINETIC_TIERS);
          const lit = bare === hot && bare.length > 0;
          return (
            <span
              key={i}
              data-fit-tier={size.tier}
              style={{
                fontWeight: i % 2 === 0 ? 700 : 800,
                fontFamily: 'var(--reel-sans)',
                letterSpacing: '-0.01em',
                color: lit ? 'var(--reel-accent)' : 'var(--reel-ink)',
                animation: `reel-pop 0.42s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.055}s both`,
                ...size.style,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>

      {slots.attribution && attribution && (
        <div
          data-fit-tier={attribution.tier}
          style={{
            fontFamily: 'var(--reel-mono)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'color-mix(in oklab, var(--reel-ink) 62%, transparent)',
            animation: `reel-fade-up 0.5s cubic-bezier(0.2,0.7,0.3,1) ${words.length * 0.055 + 0.15}s both`,
            ...attribution.style,
          }}
        >
          — {slots.attribution}
        </div>
      )}
    </div>
  );
}
