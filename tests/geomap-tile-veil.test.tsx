import { render, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoMap } from '../src/canvas/blocks/media/GeoMap';

// The tile veil: a geomap renders behind a shimmer (data-tiles='loading') until Leaflet reports
// the first complete tile load — or until the 8s honest-degrade cap drops the veil over whatever
// has arrived. The listener must survive the CARTO→OSM fallback swap (the errored layer takes its
// pending 'load' with it), and the cap timer must never outlive the map.

const { tileLayers } = vi.hoisted(() => ({
  tileLayers: [] as Array<{ url: string; fire: (event: string) => void }>,
}));

vi.mock('leaflet', () => {
  // Just enough Leaflet for GeoMap's wiring: layers record their handlers and expose a fire()
  // through the registry so tests can play tile events; everything else is inert.
  const tileLayer = (url: string) => {
    const once: Record<string, Array<() => void>> = {};
    const on: Record<string, Array<() => void>> = {};
    const layer = {
      addTo: () => layer,
      on: (event: string, handler: () => void) => {
        (on[event] ??= []).push(handler);
      },
      once: (event: string, handler: () => void) => {
        (once[event] ??= []).push(handler);
      },
      setUrl: () => {},
    };
    tileLayers.push({
      url,
      fire: (event: string) => {
        const oneshots = once[event] ?? [];
        once[event] = [];
        for (const handler of oneshots) handler();
        for (const handler of on[event] ?? []) handler();
      },
    });
    return layer;
  };
  return {
    default: {
      map: () => ({
        removeLayer: () => {},
        fitBounds: () => {},
        setView: () => {},
        remove: () => {},
      }),
      tileLayer,
      polygon: () => ({ addTo: () => ({ bindPopup: () => {} }) }),
      divIcon: () => ({}),
      marker: () => ({ addTo: () => ({ bindPopup: () => {} }) }),
    },
  };
});

const markers = [
  { name: 'Louvre', lat: 48.8606, lng: 2.3376 },
  { name: 'Tate Modern', lat: 51.5076, lng: -0.0994 },
];

// flush the lazy import('leaflet') + the map wiring inside the mount effect
const flushLeaflet = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  tileLayers.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GeoMap tile veil', () => {
  it("mounts veiled — data-tiles='loading' + aria-busy — and unveils on the first tile load", async () => {
    const { container } = render(<GeoMap title="Two museums" markers={markers} />);
    const map = container.querySelector('.geo-map')!;
    expect(map.getAttribute('data-tiles')).toBe('loading');
    expect(map.getAttribute('aria-busy')).toBe('true');

    // Leaflet wired but no tile has finished — still veiled.
    await flushLeaflet();
    expect(map.getAttribute('data-tiles')).toBe('loading');

    await act(async () => tileLayers[0].fire('load'));
    expect(map.getAttribute('data-tiles')).toBe('ready');
    expect(map.getAttribute('aria-busy')).toBe('false');
  });

  it('the 8s cap drops the veil even when no load event ever arrives', async () => {
    const { container } = render(<GeoMap title="Slow CDN" markers={markers} />);
    await flushLeaflet();
    const map = container.querySelector('.geo-map')!;

    act(() => vi.advanceTimersByTime(7999));
    expect(map.getAttribute('data-tiles')).toBe('loading');
    act(() => vi.advanceTimersByTime(1));
    expect(map.getAttribute('data-tiles')).toBe('ready');
  });

  it('re-arms the load listener on the OSM fallback layer after a tileerror swap', async () => {
    const { container } = render(<GeoMap title="Blocked basemap" markers={markers} />);
    await flushLeaflet();

    await act(async () => tileLayers[0].fire('tileerror'));
    expect(tileLayers).toHaveLength(2);
    const map = container.querySelector('.geo-map')!;
    expect(map.getAttribute('data-tiles')).toBe('loading');

    await act(async () => tileLayers[1].fire('load'));
    expect(map.getAttribute('data-tiles')).toBe('ready');
  });

  it('unmount clears the cap timer — nothing left ticking', async () => {
    const { unmount } = render(<GeoMap title="Leak check" markers={markers} />);
    await flushLeaflet();
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
