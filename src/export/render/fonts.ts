// Loads a skin's web fonts and resolves once they're actually ready to paint. This is the single
// most important correctness step for the raster pipeline: capturing before web fonts settle
// rasterizes fallback (system) fonts, so every capture awaits this first.
//
// `document.fonts.ready` alone is not enough. A freshly-injected <link> declares its @font-face
// rules but doesn't *download* a face until something paints with it, so `ready` can resolve
// against the system fallbacks before the skin's faces are even pending — and the capture uses the
// wrong font. `ensureFacesLoaded` closes that race by explicitly requesting each face it needs
// (`document.fonts.load`) and waiting for those loads, not just for the generic "ready" signal.
// Both the slide deck pipeline and the document measure/export/print paths share this primitive.

import type { SlideFonts } from '../../slides/skins/types';

const injected = new Map<string, Promise<void>>();

/** One face a pipeline needs warmed before capture: a family at a weight, normal or italic. */
export interface FaceSpec {
  family: string;
  weight: number;
  style?: 'italic';
}

/** Resolve after `ms`, clearing its own timer so no handle leaks when it wins (or loses) a race. */
function timeout(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      resolve();
    }, ms);
  });
}

/**
 * Inject a font stylesheet exactly once per href, resolving once its `@font-face` rules are
 * actually registered (the link's `load`/`error` event) or a short ceiling elapses. Every caller
 * for the same href shares this one promise — critical when two skins reference the same family:
 * `document.fonts.load()` only matches faces the browser has already parsed out of a stylesheet,
 * so calling it in the same tick as appending the `<link>` races the fetch and silently finds
 * nothing (verified against a real build — a same-origin file that resolves in ~10ms still loses
 * that race). Bounded well under `ensureFacesLoaded`'s own ceiling so a stylesheet that never
 * settles (or an environment with no real network, like jsdom in tests) can't stall the export.
 */
function injectLink(href: string): Promise<void> {
  const pending = injected.get(href);
  if (pending) return pending;

  if (typeof document === 'undefined') return Promise.resolve();

  const existing = document.querySelector(`link[data-export-font="${cssEscape(href)}"]`);
  if (existing) {
    // Already in the DOM from an earlier mount — its stylesheet has long since settled.
    const settled = Promise.resolve();
    injected.set(href, settled);
    return settled;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.exportFont = href;
  const settles = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
  document.head.appendChild(link);

  const promise = Promise.race([settles, timeout(1000)]);
  injected.set(href, promise);
  return promise;
}

/** The `document.fonts.load()` shorthand spec string for one face. */
function loadSpec(face: FaceSpec): string {
  const style = face.style === 'italic' ? 'italic ' : '';
  return `${style}${face.weight} 1em "${face.family}"`;
}

/**
 * Inject `hrefs` and resolve once every face in `faces` is loaded (or a bounded ceiling elapses).
 * The shared race-free path: explicitly requests each face via `document.fonts.load` rather than
 * trusting the generic `ready` signal. Used by the slide deck pipeline and the document
 * measurement/export/print paths alike. Never throws — a missing/unreachable face degrades to a
 * fallback face rather than blocking or failing the export.
 *
 * `hrefs` accepts one stylesheet (a slide skin's single href) or several (a document skin's own
 * family file plus any families it shares with other skins). Each is injected through the same
 * deduped `injectLink` — critical when two skins share a family (Hanken Grotesk, IBM Plex Sans…):
 * injecting that family's declarations from *more than one* stylesheet, even indirectly via a
 * per-skin wrapper's `@import`, registers duplicate `@font-face` bindings, and Chromium's
 * `document.fonts.load`/`check` then don't reliably resolve against the one that's actually
 * loaded. Routing every skin through the *same* href for a shared family — deduped here — is what
 * keeps each family's faces registered exactly once no matter how many skins reference it.
 */
export async function ensureFacesLoaded(
  hrefs: string | string[],
  faces: FaceSpec[],
): Promise<void> {
  if (typeof document === 'undefined') return;
  const hrefList = Array.isArray(hrefs) ? hrefs : [hrefs];

  // jsdom / very old browsers expose no usable Font Loading API — fall back to the generic ready
  // signal (bounded) and move on. This is the branch unit tests hit when `document.fonts` is absent.
  if (!('fonts' in document) || typeof document.fonts.load !== 'function') {
    for (const href of hrefList) void injectLink(href);
    try {
      await Promise.race([document.fonts?.ready, timeout(4000)]);
    } catch {
      /* no Font Loading API — text renders in a fallback face */
    }
    return;
  }

  // Every stylesheet must actually be parsed (its @font-face rules registered) before requesting
  // a face — see injectLink's doc comment for why calling `document.fonts.load` any earlier loses
  // the race and silently finds nothing.
  await Promise.all(hrefList.map(injectLink));

  const loads = faces.map((face) => document.fonts.load(loadSpec(face)).catch(() => undefined));
  // Race the whole batch (plus the generic ready) against a ceiling so a slow/unreachable font
  // can't hang the export — a missing face degrades to a fallback face rather than blocking forever.
  await Promise.race([Promise.allSettled([...loads, document.fonts.ready]), timeout(4000)]);
}

/** Skins whose display family carries meaning in italic — slide layouts use it for emphasis. */
const ITALIC_DISPLAY = /Newsreader|Spectral|Cormorant|Source Serif|DM Serif/;

/**
 * The faces (family+weight+style) a slide skin actually paints with: the display headline weight,
 * the body weights the layouts use (400/600/700 around the skin's default), the mono kicker, and
 * one italic of the display family for serif emphasis.
 */
function slideFaces(f: SlideFonts): FaceSpec[] {
  const display = familyName(f.display);
  const body = familyName(f.body);
  const faces: FaceSpec[] = [];

  // De-dupe requested weights per family (display and body can resolve to the same family).
  const byFamily = new Map<string, Set<number>>();
  const want = (family: string, weight: number) => {
    const set = byFamily.get(family) ?? new Set<number>();
    set.add(weight);
    byFamily.set(family, set);
  };

  want(display, f.displayWeight ?? 700);
  want(body, f.bodyWeight ?? 400);
  want(body, 600);
  want(body, 700);
  if (f.mono) want(familyName(f.mono), 700);

  for (const [family, weights] of byFamily) {
    for (const weight of weights) faces.push({ family, weight });
  }

  // One italic of the display family for skins that lean on italic emphasis.
  if (f.allSerif || ITALIC_DISPLAY.test(display)) {
    faces.push({ family: display, weight: f.displayWeight ?? 700, style: 'italic' });
  }
  return faces;
}

/**
 * The set of `document.fonts.load` shorthand specs a slide skin actually paints with. Exported so
 * a unit test can assert enumeration without touching real fonts.
 */
export function facesFromFonts(f: SlideFonts): string[] {
  return slideFaces(f).map(loadSpec);
}

/**
 * Inject a slide skin's fonts and resolve only once the specific faces it paints with are loaded —
 * the race-free path for the slide raster pipeline.
 */
export async function ensureSlideFontsLoaded(fonts: SlideFonts): Promise<void> {
  return ensureFacesLoaded(fonts.href, slideFaces(fonts));
}

/**
 * The bare family name from a quoted CSS font value: `familyName("'Newsreader', serif")` →
 * `"Newsreader"`. Takes the first stack entry and strips its quotes. Exported for the unit test.
 */
export function familyName(value: string): string {
  const first = value.split(',')[0]?.trim() ?? value;
  return first.replace(/^['"]|['"]$/g, '');
}

/** Minimal attribute-selector escaping for the href value. */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
