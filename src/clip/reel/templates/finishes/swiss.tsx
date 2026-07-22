// A Swiss/International-style concept finish: strict left-aligned grid, generous negative space, and
// ONE giant word (the title's first word) anchoring the column. The rest of the title and the subtitle
// sit small beneath it, with tiny mono register marks top and bottom — so the type, not a card, is the
// whole design. No card shell here on purpose: the bare grid is the point.
import type { SlideProps } from '../types';
import { fitLine, fitText, TITLE_TIERS, WORD_TIERS, BODY_TIERS } from '../fitText';

export function SwissSlide({ slots }: SlideProps<'concept'>) {
  const title = slots.title.trim();
  const space = title.indexOf(' ');
  // Split off the opening word for the hero line; the remainder rides small underneath it.
  const lead = space > 0 ? title.slice(0, space) : title;
  const rest = space > 0 ? title.slice(space + 1).trim() : '';
  const register = (slots.tag || 'Concept').toUpperCase();
  // The hero word stays whole and un-ellipsized (Swiss type never trails off), so its tier is keyed
  // by the word itself; the remainder and subtitle reflow with their own ramps.
  const hero = fitLine(lead, WORD_TIERS);
  const restFit = rest ? fitText(rest, TITLE_TIERS) : undefined;
  const subFit = slots.subtitle ? fitText(slots.subtitle, BODY_TIERS, 62) : undefined;

  return (
    <div
      style={{
        width: 'calc(var(--rw) * 78)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 5)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the column staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      {/* Top register: an index mark and the tag, hairline-ruled like a print grid. */}
      <div style={mono('flex-start')}>
        <span>01 / 01</span>
        <span style={{ marginLeft: 'auto' }}>{register}</span>
      </div>
      <span aria-hidden="true" style={rule} />

      {/* The accent bar + hero word: the bar marks the column edge the giant type hangs from. */}
      <div style={{ display: 'flex', gap: 'calc(var(--rw) * 3.6)', alignItems: 'stretch' }}>
        <span
          aria-hidden="true"
          style={{
            width: 'calc(var(--rw) * 1.4)',
            flexShrink: 0,
            background: 'var(--reel-accent)',
            transformOrigin: 'top',
            animation: 'reel-grow-x 0.7s cubic-bezier(0.3,0.7,0.3,1) 0.1s both',
          }}
        />
        <div style={{ minWidth: 0 }}>
          <h2
            data-fit-tier={hero.tier}
            style={{
              margin: 0,
              // No clamp/ellipsis: the hero word stays whole (a truncated "EIGE…" reads as broken) —
              // the WORD_TIERS ramp shrinks it by length and FitScale absorbs any remainder.
              fontWeight: 800,
              fontFamily: 'var(--reel-sans)',
              letterSpacing: '-0.045em',
              textTransform: 'uppercase',
              color: 'var(--reel-ink)',
              ...hero.style,
            }}
          >
            {lead}
          </h2>
          {rest && restFit && (
            <div
              data-fit-tier={restFit.tier}
              style={{
                marginTop: 'calc(var(--ru) * 1.4)',
                fontWeight: 600,
                fontFamily: 'var(--reel-sans)',
                letterSpacing: '-0.01em',
                color: 'var(--reel-ink)',
                ...restFit.style,
              }}
            >
              {rest}
            </div>
          )}
          {slots.subtitle && subFit && (
            <p
              data-fit-tier={subFit.tier}
              style={{
                margin: 'calc(var(--ru) * 2.2) 0 0',
                maxWidth: 'calc(var(--rw) * 62)',
                fontWeight: 400,
                fontFamily: 'var(--reel-sans)',
                color: 'color-mix(in oklab, var(--reel-ink) 60%, transparent)',
                ...subFit.style,
              }}
            >
              {slots.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Bottom register closes the grid, mirroring the top rule. */}
      <span aria-hidden="true" style={rule} />
      <div style={mono('flex-end')}>
        <span>MAVÉA</span>
        <span style={{ marginLeft: 'auto' }}>↳ {register}</span>
      </div>
    </div>
  );
}

// A tiny uppercase mono register row — the recurring "label" texture of the Swiss grid.
const mono = (justify: string) => ({
  display: 'flex',
  justifyContent: justify,
  alignItems: 'center',
  font: '500 calc(var(--ru) * 1.9)/1 var(--reel-mono)',
  letterSpacing: '0.22em',
  color: 'color-mix(in oklab, var(--reel-ink) 56%, transparent)',
});

// The hairline rule that fences the grid top and bottom.
const rule = {
  height: '1px',
  background: 'color-mix(in oklab, var(--reel-ink) 22%, transparent)',
};
