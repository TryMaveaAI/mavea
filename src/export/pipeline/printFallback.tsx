// The vector "Print / Save as PDF" path: mount the document into a `.mavea-export-doc` portal at
// the <body> root (so export-print.css can isolate it from the live app), print, then tear it
// down once the dialog closes. Selectable, searchable text and a tiny file — the accessible
// counterpart to the pixel-perfect raster export.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ExportDocView } from '../render/ExportDoc';
import { ensureFacesLoaded } from '../render/fonts';
import { nextFrame } from '../../lib/nextFrame';
import type { ExportDoc } from '../model/ExportDoc';
import type { TemplateSkin } from '../skins/types';
import '../export-print.css';

/** Render `doc` into an off-canvas print portal and open the print dialog. Cleans up on
 *  `afterprint` (with a long timeout safety net so the portal can't leak if the event misfires). */
export async function printDoc(doc: ExportDoc, skin: TemplateSkin, accent?: string): Promise<void> {
  if (typeof document === 'undefined') return;
  await ensureFacesLoaded(skin.fonts.hrefs, skin.fonts.faces);

  const host = document.createElement('div');
  host.className = 'mavea-export-doc';
  document.body.appendChild(host);
  const root = createRoot(host);

  // Install the teardown net BEFORE rendering so a throw in the render can't leak the root/host.
  // `.mavea-printing` gates export-print.css's "hide everything else" rule to this print only.
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
      root.render(<ExportDocView doc={doc} skin={skin} accent={accent} />);
    });
    await nextFrame();
    await nextFrame();
    timer = window.setTimeout(cleanup, 120_000);
    window.addEventListener('afterprint', cleanup);
    document.body.classList.add('mavea-printing');
    window.print();
  } catch (err) {
    cleanup();
    throw err;
  }
}
