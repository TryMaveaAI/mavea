// A concept finish staged as a search engine: a rounded pill search box holds the title as the just-
// typed query with a blinking caret, an autocomplete dropdown lists a few suggestions derived from the
// subtitle, and a mono "results" line closes it off. A search panel has its own dark chrome identity
// (the near-black field, the hairline divider) that a real search box keeps regardless of theme, so
// those two neutrals live in a scoped <style>; everything that should recolor — the caret, the leading
// magnifier, the query echo and the result count — leans on palette vars. The caret reuses reel-blink;
// the rows fall in one after another via a bespoke search-drop so the list feels like it's resolving.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS } from '../fitText';

/** Build up to three autocomplete rows from the subtitle. We split on natural separators so each clause
 *  becomes its own suggestion; with nothing to split we fall back to generic completions so the dropdown
 *  always reads like a live search rather than an empty box. */
function completions(title: string, subtitle?: string): string[] {
  const head = title.trim().toLowerCase();
  const rows = (subtitle ?? '')
    .split(/[·,;|—]|\s+(?:and|or|vs\.?)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const list = rows.length
    ? rows
    : [`${head} explained`, `${head} examples`, `why ${head} matters`];
  return list.slice(0, 3);
}

export function SearchBarSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  const rows = completions(title, subtitle);
  // A query is a sentence, not a chip: it wraps on the title ramp, sized by length, so a long
  // question reads whole in the pill. The suggestion rows below stay one-line ellipsized like a
  // real dropdown.
  const query = fitText(title, TITLE_TIERS);
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 82)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the panel staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-pop 0.55s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`
        .reel[data-palette] {
          --search-field: #16181f;
          --search-row: #1d2029;
        }
        @keyframes search-drop {
          from { opacity: 0; transform: translateY(calc(var(--ru) * -1.6)); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* The search field: a dark pill with a leading magnifier, the typed query, and a live caret. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--rw) * 2.4)',
          padding: 'calc(var(--ru) * 3) calc(var(--rw) * 4)',
          borderRadius: 'calc(var(--ru) * 6)',
          background: 'var(--search-field)',
          border: '1px solid color-mix(in oklab, var(--reel-accent) 32%, transparent)',
          boxShadow:
            '0 calc(var(--ru) * 5) calc(var(--ru) * 13) calc(var(--ru) * -6) rgba(0, 0, 0, 0.55)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          style={{ width: 'calc(var(--ru) * 4.4)', flexShrink: 0 }}
          aria-hidden="true"
        >
          <g fill="none" stroke="var(--reel-accent)" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 L21 21" />
          </g>
        </svg>
        <span
          data-fit-tier={query.tier}
          style={{
            minWidth: 0,
            fontWeight: 600,
            fontFamily: 'var(--reel-sans)',
            color: 'rgba(255, 255, 255, 0.94)',
            ...query.style,
          }}
        >
          {title}
        </span>
        {/* The text cursor blinking at the end of the query, the way a fresh search sits mid-type. */}
        <i
          aria-hidden="true"
          style={{
            width: 'calc(var(--rw) * 0.4)',
            height: 'calc(var(--ru) * 4.6)',
            flexShrink: 0,
            background: 'var(--reel-accent)',
            animation: 'reel-blink 1s step-end infinite',
          }}
        />
      </div>

      {/* The autocomplete dropdown: each suggestion echoes the query in accent, then the unique clause. */}
      <div
        style={{
          marginTop: 'calc(var(--ru) * 1.4)',
          borderRadius: 'calc(var(--ru) * 3)',
          background: 'var(--search-row)',
          overflow: 'hidden',
        }}
      >
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'calc(var(--rw) * 2.4)',
              padding: 'calc(var(--ru) * 2.8) calc(var(--rw) * 4)',
              borderTop: i ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
              animation: `search-drop 0.4s cubic-bezier(0.2,0.7,0.3,1) ${0.2 + i * 0.12}s both`,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{ width: 'calc(var(--ru) * 3.4)', flexShrink: 0 }}
              aria-hidden="true"
            >
              <g fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M15.5 15.5 L21 21" />
              </g>
            </svg>
            <span
              style={{
                font: '500 calc(var(--ru) * 3.2)/1.2 var(--reel-sans)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <span style={{ color: 'var(--reel-accent)', fontWeight: 700 }}>{title} </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.78)' }}>{row}</span>
            </span>
          </div>
        ))}
      </div>

      {/* A small mono result line, the line a search lands on once the query resolves. */}
      <div
        style={{
          marginTop: 'calc(var(--ru) * 1.8)',
          paddingLeft: 'calc(var(--rw) * 1)',
          font: '500 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
          letterSpacing: '0.04em',
          color: 'color-mix(in oklab, var(--reel-ink) 56%, transparent)',
          animation: 'search-drop 0.4s cubic-bezier(0.2,0.7,0.3,1) 0.6s both',
        }}
      >
        {`${tag ? `${tag} · ` : ''}about ${rows.length} suggestions`}
      </div>
    </div>
  );
}
