// A "recap" finish styled as a thermal receipt: a torn perforated strip of paper (a clip-path
// zigzag, so the notches stay crisp at any export size instead of relying on a gradient trick that
// has to line up against whatever sits behind it) with each metric printed as a label / dotted
// leader / value line, an accent-colored TOTAL line closing the tape out, and a CSS-only barcode
// underneath. The paper stock is an intrinsic material identity — a receipt is always pale printed
// stock, never a palette hue — so it's the one scoped var here, same as the marquee's cream band or
// the Finder window's neutrals; everything printed ON the paper still rides the reel ink/accent.
import type { SlideProps } from '../types';

// Even so both ends of the zigzag land on a flat corner (i=0 and i=TEETH), not a half-notch.
const TEETH = 14;
const NOTCH_DEPTH = 'calc(var(--ru) * 1.6)';

function tornEdge(edge: 'top' | 'bottom'): string[] {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i++) {
    const x = `${((i / TEETH) * 100).toFixed(2)}%`;
    const notch = i % 2 === 1;
    const y =
      edge === 'top'
        ? notch
          ? NOTCH_DEPTH
          : '0%'
        : notch
          ? `calc(100% - ${NOTCH_DEPTH})`
          : '100%';
    pts.push(`${x} ${y}`);
  }
  return pts;
}
// Top edge left→right, then the bottom edge reversed (right→left) — polygon() auto-closes the last
// point back to the first, which draws the straight left/right sides for free.
const TORN_CLIP = `polygon(${[...tornEdge('top'), ...tornEdge('bottom').reverse()].join(', ')})`;

export function ReceiptTapeSlide({ slots }: SlideProps<'recap'>) {
  const metrics = slots.metrics.slice(0, 4);
  return (
    <div className="reel-fade" style={{ width: 'calc(var(--rw) * 62)', maxWidth: '90%' }}>
      <style>{`.reel[data-palette] { --rt-paper: #f6f1e2; }`}</style>

      <div
        style={{
          clipPath: TORN_CLIP,
          filter: 'drop-shadow(0 calc(var(--ru) * 3) calc(var(--ru) * 6) rgba(20, 16, 44, 0.35))',
          background: 'var(--rt-paper)',
          padding: 'calc(var(--ru) * 4.2) calc(var(--rw) * 5) calc(var(--ru) * 4)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            font: '700 calc(var(--ru) * 2.6)/1.3 var(--reel-mono)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--reel-ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 'calc(var(--ru) * 2.6)',
          }}
        >
          {slots.topic}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--ru) * 1.8)' }}>
          {metrics.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'calc(var(--rw) * 1.4)',
                font: '500 calc(var(--ru) * 2.5)/1.3 var(--reel-mono)',
                color: 'var(--reel-ink)',
                animation: `reel-rise 0.4s ease-out ${i * 0.08}s both`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  maxWidth: '54%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.label}
              </span>
              <span
                aria-hidden="true"
                style={{
                  flex: 1,
                  minWidth: 'calc(var(--rw) * 2)',
                  borderBottom: '2px dotted color-mix(in oklab, var(--reel-ink) 32%, transparent)',
                  transform: 'translateY(-0.3em)',
                }}
              />
              <span
                style={{
                  flexShrink: 0,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '32%',
                }}
              >
                {m.value}
              </span>
            </div>
          ))}

          {/* The receipt's closing line — the real count of tracked lines, styled as the tape's total
              rather than a fabricated sum of unrelated metrics (nothing here is invented). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'calc(var(--rw) * 1.4)',
              marginTop: 'calc(var(--ru) * 1)',
              paddingTop: 'calc(var(--ru) * 2)',
              borderTop: '2px solid color-mix(in oklab, var(--reel-ink) 30%, transparent)',
              font: '800 calc(var(--ru) * 3.1)/1.2 var(--reel-mono)',
              color: 'var(--reel-accent)',
              animation: `reel-rise 0.4s ease-out ${metrics.length * 0.08}s both`,
            }}
          >
            <span style={{ flexShrink: 0, letterSpacing: '0.08em' }}>TOTAL</span>
            <span
              aria-hidden="true"
              style={{
                flex: 1,
                minWidth: 'calc(var(--rw) * 2)',
                borderBottom: '2px dotted color-mix(in oklab, var(--reel-accent) 40%, transparent)',
                transform: 'translateY(-0.3em)',
              }}
            />
            <span style={{ flexShrink: 0 }}>
              {metrics.length} {metrics.length === 1 ? 'ITEM' : 'ITEMS'}
            </span>
          </div>
        </div>

        {/* A deterministic CSS-only barcode: three repeating gradients at different periods layered
            together read like varying bar widths — no image, no randomness. */}
        <div
          aria-hidden="true"
          style={{
            marginTop: 'calc(var(--ru) * 3.4)',
            height: 'calc(var(--ru) * 5)',
            backgroundImage: [
              'repeating-linear-gradient(90deg, var(--reel-ink) 0 2px, transparent 2px 6px)',
              'repeating-linear-gradient(90deg, var(--reel-ink) 0 1px, transparent 1px 11px)',
              'repeating-linear-gradient(90deg, var(--reel-ink) 0 3px, transparent 3px 17px)',
            ].join(', '),
          }}
        />
        <div
          style={{
            marginTop: 'calc(var(--ru) * 1.2)',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            font: '500 calc(var(--ru) * 1.7)/1 var(--reel-mono)',
            letterSpacing: '0.18em',
            color: 'color-mix(in oklab, var(--reel-ink) 55%, transparent)',
          }}
        >
          {slots.topic.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
