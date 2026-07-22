// A quote finish staged as a roadside billboard: a mono "NOW SHOWING" marquee label, then a dark inset
// panel (rounded, a thick ink-mix border) carrying the quote big, with a small "Mavéa Replay" badge in
// the corner and the attribution as a footer metric. A short support pole grounds the panel so it reads
// as out-of-home signage rather than a card. The panel rides on the reel's own dark wash for contrast,
// so its ink/border still recolor with the palette — only its lit-sign glow is bespoke motion.
import type { SlideProps } from '../types';
import { fitText, QUOTE_TIERS } from '../fitText';

export function BillboardSlide({ slots }: SlideProps<'quote'>) {
  const { quote, highlight, attribution } = slots;
  // Split once around the highlight so we can light just that phrase in the accent, like a marquee.
  const parts = highlight && quote.includes(highlight) ? quote.split(highlight) : null;
  // Sign copy re-sets by length — a short line stays huge, a full quote steps down and wraps
  // instead of stretching the panel past the frame.
  const line = fitText(quote, QUOTE_TIERS);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 'calc(var(--rw) * 86)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the panel staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`@keyframes billboard-light{0%,100%{box-shadow:0 calc(var(--ru) * 5) calc(var(--ru) * 16) calc(var(--ru) * -6) var(--reel-glow),inset 0 0 calc(var(--ru) * 8) color-mix(in oklab,var(--reel-accent) 18%,transparent)}50%{box-shadow:0 calc(var(--ru) * 5) calc(var(--ru) * 16) calc(var(--ru) * -6) var(--reel-glow),inset 0 0 calc(var(--ru) * 8) color-mix(in oklab,var(--reel-accent) 34%,transparent)}}`}</style>

      <span
        style={{
          font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
          letterSpacing: '0.26em',
          textTransform: 'uppercase',
          color: 'var(--reel-accent)',
          marginBottom: 'calc(var(--ru) * 1.8)',
        }}
      >
        ▸ Now showing
      </span>

      <div
        style={{
          position: 'relative',
          boxSizing: 'border-box',
          width: '100%',
          padding: 'calc(var(--ru) * 5.2) calc(var(--rw) * 5)',
          borderRadius: 'calc(var(--ru) * 3)',
          border: '6px solid color-mix(in oklab, var(--reel-ink) 34%, transparent)',
          background: 'color-mix(in oklab, var(--reel-ink) 90%, #000)',
          animation: 'billboard-light 4s ease-in-out infinite',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 'calc(var(--ru) * 2)',
            right: 'calc(var(--rw) * 3)',
            font: '600 calc(var(--ru) * 1.7)/1 var(--reel-mono)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'color-mix(in oklab, var(--reel-accent-2) 80%, #fff)',
          }}
        >
          ✦ Mavéa Replay
        </span>
        <p
          data-fit-tier={line.tier}
          style={{
            margin: 'calc(var(--ru) * 1.4) 0 0',
            fontWeight: 800,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.01em',
            color: 'rgba(255,255,255,0.96)',
            ...line.style,
          }}
        >
          {parts ? (
            <>
              {parts[0]}
              <span style={{ color: 'var(--reel-accent)' }}>{highlight}</span>
              {parts.slice(1).join(highlight)}
            </>
          ) : (
            quote
          )}
        </p>
        {attribution && (
          <div
            style={{
              marginTop: 'calc(var(--ru) * 3)',
              paddingTop: 'calc(var(--ru) * 2)',
              borderTop: '1px solid rgba(255,255,255,0.16)',
              font: '500 calc(var(--ru) * 2.2)/1.3 var(--reel-mono)',
              letterSpacing: '0.06em',
              color: 'rgba(255,255,255,0.62)',
            }}
          >
            {attribution}
          </div>
        )}
      </div>

      {/* The support pole + footing, so the panel reads as a billboard planted by the roadside. */}
      <i
        style={{
          width: 'calc(var(--rw) * 2.2)',
          height: 'calc(var(--ru) * 6)',
          background: 'color-mix(in oklab, var(--reel-ink) 28%, transparent)',
        }}
      />
      <i
        style={{
          width: 'calc(var(--rw) * 14)',
          height: 'calc(var(--ru) * 1)',
          borderRadius: '999px',
          background: 'color-mix(in oklab, var(--reel-ink) 28%, transparent)',
        }}
      />
    </div>
  );
}
