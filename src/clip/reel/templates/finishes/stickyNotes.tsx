// A list finish styled as a corkboard of sticky notes: a faint dot grid behind, then three or four
// pastel squares — each pinned, slightly rotated and offset — carrying one item in a casual bold
// hand. The pastel paper stock (yellow/cyan/pink) is an intrinsic, non-palette identity, so it lives
// in a scoped <style>; the title rides above as a small pin label that DOES recolor with the reel.
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
      <style>{`
        .reel-board-pin {
          --note-yellow: #fde98a;
          --note-cyan: #a8e6ec;
          --note-pink: #f9b8cf;
          --note-ink: #3a2f1d;
          --note-dot: rgba(58, 47, 29, 0.1);
          position: relative;
          width: calc(var(--rw) * 84);
          padding: calc(var(--ru) * 5) calc(var(--rw) * 3);
          border-radius: calc(var(--ru) * 3);
          background:
            radial-gradient(var(--note-dot) calc(var(--ru) * 0.5), transparent calc(var(--ru) * 0.5)) 0 0 / calc(var(--rw) * 5) calc(var(--rw) * 5),
            color-mix(in oklab, var(--reel-ink) 5%, transparent);
        }
        .reel-board-pin .label {
          display: block;
          width: max-content;
          max-width: calc(var(--rw) * 76);
          margin: 0 auto calc(var(--ru) * 4);
          padding: calc(var(--ru) * 1) calc(var(--rw) * 3);
          border-radius: 999px;
          font: 600 calc(var(--ru) * 2.2)/1 var(--reel-mono);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #fff;
          background: var(--reel-accent);
          box-shadow: 0 calc(var(--ru) * 2) calc(var(--ru) * 5) calc(var(--ru) * -2) var(--reel-glow);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .reel-board-pin .grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: calc(var(--rw) * 5) calc(var(--rw) * 6);
        }
        .reel-board-pin .note {
          position: relative;
          width: calc(var(--rw) * 34);
          aspect-ratio: 1 / 1;
          padding: calc(var(--ru) * 5) calc(var(--rw) * 2.6) calc(var(--ru) * 2.6);
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          background: var(--note-paper);
          color: var(--note-ink);
          box-shadow: 0 calc(var(--ru) * 4) calc(var(--ru) * 9) calc(var(--ru) * -4) rgba(20, 16, 44, 0.55);
          transform: rotate(var(--note-tilt));
          animation:
            note-pin 5.5s ease-in-out var(--note-delay) infinite,
            reel-pop 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) var(--note-delay) both;
        }
        /* The pin: a small domed head punched through the top edge of each note. */
        .reel-board-pin .note::before {
          content: '';
          position: absolute;
          top: calc(var(--ru) * -1.4);
          left: 50%;
          width: calc(var(--ru) * 2.6);
          height: calc(var(--ru) * 2.6);
          border-radius: 50%;
          transform: translateX(-50%);
          background: radial-gradient(circle at 36% 30%, #fff 0%, var(--reel-accent-2) 60%, var(--reel-accent) 100%);
          box-shadow: 0 calc(var(--ru) * 1) calc(var(--ru) * 2) calc(var(--ru) * -0.6) rgba(20, 16, 44, 0.6);
        }
        .reel-board-pin .note span {
          /* Size, line and clamp come from the note's tier (inline); the hand stays bold. */
          font-weight: 700;
          font-family: var(--reel-sans);
          letter-spacing: -0.01em;
        }
        /* Bake the per-note lean into the sway so the note keeps its tilt while it breathes. */
        @keyframes note-pin {
          0%, 100% { transform: rotate(var(--note-tilt)) translateY(0); }
          50% { transform: rotate(var(--note-tilt)) translateY(calc(var(--ru) * -1.2)); }
        }
      `}</style>

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
