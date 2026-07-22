// Render the document to a PDF Blob. Crucially this mounts a FRESH copy of the pages at their
// natural page width (816 Letter / 794 A4) with NO ancestor transform, then rasterizes that — the
// on-screen preview is scaled down via CSS transform, and modern-screenshot mis-measures a
// transformed ancestor (content laid out at full width captured into a shrunken box → right-edge
// clipping). Capturing an untransformed mount guarantees the PDF matches the page exactly.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { pageSize } from '../paginate/geometry';
import { ExportDocView } from '../render/ExportDoc';
import { ensureFacesLoaded } from '../render/fonts';
import { ensureFigureReady } from '../../canvas/embed';
import { nextFrame } from '../../lib/nextFrame';
import { ExportCancelledError, type PdfMetadata, rasterToPdf, type RasterScale } from './raster';
import type { ExportDoc } from '../model/ExportDoc';
import type { TemplateSkin } from '../skins/types';

export async function exportDocToPdf(
  doc: ExportDoc,
  skin: TemplateSkin,
  opts: {
    scale: RasterScale;
    accent?: string;
    properties?: PdfMetadata;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<Blob> {
  // Bail before mounting an offscreen document if the export was already cancelled.
  if (opts.signal?.aborted) throw new ExportCancelledError();
  await ensureFacesLoaded(skin.fonts.hrefs, skin.fonts.faces);

  const size = pageSize(doc.format);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${size.width}px`,
    // No transform, no scaling — the pages render at exactly their natural size so capture is 1:1.
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(<ExportDocView doc={doc} skin={skin} accent={opts.accent} />);
    });
    await nextFrame();
    await nextFrame();
    // Embedded figures may load async content (Shiki, KaTeX, images) after first paint — let them
    // settle so the raster captures the real visual, not a blank/half-loaded box.
    await ensureFigureReady(host);
    return await rasterToPdf(host, {
      scale: opts.scale,
      background: skin.tokens.dark ? skin.tokens.pageBg : '#ffffff',
      properties: opts.properties,
      onProgress: opts.onProgress,
      signal: opts.signal,
      documentMode: true,
      format: [size.width, size.height],
    });
  } finally {
    root.unmount();
    host.remove();
  }
}
