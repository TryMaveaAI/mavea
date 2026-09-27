// A list finish set as a page of study notes: the title as a handwritten-feel heading underlined in
// ink, the items as bulleted lines that write in one after another, a small hand-drawn doodle sketched
// in the margin, and a boxed callout for the keeper idea. The cream paper, the blue ruled lines and the
// red margin rule are a real notebook's intrinsic identity (a page isn't tinted by the reel), so those
// few colors live in finishes.css; the ink itself is dark blue ballpoint, also there. The doodle
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
