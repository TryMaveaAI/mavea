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
const CLEF_W = 24; // room the drawn clef takes after CLEF_X
const TIME_SIG_DIGIT_W = 9; // a 14-unit bold serif digit, a little generous
const ACC_W = 10; // an accidental plus its gap before the notehead
const NOTE_SPACING = 34; // px per note
// The staff draws at 1.5× its user units. At 1:1 an 11-unit line spacing put the whole staff
// in a corner of a full-width card at engraving size you would expect from a phone.
const RENDER_SCALE = 1.5;

/** Where the time signature and the first note go, from what actually precedes the note: a
 *  wide signature ("12/8") or an accidental on the opening note needs more lead-in than a
 *  bare 4/4, and a fixed first-note x let them collide. */
function staffLeadIn(
  timeSignature: string | undefined,
  firstHasAccidental: boolean,
): { timeSigX: number; firstNoteX: number } {
  const after = CLEF_X + CLEF_W;
  if (!timeSignature) {
    return { timeSigX: after, firstNoteX: after + 10 + (firstHasAccidental ? ACC_W : 0) + 6 };
  }
  const [num = '', den = ''] = timeSignature.split('/');
  const w = Math.max(num.length, den.length, 1) * TIME_SIG_DIGIT_W;
  const timeSigX = after + 4 + w / 2;
  return { timeSigX, firstNoteX: timeSigX + w / 2 + 10 + (firstHasAccidental ? ACC_W : 0) + 6 };
}

// The clefs are drawn, not typed. The Unicode clef glyphs come from whichever symbol font the
// system falls back to, each with its own size and baseline (Apple Symbols draws the G clef at
// half the staff's height) and none at all on a machine without one. Both paths are authored
// for a 10-unit line spacing with the clef's own line at y = 0, then scaled to the staff.
const TREBLE_PATH =
  'M 1,0 C 5,0 5,5 1,5 C -4,5 -5,-2 -1,-5 C 4,-8 9,-4 9,2 C 9,9 2,12 -2,11 ' +
  'C -8,10 -10,2 -8,-5 C -6,-12 3,-18 4,-26 C 5,-34 3,-44 -1,-44 C -5,-44 -5,-36 -2,-30 ' +
  'C 0,-24 2,-14 2,0 L 3,20 C 3,26 -4,27 -5,22';
const BASS_PATH = 'M -7,-1 C -6,-10 8,-12 9,-2 C 10,8 0,19 -9,25';

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
  const firstAcc = notes[0] ? parsePitch(notes[0].pitch, clef).acc !== '' : false;
  const { timeSigX, firstNoteX } = staffLeadIn(timeSignature, firstAcc);
  const svgW = Math.max(180, firstNoteX + notes.length * NOTE_SPACING + 24);
  const clefScale = LINE_SPACING / 10;
  const clefX = CLEF_X + CLEF_W / 2;

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
          style={{ maxWidth: svgW * RENDER_SCALE }}
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

          {/* Clef: the G clef curls round the G line (step 2), the F clef's head sits on F
              (step 6) between its two dots */}
          {clef === 'bass' ? (
            <g
              transform={`translate(${clefX - 2} ${stepY(6)}) scale(${clefScale})`}
              className="ms-clef"
            >
              <circle cx={-6} cy={0} r={3} className="ms-clef-dot" />
              <path d={BASS_PATH} className="ms-clef-line" />
              <circle cx={13} cy={-5} r={1.6} className="ms-clef-dot" />
              <circle cx={13} cy={5} r={1.6} className="ms-clef-dot" />
            </g>
          ) : (
            <g
              transform={`translate(${clefX} ${stepY(2)}) scale(${clefScale})`}
              className="ms-clef"
            >
              <path d={TREBLE_PATH} className="ms-clef-line" />
              <circle cx={-3.5} cy={21.5} r={2.6} className="ms-clef-dot" />
            </g>
          )}

          {/* Time signature */}
          {timeSignature &&
            (() => {
              const [num, den] = timeSignature.split('/');
              const midY = TOP_Y + 2 * LINE_SPACING;
              return (
                <>
                  <text x={timeSigX} y={midY - 1} className="ms-timesig" textAnchor="middle">
                    {num}
                  </text>
                  <text
                    x={timeSigX}
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
            <Note key={i} note={n} x={firstNoteX + i * NOTE_SPACING} clef={clef} />
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
