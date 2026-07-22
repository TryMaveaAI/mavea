// A "recap" finish staged as a torn-off event pass. The top stub is a gradient header carrying the
// topic as the "event"; a dashed perforation (with two notch cut-outs riding the reel wash) splits it
// from the bottom stub, where the metrics read as mono ADMIT-ONE label/value rows above a faux barcode.
// The barcode's bars are deterministic from their index (stable across remixes) and a shimmer sweeps a
// bright band across them so the ticket feels freshly printed; everything recolors with the palette.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS } from '../fitText';

// A stable, varied bar width per column so the barcode looks scanned, not striped — no randomness so a
// remix re-rolls the finish, never the bars.
const bar = (i: number) => 0.6 + ((i * 37) % 5) * 0.5;

export function SessionPassSlide({ slots }: SlideProps<'recap'>) {
  const { topic, metrics } = slots;
  // The headline act reflows down the title ramp so a long topic re-sets smaller instead of
  // stretching the stub.
  const heading = fitText(topic, TITLE_TIERS);
  return (
    <div
      className="reel-pass"
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 80)',
        borderRadius: 'calc(var(--ru) * 3.4)',
        overflow: 'hidden',
        boxShadow:
          '0 calc(var(--ru) * 6) calc(var(--ru) * 14) calc(var(--ru) * -6) rgba(20,16,44,0.45)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the ticket staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      {/* This is a DARK_BLEED finish, so the board flips --reel-ink near-white — but the ticket stub
          is a near-white panel, so its tear line, labels and barcode need a DARK ink to stay legible.
          Scope a local dark ink (the finder finish uses the same pattern). */}
      <style>{`.reel-pass{--pass-ink:#1c1a3a}@keyframes pass-scan{from{transform:translateX(-120%)}to{transform:translateX(320%)}}`}</style>

      {/* Event stub: the gradient header, with the topic as the headline act. */}
      <div
        style={{
          padding: 'calc(var(--ru) * 4.4) calc(var(--rw) * 5) calc(var(--ru) * 4)',
          background: 'linear-gradient(135deg, var(--reel-accent), var(--reel-accent-2))',
          color: '#fff',
        }}
      >
        <div
          style={{
            font: '600 calc(var(--ru) * 2)/1 var(--reel-mono)',
            letterSpacing: '0.22em',
            opacity: 0.85,
          }}
        >
          MAVÉA · SESSION PASS
        </div>
        <h3
          data-fit-tier={heading.tier}
          style={{
            margin: 'calc(var(--ru) * 1.8) 0 0',
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.01em',
            ...heading.style,
          }}
        >
          {topic}
        </h3>
      </div>

      {/* Perforation: a dashed tear line flanked by two notch cut-outs that show the reel wash through.
          The card's own side margin is sized in --rw (width-relative), so the notch's horizontal
          bleed has to be too — sizing it in --ru (height-relative) instead let the bleed outrun the
          margin on a tall, narrow board (9:16), where --ru runs proportionally larger than --rw. */}
      <div style={{ position: 'relative', height: 0 }}>
        <span
          style={{
            position: 'absolute',
            top: 'calc(var(--ru) * -1.6)',
            left: 'calc(var(--rw) * -0.4)',
            width: 'calc(var(--rw) * 0.8)',
            height: 'calc(var(--ru) * 3.2)',
            borderRadius: '50%',
            background: 'var(--reel-bg)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 'calc(var(--ru) * -1.6)',
            right: 'calc(var(--rw) * -0.4)',
            width: 'calc(var(--rw) * 0.8)',
            height: 'calc(var(--ru) * 3.2)',
            borderRadius: '50%',
            background: 'var(--reel-bg)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 'calc(var(--rw) * 3)',
            right: 'calc(var(--rw) * 3)',
            borderTop: '2px dashed color-mix(in oklab, var(--pass-ink) 26%, transparent)',
          }}
        />
      </div>

      {/* Ticket stub: ADMIT-ONE metric rows over a shimmering barcode. */}
      <div
        style={{
          padding: 'calc(var(--ru) * 4) calc(var(--rw) * 5) calc(var(--ru) * 4.4)',
          background: 'rgba(255,255,255,0.72)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--ru) * 2.4)' }}>
          {metrics.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 'calc(var(--rw) * 3)',
                animation: `reel-rise 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.1}s both`,
              }}
            >
              <span
                style={{
                  font: '500 calc(var(--ru) * 2.3)/1.1 var(--reel-mono)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in oklab, var(--pass-ink) 58%, transparent)',
                }}
              >
                {m.label}
              </span>
              <span
                style={{
                  font: '700 calc(var(--ru) * 3.4)/1 var(--reel-sans)',
                  color: 'var(--reel-accent)',
                  flexShrink: 0,
                }}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 'calc(var(--rw) * 0.7)',
            height: 'calc(var(--ru) * 9)',
            marginTop: 'calc(var(--ru) * 3.4)',
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: 34 }, (_, i) => (
            <i
              key={i}
              style={{
                flex: bar(i),
                height: i % 7 === 0 ? '74%' : '100%',
                background: 'var(--pass-ink)',
                borderRadius: 'calc(var(--ru) * 0.4)',
              }}
            />
          ))}
          {/* A bright band sweeping across the bars reads as a live scan. */}
          <span
            style={{
              position: 'absolute',
              inset: '0 auto 0 0',
              width: '18%',
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
              animation: 'pass-scan 2.6s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
}
