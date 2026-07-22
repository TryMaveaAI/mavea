import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PainscaleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PainscaleProps & { delay?: number };

// Wong-Baker FACES uses six anchor faces at 0/2/4/6/8/10. Each is drawn from the same
// 24×24 face frame; only the mouth curve and brow tilt change, so a higher score reads
// as a sadder face. `mouth` is the SVG path for the lip line; `brow` is the y-offset that
// lowers the inner brow as pain climbs; `tint` keys the emphasis colour off severity.
const FACES: { score: number; mouth: string; brow: number; tint: string }[] = [
  { score: 0, mouth: 'M8.5 14.5q3.5 3 7 0', brow: 0, tint: 'var(--insight)' },
  { score: 2, mouth: 'M8.5 14.8q3.5 1.8 7 0', brow: 0, tint: 'var(--insight)' },
  { score: 4, mouth: 'M8.5 15q3.5 0 7 0', brow: 0.4, tint: 'var(--presence)' },
  { score: 6, mouth: 'M8.5 15.6q3.5 -1.4 7 0', brow: 1, tint: 'var(--warning)' },
  { score: 8, mouth: 'M8.5 16.2q3.5 -2.6 7 0', brow: 1.6, tint: 'var(--warning)' },
  { score: 10, mouth: 'M8.5 16.8q3.5 -3.4 7 0', brow: 2.2, tint: 'var(--danger)' },
];

// The label a clinician reads off the face anchors — also the default VAS anchors.
const ANCHOR_WORDS = ['No pain', 'Mild', 'Moderate', 'Moderate', 'Severe', 'Worst pain'];

// Severity bucket → accent token, so the headline number and VAS marker share the face palette.
function tintFor(v: number): string {
  if (v <= 0) return 'var(--insight)';
  if (v <= 3) return 'var(--insight)';
  if (v <= 5) return 'var(--presence)';
  if (v <= 7) return 'var(--warning)';
  return 'var(--danger)';
}

function FaceGlyph({ mouth, brow }: { mouth: string; brow: number }) {
  return (
    <svg viewBox="0 0 24 24" className="ps-face-svg" aria-hidden="true">
      <circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {/* eyes drop with the brow so distress reads on the upper face, not just the mouth */}
      <circle cx="8.6" cy={9.4 + brow} r="1.15" fill="currentColor" />
      <circle cx="15.4" cy={9.4 + brow} r="1.15" fill="currentColor" />
      <path d={mouth} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PainScale({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  value,
  kind = 'faces',
  anchors,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  // Clamp the report into the instrument's 0..10 range — a stray 12 or −1 from the model
  // can't push the marker off the bar or select a face that doesn't exist.
  const v = Math.min(10, Math.max(0, value));
  const tint = tintFor(v);
  // The selected FACES anchor is the one nearest the reading (rounded to the even anchors).
  const selectedFace = Math.min(FACES.length - 1, Math.max(0, Math.round(v / 2)));
  // Verbal anchor under the headline — prefer the supplied anchors, else the clinical words.
  const word =
    caption ||
    (anchors && anchors.length
      ? anchors[Math.min(anchors.length - 1, Math.round((v / 10) * (anchors.length - 1)))]
      : ANCHOR_WORDS[selectedFace]);

  // VAS verbal anchors: the supplied pair (or the clinical extremes) bookend the track.
  const lowAnchor = anchors?.[0] ?? 'No pain';
  const highAnchor = anchors?.[anchors.length - 1] ?? 'Worst pain';

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ps-c' as string]: tint } as CSSProperties
      }
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="ps-readout">
        <span className="ps-num tab-num" data-mark="underline">
          {v}
          <span className="ps-num-d">/10</span>
        </span>
        <span className="ps-word">{word}</span>
      </div>

      {kind === 'vas' ? (
        <div className="ps-vas">
          <div className="ps-vas-track">
            <span className="ps-vas-fill" style={{ width: (v / 10) * 100 + '%' }} />
            {/* the marker sits at the reported fraction of the 0..10 span — a faithful plot */}
            <span className="ps-vas-marker" style={{ left: (v / 10) * 100 + '%' }}>
              <span className="ps-vas-flag tab-num">{v}</span>
            </span>
          </div>
          <div className="ps-vas-anchors">
            <span className="ps-anchor-lo">{lowAnchor}</span>
            <span className="ps-anchor-hi">{highAnchor}</span>
          </div>
          {/* numbered ticks 0..10 so the analog bar still reads as the clinical 11-point scale */}
          <div className="ps-vas-ticks" aria-hidden="true">
            {Array.from({ length: 11 }).map((_, i) => (
              <span key={i} className={`ps-tick ${i === Math.round(v) ? 'on' : ''}`}>
                {i}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="ps-faces">
          {FACES.map((f, i) => {
            const on = i === selectedFace;
            return (
              <div
                key={f.score}
                className={`ps-face ${on ? 'on' : ''}`}
                style={{ ['--face-c' as string]: f.tint } as CSSProperties}
                data-mark={on ? 'circle' : undefined}
              >
                <FaceGlyph mouth={f.mouth} brow={f.brow} />
                <span className="ps-face-n tab-num">{f.score}</span>
              </div>
            );
          })}
        </div>
      )}

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
