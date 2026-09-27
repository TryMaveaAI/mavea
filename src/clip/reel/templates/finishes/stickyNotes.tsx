// A list finish styled as a corkboard of sticky notes: a faint dot grid behind, then three or four
// pastel squares — each pinned, slightly rotated and offset — carrying one item in a casual bold
// hand. The pastel paper stock (yellow/cyan/pink) is an intrinsic, non-palette identity, so it lives
// in finishes.css; the title rides above as a small pin label that DOES recolor with the reel.
// Each note pops in on a stagger via the shared reel-pop, and the per-note rotation is baked into a
// uniquely-named keyframe so the gentle sway never flattens the tilt the way the shared loops would.
import type { SlideProps } from '../types';
import { fitText, type Ladder } from '../fitText';

// A note is a fixed pastel square (34rw, ~29rw of writing room after the pin margin) that can never
// grow, so its ramp is keyed to that square rather than a shared column ladder — a longer thought is
// written smaller across more lines, the way a real sticky absorbs one.
const NOTE_TIERS: Ladder = [
  { upTo: 12, size: 3.6, line: 1.16, maxLines: 2 },
  { upTo: 24, size: 3, line: 1.18, maxLines: 3 },
  { upTo: 40, size: 2.4, line: 1.2, maxLines: 4 },
  { upTo: Infinity, size: 1.9, line: 1.22, maxLines: 5 },
];

// Up to four notes read as a board; beyond that they crowd, so the rest fall away (FitScale handles
// the height, but a tidy board beats a packed one). Each note keeps its own paper hue and lean.
const NOTES = [
  { paper: 'var(--note-yellow)', tilt: '-3.2deg' },
  { paper: 'var(--note-cyan)', tilt: '2.6deg' },
  { paper: 'var(--note-pink)', tilt: '-1.8deg' },
  { paper: 'var(--note-yellow)', tilt: '3deg' },
] as const;

export function StickyNotesSlide({ slots }: SlideProps<'list'>) {
  const items = slots.items.slice(0, NOTES.length);

  return (
    <div className="reel-board-pin reel-fade">
      {slots.title && <span className="label">{slots.title}</span>}
      <div className="grid">
        {items.map((text, i) => {
          const n = NOTES[i];
          const f = fitText(text, NOTE_TIERS, 29);
          return (
            <div
              key={i}
              className="note"
              style={{
                ['--note-paper' as string]: n.paper,
                ['--note-tilt' as string]: n.tilt,
                ['--note-delay' as string]: `${i * 0.12}s`,
              }}
            >
              <span data-fit-tier={f.tier} style={f.style}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
