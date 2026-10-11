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
