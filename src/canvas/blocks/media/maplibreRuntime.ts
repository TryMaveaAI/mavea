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
