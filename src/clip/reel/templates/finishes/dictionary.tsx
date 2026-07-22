// A concept finish set as a print dictionary entry: a small accent part-of-speech tag, the headword in
// a big serif, a mono pronunciation line, and the definition in serif below. Left-aligned and editorial
// — no card, so the entry reads as a page torn from a lexicon. When no tag is given we render a derived
// IPA-style placeholder under the headword so the pronunciation slot is never an empty rule on the page.
import type { SlideProps } from '../types';
import { fitLine, fitText, BODY_TIERS, HERO_TIERS, WORD_TIERS } from '../fitText';

/** A rough phonetic placeholder from the headword's first word — only used when the entry has no tag,
 *  so the mono line still reads like a pronunciation guide rather than sitting blank. */
function pronounce(title: string): string {
  const word = title.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return word ? `ˈ${word.replace(/[^a-z]/g, '')}` : '';
}

export function DictionarySlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  const phonetic = tag ? '' : pronounce(title);
  // A lone headword must stay whole — "epistemolo…" reads as a typo, not an entry — so single words
  // set solid on the word ramp; multi-word entries reflow like a headline. The definition reads at
  // body size, the way a lexicon subordinates it to the headword.
  const single = !/\s/.test(title.trim());
  const head = single ? fitLine(title.trim(), WORD_TIERS) : fitText(title, HERO_TIERS);
  const def = subtitle ? fitText(subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 2.4)',
        maxWidth: 'calc(var(--rw) * 84)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the entry staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      {tag && (
        <span
          style={{
            font: '600 italic calc(var(--ru) * 3)/1 var(--reel-serif)',
            letterSpacing: '0.01em',
            color: 'var(--reel-accent)',
          }}
        >
          {tag}
        </span>
      )}
      <h2
        data-fit-tier={head.tier}
        style={{
          margin: 0,
          fontWeight: 700,
          fontFamily: 'var(--reel-serif)',
          letterSpacing: '-0.01em',
          color: 'var(--reel-ink)',
          ...head.style,
        }}
      >
        {title}
        <span
          style={{
            // A hanging superscript "1" gives the headword its dictionary-sense marker.
            font: '600 calc(var(--ru) * 3.4)/1 var(--reel-serif)',
            verticalAlign: 'super',
            marginLeft: 'calc(var(--rw) * 0.6)',
            color: 'var(--reel-accent)',
          }}
        >
          1
        </span>
      </h2>
      {phonetic && (
        <span
          style={{
            font: '500 calc(var(--ru) * 3)/1 var(--reel-mono)',
            letterSpacing: '0.02em',
            color: 'var(--reel-accent-2)',
          }}
        >
          | {phonetic} |
        </span>
      )}
      {subtitle && def && (
        <p
          data-fit-tier={def.tier}
          style={{
            margin: 0,
            fontWeight: 400,
            fontFamily: 'var(--reel-serif)',
            color: 'color-mix(in oklab, var(--reel-ink) 82%, transparent)',
            ...def.style,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
