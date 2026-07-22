// A list finish as a TikTok kinetic marquee: a tiny mono title up top, then a stack of bold bands
// that each tilt a few degrees off-level and scroll one item endlessly across the frame. Bands
// alternate palette fills (accent → cream → orb-1 → accent-2) and scroll direction so the eye
// zig-zags down the stack. The cream band is an intrinsic paper tone (a marquee always has one warm
// stripe regardless of palette), so it lives in the scoped <style>; everything else rides the reel
// vars. Each track duplicates its text so the loop is seamless, and the two scroll keyframes are
// local + uniquely prefixed.
import type { SlideProps } from '../types';
import { fitLine, HERO_TIERS } from '../fitText';

// The fills a band cycles through. `cream` is a scoped intrinsic tone; the rest recolor with the reel.
const BANDS = [
  { fill: 'var(--reel-accent)', ink: '#fff' },
  { fill: 'var(--marq-cream)', ink: 'var(--reel-ink)' },
  { fill: 'var(--reel-orb-1)', ink: '#fff' },
  { fill: 'var(--reel-accent-2)', ink: '#fff' },
] as const;

export function MarqueeSlide({ slots }: SlideProps<'list'>) {
  const items = slots.items.slice(0, BANDS.length);
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 100)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 2.2)',
      }}
    >
      <style>{`
        .reel[data-palette] { --marq-cream: #f4ead6; }
        @keyframes marq-l { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marq-r { from { transform: translateX(-50%); } to { transform: translateX(0); } }
      `}</style>

      {slots.title && (
        <span
          style={{
            alignSelf: 'center',
            font: '600 calc(var(--ru) * 2.4)/1 var(--reel-mono)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)',
          }}
        >
          {slots.title}
        </span>
      )}

      {items.map((text, i) => {
        const band = BANDS[i % BANDS.length];
        const leftward = i % 2 === 0; // alternate scroll direction so the stack zig-zags
        // A band carries its whole item as ONE scrolling line — it must never wrap or trail off
        // (the track is intentional overflow), so fitLine steps the display size down with length
        // and the marquee simply scrolls whatever width remains.
        const f = fitLine(text, HERO_TIERS);
        return (
          <div
            key={i}
            style={{
              // Full-bleed band, tilted off-level; overflow clips the scrolling track to the stripe.
              width: 'calc(var(--rw) * 112)',
              marginLeft: 'calc(var(--rw) * -6)',
              padding: 'calc(var(--ru) * 2.4) 0',
              background: band.fill,
              transform: `rotate(${i % 2 === 0 ? -4 : -3.2}deg)`,
              boxShadow:
                '0 calc(var(--ru) * 2) calc(var(--ru) * 5) calc(var(--ru) * -2) rgba(20, 16, 44, 0.45)',
              overflow: 'hidden',
              animation: `reel-pop 0.55s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.09}s both`,
            }}
          >
            <div
              data-reel-marquee=""
              style={{
                display: 'flex',
                width: 'max-content',
                whiteSpace: 'nowrap',
                animation: `${leftward ? 'marq-l' : 'marq-r'} ${14 + i * 2}s linear infinite`,
              }}
            >
              {/* Two copies of the text → a seamless wrap when the track hits -50%. */}
              {[0, 1].map((copy) => (
                <span
                  key={copy}
                  aria-hidden={copy === 1}
                  data-fit-tier={f.tier}
                  style={{
                    paddingInline: 'calc(var(--rw) * 3)',
                    fontWeight: 800,
                    fontFamily: 'var(--reel-sans)',
                    letterSpacing: '-0.01em',
                    color: band.ink,
                    ...f.style,
                  }}
                >
                  {text}
                  <span style={{ opacity: 0.45, paddingInline: 'calc(var(--rw) * 3)' }}>✦</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
