// A glossy editorial "concept" finish, built like a magazine cover: a mono masthead row (the tag
// reads as the publication / issue line) over a hairline rule, the floaty brand jelly as the hero
// image, then a big serif headline and a subhead below it. No card — the page IS the cover. Only
// the masthead's hairline gets a bespoke draw so it ticks in like a printed rule.
import type { SlideProps } from '../types';
import { ReelJelly } from '../../ReelJelly';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function MagazineSlide({ slots }: SlideProps<'concept'>) {
  // Cover lines run from two words to a bridged full quote — the tier keeps the serif display
  // large for short lines and steps it down (more, tighter lines) instead of wrapping a tall tower.
  const head = fitText(slots.title, HERO_TIERS);
  const sub = slots.subtitle ? fitText(slots.subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 84)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 3.2)',
        // No card, no rounded corners here (the page IS the cover) — overflow:hidden had nothing
        // of its own to clip. Leaving it set only cost real height: a flex column's own auto-height
        // doesn't reliably roll a `-webkit-line-clamp` child's true rendered extent into its total
        // the way it does an ordinary child, so this wrapper could end up shorter than its own
        // (correctly self-clamping) headline+subhead need and hard-clip the last line before the
        // clamp's own ellipsis ever got a chance to fire.
      }}
    >
      <style>{`
        /* The masthead rule draws across like setting a printed dateline. */
        @keyframes mag-rule { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>

      {/* Masthead: publication / issue line, all-caps mono, justified against the issue word. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'calc(var(--rw) * 3)',
          font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--reel-accent)',
          // forwards, not both: zero delay, so this costs nothing visible and avoids the masthead
          // staying blank if the tab was backgrounded when it mounted (a stalled `backwards` fill
          // holds opacity 0).
          animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
        }}
      >
        <span style={{ minWidth: 0 }}>{slots.tag || 'The Mavéa'}</span>
        <span
          style={{ flexShrink: 0, color: 'color-mix(in oklab, var(--reel-ink) 50%, transparent)' }}
        >
          Issue 01
        </span>
      </div>
      <span
        aria-hidden="true"
        style={{
          height: 'calc(var(--ru) * 0.3)',
          borderRadius: 999,
          background: 'color-mix(in oklab, var(--reel-ink) 32%, transparent)',
          transformOrigin: 'left',
          animation: 'mag-rule 0.7s cubic-bezier(0.3,0.7,0.3,1) 0.15s both',
        }}
      />

      {/* Hero "cover image": the brand jelly, floating front and center. */}
      <div style={{ alignSelf: 'center', margin: 'calc(var(--ru) * 1.6) 0' }}>
        <ReelJelly size="sm" />
      </div>

      {/* Cover line: the big serif headline. */}
      <h2
        data-fit-tier={head.tier}
        style={{
          margin: 0,
          fontWeight: 700,
          fontFamily: 'var(--reel-serif)',
          letterSpacing: '-0.01em',
          color: 'var(--reel-ink)',
          animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) 0.3s both',
          ...head.style,
        }}
      >
        {slots.title}
      </h2>

      {slots.subtitle && sub && (
        <p
          data-fit-tier={sub.tier}
          style={{
            margin: 0,
            fontWeight: 500,
            fontFamily: 'var(--reel-sans)',
            color: 'color-mix(in oklab, var(--reel-ink) 66%, transparent)',
            animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) 0.45s both',
            ...sub.style,
          }}
        >
          {slots.subtitle}
        </p>
      )}
    </div>
  );
}
