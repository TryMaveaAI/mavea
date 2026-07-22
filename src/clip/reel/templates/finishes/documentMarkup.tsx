// The annotation-reel finish: the real document page with Mavéa's pen mark drawn over the cited
// passage, exactly as the reader saw it in Prism. The page is a rasterized dataURL <img>; an SVG
// overlay whose viewBox IS the page's pixel space replays the same `penStrokes` the live view drew
// (so the clip matches the app). It then CAMERA-PUSHES into the marked passage and SPOTLIGHTS it
// (dimming the rest), so on a tall vertical board the annotated line is the hero — not a speck on a
// full page. Full-bleed; when there's no page raster (office/text/image), it falls back to a clean
// text beat.
import type { CSSProperties } from 'react';
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS, BODY_TIERS } from '../fitText';
import { penStrokes, type PenRect } from '../../../../live/annotate/penStrokes';

/** The union of all marked boxes, padded + clamped to the page. `padY` is generous so a single line
 *  shows the lines around it for context. Null when nothing is marked (→ whole-page fallback). */
function unionBox(
  rects: readonly PenRect[],
  figure: PenRect | undefined,
  imgW: number,
  imgH: number,
  padXFrac: number,
  padYFrac: number,
): PenRect | null {
  const boxes = figure ? [...rects, figure] : [...rects];
  if (boxes.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  const padX = Math.max((x1 - x0) * padXFrac, imgW * 0.035);
  const padY = Math.max((y1 - y0) * padYFrac, imgH * 0.03);
  x0 = Math.max(0, x0 - padX);
  y0 = Math.max(0, y0 - padY);
  x1 = Math.min(imgW, x1 + padX);
  y1 = Math.min(imgH, y1 + padY);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The crop the reel shows: the cited passage, grown to a minimum slice of the page (so a tiny
 *  one-line mark isn't magnified into a blurry JPEG and always carries a few lines of context) and
 *  clamped inside the page. Null in (nothing marked) → null out → the whole page is shown. */
function cropBox(box: PenRect | null, imgW: number, imgH: number): PenRect | null {
  if (!box) return null;
  const minW = imgW * 0.42;
  const minH = imgH * 0.13;
  let { x, y, w, h } = box;
  if (w < minW) {
    x -= (minW - w) / 2;
    w = minW;
  }
  if (h < minH) {
    y -= (minH - h) / 2;
    h = minH;
  }
  w = Math.min(w, imgW);
  h = Math.min(h, imgH);
  x = Math.max(0, Math.min(x, imgW - w));
  y = Math.max(0, Math.min(y, imgH - h));
  return { x, y, w, h };
}

export function DocumentMarkupSlide({ slots }: SlideProps<'markup'>) {
  const {
    pageImage,
    imgW,
    imgH,
    rects,
    figure,
    isFigure,
    seed,
    accent,
    color,
    title,
    explanation,
  } = slots;
  const fig = figure ?? undefined;
  // The explanation is the model's own words and can run to ~240 chars — the tier reflows a long
  // one smaller instead of stacking eight fixed-size lines under the page.
  const expl = fitText(explanation, BODY_TIERS);

  // No page raster (office/text/image doc): show the explanation on a clean card instead of a blank.
  if (!pageImage) {
    const head = fitText(title, TITLE_TIERS);
    return (
      <div
        style={{
          width: 'calc(var(--rw) * 78)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 3)',
          // forwards, not both: zero delay, so this costs nothing visible and avoids the card staying
          // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
          animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 'calc(var(--rw) * 10)',
            height: 'calc(var(--ru) * 0.9)',
            borderRadius: '999px',
            background: color,
          }}
        />
        {title && (
          <h2
            data-fit-tier={head.tier}
            style={{
              margin: 0,
              fontWeight: 800,
              fontFamily: 'var(--reel-sans)',
              letterSpacing: '-0.02em',
              color: 'var(--reel-ink)',
              ...head.style,
            }}
          >
            {title}
          </h2>
        )}
        <p
          data-fit-tier={expl.tier}
          style={{
            margin: 0,
            fontWeight: 500,
            fontFamily: 'var(--reel-sans)',
            color: 'color-mix(in oklab, var(--reel-ink) 78%, transparent)',
            ...expl.style,
          }}
        >
          {explanation}
        </p>
      </div>
    );
  }

  const strokes = penStrokes(rects, fig, isFigure, imgW, imgH, seed, accent);
  // Stroke weight scales with the page so it reads the same on any page resolution.
  const main = Math.max(2, imgW * 0.005);
  const halo = main * 2.6;

  // Crop to the cited passage so it reads as a snippet lifted out and shown up close — not a speck on
  // a full page. The crop box is the marked lines + a little context; `cropBox` grows it to a minimum
  // slice so a thin one-line mark isn't over-magnified into blur. The page is sized (not transformed)
  // so the crop fills the viewport — a held crop is robust in the export rasterizer, with no
  // per-instance keyframe to desync. A tighter `spot` box dims the surrounding context lines.
  const crop = cropBox(unionBox(rects, fig, imgW, imgH, 0.12, 0.4), imgW, imgH);
  const spot = unionBox(rects, fig, imgW, imgH, 0.04, 0.18);

  // The page, scaled within the crop viewport so the crop region fills it (crop.x/y → top-left).
  const pageStyle: CSSProperties = crop
    ? {
        position: 'absolute',
        width: `${((imgW / crop.w) * 100).toFixed(3)}%`,
        height: `${((imgH / crop.h) * 100).toFixed(3)}%`,
        left: `${(-(crop.x / crop.w) * 100).toFixed(3)}%`,
        top: `${(-(crop.y / crop.h) * 100).toFixed(3)}%`,
      }
    : { position: 'absolute', inset: 0 };

  // The spotlight: four dark bands around the spot box (no SVG mask/filter — those are unreliable in
  // the export rasterizer). The marked line's own faint band stays bright inside the hole.
  const dim = 'rgba(9, 11, 17, 0.55)';
  const bands: PenRect[] = spot
    ? [
        { x: 0, y: 0, w: imgW, h: spot.y },
        { x: 0, y: spot.y + spot.h, w: imgW, h: imgH - (spot.y + spot.h) },
        { x: 0, y: spot.y, w: spot.x, h: spot.h },
        { x: spot.x + spot.w, y: spot.y, w: imgW - (spot.x + spot.w), h: spot.h },
      ].filter((b) => b.w > 0 && b.h > 0)
    : [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the card staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      {title && (
        <div
          style={{
            font: '700 calc(var(--ru) * 2.7)/1.2 var(--reel-sans)',
            letterSpacing: '0.01em',
            color: 'var(--reel-ink)',
            textAlign: 'center',
            maxWidth: 'calc(var(--rw) * 86)',
          }}
        >
          {title}
        </div>
      )}

      {/* The viewport IS the crop: its aspect ratio is the snippet's, so the cited passage fills it
          up close. data-reel-marquee opts it out of FitScale's un-clip measure (intentional crop),
          so the finish is sized to the board, not the full page. */}
      <div
        data-reel-marquee=""
        style={{
          position: 'relative',
          width: 'calc(var(--rw) * 90)',
          maxHeight: 'calc(var(--ru) * 66)',
          aspectRatio: crop ? `${crop.w} / ${crop.h}` : `${imgW} / ${imgH}`,
          overflow: 'hidden',
          borderRadius: 'calc(var(--ru) * 1.6)',
          boxShadow: '0 calc(var(--ru) * 1.6) calc(var(--ru) * 4) rgba(15, 20, 30, 0.28)',
        }}
      >
        {/* The page + overlay sit 1:1; sizing places the crop region across the whole viewport. */}
        <div style={pageStyle}>
          <img
            src={pageImage}
            alt=""
            decoding="sync"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill' }}
          />
          <svg
            viewBox={`0 0 ${imgW} ${imgH}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', color }}
          >
            {/* spotlight bands — dim everything outside the marked passage */}
            {bands.map((b, i) => (
              <rect key={`d${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={dim} />
            ))}
            {/* a faint band marks where, under the pen gesture */}
            {rects.map((r, i) => (
              <rect
                key={`b${i}`}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill="currentColor"
                opacity={0.16}
              />
            ))}
            {strokes.map((s, i) => (
              <g
                key={`s${i}`}
                style={{
                  ['--len' as string]: 1,
                  animation: `reel-draw 0.7s ease-out ${0.35 + i * 0.4}s both`,
                }}
              >
                <path
                  d={s.d}
                  pathLength={1}
                  strokeDasharray={1}
                  fill={s.fill ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={halo}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.14}
                />
                <path
                  d={s.d}
                  pathLength={1}
                  strokeDasharray={1}
                  fill={s.fill ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={main}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.92}
                />
                {s.head && (
                  <path
                    d={s.head}
                    pathLength={1}
                    strokeDasharray={1}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={main}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.92}
                  />
                )}
                {s.label && (
                  // A written glyph beside the stroke (the question accent's "?") — the same
                  // hand-font stack the live pen uses; `size` is already in page-pixel space.
                  <text
                    x={s.label.x}
                    y={s.label.y}
                    textAnchor={s.label.anchor}
                    fontSize={s.label.size ?? 26}
                    fontWeight={700}
                    fill="currentColor"
                    opacity={0.92}
                    style={{
                      fontFamily:
                        "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Marker Felt', cursive",
                    }}
                  >
                    {s.label.text}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {explanation && (
        <p
          data-fit-tier={expl.tier}
          style={{
            margin: 0,
            maxWidth: 'calc(var(--rw) * 84)',
            fontWeight: 500,
            fontFamily: 'var(--reel-sans)',
            color: 'color-mix(in oklab, var(--reel-ink) 82%, transparent)',
            textAlign: 'center',
            ...expl.style,
          }}
        >
          {explanation}
        </p>
      )}
    </div>
  );
}
