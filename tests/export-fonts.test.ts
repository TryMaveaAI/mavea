// export-fonts.test.ts — guards the font enumeration that fixes the raster pipeline's font-load
// race, for both the slide deck and document pipelines. `ensureFacesLoaded` (and its slide-skin
// wrapper `ensureSlideFontsLoaded`) must request each face a skin actually paints with (via
// `document.fonts.load`), not just await the generic `document.fonts.ready` — which can resolve
// against system fallbacks before the skin's faces are even pending, capturing the wrong font.
// It also guards that every document skin's fonts are self-hosted (public/fonts/), not a live
// Google Fonts CDN request — the CDN link is blocked outright by the app's CSP (font-src/
// style-src are both 'self') and, even without that, silently falls back to system fonts when the
// network is offline or slow.
//
// Tests exercising the real-Font-Loading-API branch use fake timers: `ensureFacesLoaded` now
// awaits each injected stylesheet's `load`/`error` event (or a bounded ceiling) before requesting
// a face — jsdom never fires those events for a `<link>`, so without fake timers every such test
// would burn the real ~1s ceiling. Advancing past it is what stands in for "the stylesheet settled".
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureFacesLoaded,
  ensureSlideFontsLoaded,
  facesFromFonts,
  familyName,
} from '../src/export/render/fonts';
import { folio } from '../src/slides/skins/registry';
import { SKIN_ORDER, SKINS } from '../src/export/skins/registry';

/** Install a minimal Font Loading API stub (jsdom has none) and return its `load` spy. */
function stubFontsApi() {
  const load = vi.fn(() => Promise.resolve([]));
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load, ready: Promise.resolve() },
  });
  return load;
}

describe('familyName — bare family from a quoted CSS font value', () => {
  it('takes the first stack entry and strips quotes', () => {
    expect(familyName("'Newsreader', serif")).toBe('Newsreader');
    expect(familyName('"Hanken Grotesk", sans-serif')).toBe('Hanken Grotesk');
    expect(familyName('Archivo')).toBe('Archivo');
  });
});

describe('facesFromFonts — the faces a slide skin paints with', () => {
  it("enumerates folio's display, body weight set, and a serif italic", () => {
    const faces = facesFromFonts(folio.fonts);

    // Display headline at the skin's display weight (folio is 500).
    expect(faces).toContain('500 1em "Newsreader"');
    // The body weight set the layouts use (default + 600 + 700).
    expect(faces).toContain('400 1em "Hanken Grotesk"');
    expect(faces).toContain('600 1em "Hanken Grotesk"');
    expect(faces).toContain('700 1em "Hanken Grotesk"');
    // Newsreader is an italic-emphasis serif, so its italic is requested.
    expect(faces).toContain('italic 500 1em "Newsreader"');
  });

  it('de-dupes weights when display and body resolve to the same family', () => {
    const allArchivo = {
      href: 'https://example.test/archivo.css',
      display: "'Archivo', sans-serif",
      body: "'Archivo', sans-serif",
      displayWeight: 700,
      bodyWeight: 600,
    };
    const faces = facesFromFonts(allArchivo);
    const archivo = faces.filter((f) => f.includes('"Archivo"'));
    // 700 (display) + 600 (body default) + 600 + 700 → de-duped to {600, 700}; no italic (sans).
    expect(new Set(archivo).size).toBe(archivo.length);
    expect(archivo.sort()).toEqual(['600 1em "Archivo"', '700 1em "Archivo"']);
  });
});

describe('ensureSlideFontsLoaded — requests every enumerated face once', () => {
  afterEach(() => {
    // The Font Loading API isn't native to jsdom; remove the stub so other suites see a clean doc.
    Reflect.deleteProperty(document, 'fonts');
    vi.useRealTimers();
  });

  it('calls document.fonts.load once per face for folio (incl. the serif italic)', async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();

    const done = ensureSlideFontsLoaded(folio.fonts);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    const expected = facesFromFonts(folio.fonts);
    expect(load).toHaveBeenCalledTimes(expected.length);
    for (const spec of expected) expect(load).toHaveBeenCalledWith(spec);
    expect(load).toHaveBeenCalledWith('italic 500 1em "Newsreader"');
  });
});

describe('document skin fonts.hrefs — self-hosted, never a live Google Fonts CDN request', () => {
  it('every one of the 10 skins points only at local /fonts/ stylesheets', () => {
    for (const id of SKIN_ORDER) {
      const hrefs = SKINS[id].fonts.hrefs;
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href.startsWith('/fonts/')).toBe(true);
        expect(href.includes('fonts.googleapis.com')).toBe(false);
      }
      // Each skin declares at least one face — an empty list would silently warm nothing.
      expect(SKINS[id].fonts.faces.length).toBeGreaterThan(0);
    }
  });

  it('a family shared by two skins resolves to the exact same stylesheet URL', () => {
    // Sharing a URL (not just a family name) is what lets ensureFacesLoaded's href dedup prevent
    // duplicate @font-face registration — see the ensureFacesLoaded/injectLink doc comments.
    const jetbrainsHref = SKINS.editorial.fonts.hrefs.find((h) => h.includes('jetbrains-mono'));
    expect(jetbrainsHref).toBeTruthy();
    expect(SKINS.terminal.fonts.hrefs).toContain(jetbrainsHref);

    expect(SKINS.medical.fonts.hrefs).toContain('/fonts/fonts.css');
    expect(SKINS.executive.fonts.hrefs).toContain('/fonts/fonts.css');
  });
});

