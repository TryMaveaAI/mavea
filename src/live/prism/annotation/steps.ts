// One annotation the reader saw Mavéa draw — captured so the reel can replay it faithfully.
// Rects live in canvas-pixel space alongside `imgW`/`imgH`, so the reel finish can set
// viewBox="0 0 imgW imgH" and reuse `penStrokes` to redraw the exact mark. Color is concrete
// (never a `var(--…)` token, which would resolve to the app theme and rasterize wrong).
import type { PenAccent, PenRect } from '../../annotate/penStrokes';

export interface AnnotationStep {
  /** JPEG dataURL of the rendered page; '' for office/text/image sources that have no raster. */
  pageImage: string;
  /** Natural pixels of `pageImage` — the coordinate space of `rects`/`figure`. */
  imgW: number;
  imgH: number;
  /** The cited line bars; empty when the quote couldn't be located (caption-only). */
  rects: PenRect[];
  /** A figure/diagram box to lasso, when the claim is a figure. */
  figure?: PenRect;
  isFigure: boolean;
  /** Stable wobble seed (`${source}:${page}:${quote}`) → identical strokes live and in the reel. */
  seed: string;
  /** Claim-aware judgment ink (a load-bearing star, a forecast's "?") — recorded so the reel
   *  replays exactly what the live pen drew. */
  accent?: PenAccent;
  /** Concrete ink color (hex/rgb), e.g. '#a855f7'. */
  color: string;
  /** The claim title, or a short label for an Ask answer. */
  title: string;
  /** The spoken/shown explanation (Ask readout, deterministic claim line, or briefing beat). */
  explanation: string;
}

/** The geometry a source-panel surface emits once its content is rendered with the pen on — the
 *  overlay adds the color/title/explanation (which it knows from the panel view) to make a full
 *  {@link AnnotationStep}. */
export interface PenGeometry {
  pageImage: string;
  imgW: number;
  imgH: number;
  rects: PenRect[];
  figure?: PenRect;
  isFigure: boolean;
  seed: string;
}
