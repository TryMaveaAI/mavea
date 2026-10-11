// EtymTree.tsx — word-origin tree: roots flow in from the left, the word sits centre,
// descendants/cognates branch out to the right. Each root and descendant carries a
// language-of-origin badge (Proto-Indo-European, Latin, Old French, …) and an optional
// gloss. Connectors are drawn as smooth bezier paths so the provenance chain reads as
// a single visual flow rather than a flat list.
// Use for vocabulary tuition, historical linguistics, GMAT/GRE word-roots prep,
// etymology footnotes, and any "where did this word come from?" question.
import { useMemo, type CSSProperties } from 'react';
import type { EtymTreeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import type { FitTextResult } from '../../lib/fitText';
import { useHostWidth } from '../../lib/useBoxSize';
import { etymLayout, HDR_FS, LINE_GAP, PAD_Y } from './etymLayout';

type Props = EtymTreeProps & { delay?: number };

// Laid out at the card's measured width, one user unit per pixel, so type stays the size it is
// set at instead of scaling with a stretched viewBox (see etymLayout for the geometry).
const FALLBACK_W = 480;
// The stacked layout wraps its boxes to any width; a floor wider than a 320px phone's card (233px)
// only pushed the tree past the card's edge.
const MIN_W = 160;
const MAX_W = 960;

/** Lines of one fitted block, first baseline at `top` plus roughly the cap height. */
function Lines({
  fit,
  cx,
  top,
  className,
  fill,
}: {
  fit: FitTextResult;
  cx: number;
  top: number;
  className: string;
  fill?: string;
}) {
  return (
    <text
      textAnchor="middle"
      className={className}
      fontSize={fit.fontSize}
      style={fill ? { fill } : undefined}
    >
      {fit.lines.map((line, i) => (
        <tspan key={i} x={cx} y={top + fit.fontSize * 0.82 + i * fit.lineHeightPx}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function EtymTree({ word, roots, descendants, note, footer, delay }: Props) {
  const safeWord = typeof word === 'string' && word ? word : 'Word';
  const [hostRef, measured] = useHostWidth<HTMLDivElement>();
  const W = measured ? Math.max(MIN_W, Math.min(measured, MAX_W)) : FALLBACK_W;

  const layout = useMemo(
    () => etymLayout(W, roots ?? [], descendants ?? [], safeWord),
    [W, roots, descendants, safeWord],
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="et-wrap" ref={hostRef}>
        <svg
          className="et-svg"
          width={W}
          height={layout.height}
          viewBox={`0 0 ${W} ${layout.height}`}
          role="img"
          aria-label={`Etymology of "${safeWord}"`}
        >
          {layout.wires.map((w, i) => (
            <path key={i} d={w.d} fill="none" stroke={w.color} strokeWidth="1.5" opacity="0.75" />
          ))}
          {layout.boxes.map((b, i) => {
            const cx = b.x + b.w / 2;
            const formTop = b.y + PAD_Y;
            const langTop = formTop + b.form.lines.length * b.form.lineHeightPx + LINE_GAP;
            return (
              <g key={i}>
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={6}
                  className="et-box"
                  style={{ stroke: b.color }}
                />
                <Lines fit={b.form} cx={cx} top={formTop} className="et-form" />
                {b.lang && (
                  <Lines fit={b.lang} cx={cx} top={langTop} className="et-lang" fill={b.color} />
                )}
              </g>
            );
          })}
          <rect
            x={layout.word.x}
            y={layout.word.y}
            width={layout.word.w}
            height={layout.word.h}
            rx={8}
            className="et-word-box"
          />
          <Lines
            fit={layout.word.fit}
            cx={layout.word.x + layout.word.w / 2}
            top={
              layout.word.y +
              (layout.word.h - layout.word.fit.lines.length * layout.word.fit.lineHeightPx) / 2
            }
            className="et-word"
          />
          {layout.headers.map((h) => (
            <text
              key={h.label}
              x={h.x}
              y={h.y}
              textAnchor={h.anchor}
              className="et-col-hdr"
              fontSize={HDR_FS}
            >
              {h.label}
            </text>
          ))}
        </svg>
      </div>

      {note && <div className="et-note">{note}</div>}
      {footer && (
        <div
          className="insight-summary"
          dangerouslySetInnerHTML={richInnerHtml(footer)}
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}
