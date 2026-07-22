// A quote finish drawn as a pop-art comic panel: a warm halftone-dot field, a white speech bubble with
// a bold ink outline and an offset shadow holding the line, a spiky "burst" orb that explodes in behind
// it, and an attribution caption on a small ink-outlined tab. The comic identity — the black ink line,
// the speech-bubble white and the warm halftone dots — isn't tinted by the reel (a comic page is a comic
// page), so those few colors live in a scoped <style>; the burst star and the highlight pull from the
// palette so the explosion still recolors. The pow keyframe gives the burst a one-shot punch-in, and
// bubble-pop bakes a tiny overshoot so the speech bubble lands like a printed panel snapping into place.
import type { CSSProperties } from 'react';
import type { SlideProps } from '../types';
import { fitText, type Ladder } from '../fitText';

// The speech bubble is a far narrower measure (~62rw inside the panel) than the ~80rw column the
// shared quote ladder assumes, so the dialogue gets its own ramp keyed to the bubble: the panel
// grows with its bubble, so deeper tiers trade size for extra lines rather than cutting the line off
// mid-speech. Tier 0 is the finish's original setting, so short dialogue reads exactly as before.
const SPEECH_TIERS: Ladder = [
  { upTo: 45, size: 4.8, line: 1.22, maxLines: 4 },
  { upTo: 80, size: 4, line: 1.22, maxLines: 6 },
  { upTo: 115, size: 3.4, line: 1.24, maxLines: 7 },
  { upTo: Infinity, size: 3, line: 1.26, maxLines: 8 },
];

// Star points for the classic comic "explosion" — alternating outer/inner radii around the centre.
const BURST = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 === 0 ? 50 : 31;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

const ink: CSSProperties = { color: 'var(--comic-ink)' };

export function ComicPanelSlide({ slots }: SlideProps<'quote'>) {
  const { quote, highlight, attribution } = slots;
  const parts = highlight && quote.includes(highlight) ? quote.split(highlight) : null;
  const line = fitText(quote, SPEECH_TIERS, 62);
  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 82)',
        padding: 'calc(var(--ru) * 6) calc(var(--rw) * 5) calc(var(--ru) * 7)',
        borderRadius: 'calc(var(--ru) * 2.4)',
        // The panel itself: a warm cream stock peppered with a halftone dot screen, boxed by a bold ink line.
        background:
          'radial-gradient(var(--comic-dot) 22%, transparent 24%) 0 0 / calc(var(--ru) * 4) calc(var(--ru) * 4), var(--comic-paper)',
        border: '3px solid var(--comic-ink)',
        boxShadow: 'calc(var(--ru) * 0.9) calc(var(--ru) * 1.1) 0 var(--comic-ink)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the panel staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-pop 0.5s cubic-bezier(0.2,0.7,0.3,1) forwards',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .reel[data-palette] {
          --comic-ink: #141118;
          --comic-paper: #fbf3df;
          --comic-dot: rgba(20, 17, 24, 0.16);
          --comic-bubble: #ffffff;
        }
        @keyframes comic-pow {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.3) rotate(-24deg); }
          70%  { opacity: 1; transform: translate(-50%, -50%) scale(1.08) rotate(4deg); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
        }
        @keyframes comic-bubble-pop {
          from { opacity: 0; transform: translateY(calc(var(--ru) * 2.2)) scale(0.92); }
          65%  { opacity: 1; transform: translateY(0) scale(1.03); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* The exploding star bursts in behind the bubble, drawn with the palette accent and an ink edge. */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          width: 'calc(var(--rw) * 92)',
          maxWidth: 'none',
          transform: 'translate(-50%, -50%)',
          animation: 'comic-pow 0.7s cubic-bezier(0.3,0.8,0.3,1.2) 0.1s both',
        }}
      >
        <polygon
          points={BURST}
          fill="var(--reel-accent)"
          stroke="var(--comic-ink)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>

      {/* The speech bubble: white stock, a thick ink outline and an offset comic shadow, holding the line. */}
      <div
        style={{
          position: 'relative',
          background: 'var(--comic-bubble)',
          border: '3px solid var(--comic-ink)',
          borderRadius: 'calc(var(--ru) * 4)',
          padding: 'calc(var(--ru) * 4) calc(var(--rw) * 5)',
          boxShadow: 'calc(var(--ru) * 0.7) calc(var(--ru) * 0.9) 0 var(--comic-ink)',
          animation: 'comic-bubble-pop 0.55s cubic-bezier(0.2,0.7,0.3,1) 0.18s both',
        }}
      >
        <p
          data-fit-tier={line.tier}
          style={{
            margin: 0,
            fontWeight: 800,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.01em',
            ...ink,
            ...line.style,
          }}
        >
          {parts ? (
            <>
              {parts[0]}
              <span style={{ color: 'var(--reel-accent-2)' }}>{highlight}</span>
              {parts[1]}
            </>
          ) : (
            quote
          )}
        </p>
        {/* The bubble's tail: a small ink-outlined triangle pointing down to the speaker tab. */}
        <svg
          viewBox="0 0 40 28"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '14%',
            bottom: 'calc(var(--ru) * -3.2)',
            width: 'calc(var(--rw) * 9)',
          }}
        >
          <path
            d="M2 2 L38 2 L8 26 Z"
            fill="var(--comic-bubble)"
            stroke="var(--comic-ink)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {attribution && (
        <div
          style={{
            position: 'relative',
            marginTop: 'calc(var(--ru) * 5)',
            alignSelf: 'flex-start',
            display: 'inline-block',
            padding: 'calc(var(--ru) * 1.4) calc(var(--rw) * 3.4)',
            background: 'var(--reel-accent)',
            border: '3px solid var(--comic-ink)',
            borderRadius: 'calc(var(--ru) * 1.4)',
            boxShadow: 'calc(var(--ru) * 0.5) calc(var(--ru) * 0.6) 0 var(--comic-ink)',
            font: '800 calc(var(--ru) * 2.8)/1.1 var(--reel-sans)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: '#fff',
            maxWidth: '88%',
            animation: 'comic-bubble-pop 0.5s cubic-bezier(0.2,0.7,0.3,1) 0.34s both',
          }}
        >
          {attribution}
        </div>
      )}
    </div>
  );
}
