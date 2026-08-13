// Presentation export: render a composed slide deck to a landscape PDF (or, via exportPptx.tsx, a
// real .pptx). Reuses the document pipeline's font-settling + rasterizer (modern-screenshot + jsPDF,
// both lazy-loaded chunks), differing only in page geometry. Each slide is rendered at its true
// 1920×1080 size with NO ancestor transform, so capture is 1:1 and the PDF matches the on-screen
// preview exactly. `rasterizeDeckImages` is the shared offscreen-mount-then-capture step: both the
// PDF assembly below and exportPptx.tsx call it rather than each carrying their own copy of the
// mount/font-settle/figure-wait dance.
/* eslint-disable react-refresh/only-export-components -- a pipeline module: it exports the export
   functions + the PDF page-size constants, not components (DeckView is internal). */
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { SlideCanvas } from '../../slides';
import type { Slide } from '../../slides/model/Slide';
import { slideNotes } from '../../slides/model/notes';
import { STAGE_W } from '../../slides/skins/chrome/bits';
import type { SlideSkin } from '../../slides/skins/types';
import { ensureSlideFontsLoaded } from '../render/fonts';
import { ensureFigureReady } from '../../canvas/embed';
import { nextFrame } from '../../lib/nextFrame';
import {
  ExportCancelledError,
  type PdfMetadata,
  type RasterPage,
  type RasterScale,
  rasterizePages,
  rasterToPdf,
} from './raster';
import '../export-print.css';

/** 16:9 PDF page (px). 1280×720 keeps the file small; slides render at 1920 and downscale crisply. */
export const SLIDE_PDF_W = 1280;
export const SLIDE_PDF_H = 720;

function DeckView({ slides, skin, accent }: { slides: Slide[]; skin: SlideSkin; accent?: string }) {
  return (
    <>
      {slides.map((s, i) => (
        <SlideCanvas
          key={s.id}
          slide={s}
          skin={skin}
          ctx={{ index: i, total: slides.length }}
          accent={accent}
        />
      ))}
    </>
  );
}

/** The same deck, with each slide's speaker-notes line printed in a band underneath it — the notes
 *  print handout's DOM (see `printDeckWithNotes` below). */
function DeckViewWithNotes({
  slides,
  skin,
  accent,
}: {
  slides: Slide[];
  skin: SlideSkin;
  accent?: string;
}) {
  return (
    <>
      {slides.map((s, i) => (
        <div className="slide-page-notes" key={s.id}>
          <SlideCanvas
            slide={s}
            skin={skin}
            ctx={{ index: i, total: slides.length }}
            accent={accent}
          />
          <div className="slide-notes-block">
            <div className="slide-notes-label">Speaker notes</div>
            <p className="slide-notes-text">{slideNotes(s) || 'No notes for this slide.'}</p>
          </div>
        </div>
      ))}
    </>
  );
}

/** Mount `slides` offscreen at their true 1920×1080 size (no ancestor transform → capture is 1:1)
 *  and wait for fonts + embedded figures (Shiki/KaTeX/images) to settle. Callers must rasterize (or
 *  print) the returned host and then call `cleanup` — always, even on a throw, so the offscreen host
 *  and React root never leak. */
