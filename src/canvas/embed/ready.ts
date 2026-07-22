// ready — wait for an embedded figure's async content to settle before the rasterizer captures it.
//
// A real component can load resources after its first paint: a code block loads its bundled Shiki
// chunk and swaps in highlighted lines, an equation loads bundled KaTeX, an <img> decodes. The raster
// path renders + flushes + waits two frames, which is enough for synchronous SVG but would snapshot
// a code block as its un-highlighted fallback or an image as blank. This gate, awaited on the
// mounted host before `domToCanvas`, lets those settle — bounded, so a slow CDN degrades to a
// best-effort capture instead of hanging the export. Leak-free: the only timers are the bounded
// races, each cleared when it resolves.
import { nextFrame } from '../../lib/nextFrame';
import { bounded } from '../../lib/bounded';

/** Decode every image under `host` so the raster captures pixels, not blank boxes. A broken or
 *  cross-origin image rejects — `allSettled` keeps one bad image from blocking the rest. */
async function settleImages(host: HTMLElement, perImageMs: number): Promise<void> {
  const imgs = Array.from(host.querySelectorAll('img'));
  if (!imgs.length) return;
  await Promise.allSettled(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      const done =
        typeof img.decode === 'function'
          ? img.decode()
          : new Promise<void>((resolve, reject) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => reject(new Error('img')), { once: true });
            });
      return bounded(done, perImageMs);
    }),
  );
}

/** True while any embedded Leaflet map is still loading its tiles — a fixed-size map doesn't grow
 *  the host, so the height poll can't see it; this does. A map container with no tiles yet, or any
 *  tile not yet flagged `leaflet-tile-loaded`, counts as pending. */
function mapsPending(host: HTMLElement): boolean {
  const maps = host.querySelectorAll('.leaflet-container');
  for (const m of maps) {
    if (!m.querySelector('.leaflet-tile')) return true; // map mounted, tiles not requested yet
    if (m.querySelector('.leaflet-tile:not(.leaflet-tile-loaded)')) return true; // tiles in flight
  }
  return false;
}

export interface FigureReadyOpts {
  /** Overall ceiling before giving up and capturing whatever has rendered (default 5000ms). */
  timeoutMs?: number;
  /** Per-image decode ceiling (default 3000ms). */
  perImageMs?: number;
}

/**
 * Wait for the figures under `host` to settle before capture — bounded by `timeoutMs`. Async
 * content lands in two ways: Shiki/KaTeX grow the rendered height (watched by the height poll), and
 * Leaflet maps load fixed-size tiles (watched explicitly). Once both are quiet, every `<img>` —
 * including map tiles — is decoded so the raster captures pixels, not blanks. Generic: a new
 * embeddable family needs no change unless it loads async in a way neither signal catches. A no-op
 * where there is no layout (jsdom: no rAF / zero-size host), so it never stalls a test.
 */
export async function ensureFigureReady(
  host: HTMLElement,
  opts: FigureReadyOpts = {},
): Promise<void> {
  if (typeof document === 'undefined') return;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const perImageMs = opts.perImageMs ?? 3000;

  if (typeof document.fonts?.ready?.then === 'function') {
    await bounded(document.fonts.ready, Math.min(timeoutMs, 3000));
  }

  // Poll until the rendered height holds steady AND no map is still loading tiles.
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let stable = 0;
  while (Date.now() < deadline) {
    await nextFrame();
    const pending = mapsPending(host);
    const h = host.scrollHeight;
    if (h === last && !pending) {
      stable += 1;
      if (stable >= 2) break;
    } else {
      stable = 0;
      last = h;
    }
    if (h === 0 && !pending) break; // no layout (jsdom) — nothing to wait for
  }

  // Decode every image (incl. now-loaded map tiles) so the raster captures real pixels.
  await settleImages(host, perImageMs);
}
