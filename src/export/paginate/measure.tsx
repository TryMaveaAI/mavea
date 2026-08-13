// Offscreen measurement: render every section and the page chrome at the skin's real content
// width with its real fonts, read each element's height, and hand pagination exact numbers.
// Because measurement renders through the same components as the preview and PDF, measured
// height equals rendered height — the basis for WYSIWYG.
import { Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { contentHeight, contentWidth, type PageFormat } from './geometry';
import { ensureFacesLoaded } from '../render/fonts';
import { RenderSection } from '../render/ExportDoc';
import { nextFrame } from '../../lib/nextFrame';
import { ensureFigureReady } from '../../canvas/embed';
import type { ExportMeta, Section } from '../model/ExportDoc';
import type { TemplateSkin } from '../skins/types';

type Style = React.CSSProperties & Record<`--${string}`, string | number>;

export interface MeasureResult {
  /** Sections with `measuredH` filled in. */
  sections: Section[];
  /** Usable content height on page 1 and on later pages. */
  contentH1: number;
  contentHRest: number;
}

/**
 * Measure a skin's chrome and the document's sections. Mounts an offscreen, font-loaded tree,
 * reads heights, then tears everything down. Returns the page-fit numbers pagination needs.
 */
export async function measureDoc(
  meta: ExportMeta,
  sections: Section[],
  skin: TemplateSkin,
  accent?: string,
  format: PageFormat = 'letter',
): Promise<MeasureResult> {
  await ensureFacesLoaded(skin.fonts.hrefs, skin.fonts.faces);

  const host = document.createElement('div');
  host.className = 'ex-measure-host';
  host.setAttribute('aria-hidden', 'true');
  // Mirrors Page.tsx's own accent/tint derivation so a measured section is painted exactly like the
  // page that will render it. Colour only — it has no bearing on the heights read back below.
  const tint =
    accent && accent !== skin.tokens.accent
      ? `color-mix(in oklab, ${accent} 10%, ${skin.tokens.pageBg})`
      : skin.tokens.tint;
  const hostStyle: Style = {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${contentWidth(skin.tokens.padding, skin.tokens.pageBorderLeft, format)}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
    color: skin.tokens.ink,
    fontFamily: skin.fonts.body,
    '--accent': accent ?? skin.tokens.accent,
    '--tint': tint,
  };
  Object.assign(host.style, hostStyle as Record<string, string>);
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    // A single page's chrome (rendered through the real components) gives masthead/header/footer
    // heights; each section is wrapped so its own height can be read back by id.
    flushSync(() => {
      root.render(
        <Fragment>
          <div data-m="masthead">
            <skin.chrome.masthead meta={meta} skin={skin} />
          </div>
          <div data-m="runningHeader">
            <skin.chrome.runningHeader meta={meta} skin={skin} />
          </div>
          <div data-m="footer">
            <skin.chrome.footer meta={meta} skin={skin} page={1} total={1} />
          </div>
          {sections.map((s) => (
            <div key={s.id} data-mid={s.id}>
              <RenderSection section={s} skin={skin} format={format} />
            </div>
          ))}
        </Fragment>,
      );
    });
    await nextFrame();
    await nextFrame();
    // A figure can load async content (Shiki, KaTeX, a MapLibre map) that changes its height after
    // first paint — wait for it to settle before reading heights, or a figure could measure
    // artificially short here and then render taller than measured at real export time.
    if (sections.some((s) => s.kind === 'figure')) {
      await ensureFigureReady(host);
    }

    const heightOf = (sel: string): number =>
      (host.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect().height ?? 0;

    const mastheadH = heightOf('[data-m="masthead"]');
    const runningH = heightOf('[data-m="runningHeader"]');
    const footerH = heightOf('[data-m="footer"]');

    const measured = sections.map((s) => ({
      ...s,
      measuredH: heightOf(`[data-mid="${cssAttr(s.id)}"]`),
    }));

    return {
      sections: measured,
      contentH1: contentHeight(skin.tokens.padding, mastheadH, footerH, format),
      contentHRest: contentHeight(skin.tokens.padding, runningH, footerH, format),
    };
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Escape a section id for use inside an attribute selector. */
function cssAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
