import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScriptStrokeProps, ScriptStrokeStep } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScriptStrokeProps & { delay?: number };

// A stroke-order writing guide for a foreign character (CJK hanzi/kanji, Hangul, etc.).
//
// The glyph sits on a calligraphy practice grid — the 米字格 (mǐ, eight guide lines) or the
// simpler 田字格 (tián, a centre cross) — exactly the grids used to learn balance and
// proportion. When a stroke carries an SVG path (in the shared 0..100 grid space) we draw
// the strokes in order, each with a numbered start badge placed at the path's first point,
// so the reader sees both the shape and the sequence. When no paths are given we fall back
// to the glyph shown large with an ordered list of stroke hints — still useful, never blank.
//
// Romanization and meaning ride alongside so the card answers "how do I write AND say this".

/** Pull the first "M x y" / "x y" coordinate out of an SVG path so we can pin a stroke badge. */
function pathStart(d: string): { x: number; y: number } | null {
  // match the first two numbers in the path data (the initial moveto target)
  const m = d.match(/-?\d*\.?\d+/g);
  if (!m || m.length < 2) return null;
  const x = Number(m[0]);
  const y = Number(m[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function ScriptStroke({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  glyph,
  strokes,
  grid = 'mi',
  romanization,
  meaning,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.edit;
  // strokes always rendered in writing order, regardless of authored array order
  const ordered: ScriptStrokeStep[] = [...(strokes ?? [])].sort((a, b) => a.order - b.order);
  const hasPaths = ordered.some((s) => s.path && s.path.trim().length > 0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ss-stage">
        {/* the writing square with guide grid + glyph/strokes */}
        <div className="ss-square">
          <svg
            viewBox="0 0 100 100"
            width="100%"
            role="img"
            aria-label={`Writing guide for ${glyph}`}
          >
            {/* outer frame */}
            <rect
              x={1}
              y={1}
              width={98}
              height={98}
              rx={2}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth={0.8}
            />
            {/* guide lines: tian = centre cross; mi = cross + both diagonals */}
            {grid !== 'none' && (
              <g stroke="var(--grid-line)" strokeWidth={0.6} strokeDasharray="3 2.5">
                <line x1={50} y1={1} x2={50} y2={99} />
                <line x1={1} y1={50} x2={99} y2={50} />
                {grid === 'mi' && (
                  <>
                    <line x1={1} y1={1} x2={99} y2={99} />
                    <line x1={99} y1={1} x2={1} y2={99} />
                  </>
                )}
              </g>
            )}

            {hasPaths ? (
              <>
                {/* faint ghost of the full glyph behind the animated strokes for context */}
                <text
                  x={50}
                  y={54}
                  className="ss-ghost"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {glyph}
                </text>
                {/* each stroke drawn in order, then its number badge at its start point */}
                {ordered.map((s, i) =>
                  s.path ? (
                    <path
                      key={`p${i}`}
                      d={s.path}
                      className="ss-stroke"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ ['--i' as string]: i } as CSSProperties}
                    />
                  ) : null,
                )}
                {ordered.map((s, i) => {
                  const pt = s.path ? pathStart(s.path) : null;
                  if (!pt) return null;
                  return (
                    <g key={`b${i}`} transform={`translate(${pt.x}, ${pt.y})`}>
                      <circle r={4.6} className="ss-badge-bg" />
                      <text className="ss-badge-num" textAnchor="middle" dominantBaseline="central">
                        {s.order}
                      </text>
                    </g>
                  );
                })}
              </>
            ) : (
              // no path data — show the glyph large, centered on the grid
              <text
                x={50}
                y={54}
                className="ss-glyph"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {glyph}
              </text>
            )}
          </svg>
        </div>

        {/* reading + meaning sit beside the square */}
        <div className="ss-meta">
          <div className="ss-glyph-sm" aria-hidden="true">
            {glyph}
          </div>
          {romanization && (
            <div className="ss-romanization">
              <span className="ss-meta-k">Reading</span>
              <span className="ss-meta-v">{romanization}</span>
            </div>
          )}
          {meaning && (
            <div className="ss-meaning">
              <span className="ss-meta-k">Meaning</span>
              <span className="ss-meta-v">{meaning}</span>
            </div>
          )}
          <div className="ss-count">
            {ordered.length} {ordered.length === 1 ? 'stroke' : 'strokes'}
          </div>
        </div>
      </div>

      {/* numbered stroke-order list (always shown — the steps, regardless of path data) */}
      {ordered.length > 0 && (
        <ol className="ss-steps">
          {ordered.map((s, i) => (
            <li key={i} className="ss-step">
              <span className="ss-step-num">{s.order}</span>
              <span className="ss-step-hint">{s.hint ?? `Stroke ${s.order}`}</span>
            </li>
          ))}
        </ol>
      )}

      {caption && <div className="ipa-caption">{caption}</div>}

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
