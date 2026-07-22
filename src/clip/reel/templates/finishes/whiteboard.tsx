// A quick whiteboard sketch for a concept: a felt-tip title over a two-arrow diagram fanning out from
// one origin, the subtitle's first words pinned as hand-labels. The paper is an intrinsic near-white and
// one marker runs red, so those few non-palette colors are scoped here; everything else recolors with
// the reel. The strokes redraw on a gentle loop so the board feels like it's still being sketched.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS } from '../fitText';

export function WhiteboardSlide({ slots }: SlideProps<'concept'>) {
  // First two words of the subtitle become the arrow labels; fall back to generic endpoints.
  const words = (slots.subtitle ?? '').split(/\s+/).filter(Boolean);
  const labelA = words[0] ?? 'this';
  const labelB = words[1] ?? words[0] ?? 'that';
  // The marker header sizes by length so a long concept wraps as a neat block above the sketch.
  const head = fitText(slots.title, TITLE_TIERS);

  return (
    <div
      className="reel-card reel-fade"
      style={{ background: '#fbfbf6', border: '1px solid rgba(28,26,58,0.1)' }}
    >
      <style>{`
        @keyframes whiteboard-draw {
          0%, 8% { stroke-dashoffset: var(--ink-len); }
          46%, 92% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: var(--ink-len); }
        }
        .whiteboard-stroke {
          stroke-dasharray: var(--ink-len);
          stroke-dashoffset: 0;
          animation: whiteboard-draw 5.4s ease-in-out var(--ink-delay, 0s) infinite both;
        }
      `}</style>

      <div
        className="reel-eyebrow"
        style={{ color: 'color-mix(in oklab, var(--reel-ink) 56%, transparent)' }}
      >
        <span>sketch</span>
      </div>

      <div
        data-fit-tier={head.tier}
        style={{
          marginTop: 'calc(var(--ru) * 2)',
          fontWeight: 600,
          fontFamily: 'var(--reel-sans)',
          color: 'var(--reel-ink)',
          // The marker title slants up like a hand-drawn header.
          transform: 'rotate(-1.4deg)',
          // forwards, not both: zero delay, so this costs nothing visible and avoids the title staying
          // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds
          // opacity 0).
          animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
          ...head.style,
        }}
      >
        {slots.title}
      </div>

      <svg
        viewBox="0 0 100 64"
        style={{
          width: '100%',
          height: 'calc(var(--ru) * 32)',
          marginTop: 'calc(var(--ru) * 2.4)',
          overflow: 'hidden',
        }}
      >
        {/* origin dot */}
        <circle cx="18" cy="50" r="2.4" fill="var(--reel-ink)" />
        {/* two arrows fanning from the origin: one accent, one scoped marker-red */}
        <g fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path
            className="whiteboard-stroke"
            style={{ ['--ink-len' as string]: 90, ['--ink-delay' as string]: '0s' }}
            d="M18,50 C40,46 56,30 80,18 M80,18 l-7,1.4 M80,18 l-3.4,6.2"
            stroke="var(--reel-accent)"
          />
          <path
            className="whiteboard-stroke"
            style={{ ['--ink-len' as string]: 70, ['--ink-delay' as string]: '0.5s' }}
            d="M18,50 C36,54 50,56 74,54 M74,54 l-6.6,-2.6 M74,54 l-5.2,4.4"
            stroke="#d9483a"
          />
        </g>
        {/* hand-labels riding each arrow's tip */}
        <text x="84" y="16" fontSize="5.2" fill="var(--reel-accent)" fontWeight="600">
          {labelA}
        </text>
        <text x="78" y="61" fontSize="5.2" fill="#d9483a" fontWeight="600">
          {labelB}
        </text>
      </svg>

      {slots.tag && (
        <div
          style={{
            marginTop: 'calc(var(--ru) * 1.4)',
            alignSelf: 'flex-start',
            padding: 'calc(var(--ru) * 0.8) calc(var(--rw) * 2.4)',
            borderRadius: 'calc(var(--ru) * 2)',
            border: '1px dashed color-mix(in oklab, var(--reel-ink) 24%, transparent)',
            font: '500 calc(var(--ru) * 2.3)/1 var(--reel-mono)',
            color: 'color-mix(in oklab, var(--reel-ink) 62%, transparent)',
            transform: 'rotate(1deg)',
          }}
        >
          {slots.tag}
        </div>
      )}
    </div>
  );
}