describe('document skin faces — the exact set ensureFacesLoaded warms per skin', () => {
  it("enumerates editorial's Instrument Serif (incl. italic), Hanken Grotesk, and JetBrains Mono", () => {
    const faces = SKINS.editorial.fonts.faces;
    expect(faces).toContainEqual({ family: 'Instrument Serif', weight: 400 });
    expect(faces).toContainEqual({ family: 'Instrument Serif', weight: 400, style: 'italic' });
    expect(faces).toContainEqual({ family: 'Hanken Grotesk', weight: 700 });
    expect(faces).toContainEqual({ family: 'JetBrains Mono', weight: 500 });
  });

  it("enumerates research's Spectral (incl. italic) and IBM Plex Sans", () => {
    const faces = SKINS.research.fonts.faces;
    expect(faces).toContainEqual({ family: 'Spectral', weight: 600 });
    expect(faces).toContainEqual({ family: 'Spectral', weight: 500, style: 'italic' });
    expect(faces).toContainEqual({ family: 'IBM Plex Sans', weight: 700 });
    // Research's display italic tops out at 500 — 600 italic was never part of the reference.
    expect(faces).not.toContainEqual({ family: 'Spectral', weight: 600, style: 'italic' });
  });
});

describe('ensureFacesLoaded — the document export/print/measure paths share this primitive', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'fonts');
    vi.useRealTimers();
  });

  it("requests every face in editorial's list exactly once", async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();

    const done = ensureFacesLoaded(SKINS.editorial.fonts.hrefs, SKINS.editorial.fonts.faces);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    expect(load).toHaveBeenCalledTimes(SKINS.editorial.fonts.faces.length);
    expect(load).toHaveBeenCalledWith('italic 400 1em "Instrument Serif"');
    expect(load).toHaveBeenCalledWith('600 1em "Hanken Grotesk"');
    expect(load).toHaveBeenCalledWith('500 1em "JetBrains Mono"');
  });

  it("requests every face in swiss's list exactly once (a single family up to weight 900)", async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();

    const done = ensureFacesLoaded(SKINS.swiss.fonts.hrefs, SKINS.swiss.fonts.faces);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    expect(load).toHaveBeenCalledTimes(SKINS.swiss.fonts.faces.length);
    expect(load).toHaveBeenCalledWith('900 1em "Archivo"');
  });

  it('injects one <link> per href, none pointed at a Google Fonts CDN', async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();
    // Synthetic, test-local hrefs — real skin hrefs can already be cached from an earlier test in
    // this file (injectLink dedupes for the life of the module, matching a real session), so
    // asserting exact <link> counts needs hrefs no other test could have touched.
    const hrefs = [
      '/fonts/export/families/__test-link-a.css',
      '/fonts/export/families/__test-link-b.css',
    ];

    const done = ensureFacesLoaded(hrefs, [{ family: 'Test', weight: 400 }]);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    for (const href of hrefs) {
      const link = document.querySelector(`link[data-export-font="${href}"]`);
      expect(link?.getAttribute('href')).toBe(href);
      expect(link?.getAttribute('href')).not.toContain('fonts.googleapis.com');
    }
    expect(load).toHaveBeenCalledWith('400 1em "Test"');
  });

  it('a family shared by two skins is only ever injected once across a session', async () => {
    vi.useFakeTimers();
    stubFontsApi();
    const sharedHref = '/fonts/export/families/__test-shared.css';

    const before = document.head.querySelectorAll(`link[data-export-font="${sharedHref}"]`).length;

    const first = ensureFacesLoaded([sharedHref], [{ family: 'Test', weight: 400 }]);
    await vi.advanceTimersByTimeAsync(1500);
    await first;
    const afterFirst = document.head.querySelectorAll(
      `link[data-export-font="${sharedHref}"]`,
    ).length;

    const second = ensureFacesLoaded([sharedHref], [{ family: 'Test', weight: 500 }]);
    await vi.advanceTimersByTimeAsync(1500);
    await second;
    const afterSecond = document.head.querySelectorAll(
      `link[data-export-font="${sharedHref}"]`,
    ).length;

    expect(afterFirst).toBe(before + 1);
    // The second call (a different skin sharing the same family) must not add a second <link>.
    expect(afterSecond).toBe(afterFirst);
  });
});
