import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FretboardMapProps, FretDot } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FretboardMapProps & { delay?: number };

// Neck geometry (SVG units). The neck runs left→right; strings stack top→bottom.
const NUT_X = 30; // x of the nut (open-string position); leaves room for tuning labels
const NECK_TOP = 16;
const FRET_W = 30; // pixels per fret cell
const STRING_GAP = 14; // vertical gap between adjacent strings
const PAD_R = 16; // right breathing room past the last fret
const PAD_B = 18; // bottom room for the fret-number row

// Single-dot inlay frets and the double-dot octave fret — the standard guitar markers.
const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];

// Interval role → accent token. Roots are emphasised so the shape's anchor reads instantly.
const ROLE_COLOR: Record<NonNullable<FretDot['role']>, string> = {
  root: 'var(--presence)',
  third: 'var(--insight)',
  fifth: 'var(--warning)',
  other: 'var(--text-secondary)',
};

// The dot label sits inside a small fretted-note circle (r=5-6 SVG units) at the CSS class's
// 6.5px base size — comfortable for the demo's 1-2 char interval shorthand ("R", "5", "b7") but
// a longer note/interval name ("bVII", "maj7") overflows that circle at the same size. Shrink the
// font as the label grows so 3+ char labels still fit inside the dot instead of bleeding past it.
function dotLabelFontSize(label: string): number {
  if (label.length <= 2) return 6.5;
  if (label.length === 3) return 5;
  return 4;
}

export function FretboardMap({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  strings = 6,
  frets = 12,
  tuning,
  dots,
  scaleName,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  const { strCount, fretCount, svgW, svgH, fretXs, stringYs } = useMemo(() => {
    const sc = Math.min(7, Math.max(4, Math.round(strings || 6)));
    const fc = Math.min(24, Math.max(4, Math.round(frets || 12)));
    // Fret wire x-positions: index 0 = nut, 1..fc = each fret wire.
    const fx = Array.from({ length: fc + 1 }, (_, i) => NUT_X + i * FRET_W);
    // String y-positions, top (thinnest drawn first visually = highest string) to bottom.
    const sy = Array.from({ length: sc }, (_, i) => NECK_TOP + i * STRING_GAP);
    const w = NUT_X + fc * FRET_W + PAD_R;
    const h = NECK_TOP + (sc - 1) * STRING_GAP + PAD_B;
    return { strCount: sc, fretCount: fc, svgW: w, svgH: h, fretXs: fx, stringYs: sy };
  }, [strings, frets]);

  // Map a 1-based string number (1 = lowest/thickest) to a y. The lowest string is drawn at the
  // BOTTOM (a player's eye view, low E nearest the floor), so flip the index onto the row array.
  const stringY = (n: number) =>
    stringYs[strCount - Math.min(strCount, Math.max(1, Math.round(n)))];

  // The center x of a fretted note (between two wires) or the nut for an open string.
  const dotX = (fret: number) =>
    fret <= 0 ? NUT_X - 9 : fretXs[Math.min(fretCount, fret) - 1] + FRET_W / 2;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
          {scaleName && <span className="fbm-scale-tag">{scaleName}</span>}
        </div>
      )}

      <div className="fbm-board">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="fbm-svg"
          role="img"
          aria-label={scaleName ? `${scaleName} on a fretboard` : title}
        >
          {/* Inlay markers (under the strings) */}
          {Array.from({ length: fretCount }, (_, i) => i + 1)
            .filter((f) => SINGLE_INLAYS.includes(f) || DOUBLE_INLAYS.includes(f))
            .map((f) => {
              const cx = fretXs[f - 1] + FRET_W / 2;
              const midY = NECK_TOP + ((strCount - 1) * STRING_GAP) / 2;
              if (DOUBLE_INLAYS.includes(f)) {
                return (
                  <g key={`in${f}`} className="fbm-inlay">
                    <circle cx={cx} cy={midY - STRING_GAP} r={2.4} />
                    <circle cx={cx} cy={midY + STRING_GAP} r={2.4} />
                  </g>
                );
              }
              return <circle key={`in${f}`} cx={cx} cy={midY} r={2.4} className="fbm-inlay" />;
            })}

          {/* Nut (a thicker wire at fret 0) */}
          <line
            x1={NUT_X}
            y1={NECK_TOP - 1}
            x2={NUT_X}
            y2={NECK_TOP + (strCount - 1) * STRING_GAP + 1}
            className="fbm-nut"
          />

          {/* Fret wires */}
          {fretXs.slice(1).map((x, i) => (
            <line
              key={`fw${i}`}
              x1={x}
              y1={NECK_TOP}
              x2={x}
              y2={NECK_TOP + (strCount - 1) * STRING_GAP}
              className="fbm-fret"
            />
          ))}

          {/* Strings */}
          {stringYs.map((y, i) => (
            <line
              key={`st${i}`}
              x1={NUT_X}
              y1={y}
              x2={NUT_X + fretCount * FRET_W}
              y2={y}
              className="fbm-string"
              strokeWidth={1 + (i / Math.max(1, strCount - 1)) * 0.9}
            />
          ))}

          {/* Tuning labels at the nut */}
          {tuning &&
            stringYs.map((y, row) => {
              // tuning is listed thickest→thinnest (low→high); row 0 here is the top (highest).
              const n = strCount - row; // 1-based string number for this row
              const label = tuning[strCount - n];
              return label ? (
                <text
                  key={`tn${row}`}
                  x={NUT_X - 14}
                  y={y + 3}
                  className="fbm-tuning"
                  textAnchor="middle"
                >
                  {label}
                </text>
              ) : null;
            })}

          {/* Fret numbers along the bottom */}
          {Array.from({ length: fretCount }, (_, i) => i + 1).map((f) => (
            <text
              key={`fn${f}`}
              x={fretXs[f - 1] + FRET_W / 2}
              y={NECK_TOP + (strCount - 1) * STRING_GAP + 14}
              className="fbm-fret-num"
              textAnchor="middle"
            >
              {f}
            </text>
          ))}

          {/* Dots — the notes of the shape */}
          {dots?.map((d, i) => {
            const role = d.role ?? 'other';
            const color = ROLE_COLOR[role] ?? ROLE_COLOR.other;
            const isRoot = role === 'root';
            const cx = dotX(d.fret);
            const cy = stringY(d.string);
            const open = d.fret <= 0;
            return (
              <g key={`dot${i}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={open ? 5 : 6}
                  fill={open ? 'var(--surface-default)' : color}
                  stroke={color}
                  className={isRoot ? 'fbm-dot fbm-dot--root' : 'fbm-dot'}
                />
                {d.label && (
                  <text
                    x={cx}
                    y={cy + 2.6}
                    className="fbm-dot-lbl"
                    textAnchor="middle"
                    fill={open ? color : 'var(--surface-default)'}
                    style={{ fontSize: dotLabelFontSize(d.label) }}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {caption && <p className="fbm-caption">{caption}</p>}

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
