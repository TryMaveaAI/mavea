// A map card builds its map inside an async effect, so React can run the cleanup in the window
// between `new ml.Map()` and the style finishing load. MapLibre 6.4 throws out of `remove()` in
// exactly that window — it reads `.destroy` off an internal handler it has not constructed yet —
// where 6.3 tolerated it, and the maplibre-gl 6.3 → 6.4 bump surfaced it as an unmount crash on
// every surface carrying a map.
//
// An exception escaping the cleanup is the expensive half: React abandons the rest of the unmount,
// so the WebGL context, the tile requests and the observers that `remove()` exists to release all
// outlive the card. These cases pin the teardown as best-effort — the version that throws must be
// survivable, and one bad marker must not strand the map behind it.
import { describe, expect, it, vi } from 'vitest';
import { disposeMap } from '../src/canvas/blocks/media/maplibreRuntime';

/** What MapLibre 6.4 does when torn down before it finished initialising. */
const throwsLikeMaplibre64 = () => {
  throw new TypeError("Cannot read properties of undefined (reading 'destroy')");
};

describe('disposeMap — unmount must survive a half-built map', () => {
  it('does not rethrow when the map throws mid-initialisation', () => {
    const map = { remove: vi.fn(throwsLikeMaplibre64) };
    expect(() => disposeMap(map, [])).not.toThrow();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it('still releases the map when a marker throws first', () => {
    // Markers are removed before the map, so an unguarded marker loop would strand the WebGL
    // context behind it — the single most expensive thing this teardown is responsible for.
    const map = { remove: vi.fn() };
    const bad = { remove: vi.fn(throwsLikeMaplibre64) };
    const good = { remove: vi.fn() };
    expect(() => disposeMap(map, [bad, good])).not.toThrow();
    expect(good.remove).toHaveBeenCalledTimes(1);
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it('releases every marker and the map on the ordinary path', () => {
    const map = { remove: vi.fn() };
    const markers = [{ remove: vi.fn() }, { remove: vi.fn() }];
    disposeMap(map, markers);
    for (const marker of markers) expect(marker.remove).toHaveBeenCalledTimes(1);
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the effect is cleaned up before the map exists', () => {
    // The async load can be cancelled before `new ml.Map()` ever runs (offline, CSP, a fast
    // unmount), which leaves the local binding null.
    expect(() => disposeMap(null, [])).not.toThrow();
    expect(() => disposeMap(undefined, [])).not.toThrow();
  });
});
