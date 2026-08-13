import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoMap } from '../src/canvas/blocks/media/GeoMap';
import { MapRoute } from '../src/canvas/blocks/media/MapRoute';

const mocks = vi.hoisted(() => ({
  maps: [] as Array<{
    options: Record<string, unknown>;
    fire: (event: string) => void;
    removed: boolean;
  }>,
  markers: [] as Array<{ element: HTMLElement; anchor?: string }>,
  workerCounts: [] as number[],
  workerCount: 2,
  workerUrls: [] as string[],
}));

// The bundled worker asset the runtime must hand to MapLibre before any map is constructed —
// v6 cannot find its own worker under a bundler, and without this every map stalls tileless.
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'blob:maplibre-worker',
}));

vi.mock('maplibre-gl', () => {
  class Map {
    private handlers = new globalThis.Map<string, Array<() => void>>();
    private sources = new Set<string>();
    readonly record: (typeof mocks.maps)[number];

    constructor(options: Record<string, unknown>) {
      this.record = {
        options,
        removed: false,
        fire: (event: string) => {
          for (const handler of this.handlers.get(event) ?? []) handler();
        },
      };
      mocks.maps.push(this.record);
    }
    on(event: string, handler: () => void): void {
      const current = this.handlers.get(event) ?? [];
      current.push(handler);
      this.handlers.set(event, current);
    }
    isStyleLoaded(): boolean {
      return true;
    }
    getSource(id: string): object | undefined {
      return this.sources.has(id) ? {} : undefined;
    }
    addSource(id: string): void {
      this.sources.add(id);
    }
    addLayer(): void {}
    fitBounds(): void {}
    setStyle(): void {
      this.sources.clear();
    }
    remove(): void {
      this.record.removed = true;
    }
  }
  class Marker {
    constructor(options: { element: HTMLElement; anchor?: string }) {
      mocks.markers.push(options);
    }
    setLngLat(): this {
      return this;
    }
    setPopup(): this {
      return this;
    }
    addTo(): this {
      return this;
    }
    remove(): void {}
  }
  class Popup {
    setDOMContent(): this {
      return this;
    }
  }
  class LngLatBounds {
    extend(): this {
      return this;
    }
  }
  return {
    Map,
    Marker,
    Popup,
    LngLatBounds,
    getWorkerCount: () => mocks.workerCount,
    setWorkerCount: (count: number) => {
      mocks.workerCount = count;
      mocks.workerCounts.push(count);
    },
    setWorkerUrl: (url: string) => {
      mocks.workerUrls.push(url);
    },
  };
});

const markers = [
  { name: 'Louvre', lat: 48.8606, lng: 2.3376 },
  { name: 'Tate Modern', lat: 51.5076, lng: -0.0994 },
];

const flushMapLibre = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  mocks.maps.length = 0;
  mocks.markers.length = 0;
  mocks.workerCounts.length = 0;
  mocks.workerCount = 2;
  mocks.workerUrls.length = 0;
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  vi.useRealTimers();
});

