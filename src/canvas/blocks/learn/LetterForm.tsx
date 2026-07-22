import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LetterFormProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LetterFormProps & { delay?: number };

// The ruled-paper viewBox. Four guidelines divide it into the ascender, x-height, and descender zones.
const VB_W = 200;
const VB_H = 180;
const CAP = 30; // cap / ascender line
const MID = 70; // midline (top of x-height)
const BASE = 130; // baseline
const DESC = 165; // descender line

// The stroke-order indices fan out across a fixed-width band (see `x` below). Their radius must
// shrink as more strokes are added, or neighboring circles start to overlap — a fixed r=9 only
// stays clear of its neighbor up to about 7-8 strokes on that band. `indexRadius` solves for the
// largest radius that still leaves a small gap between adjacent circle centers: that overlap-free
// ceiling always wins, even below the legibility floor, so circles never collide however many
// strokes the model sends — at extreme counts they just get small, never overlapping.
const INDEX_BAND = VB_W - 60; // the span the indices fan across (x runs 30..VB_W-30)
const INDEX_R_MAX = 9;
const INDEX_R_MIN = 3; // legibility floor; only reached when the overlap-free ceiling allows it
function indexRadius(count: number): number {
  if (count <= 1) return INDEX_R_MAX;
  const gap = INDEX_BAND / (count - 1);
  const noOverlapCeiling = Math.max(1, gap / 2 - 0.5); // small breathing room between circles
  const target = Math.min(INDEX_R_MAX, Math.max(INDEX_R_MIN, noOverlapCeiling));
  return Math.min(target, noOverlapCeiling);
}

export function LetterForm({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  letter,
  case: letterCase = 'lower',
  strokes,
  showGuides = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;

  // Take the first character and force the requested case — the model may send either.
  const ch = (letter ?? '').slice(0, 1);
  const glyph = letterCase === 'upper' ? ch.toUpperCase() : ch.toLowerCase();
  // Sort the stroke hints by their order so the numbered list always reads 1, 2, 3…
  const ordered = [...strokes].sort((a, b) => a.order - b.order);

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

      <div className="lr-lf-wrap">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="lr-lf-svg" role="img" aria-label={glyph}>
          {showGuides && (
            <g>
              {/* Cap line + baseline are solid; the midline is dashed (the x-height guide). */}
              <line x1={8} y1={CAP} x2={VB_W - 8} y2={CAP} className="lr-lf-guide" />
              <line
                x1={8}
                y1={MID}
                x2={VB_W - 8}
                y2={MID}
                className="lr-lf-guide lr-lf-guide--mid"
              />
              <line
                x1={8}
                y1={BASE}
                x2={VB_W - 8}
                y2={BASE}
                className="lr-lf-guide lr-lf-guide--base"
              />
              <line
                x1={8}
                y1={DESC}
                x2={VB_W - 8}
                y2={DESC}
                className="lr-lf-guide lr-lf-guide--desc"
              />
            </g>
          )}

          {/* Faint trace ghost behind the solid letter so the learner can see the target form. */}
          <text x={VB_W / 2} y={BASE} className="lr-lf-ghost" textAnchor="middle">
            {glyph}
          </text>
          {/* The letter itself, seated on the baseline. */}
          <text x={VB_W / 2} y={BASE} className="lr-lf-glyph" textAnchor="middle">
            {glyph}
          </text>

          {/* Numbered stroke-order indices, fanned along the cap line above the letter. Radius
              (and the digit size riding inside it) scale down as the stroke count grows so
              circles never overlap, however many strokes the model sends. */}
          {(() => {
            const r = indexRadius(ordered.length);
            const fontSize = 11 * (r / INDEX_R_MAX);
            return ordered.map((s, i) => {
              const x = 30 + (i * INDEX_BAND) / Math.max(1, ordered.length - 1 || 1);
              return (
                <g key={s.order}>
                  <circle cx={x} cy={18} r={r} className="lr-lf-index" />
                  <text
                    x={x}
                    y={18}
                    dy="0.35em"
                    className="lr-lf-index-n"
                    textAnchor="middle"
                    style={{ fontSize }}
                  >
                    {s.order}
                  </text>
                </g>
              );
            });
          })()}
        </svg>
      </div>

      {/* The ordered stroke hints. */}
      <ol className="lr-lf-strokes">
        {ordered.map((s) => (
          <li key={s.order} className="lr-lf-stroke">
            <span className="lr-lf-stroke-n">{s.order}</span>
            <span className="lr-lf-stroke-hint">{s.hint}</span>
          </li>
        ))}
      </ol>

      {caption && <p className="lr-lf-cap">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
