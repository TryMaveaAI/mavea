// A stat finish styled as a stock-ticker terminal: the label reads as a symbol, the value is the
// quote with an up-tick arrow in the accent, an inline sparkline traces the trend, and a looping
// tape repeats the symbol/quote along the bottom. The panel is its own dark surface (no light card)
// so it reads as a trading screen against any palette; the only bespoke motion is the tape scroll.
import type { SlideProps } from '../types';
import { fitLine, VALUE_TIERS, type Ladder } from '../fitText';

// The quote runs at 11/16 of the shared stat ramp (its unit at 4.4/16), so a long value steps down
// the same ladder instead of running off the panel — a quote never ellipsizes.
const QUOTE_VALUE_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (11 / 16) }));
const QUOTE_UNIT_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (4.4 / 16) }));

export function TickerSlide({ slots }: SlideProps<'stat'>) {
  const symbol = slots.label.toUpperCase().replace(/\s+/g, '').slice(0, 6) || 'MAVÉA';
  const value = fitLine(slots.value + (slots.unit ?? ''), QUOTE_VALUE_TIERS);
  const unit = slots.unit ? fitLine(slots.unit, QUOTE_UNIT_TIERS) : undefined;
  // Reuse the Spark look inline so the line can paint over the dark panel in the accent color.
  const pts =
    slots.spark && slots.spark.length >= 2 ? slots.spark : [0.2, 0.45, 0.38, 0.7, 0.62, 1];
  const w = 100;
  const h = 30;
  const lo = Math.min(...pts);
  const span = Math.max(...pts) - lo || 1;
  const line = pts
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - ((p - lo) / span) * h).toFixed(1)}`,
    )
    .join(' ');
  // The tape repeats enough copies to fill the loop with no visible seam.
  const tape = `${symbol}  ${slots.value}${slots.unit ?? ''}  ▲`;

  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 84)',
        borderRadius: 'calc(var(--ru) * 3)',
        overflow: 'hidden',
        // A near-black trading surface with a subtle accent edge, independent of the light card.
        background: 'linear-gradient(180deg, #0c1018 0%, #060a11 100%)',
        border: '1px solid color-mix(in oklab, var(--reel-accent) 40%, transparent)',
        boxShadow:
          '0 calc(var(--ru) * 6) calc(var(--ru) * 14) calc(var(--ru) * -6) rgba(0,0,0,0.7)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the panel staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`@keyframes ticker-tape{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>

      {/* Symbol header with a live "market open" dot. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--rw) * 1.6)',
          padding: 'calc(var(--ru) * 3) calc(var(--rw) * 4) 0',
        }}
      >
        <span
          className="reel-dot"
          style={{ width: 'calc(var(--ru) * 1.4)', height: 'calc(var(--ru) * 1.4)' }}
        />
        <span
          style={{
            font: '600 calc(var(--ru) * 3)/1 var(--reel-mono)',
            letterSpacing: '0.14em',
            color: '#fff',
          }}
        >
          {symbol}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            font: '500 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
            letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          {slots.prior ?? 'LIVE'}
        </span>
      </div>

      {/* The quote: value big in accent, with an up-arrow that pops in. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'calc(var(--rw) * 2)',
          padding: 'calc(var(--ru) * 1.4) calc(var(--rw) * 4) 0',
        }}
      >
        <span
          data-fit-tier={value.tier}
          style={{
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.03em',
            color: 'var(--reel-accent)',
            ...value.style,
          }}
        >
          {slots.value}
        </span>
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
        <span
          aria-hidden="true"
          style={{
            font: '700 calc(var(--ru) * 5)/1 var(--reel-sans)',
            color: 'var(--reel-accent)',
            animation: 'reel-pop 0.5s cubic-bezier(0.2,0.7,0.3,1) 0.3s both',
          }}
        >
          ▲
        </span>
      </div>

      {/* The trend, drawing itself across the panel in the accent. */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{
          display: 'block',
          width: '100%',
          height: 'calc(var(--ru) * 12)',
          marginTop: 'calc(var(--ru) * 1.6)',
        }}
      >
        <path
          d={line}
          fill="none"
          stroke="var(--reel-accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ ['--len' as string]: 1, animation: 'reel-draw 1.3s ease-out 0.2s both' }}
        />
      </svg>

      {/* The scrolling tape: two identical halves so the -50% loop is seamless. The track is far wider
          than the panel by design, so it opts out of FitScale (it must not force the slide to shrink). */}
      <div
        data-reel-marquee
        style={{
          overflow: 'hidden',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div
          data-reel-marquee=""
          style={{
            display: 'flex',
            width: 'max-content',
            animation: 'ticker-tape 9s linear infinite',
          }}
        >
          {[0, 1].map((half) => (
            <span
              key={half}
              aria-hidden={half === 1}
              style={{
                font: '600 calc(var(--ru) * 2.6)/1 var(--reel-mono)',
                letterSpacing: '0.1em',
                color: 'var(--reel-accent)',
                padding: 'calc(var(--ru) * 2) calc(var(--rw) * 3)',
                whiteSpace: 'nowrap',
              }}
            >
              {`${tape}    `.repeat(6)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
