// A playful hand-drawn finish for a concept: cream paper with a faint dot grid, a wobbling marker
// title, a swiped highlight behind its last word, and a hand-drawn doodle (a looping circle or an
// underline scrawl) that draws itself in. The paper, ink and highlighter are an intrinsic doodle
// identity, so they're scoped here rather than recolored — the accent stroke still tracks the reel.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

export function MarkerDoodleSlide({ slots }: SlideProps<'concept'>) {
  // Lift the title's final word so the highlighter swipe + the underline scrawl land under it.
  const words = slots.title.split(' ');
  const lead = words.slice(0, -1).join(' ');
  const last = words[words.length - 1] ?? slots.title;
  // Marker writing sizes by length (inline, since the tier changes per slide): a short scrawl stays
  // big, a bridged quote wraps inside the paper instead of running off the dot grid.
  const head = fitText(slots.title, HERO_TIERS);
  const sub = slots.subtitle ? fitText(slots.subtitle, BODY_TIERS) : undefined;

  return (
    <div className="reel-doodle reel-fade">
      <style>{`
        .reel-doodle {
          --paper: #fbf6e9;
          --paper-dot: rgba(60, 48, 30, 0.14);
          --doodle-ink: #2c2620;
          --doodle-mark: rgba(255, 214, 84, 0.62);
          position: relative;
          width: calc(var(--rw) * 82);
          padding: calc(var(--ru) * 7) calc(var(--rw) * 7) calc(var(--ru) * 8);
          border-radius: calc(var(--ru) * 3);
          background:
            radial-gradient(var(--paper-dot) calc(var(--ru) * 0.5), transparent calc(var(--ru) * 0.5)) 0 0 / calc(var(--rw) * 5) calc(var(--rw) * 5),
            var(--paper);
          box-shadow: 0 calc(var(--ru) * 5) calc(var(--ru) * 13) calc(var(--ru) * -6) rgba(44, 38, 32, 0.5);
          transform: rotate(-1.4deg);
          color: var(--doodle-ink);
        }
        .reel-doodle .tag {
          display: inline-block;
          font: 600 calc(var(--ru) * 2.2)/1 var(--reel-mono);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--reel-accent);
          margin-bottom: calc(var(--ru) * 2.4);
        }
        .reel-doodle h2 {
          margin: 0;
          font-weight: 800;
          font-family: var(--reel-sans);
          letter-spacing: -0.01em;
          animation: doodle-wobble 5s ease-in-out infinite;
        }
        .reel-doodle .last {
          position: relative;
        }
        /* The highlighter swipe sits behind the last word and wipes in from the left. */
        .reel-doodle .last::before {
          content: '';
          position: absolute;
          inset: 14% calc(var(--rw) * -1.4) -6%;
          z-index: -1;
          background: var(--doodle-mark);
          border-radius: calc(var(--ru) * 0.6);
          transform-origin: left;
          animation: doodle-swipe 0.5s cubic-bezier(0.3, 0.7, 0.3, 1) 0.5s both;
        }
        .reel-doodle .sub {
          margin: calc(var(--ru) * 3.6) 0 0;
          font-weight: 500;
          font-family: var(--reel-sans);
          color: color-mix(in oklab, var(--doodle-ink) 70%, transparent);
        }
        /* The hand-drawn underline scrawl beneath the title. */
        .reel-doodle .scrawl {
          display: block;
          width: calc(var(--rw) * 56);
          height: calc(var(--ru) * 4);
          margin-top: calc(var(--ru) * 1);
        }
        @keyframes doodle-wobble {
          0%, 100% { transform: rotate(-0.7deg); }
          50% { transform: rotate(0.7deg); }
        }
        @keyframes doodle-swipe {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>

      {slots.tag && <span className="tag">{slots.tag}</span>}
      <h2 data-fit-tier={head.tier} style={head.style}>
        {lead && <>{lead} </>}
        <span className="last">{last}</span>
      </h2>
      <svg className="scrawl" viewBox="0 0 200 16" fill="none" aria-hidden="true">
        <path
          d="M3 11 C40 4, 78 14, 116 8 S 178 6, 197 11"
          stroke="var(--reel-accent)"
          strokeWidth="3.4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ ['--len' as string]: 1, animation: 'reel-draw 0.9s ease-out 0.6s both' }}
        />
      </svg>
      {slots.subtitle && sub && (
        <p className="sub" data-fit-tier={sub.tier} style={sub.style}>
          {slots.subtitle}
        </p>
      )}
    </div>
  );
}
