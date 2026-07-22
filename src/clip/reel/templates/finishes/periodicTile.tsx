// A "concept" finish that frames the term as a periodic-element tile: a centered rounded square with
// the tag riding the top-left like an atomic number, a big two-letter "symbol" struck from the title,
// the full title beneath, and the subtitle as a tiny mono descriptor below the rule. The tile settles
// in with a soft lift; an inner sheen drifts so the surface reads like coated card stock. Everything
// recolors from the palette — only motion is local.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS, BODY_TIERS } from '../fitText';

// The element "symbol": first letter capitalized + the next letter lowercased, mimicking real tiles
// (Fe, Na, He). Falls back to a single capital for one-word/one-letter titles.
function symbolOf(title: string): string {
  const word = title.trim().replace(/[^A-Za-z]/g, '');
  if (!word) return title.trim().slice(0, 2) || '—';
  return (word[0] + (word[1] ?? '')).replace(
    /^(.)(.*)$/,
    (_, a, b) => a.toUpperCase() + b.toLowerCase(),
  );
}

export function PeriodicTileSlide({ slots }: SlideProps<'concept'>) {
  // The name and descriptor pick their tier by the tile's writing width (62ru ≈ 93rw inside the
  // padding) and clamp; the big symbol cedes its space as they lengthen, so the square yields to
  // the text instead of silently crushing it.
  const head = fitText(slots.title, TITLE_TIERS, 93);
  const sub = slots.subtitle ? fitText(slots.subtitle, BODY_TIERS, 93) : undefined;
  const symbolRu = head.tier <= 1 && (!sub || sub.tier === 0) ? 26 : head.tier <= 2 ? 18 : 13;
  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--ru) * 62)',
        aspectRatio: '1 / 1',
        padding: 'calc(var(--ru) * 4.4) calc(var(--ru) * 4.4) calc(var(--ru) * 4)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'calc(var(--ru) * 5)',
        border: '2px solid var(--reel-accent)',
        background: 'color-mix(in oklab, var(--reel-ink) 5%, transparent)',
        boxShadow:
          '0 calc(var(--ru) * 5) calc(var(--ru) * 13) calc(var(--ru) * -5) var(--reel-glow), inset 0 0 calc(var(--ru) * 6) color-mix(in oklab, var(--reel-accent) 16%, transparent)',
        overflow: 'hidden',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the tile staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'tile-settle 0.7s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`
        @keyframes tile-settle {
          from { opacity: 0; transform: translateY(calc(var(--ru) * 3)) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tile-sheen {
          0%, 100% { transform: translate(-12%, -8%); opacity: 0.45; }
          50% { transform: translate(12%, 8%); opacity: 0.8; }
        }
      `}</style>

      {/* A drifting highlight gives the coated-tile glint without competing with the type. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '-30%',
          background:
            'radial-gradient(40% 32% at 32% 26%, rgba(255,255,255,0.5) 0%, transparent 70%)',
          animation: 'tile-sheen 7s ease-in-out infinite',
          zIndex: 0,
        }}
      />

      {/* Atomic-number row: the tag sits top-left, tiny and mono, exactly like a real element tile. */}
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          font: '600 calc(var(--ru) * 3.4)/1 var(--reel-mono)',
          color: 'var(--reel-accent)',
        }}
      >
        {slots.tag || '01'}
      </span>

      {/* The big symbol — the visual anchor of the tile, stepping aside for long name/descriptor. */}
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          margin: 'auto 0 0',
          font: `800 calc(var(--ru) * ${symbolRu})/0.86 var(--reel-sans)`,
          letterSpacing: '-0.04em',
          color: 'var(--reel-ink)',
        }}
      >
        {symbolOf(slots.title)}
      </span>

      <h2
        data-fit-tier={head.tier}
        style={{
          position: 'relative',
          zIndex: 1,
          margin: 'calc(var(--ru) * 1.4) 0 0',
          // Never let the square compress the name to fit — the tile grows past square instead
          // (FitScale absorbs the stretch), which reads better than swallowed lines.
          flexShrink: 0,
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.01em',
          color: 'var(--reel-ink)',
          ...head.style,
        }}
      >
        {slots.title}
      </h2>

      {slots.subtitle && sub && (
        <span
          data-fit-tier={sub.tier}
          style={{
            position: 'relative',
            zIndex: 1,
            marginTop: 'calc(var(--ru) * 1.6)',
            paddingTop: 'calc(var(--ru) * 1.6)',
            borderTop: '1px solid color-mix(in oklab, var(--reel-ink) 16%, transparent)',
            flexShrink: 0,
            fontWeight: 500,
            fontFamily: 'var(--reel-mono)',
            letterSpacing: '0.04em',
            color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)',
            ...sub.style,
          }}
        >
          {slots.subtitle}
        </span>
      )}
    </div>
  );
}
