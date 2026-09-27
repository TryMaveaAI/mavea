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
