// MapLibre v6 is ESM-only and cannot locate its own worker under a bundler: import.meta.url
// points into the bundle graph, defaultWorkerUrl() returns '', and every map stalls silently
// right after the style's metadata loads — background paints, tiles never arrive. Vite must hand
// it the worker as a bundled asset before the first map is constructed (maplibre's documented
// bundler contract), so every map card loads MapLibre through here.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/** Load MapLibre lazily with its worker wired up; null when the chunk can't load (offline/CSP). */
export async function loadMapLibre(): Promise<typeof import('maplibre-gl') | null> {
  const ml = await import('maplibre-gl').catch(() => null);
  if (!ml?.Map) return null;
  ml.setWorkerUrl(workerUrl);
  // A single worker keeps maps useful on older machines without letting an incidental card fan
  // out across every CPU core. MapLibre shares this pool across all lazy map instances.
  if (ml.getWorkerCount() !== 1) ml.setWorkerCount(1);
  return ml;
}

/** The minimum every map card's teardown needs from MapLibre — structural, so a version bump
 *  cannot change the shape this module depends on. */
interface Disposable {
  remove: () => void;
}

/**
 * Release a map and its markers on unmount. Best-effort BY DESIGN, and that is the whole point:
 * every map card builds its map inside an async effect, so React can run the cleanup in the window
 * between `new ml.Map()` and the style finishing load. MapLibre 6.4 throws out of `remove()` in
 * exactly that window — its internal handlers are not constructed yet, so it reads `.destroy` off
 * undefined — where 6.3 tolerated it. An exception escaping here is the expensive failure: React
 * abandons the rest of the unmount, and the WebGL context, the tile requests and the resize
 * observer this call exists to release all survive the card that owned them.
 *
 * Markers are removed first and individually, so one detached marker cannot strand the map itself.
 */
export function disposeMap(
  map: Disposable | null | undefined,
  markers: readonly Disposable[],
): void {
  for (const marker of markers) {
    try {
      marker.remove();
    } catch {
      /* already detached with its parent — nothing left to release */
    }
  }
  try {
    map?.remove();
  } catch {
    /* torn down before it finished initialising; MapLibre owns what it could not release */
  }
}
