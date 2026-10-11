import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CircleOfFifthsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CircleOfFifthsProps & { delay?: number };

// PAD widens the square viewBox around the ring on every side so the rim's signature labels sit
// fully inside (the .card clips with overflow:hidden, so they must live within the viewBox).
const PAD = 14;
const RING = 220; // diameter the ring + labels are laid out within
const VB = RING + PAD * 2; // square viewBox, padded so rim labels never clip
const C = VB / 2; // centre
const R_OUTER = 96; // major-key ring radius
const R_INNER = 60; // relative-minor ring radius
const KEY_R = 15; // major-key chip radius
const SIG_FS = 9; // .cof-sig
const SIG_GAP = 2.5;

/** Centre radius for a signature label at angle `a`: just clear of its key's chip. A centred
 *  label reaches half its width past its centre at 3 and 9 o'clock and half its height at 12
 *  and 6, so one fixed radius either sat on the chip at the top or floated off it at the sides. */
const sigRadius = (a: number, text: string) =>
  R_OUTER +
  KEY_R +
  SIG_GAP +
  (Math.abs(Math.cos(a)) * text.length * SIG_FS * 0.6) / 2 +
  (Math.abs(Math.sin(a)) * SIG_FS * 0.75) / 2;

/** A key name with its accidental set upright: the italic face has no ♯/♭, and the fallback
 *  glyph it borrows carries wide side bearings that read as "B ♭ m". */
function KeyName({ name }: { name: string }) {
  const parts = name.split(/([♯♭])/).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p === '♯' || p === '♭' ? (
          <tspan key={i} className="cof-acc">
            {p}
          </tspan>
        ) : (
          p
        ),
      )}
    </>
  );
}

// The circle of fifths, clockwise from C at twelve o'clock. Each entry pairs a major key with its
// relative minor and the key signature (sharps positive, flats negative). This is the canonical,
// fixed layout — the component owns it, the model only names which key to light up.
interface KeySlot {
  major: string;
  minor: string;
  sig: number; // # of sharps (>0) or flats (<0); 0 = none
}
const SLOTS: KeySlot[] = [
  { major: 'C', minor: 'Am', sig: 0 },
  { major: 'G', minor: 'Em', sig: 1 },
  { major: 'D', minor: 'Bm', sig: 2 },
  { major: 'A', minor: 'F♯m', sig: 3 },
  { major: 'E', minor: 'C♯m', sig: 4 },
  { major: 'B', minor: 'G♯m', sig: 5 },
  { major: 'G♭', minor: 'E♭m', sig: -6 },
  { major: 'D♭', minor: 'B♭m', sig: -5 },
  { major: 'A♭', minor: 'Fm', sig: -4 },
  { major: 'E♭', minor: 'Cm', sig: -3 },
  { major: 'B♭', minor: 'Gm', sig: -2 },
  { major: 'F', minor: 'Dm', sig: -1 },
];

