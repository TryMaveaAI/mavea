import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MusicStaffProps, MusicNote } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MusicStaffProps & { delay?: number };

// Staff geometry
const LINE_SPACING = 11; // vertical pixels between staff lines
const HALF_SPACE = LINE_SPACING / 2;
const TOP_Y = 28; // y of the top (5th) staff line
const BOTTOM_Y = TOP_Y + 4 * LINE_SPACING; // y of the bottom (1st) line = 72
const CLEF_X = 8;
const CLEF_FONT = TOP_Y + 4 * LINE_SPACING + 6; // baseline for the clef glyph
const TIME_SIG_X = 40;
const FIRST_NOTE_X = 60;
const NOTE_SPACING = 34; // px per note

// SVG dimensions; height is fixed, width scales with note count
const SVG_H = BOTTOM_Y + 24; // extra 24 below for notes + ledger lines below staff

// Diatonic step map: C=0, D=1, E=2, F=3, G=4, A=5, B=6
const LETTER_STEP: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

// Reference pitch whose diatonic step equals 0 (bottom line of each clef):
// Treble clef: E4  → abs = 4*7 + 2 = 30
// Bass clef:   G2  → abs = 2*7 + 4 = 18
const REF_ABS = { treble: 30, bass: 18 };

/** Parse "C4", "F#4", "Bb3" → { diatonicStep, accidental } */
function parsePitch(pitch: string, clef: 'treble' | 'bass'): { step: number; acc: '' | '#' | 'b' } {
  const letter = pitch[0].toUpperCase();
  let rest = pitch.slice(1);
  let acc: '' | '#' | 'b' = '';
  if (rest[0] === '#' || rest[0] === 'b') {
    acc = rest[0] as '#' | 'b';
    rest = rest.slice(1);
  }
  const octave = parseInt(rest, 10);
  if (!(letter in LETTER_STEP) || !Number.isFinite(octave)) return { step: 4, acc }; // default B4
  const abs = octave * 7 + LETTER_STEP[letter];
  return { step: abs - REF_ABS[clef], acc };
}

/** Y coordinate for a given diatonic step (step 0 = bottom staff line). */
const stepY = (step: number) => BOTTOM_Y - step * HALF_SPACE;

/** Ledger lines needed for a note outside the 5-line staff (step 0–8). */
function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  if (step < 0) {
    for (let s = -2; s >= step; s -= 2) out.push(s);
  } else if (step > 8) {
    for (let s = 10; s <= step; s += 2) out.push(s);
  }
  return out;
}

/** A rendered note: notehead, stem, flag, accidental, ledger lines. */
function Note({ note, x, clef }: { note: MusicNote; x: number; clef: 'treble' | 'bass' }) {
  const { step, acc } = useMemo(() => parsePitch(note.pitch, clef), [note.pitch, clef]);
  const dur = note.duration ?? 'quarter';
  const ny = stepY(step);

  // Stem goes up when note is below the middle line (step < 4), down otherwise
  const stemUp = step < 4;
  const headRx = 5.5,
    headRy = 3.8;
  const stemLen = 28;
  const sx = stemUp ? x + headRx - 1 : x - headRx + 1;
  const sy1 = ny;
  const sy2 = stemUp ? ny - stemLen : ny + stemLen;

  const isOpen = dur === 'whole' || dur === 'half';

  return (
    <g>
      {/* Ledger lines */}
      {ledgerSteps(step).map((ls) => (
        <line
          key={ls}
          x1={x - headRx - 4}
          y1={stepY(ls)}
          x2={x + headRx + 4}
          y2={stepY(ls)}
          className="ms-ledger"
        />
      ))}

      {/* Accidental */}
      {acc && (
        <text x={x - headRx - 6} y={ny + 3.5} className="ms-acc" textAnchor="end">
          {acc === '#' ? '♯' : '♭'}
        </text>
      )}

      {/* Notehead */}
      <ellipse
        cx={x}
        cy={ny}
        rx={headRx}
        ry={headRy}
        transform={`rotate(-15, ${x}, ${ny})`}
        fill={isOpen ? 'none' : 'var(--text-primary)'}
        stroke="var(--text-primary)"
        strokeWidth={isOpen ? 1.4 : 0}
        className="ms-head"
      />

      {/* Hole in half-note head */}
      {dur === 'half' && (
        <ellipse
          cx={x}
          cy={ny}
          rx={headRx * 0.45}
          ry={headRy * 0.5}
          transform={`rotate(-15, ${x}, ${ny})`}
          fill="var(--surface-default)"
        />
      )}

      {/* Stem (everything except whole notes) */}
      {dur !== 'whole' && <line x1={sx} y1={sy1} x2={sx} y2={sy2} className="ms-stem" />}

      {/* Eighth-note flag */}
      {dur === 'eighth' && (
        <path
          d={
            stemUp
              ? `M ${sx},${sy2} C ${sx + 16},${sy2 + 8} ${sx + 14},${sy2 + 18} ${sx + 2},${sy2 + 22}`
              : `M ${sx},${sy2} C ${sx + 16},${sy2 - 8} ${sx + 14},${sy2 - 18} ${sx + 2},${sy2 - 22}`
          }
          className="ms-flag"
        />
      )}

      {/* Augmentation dot */}
      {note.dotted && <circle cx={x + headRx + 4} cy={ny - 2} r={2} fill="var(--text-primary)" />}
    </g>
  );
}

export function MusicStaff({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  clef = 'treble',
  notes = [],
  timeSignature,
  tempo,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const svgW = Math.max(180, FIRST_NOTE_X + notes.length * NOTE_SPACING + 24);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {tempo && <div className="ms-tempo">♩= {tempo}</div>}

      <div className="ms-scroll">
        <svg
          viewBox={`0 0 ${svgW} ${SVG_H}`}
          className="ms-svg"
          style={{ maxWidth: svgW }}
          role="img"
          aria-label={title}
        >
          {/* Staff lines */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={CLEF_X}
              y1={TOP_Y + i * LINE_SPACING}
              x2={svgW - 4}
              y2={TOP_Y + i * LINE_SPACING}
              className="ms-line"
            />
          ))}

          {/* Clef glyph — Unicode Musical Symbols, serif for best coverage */}
          <text x={CLEF_X + 3} y={CLEF_FONT} className="ms-clef">
            {clef === 'bass' ? '𝄢' : '𝄞'}
          </text>

          {/* Time signature */}
          {timeSignature &&
            (() => {
              const [num, den] = timeSignature.split('/');
              const midY = TOP_Y + 2 * LINE_SPACING;
              return (
                <>
                  <text x={TIME_SIG_X} y={midY - 1} className="ms-timesig" textAnchor="middle">
                    {num}
                  </text>
                  <text
                    x={TIME_SIG_X}
                    y={midY + LINE_SPACING + 1}
                    className="ms-timesig"
                    textAnchor="middle"
                  >
                    {den ?? '4'}
                  </text>
                </>
              );
            })()}

          {/* Notes */}
          {notes.map((n, i) => (
            <Note key={i} note={n} x={FIRST_NOTE_X + i * NOTE_SPACING} clef={clef} />
          ))}
        </svg>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
