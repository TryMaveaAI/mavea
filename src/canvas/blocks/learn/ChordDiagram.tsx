import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ChordDiagramProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ChordDiagramProps & { delay?: number };

const FRET_ROWS = 4;
const DEFAULT_STRINGS = 6; // a standard guitar, when the data doesn't say otherwise

// Map fret value to display string; 0 = open circle, 'x' = muted X
function fretLabel(f: number | 'x' | 'o'): string {
  if (f === 'x') return '✕';
  if (f === 'o' || f === 0) return '○';
  return '';
}

export function ChordDiagram({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  chordName,
  frets,
  fingers,
  capoFret,
  notes,
  instrument = 'Guitar',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  // The number of strings follows the data, not a fixed six: a ukulele has 4, a bass 4–5, a
  // 7-string guitar 7. Clamp to a sane neck so a stray/empty array still renders something.
  const stringCount = Math.min(12, Math.max(3, frets.length || DEFAULT_STRINGS));
  const safe = Array.from({ length: stringCount }, (_, i) => frets[i] ?? 'x');

  // Find the barre fret range (min non-zero/non-x fret)
  const numericFrets = safe.filter((f): f is number => typeof f === 'number' && f > 0) as number[];
  const minFret = numericFrets.length ? Math.min(...numericFrets) : 0;
  const startFret = capoFret ?? (minFret > 1 ? minFret : 1);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cd-layout">
        <div className="cd-left">
          <div className="cd-chord-name">{chordName}</div>
          {instrument && <div className="cd-instrument">{instrument}</div>}
        </div>

        <div className="cd-diagram">
          {/* Nut or fret number */}
          {startFret === 1 ? (
            <div className="cd-nut" />
          ) : (
            <div className="cd-fret-label">{startFret}fr</div>
          )}

          {/* Fretboard grid */}
          <div className="cd-fretboard">
            {/* Fret lines */}
            {Array.from({ length: FRET_ROWS + 1 }).map((_, fi) => (
              <div
                key={fi}
                className="cd-fret-line"
                style={{ top: `${(fi / FRET_ROWS) * 100}%` }}
              />
            ))}

            {/* String lines + dots + open/mute markers */}
            {safe.map((fretVal, si) => {
              const x = (si / Math.max(1, stringCount - 1)) * 100;
              const isOpen = fretVal === 0 || fretVal === 'o';
              const isMuted = fretVal === 'x';
              const fretNum = typeof fretVal === 'number' && fretVal > 0 ? fretVal : null;
              const fretRow = fretNum ? fretNum - startFret + 1 : null;
              const fingerNum = fingers?.[si];

              return (
                <div key={si} className="cd-string" style={{ left: `${x}%` }}>
                  {/* Open/muted marker above nut */}
                  <div className="cd-string-top">
                    {(isOpen || isMuted) && (
                      <span className={`cd-top-mark${isMuted ? ' muted' : ' open'}`}>
                        {fretLabel(fretVal)}
                      </span>
                    )}
                  </div>
                  {/* Finger dot on fret */}
                  {fretRow !== null && fretRow >= 1 && fretRow <= FRET_ROWS && (
                    <div
                      className="cd-dot"
                      style={{
                        top: `${((fretRow - 0.5) / FRET_ROWS) * 100}%`,
                      }}
                    >
                      {fingerNum ? <span className="cd-finger">{fingerNum}</span> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Note names below strings. Longer spellings (e.g. "F♯m", "B♭") on a wide neck
              (up to 12 strings) can outgrow their even flex share — wrap instead of
              overflowing past the label or colliding with its neighbours. */}
          {notes && notes.length > 0 && (
            <div className="cd-notes">
              {Array.from({ length: stringCount }, (_, i) => (
                <div
                  key={i}
                  className="cd-note-label"
                  style={{ overflowWrap: 'break-word', minWidth: 0 }}
                >
                  {notes[i] ?? ''}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
