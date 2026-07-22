import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PianoKeysProps, PianoHighlight } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PianoKeysProps & { delay?: number };

// Keyboard geometry (SVG units). White keys tile the width; black keys overlay them.
const WHITE_W = 16;
const WHITE_H = 78;
const BLACK_W = 10;
const BLACK_H = 49;
const PAD = 4; // breathing room around the keyboard inside the viewBox

// The seven natural letters and their semitone offset from C within an octave.
const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// The black keys sit after these white indices (C#, D#, F#, G#, A#); E and B have none.
const BLACK_AFTER = new Set([0, 1, 3, 4, 5]);

// Role → accent token so a chord's intervals read at a glance.
const ROLE_COLOR: Record<string, string> = {
  root: 'var(--presence)',
  '1': 'var(--presence)',
  third: 'var(--insight)',
  '3rd': 'var(--insight)',
  '3': 'var(--insight)',
  fifth: 'var(--warning)',
  '5th': 'var(--warning)',
  '5': 'var(--warning)',
  seventh: 'var(--danger)',
  '7th': 'var(--danger)',
  '7': 'var(--danger)',
};
// Finger number → accent when no role is given, so a fingering still colours cleanly.
const FINGER_COLOR = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

const NOTE_LETTERS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

// A key's role/label sits on a fixed-width rect at a fixed 6px font-size — fine for a short
// badge like "root" or "5th", but a model-authored role string (or a black key, narrower still)
// can run long enough to bleed past the neighbouring key. Cap it to a conservative character
// budget and keep the untruncated string as a native <title> tooltip, same idiom as EtymTree/
// GraphTrace — nothing is silently lost, it's just not painted wider than the key.
const KEY_LABEL_MAX_CHARS = 6;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** Parse a scientific pitch ("C4", "G#4", "Bb3") into an absolute semitone index from C0. */
function pitchToSemitone(pitch: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(pitch.trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const base = LETTER_SEMITONE[letter];
  if (base === undefined) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = parseInt(m[3], 10);
  return octave * 12 + base + acc;
}

/** The accent for one highlighted key — role first, then finger, then a neutral default. */
function highlightColor(h: PianoHighlight): string {
  if (h.role) {
    const key = h.role.trim().toLowerCase();
    if (ROLE_COLOR[key]) return ROLE_COLOR[key];
  }
  if (h.finger && h.finger >= 1) return FINGER_COLOR[(h.finger - 1) % FINGER_COLOR.length];
  return 'var(--presence)';
}

export function PianoKeys({
  title,
  icon = 'play',
  iconColor = 'var(--presence)',
  octaves = 2,
  startNote = 'C3',
  highlight,
  chordName,
  showLabels = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.play;

  const { whites, blacks, svgW, svgH, marks } = useMemo(() => {
    const oct = Math.min(4, Math.max(1, Math.round(octaves || 2)));
    // Anchor the keyboard at the start note's octave; the leftmost C may differ from startNote,
    // but starting on a natural keeps the white-key tiling exact, so snap to the C below.
    const startSemi = pitchToSemitone(startNote) ?? pitchToSemitone('C3')!;
    const startC = Math.floor(startSemi / 12) * 12; // the C at or below the start note
    const whiteCount = oct * 7;

    // White keys: tile left→right, one per natural letter across the octaves.
    const whiteList: { x: number; semitone: number; letter: string }[] = [];
    for (let i = 0; i < whiteCount; i++) {
      const octave = Math.floor(i / 7);
      const within = i % 7;
      const letter = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][within];
      whiteList.push({
        x: PAD + i * WHITE_W,
        semitone: startC + octave * 12 + LETTER_SEMITONE[letter],
        letter,
      });
    }

    // Black keys: positioned over the gap after their white key (offset toward the next key).
    const blackList: { x: number; semitone: number }[] = [];
    for (let i = 0; i < whiteCount; i++) {
      const within = i % 7;
      if (!BLACK_AFTER.has(within)) continue;
      const octave = Math.floor(i / 7);
      const letter = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][within];
      blackList.push({
        x: PAD + (i + 1) * WHITE_W - BLACK_W / 2,
        semitone: startC + octave * 12 + LETTER_SEMITONE[letter] + 1,
      });
    }

    const w = PAD * 2 + whiteCount * WHITE_W;
    const h = PAD * 2 + WHITE_H;

    // Resolve each highlight onto a rendered key, keeping its accent + label + role/finger.
    const hi = new Map<
      number,
      { color: string; label?: string; role?: string; finger?: number; black: boolean }
    >();
    for (const item of highlight ?? []) {
      const semi = pitchToSemitone(item.note);
      if (semi === null) continue;
      const black = [1, 3, 6, 8, 10].includes(((semi % 12) + 12) % 12);
      hi.set(semi, {
        color: highlightColor(item),
        label: NOTE_LETTERS[((semi % 12) + 12) % 12] + (black ? '♯' : ''),
        role: item.role,
        finger: item.finger,
        black,
      });
    }

    return { whites: whiteList, blacks: blackList, svgW: w, svgH: h, marks: hi };
  }, [octaves, startNote, highlight]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="pk-layout">
        {chordName && (
          <div className="pk-side">
            <div className="pk-chord-name">{chordName}</div>
          </div>
        )}

        <div className="pk-board">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="pk-svg"
            role="img"
            aria-label={chordName ? `${chordName} on a piano keyboard` : title}
          >
            {/* White keys (drawn first, underneath the black keys) */}
            {whites.map((k) => {
              const m = marks.get(k.semitone);
              return (
                <g key={`w${k.semitone}`}>
                  <rect
                    x={k.x}
                    y={PAD}
                    width={WHITE_W - 1}
                    height={WHITE_H}
                    rx={2.5}
                    className="pk-white"
                    fill={
                      m ? `color-mix(in oklab, ${m.color} 26%, var(--surface-elevated))` : undefined
                    }
                    stroke={m ? m.color : undefined}
                  />
                  {showLabels && m && (
                    <text
                      x={k.x + (WHITE_W - 1) / 2}
                      y={PAD + WHITE_H - 8}
                      className="pk-key-lbl"
                      textAnchor="middle"
                      fill={m.color}
                    >
                      {(m.role ?? m.label ?? '').length > KEY_LABEL_MAX_CHARS && (
                        <title>{m.role ?? m.label}</title>
                      )}
                      {truncate(m.role ?? m.label ?? '', KEY_LABEL_MAX_CHARS)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Black keys (overlaid) */}
            {blacks.map((k) => {
              const m = marks.get(k.semitone);
              return (
                <g key={`b${k.semitone}`}>
                  <rect
                    x={k.x}
                    y={PAD}
                    width={BLACK_W}
                    height={BLACK_H}
                    rx={1.6}
                    className="pk-black"
                    fill={m ? m.color : undefined}
                  />
                  {showLabels && m && (
                    <text
                      x={k.x + BLACK_W / 2}
                      y={PAD + BLACK_H - 6}
                      className="pk-key-lbl pk-key-lbl--black"
                      textAnchor="middle"
                    >
                      {(m.role ?? m.label ?? '').length > KEY_LABEL_MAX_CHARS && (
                        <title>{m.role ?? m.label}</title>
                      )}
                      {truncate(m.role ?? m.label ?? '', KEY_LABEL_MAX_CHARS)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {caption && <p className="pk-caption">{caption}</p>}

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