describe('GeoMap tile veil', () => {
  it("mounts veiled and unveils only when OpenFreeMap's vector map is idle", async () => {
    const { container } = render(<GeoMap title="Two museums" markers={markers} />);
    const map = container.querySelector('.geo-map')!;
    expect(map.getAttribute('data-tiles')).toBe('loading');
    expect(map.getAttribute('aria-busy')).toBe('true');

    await flushMapLibre();
    expect(map.getAttribute('data-tiles')).toBe('loading');
    await act(async () => mocks.maps[0].fire('idle'));
    expect(map.getAttribute('data-tiles')).toBe('ready');
    expect(map.getAttribute('aria-busy')).toBe('false');
  });

  it('uses only the commercially permitted OpenFreeMap service and caps map workers', async () => {
    render(<GeoMap title="Two museums" markers={markers} />);
    await flushMapLibre();

    expect(mocks.maps[0].options.style).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(mocks.maps[0].options.attributionControl).toEqual(
      expect.objectContaining({ compact: false }),
    );
    expect(mocks.maps[0].options.maxTileCacheSize).toBe(48);
    expect(mocks.workerCounts).toEqual([1]);
  });

  it('keeps interactive attribution and an export-safe ODbL credit on both map types', async () => {
    const assertCredit = (container: HTMLElement) => {
      const credit = container.querySelector('.geo-map-credit');
      expect(credit?.textContent).toContain('OpenFreeMap');
      expect(credit?.textContent).toContain('© OpenMapTiles');
      expect(credit?.textContent).toContain('Data © OpenStreetMap contributors (ODbL)');
      expect(credit?.textContent).toContain('https://www.openstreetmap.org/copyright');
      expect(
        credit?.querySelector('a[href="https://www.openstreetmap.org/copyright"]'),
      ).toBeTruthy();
    };

    const geo = render(<GeoMap title="Two museums" markers={markers} />);
    assertCredit(geo.container);
    await flushMapLibre();
    geo.unmount();

    const route = render(
      <MapRoute
        title="Museum route"
        waypoints={markers.map((marker) => ({ ...marker, label: marker.name }))}
      />,
    );
    assertCredit(route.container);
    await flushMapLibre();

    expect(mocks.maps).toHaveLength(2);
    for (const map of mocks.maps) {
      expect(map.options.attributionControl).toEqual(expect.objectContaining({ compact: false }));
    }
  });

  it('wires the bundled worker asset before constructing a map (v6 bundler contract)', async () => {
    render(<GeoMap title="Two museums" markers={markers} />);
    await flushMapLibre();

    expect(mocks.workerUrls).toEqual(['blob:maplibre-worker']);
    expect(mocks.maps).toHaveLength(1);
  });

  it('the 8s cap drops the veil when the tile service is slow', async () => {
    const { container } = render(<GeoMap title="Slow CDN" markers={markers} />);
    await flushMapLibre();
    const map = container.querySelector('.geo-map')!;

    act(() => vi.advanceTimersByTime(7999));
    expect(map.getAttribute('data-tiles')).toBe('loading');
    act(() => vi.advanceTimersByTime(1));
    expect(map.getAttribute('data-tiles')).toBe('ready');
  });

  it('re-arms the cap when a theme flip re-veils the map', async () => {
    const { container } = render(<GeoMap title="Theme flip" markers={markers} />);
    await flushMapLibre();
    const map = container.querySelector('.geo-map')!;
    await act(async () => mocks.maps[0].fire('idle'));
    expect(map.getAttribute('data-tiles')).toBe('ready');

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    expect(map.getAttribute('data-tiles')).toBe('loading');

    // The swapped style never loads — without a fresh cap the veil would shimmer forever.
    act(() => vi.advanceTimersByTime(8000));
    expect(map.getAttribute('data-tiles')).toBe('ready');
  });

  it('centres each pin on its coordinate and names it for assistive tech', async () => {
    render(<GeoMap title="Two museums" markers={markers} />);
    await flushMapLibre();

    expect(mocks.markers).toHaveLength(2);
    // Centre is MapLibre's default; anchoring the tail-less badge at its bottom would float it
    // half a pin north of the place it names.
    expect(mocks.markers[0].anchor).toBeUndefined();
    expect(mocks.markers[0].element.getAttribute('role')).toBe('button');
    expect(mocks.markers[0].element.getAttribute('aria-label')).toBe('Louvre');
    expect(mocks.markers[1].element.getAttribute('aria-label')).toBe('Tate Modern');
  });

  it('describes nothing it is not showing when there are no locations', () => {
    const { container } = render(
      <GeoMap
        title="Zones only"
        markers={[]}
        zones={[
          {
            label: 'Riverside',
            category: 'residential',
            coords: [
              [51.5, -0.1],
              [51.6, -0.1],
              [51.6, -0.2],
            ],
          },
        ]}
      />,
    );

    expect(container.textContent).toContain('No locations to map.');
    // No map on screen → nothing to drag, and no legend for zones that were never drawn.
    expect(container.textContent).not.toContain('drag to explore');
    expect(container.querySelector('.geo-zone-legend')).toBeNull();
  });

  it('still shows an authored footer with nothing to map', () => {
    const { container } = render(
      <GeoMap title="Nowhere" markers={[]} footer="Coordinates arrive with the next reading." />,
    );
    expect(container.textContent).toContain('Coordinates arrive with the next reading.');
  });

  it('unmount clears the cap timer and releases the map', async () => {
    const { unmount } = render(<GeoMap title="Leak check" markers={markers} />);
    await flushMapLibre();
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.maps[0].removed).toBe(true);
  });
});