/** Normalise a user key name onto the layout's spelling: "F#" → "F♯", "Bb" → "B♭", "Bbm" → "B♭m". */
function normalizeKey(name: string): string {
  const trimmed = name.trim();
  // A flat is a lowercase "b" that directly follows the note letter (so "Bb"/"Bbm" → "B♭"/"B♭m",
  // but the leading note letter and a trailing "m" for minor are left intact).
  const flatted = trimmed.replace(/^([A-Ga-g])b/, '$1♭');
  return flatted.replace(/#/g, '♯').replace(/^([A-G])/i, (s) => s.toUpperCase());
}

/** Find the slot index for a key name, matching either the major or relative-minor spelling. */
function slotIndex(name: string | undefined): number {
  if (!name) return -1;
  const n = normalizeKey(name);
  return SLOTS.findIndex((s) => s.major === n || s.minor === n || s.minor === n + 'm');
}

const sigText = (sig: number) => (sig === 0 ? '♮' : sig > 0 ? `${sig}♯` : `${Math.abs(sig)}♭`);

// Angle (radians, 12 o'clock = -90°) for slot i, going clockwise.
const slotAngle = (i: number) => (-90 + i * 30) * (Math.PI / 180);
const px = (r: number, a: number) => C + r * Math.cos(a);
const py = (r: number, a: number) => C + r * Math.sin(a);

export function CircleOfFifths({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  highlightKey,
  showMinors = true,
  related,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  const { hiIdx, relatedIdx } = useMemo(() => {
    const hi = slotIndex(highlightKey);
    const rel = new Set<number>();
    for (const r of related ?? []) {
      const idx = slotIndex(r);
      if (idx >= 0 && idx !== hi) rel.add(idx);
    }
    return { hiIdx: hi, relatedIdx: rel };
  }, [highlightKey, related]);

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

      <div className="cof-board">
        <svg viewBox={`0 0 ${VB} ${VB}`} className="cof-svg" role="img" aria-label={title}>
          {/* Ring guides */}
          <circle cx={C} cy={C} r={R_OUTER + 16} className="cof-ring" />
          <circle cx={C} cy={C} r={R_INNER + 14} className="cof-ring" />
          <circle cx={C} cy={C} r={R_INNER - 14} className="cof-ring cof-ring--hub" />

          {/* Spokes from the highlighted key to its related keys (drawn under the segments) */}
          {hiIdx >= 0 &&
            [...relatedIdx].map((i) => (
              <line
                key={`spoke${i}`}
                x1={px(R_OUTER, slotAngle(hiIdx))}
                y1={py(R_OUTER, slotAngle(hiIdx))}
                x2={px(R_OUTER, slotAngle(i))}
                y2={py(R_OUTER, slotAngle(i))}
                className="cof-spoke"
              />
            ))}

          {/* Segment dividers */}
          {SLOTS.map((_, i) => {
            const a = slotAngle(i) + Math.PI / 12; // between slot i and i+1
            return (
              <line
                key={`div${i}`}
                x1={px(R_INNER - 14, a)}
                y1={py(R_INNER - 14, a)}
                x2={px(R_OUTER + 16, a)}
                y2={py(R_OUTER + 16, a)}
                className="cof-divider"
              />
            );
          })}

          {/* Major keys (outer), relative minors (inner), signatures (rim) */}
          {SLOTS.map((s, i) => {
            const a = slotAngle(i);
            const isHi = i === hiIdx;
            const isRel = relatedIdx.has(i);
            const tone = isHi ? 'cof-key--hi' : isRel ? 'cof-key--rel' : '';
            return (
              <g key={s.major}>
                {/* Major key chip */}
                <circle
                  cx={px(R_OUTER, a)}
                  cy={py(R_OUTER, a)}
                  r={15}
                  className={`cof-key ${tone}`}
                />
                <text
                  x={px(R_OUTER, a)}
                  y={py(R_OUTER, a) + 4}
                  className={`cof-key-lbl ${isHi ? 'cof-key-lbl--hi' : ''}`}
                  textAnchor="middle"
                >
                  {s.major}
                </text>

                {/* Key signature on the rim */}
                <text
                  x={px(sigRadius(a, sigText(s.sig)), a)}
                  y={py(sigRadius(a, sigText(s.sig)), a)}
                  className="cof-sig"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {sigText(s.sig)}
                </text>

                {/* Relative minor (inner ring) */}
                {showMinors && (
                  <text
                    x={px(R_INNER, a)}
                    y={py(R_INNER, a) + 3.5}
                    className={`cof-minor ${isHi ? 'cof-minor--hi' : ''}`}
                    textAnchor="middle"
                  >
                    <KeyName name={s.minor} />
                  </text>
                )}
              </g>
            );
          })}

          {/* Hub caption: ♯ rises clockwise, ♭ falls anticlockwise. The two baselines are set a
              full line apart at .cof-hub-lbl's size so the glyph bands stay clear of each other. */}
          <text x={C} y={C - 3} className="cof-hub-lbl" textAnchor="middle">
            ♯ →
          </text>
          <text x={C} y={C + 11} className="cof-hub-lbl" textAnchor="middle">
            ← ♭
          </text>
        </svg>
      </div>

      {caption && <p className="cof-caption">{caption}</p>}

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
