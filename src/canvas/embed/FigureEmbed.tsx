// FigureEmbed — mount a real canvas component as a designed figure inside an export (PDF page or
// slide). It does three things the live canvas does not need: re-paint the block in the skin's
// palette (the token bridge), strip the live card chrome so the block sits on the skin's paper, and
// scale it to fit a fixed frame so it can never overflow the page. The block itself is the actual
// library component — never a re-implementation — so a figure looks exactly like the conversation.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { bridgeVars, type FigurePalette } from './bridge';
import { renderBlockBare, type BareBlock } from './renderBlockBare';
import { computeFitScale } from './fitScale';
import { unclipScrollers } from './unclip';
import './embed.css';

export type { FigurePalette } from './bridge';

export interface FigureEmbedProps {
  /** The original block, rendered at full fidelity. */
  block: BareBlock;
  /** The skin palette the block is re-painted in. */
  palette: FigurePalette;
  /** The fixed frame the figure must fit, in design px. Width is honoured exactly; height is a max
   *  the figure scales down to meet — so the figure can never overflow it. */
  frame: { w: number; h: number };
  /** A skin-styled label above the figure (e.g. "SANKEY", "FIG. 2"). */
  eyebrow?: string;
  /** A skin-styled caption below the figure (real narration / the block's own footer). */
  caption?: string;
  /** Freeze entrance motion for a deterministic raster capture (default true). Present passes
   *  false so figures animate in on stage. */
  frozen?: boolean;
  /** Allow enlarging a small figure up to this factor (default 1 = shrink-only, the document
   *  behaviour). The 16:9 stage opts in so a width-capped diagram fills its frame instead of
   *  floating small; the no-overflow contract holds in both axes (see the settle pass below). */
  maxUpscale?: number;
}

export function FigureEmbed({
  block,
  palette,
  frame,
  eyebrow,
  caption,
  frozen = true,
  maxUpscale = 1,
}: FigureEmbedProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  // The block's natural (unscaled) rendered height. Measured from the untransformed content, so it
  // is independent of the scale we then apply — no measure/scale feedback loop.
  const [naturalH, setNaturalH] = useState<number | null>(null);
  // The settled upscale candidate. Upscaling narrows the content box (so the painted width still
  // equals the frame width), which can re-wrap fluid content — so the candidate is chosen ONCE from
  // the first real measurement, then only the final scale adapts to the re-measured height. That
  // keeps the sizing monotone (no oscillation) and inert in jsdom, where nothing measures.
  const [upscale, setUpscale] = useState(1);

  useLayoutEffect(() => {
    setUpscale(1);
  }, [block, frame.w, frame.h, maxUpscale]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // Before the first read: a block that scrolls internally would otherwise measure at its capped
    // height, and both the raster and the paginator would believe that lie (see unclip.ts).
    unclipScrollers(el);
    const measure = () => setNaturalH(el.offsetHeight);
    measure();
    // Re-measure when async content (Shiki, KaTeX, images) changes the block's height.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [block, frame.w]);

  useLayoutEffect(() => {
    if (maxUpscale <= 1 || upscale !== 1 || !naturalH || naturalH <= 0) return;
    const k = computeFitScale(naturalH, frame.h, maxUpscale);
    // Only commit a worthwhile enlargement; a couple of percent is not worth a re-wrap.
    if (k > 1.05) setUpscale(k);
  }, [naturalH, upscale, maxUpscale, frame.h]);

  // The final scale re-checks the (possibly re-wrapped) height at the narrowed box, so the painted
  // figure can never exceed the frame in either axis: height by the fit math, width because the
  // content box is frame.w / upscale and the scale never exceeds the upscale.
  const scale = Math.min(upscale, computeFitScale(naturalH ?? 0, frame.h, upscale));
  const framedH = naturalH && naturalH > 0 ? naturalH * scale : undefined;

  return (
    <div
      className="figure-embed"
      data-theme-mode={palette.dark ? 'dark' : 'light'}
      {...(frozen ? { 'data-static': '' } : {})}
      style={{ width: frame.w, fontFamily: palette.font, ...bridgeVars(palette) } as CSSProperties}
    >
      {eyebrow && <div className="figure-embed__eyebrow">{eyebrow}</div>}
      <div
        className="figure-embed__frame"
        style={framedH !== undefined ? { height: framedH } : undefined}
      >
        <div className="figure-embed__scaler" style={{ ['--fit-scale']: scale } as CSSProperties}>
          <div
            className="figure-embed__content"
            ref={contentRef}
            style={upscale > 1 ? { width: frame.w / upscale, margin: '0 auto' } : undefined}
          >
            {renderBlockBare(block)}
          </div>
        </div>
      </div>
      {caption && <div className="figure-embed__caption">{caption}</div>}
    </div>
  );
}
