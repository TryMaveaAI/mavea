// AnnotationLayer.tsx — the highlight marks, the hand-drawn pen strokes, and the margin notes (with
// their pointing arrows) that sit over a source surface's rendered content. Split out of PageView so
// any surface (PDF today; Office/Sheet/Image as they land) can overlay the SAME judgment ink and
// explanatory notes on whatever geometry IT located, without re-deriving this math per surface.
//
// Two components, not one: the marks + pen must sit INSIDE the element that's exactly the content's
// natural (un-zoomed) size (they use inset:0 / left:0;top:0 to cover it precisely), while the margin
// notes are a SIBLING of that element — the column and its arrows extend past its right edge into a
// gutter the caller reserved alongside it. A single component can't occupy both positions at once.
import { useMemo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { penStrokes, type PenAccent } from '../annotate/penStrokes';

import {
  NOTE_W,
  type AlsoClaim,
  type MarginNoteEntry,
  type SurfaceGeometry,
} from './annotationLayout';

export interface AnnotationMarksProps {
  geometry: SurfaceGeometry;
  zoom: number;
  /** The primary claim's accent color, used to tint its highlight. */
  color: string;
  quote: string;
  also?: readonly AlsoClaim[];
  /** True when the claim is a figure/chart — the pen lassoes the graphic instead of circling text. */
  isFigure?: boolean;
  /** Annotate (pen) mode is on — draw a hand-drawn mark over the cited passage. */
  penOn?: boolean;
  /** Concrete ink color for the pen (theme-agnostic, so it matches the exported reel). */
  penColor?: string;
  /** Claim-aware judgment ink (a load-bearing star, a forecast's "?") for the PRIMARY claim. */
  penAccent?: PenAccent;
  /** Stable seed for the hand-drawn wobble AND this render's React key, so the export reel replays
   *  the exact stroke the reader saw live. */
  seed: string;
}

/** The highlight marks (a figure outline, sibling claims, the primary quote) and, in Annotate mode,
 *  the hand-drawn pen over them. Renders in the surface's own pixel space, scaled by `zoom` — mount
 *  this INSIDE the element that's exactly the content's natural size (see the file header). */
export function AnnotationMarks({
  geometry,
  zoom,
  color,
  quote,
  also,
  isFigure,
  penOn,
  penColor,
  penAccent,
  seed,
}: AnnotationMarksProps): ReactElement {
  const { dims, rects, alsoRects, figure } = geometry;

  // A stable seed for the hand-drawn wobble: the live pen and the recorded reel use the SAME seed,
  // so the exported clip draws the exact mark the reader saw.
  const penDraw = penOn === true && quote.trim().length > 0 && dims.w > 0;
  const strokes = useMemo(() => {
    if (!penDraw) return [];
    const primary = penStrokes(
      rects,
      figure ?? undefined,
      isFigure ?? false,
      dims.w,
      dims.h,
      seed,
      penAccent,
    );
    // Sibling claims on the same surface get their own hand marks, drawn after the primary — a
    // claim-dense page carries several circles/underlines at once (no accents: judgment ink
    // belongs to the claim the reader actually opened).
    const extras = alsoRects.flatMap((rs, i) =>
      rs.length ? penStrokes(rs, undefined, false, dims.w, dims.h, `${seed}:also${i}`) : [],
    );
    return [...primary, ...extras];
  }, [penDraw, rects, alsoRects, figure, isFigure, dims.w, dims.h, seed, penAccent]);

  return (
    <>
      {/* highlight overlay — scaled into the displayed frame (marks are in surface pixels) */}
      {(rects.length > 0 || figure) && (
        <div
          className="prism-page-marks"
          style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          aria-hidden="true"
        >
          {figure && (
            <span
              className="prism-page-figure"
              style={{
                left: figure.x,
                top: figure.y,
                width: figure.w,
                height: figure.h,
                borderColor: `color-mix(in oklab, ${color} 70%, transparent)`,
                boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 20%, transparent)`,
              }}
            />
          )}
          {alsoRects.map((rs, qi) =>
            rs.map((r, i) => (
              <span
                key={`a${qi}-${i}`}
                className="prism-page-mark"
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.w,
                  height: r.h,
                  background: `color-mix(in oklab, ${also?.[qi]?.color ?? color} 18%, transparent)`,
                  boxShadow: `0 0 0 1px color-mix(in oklab, ${also?.[qi]?.color ?? color} 35%, transparent)`,
                }}
              />
            )),
          )}
          {rects.map((r, i) => (
            <span
              key={i}
              className="prism-page-mark"
              style={{
                left: r.x,
                top: r.y,
                width: r.w,
                height: r.h,
                background: `color-mix(in oklab, ${color} 32%, transparent)`,
                boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 55%, transparent)`,
              }}
            />
          ))}
        </div>
      )}
      {/* the pen: a hand-drawn mark over the cited passage, in the SAME surface-pixel space (scaled
          by zoom), drawn only in Annotate mode. Reduced-motion shows it fully drawn (see CSS). */}
      {penOn && strokes.length > 0 && (
        <svg
          className="prism-pen"
          key={seed}
          width={dims.w}
          height={dims.h}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', color: penColor }}
          aria-hidden="true"
        >
          {strokes.map((s, i) => (
            <g key={i} style={{ ['--ink-delay' as string]: `${i * 450}ms` }}>
              <path
                className="prism-pen-halo"
                d={s.d}
                pathLength={1}
                fill={s.fill ? 'currentColor' : 'none'}
              />
              <path
                className="prism-pen-stroke"
                d={s.d}
                pathLength={1}
                fill={s.fill ? 'currentColor' : 'none'}
              />
              {s.head && <path className="prism-pen-head" d={s.head} pathLength={1} fill="none" />}
              {s.label && (
                // A written glyph beside the stroke (the question accent's "?") — its size rides
                // the stroke in surface-pixel space so live view and reel match.
                <text
                  className="prism-pen-glyph"
                  x={s.label.x}
                  y={s.label.y}
                  textAnchor={s.label.anchor}
                  fontSize={s.label.size ?? 26}
                >
                  {s.label.text}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
    </>
  );
}

export interface MarginNotesProps {
  entries: readonly MarginNoteEntry[];
  /** The content's natural (un-zoomed) size — needed to place the arrows' SVG and the column. */
  dims: { w: number; h: number };
  zoom: number;
  /** Same seed as AnnotationMarks, so the arrows redraw exactly on a content change. */
  seed: string;
}

/** The claim explanations as a reader's notes in the gutter, each tied to its passage by a
 *  hand-drawn arrow. Mount as a SIBLING of the element AnnotationMarks is inside (not nested in
 *  it) — see the file header for why. Renders nothing when there are no entries. */
export function MarginNotes({ entries, dims, zoom, seed }: MarginNotesProps): ReactElement | null {
  if (entries.length === 0) return null;
  const frameW = dims.w * zoom;
  const svgW = dims.w + (NOTE_W + 20) / (zoom || 1);
  return (
    <>
      <svg
        className="prism-note-arrows"
        key={'na-' + seed}
        width={svgW}
        height={dims.h}
        viewBox={`0 0 ${svgW} ${dims.h}`}
        style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        aria-hidden="true"
      >
        {entries.map((n, i) => {
          const noteX = dims.w + 12 / (zoom || 1);
          const noteY = n.y + 14 / (zoom || 1);
          const midX = (n.anchorX + noteX) / 2;
          const d = `M ${noteX} ${noteY} C ${midX} ${noteY}, ${midX} ${n.anchorY}, ${n.anchorX + 6} ${n.anchorY}`;
          const head = `M ${n.anchorX + 14} ${n.anchorY - 6} L ${n.anchorX + 5} ${n.anchorY} L ${n.anchorX + 15} ${n.anchorY + 5}`;
          return (
            <g key={i} style={{ ['--ink-delay' as string]: `${400 + i * 500}ms`, color: n.color }}>
              <path className="prism-note-arrow" d={d} pathLength={1} fill="none" />
              <path className="prism-note-arrow-head" d={head} pathLength={1} fill="none" />
            </g>
          );
        })}
      </svg>
      <div className="prism-margin" style={{ width: NOTE_W, left: frameW + 24 } as CSSProperties}>
        {entries.map((n, i) => (
          <div
            key={i}
            className="prism-margin-note"
            style={
              {
                top: n.y * zoom,
                ['--note-c' as string]: n.color,
                ['--ink-delay' as string]: `${400 + i * 500}ms`,
              } as CSSProperties
            }
          >
            {n.text}
          </div>
        ))}
      </div>
    </>
  );
}