async function mountDeckOffscreen(
  slides: Slide[],
  skin: SlideSkin,
  accent: string | undefined,
): Promise<{ host: HTMLDivElement; cleanup: () => void }> {
  await ensureSlideFontsLoaded(skin.fonts);

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${STAGE_W}px`,
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => {
    root.render(<DeckView slides={slides} skin={skin} accent={accent} />);
  });
  await nextFrame();
  await nextFrame();
  await ensureFigureReady(host);
  return {
    host,
    cleanup: () => {
      root.unmount();
      host.remove();
    },
  };
}

/**
 * Mount the deck offscreen and rasterize every slide to an image — the shared step behind
 * `exportDeckToPdf` below and the pptx export path (`exportPptx.tsx`'s `exportDeckToPptx`), so
 * neither duplicates the offscreen-mount/font-settle/figure-wait machinery.
 */
export async function rasterizeDeckImages(
  slides: Slide[],
  skin: SlideSkin,
  opts: {
    scale: RasterScale;
    accent?: string;
    jpegQuality?: number;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<RasterPage[]> {
  if (opts.signal?.aborted) throw new ExportCancelledError();
  const { host, cleanup } = await mountDeckOffscreen(slides, skin, opts.accent);
  try {
    return await rasterizePages(host, {
      scale: opts.scale,
      background: skin.tokens.paper,
      pageSelector: '.slide-page',
      jpegQuality: opts.jpegQuality,
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
  } finally {
    cleanup();
  }
}

/** Render the deck to a landscape PDF Blob (the primary, pixel-perfect presentation export). */
export async function exportDeckToPdf(
  slides: Slide[],
  skin: SlideSkin,
  opts: {
    scale: RasterScale;
    accent?: string;
    jpegQuality?: number;
    properties?: PdfMetadata;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<Blob> {
  // Bail before mounting an offscreen deck if the export was already cancelled.
  if (opts.signal?.aborted) throw new ExportCancelledError();
  const { host, cleanup } = await mountDeckOffscreen(slides, skin, opts.accent);
  try {
    return await rasterToPdf(host, {
      scale: opts.scale,
      background: skin.tokens.paper,
      format: [SLIDE_PDF_W, SLIDE_PDF_H],
      orientation: 'landscape',
      pageSelector: '.slide-page',
      jpegQuality: opts.jpegQuality,
      properties: opts.properties,
      pageNoun: 'Slide',
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
  } finally {
    // Runs even when rasterToPdf throws (cancel / timeout / unavailable), so the offscreen host
    // and React root never leak.
    cleanup();
  }
}

/** Portal `render()` into a body-level node with class `className`, print, then tear it down once
 *  the dialog closes. Shared lifecycle behind `printDeck` and `printDeckWithNotes` below — cleans up
 *  on `afterprint`, with a timeout net so it can't leak if that event misfires. */
async function printPortal(className: string, render: () => ReactElement): Promise<void> {
  if (typeof document === 'undefined') return;

  const host = document.createElement('div');
  host.className = className;
  // The portal is `display: none` until the print rules reveal it, and a node with no layout can
  // never settle its async figures — same reasoning (and same undo) as printFallback.printDoc.
  Object.assign(host.style, {
    display: 'block',
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${STAGE_W}px`,
  });
  document.body.appendChild(host);
  const root = createRoot(host);

  let done = false;
  let timer = 0;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener('afterprint', cleanup);
    if (timer) clearTimeout(timer);
    document.body.classList.remove('mavea-printing');
    root.unmount();
    host.remove();
  };

  try {
    flushSync(() => {
      root.render(render());
    });
    await nextFrame();
    await nextFrame();
    await ensureFigureReady(host);
    host.removeAttribute('style');
    timer = window.setTimeout(cleanup, 120_000);
    window.addEventListener('afterprint', cleanup);
    document.body.classList.add('mavea-printing');
    window.print();
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * The vector "Print / Save as PDF" path for a deck: portal the slides into a body-level node and
 * print. Each slide is its true 1920×1080 block on a matching landscape page (no transform → text
 * stays selectable).
 */
export async function printDeck(slides: Slide[], skin: SlideSkin, accent?: string): Promise<void> {
  if (typeof document === 'undefined') return;
  await ensureSlideFontsLoaded(skin.fonts);
  await printPortal('mavea-export-doc mavea-export-slides', () => (
    <DeckView slides={slides} skin={skin} accent={accent} />
  ));
}

/** The notes-handout variant of `printDeck`: the same vector pages, plus each slide's speaker-notes
 *  line printed in a band underneath it (export-print.css's `.slide-page-notes` rules), for a
 *  presenter's paper copy rather than the audience-facing deck. Uses its own page class so its rules
 *  never leak onto the plain deck print above. */
export async function printDeckWithNotes(
  slides: Slide[],
  skin: SlideSkin,
  accent?: string,
): Promise<void> {
  if (typeof document === 'undefined') return;
  await ensureSlideFontsLoaded(skin.fonts);
  await printPortal('mavea-export-doc mavea-export-slides-notes', () => (
    <DeckViewWithNotes slides={slides} skin={skin} accent={accent} />
  ));
}
