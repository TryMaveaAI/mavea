// A list finish set as a page of study notes: the title as a handwritten-feel heading underlined in
// ink, the items as bulleted lines that write in one after another, a small hand-drawn doodle sketched
// in the margin, and a boxed callout for the keeper idea. The cream paper, the blue ruled lines and the
// red margin rule are a real notebook's intrinsic identity (a page isn't tinted by the reel), so those
// few colors live in a scoped <style>; the ink itself is dark blue ballpoint, also scoped. The doodle
// strokes loop their draw so the sketch keeps "being drawn" — a tiny sign of a living hand on the page.
import type { SlideProps } from '../types';
import { fitText, BODY_TIERS } from '../fitText';

export function NotebookSlide({ slots }: SlideProps<'list'>) {
  // Five lines keep the page airy; past that the ruling crowds, so the rest fall away (FitScale owns
  // height, but a calm page beats a packed one). The last item, if there's room, becomes the callout.
  const items = slots.items.slice(0, 5);
  const callout = items.length > 3 ? items[items.length - 1] : undefined;
  const bullets = callout ? items.slice(0, -1) : items;

  return (
    <div className="reel-notebook reel-fade">
      <style>{`
        .reel-notebook {
          --nb-paper: #fbf7ec;
          --nb-rule: rgba(86, 132, 196, 0.32);
          --nb-margin: rgba(210, 78, 78, 0.55);
          --nb-ink: #243a63;
          position: relative;
          width: calc(var(--rw) * 82);
          padding: calc(var(--ru) * 4) calc(var(--rw) * 4) calc(var(--ru) * 4.6) calc(var(--rw) * 11);
          border-radius: calc(var(--ru) * 0.8);
          color: var(--nb-ink);
          background:
            linear-gradient(var(--nb-rule) 1px, transparent 1px) 0 calc(var(--ru) * 0.6) / 100% calc(var(--ru) * 5.2),
            var(--nb-paper);
          box-shadow: 0 calc(var(--ru) * 7) calc(var(--ru) * 16) calc(var(--ru) * -6) rgba(20, 16, 44, 0.5);
        }
        /* The red margin rule down the left, with the punch-holes the binder leaves behind. */
        .reel-notebook::before {
          content: '';
          position: absolute;
          inset: 0 auto 0 calc(var(--rw) * 8);
          width: 1px;
          background: var(--nb-margin);
        }
        .reel-notebook h2 {
          margin: 0 0 calc(var(--ru) * 1.2);
          font: italic 700 calc(var(--ru) * 6.4)/1.1 var(--reel-serif);
          letter-spacing: 0.01em;
        }
        .reel-notebook ul { margin: 0; padding: 0; list-style: none; }
        .reel-notebook li {
          display: flex;
          gap: calc(var(--rw) * 2.4);
          align-items: baseline;
          min-height: calc(var(--ru) * 5.2);
          font: 500 calc(var(--ru) * 3)/1.72 var(--reel-serif);
          animation: nb-write 0.5s ease-out both;
        }
        .reel-notebook li b { color: color-mix(in oklab, var(--nb-margin) 70%, var(--nb-ink)); }
        .reel-notebook li span {
          flex: 1;
        }
        .reel-notebook .callout {
          margin-top: calc(var(--ru) * 1.6);
          padding: calc(var(--ru) * 1.8) calc(var(--rw) * 3);
          border: 2px solid var(--nb-margin);
          border-radius: calc(var(--ru) * 1.4);
          transform: rotate(-0.8deg);
          font: italic 600 calc(var(--ru) * 2.9)/1.4 var(--reel-serif);
          background: color-mix(in oklab, var(--nb-margin) 9%, transparent);
          animation: reel-pop 0.55s cubic-bezier(0.2,0.7,0.3,1) 0.5s both;
        }
        .reel-notebook .doodle {
          position: absolute;
          right: calc(var(--rw) * 3);
          top: calc(var(--ru) * 3);
          width: calc(var(--ru) * 14);
          transform: rotate(6deg);
        }
        @keyframes nb-write { from { opacity: 0; transform: translateX(calc(var(--rw) * -1.4)); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      <h2>{slots.title || 'Notes'}</h2>

      {/* A scribbled idea in the margin — a star catching an eye — that keeps redrawing itself. */}
      <svg className="doodle" viewBox="0 0 60 70" aria-hidden="true">
        <g
          fill="none"
          stroke="var(--nb-ink)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ ['--len' as string]: 1, animation: 'reel-draw 2.4s ease-in-out infinite' }}
        >
          <path d="M30 6 L 37 24 L 56 24 L 41 36 L 47 55 L 30 43 L 13 55 L 19 36 L 4 24 L 23 24 Z" />
          <path d="M24 30 q 6 6 12 0" />
        </g>
      </svg>

      <ul>
        {bullets.map((text, i) => {
          const f = fitText(text, BODY_TIERS);
          return (
            <li key={i} style={{ animationDelay: `${0.15 + i * 0.14}s` }}>
              <b aria-hidden="true">•</b>
              {/* The tier sizes the ink; the line box is re-pinned to the page's 5.2ru ruling so
                  every wrapped line still sits on a blue rule. */}
              <span
                data-fit-tier={f.tier}
                style={{ ...f.style, lineHeight: 'calc(var(--ru) * 5.2)' }}
              >
                {text}
              </span>
            </li>
          );
        })}
      </ul>

      {callout && <div className="callout">{callout}</div>}
    </div>
  );
}
