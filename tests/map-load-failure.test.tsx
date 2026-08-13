import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoMap } from '../src/canvas/blocks/media/GeoMap';
import { MapRoute } from '../src/canvas/blocks/media/MapRoute';

// The lazy MapLibre chunk can fail to arrive (offline mid-demo, a strict CSP). Both map cards must
// say so straight away instead of shimmering out the 8s cap and then fading to an empty slab.
vi.mock('../src/canvas/blocks/media/maplibreRuntime', () => ({
  loadMapLibre: () => Promise.resolve(null),
}));

const markers = [{ name: 'Louvre', lat: 48.8606, lng: 2.3376 }];
const waypoints = [
  { label: 'Trailhead', lat: 46.8, lng: 8.2 },
  { label: 'Summit', lat: 46.82, lng: 8.24 },
];

const flushMapLibre = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('map cards when MapLibre cannot load', () => {
  it('GeoMap drops the veil, explains itself, and promises no interaction', async () => {
    const { container } = render(<GeoMap title="Two museums" markers={markers} />);
    await flushMapLibre();

    expect(container.textContent).toContain('Map couldn’t load.');
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(container.textContent).not.toContain('drag to explore');
    // the 8s cap is cleared, not left to fire over a card that already settled
    expect(vi.getTimerCount()).toBe(0);
  });

  it('GeoMap keeps an authored footer when the map is missing', async () => {
    const { container } = render(
      <GeoMap title="Two museums" markers={markers} footer="Both sit on the river." />,
    );
    await flushMapLibre();

    expect(container.textContent).toContain('Both sit on the river.');
  });

  it('MapRoute explains the missing map but keeps the itinerary', async () => {
    const { container } = render(<MapRoute title="Ridge walk" waypoints={waypoints} />);
    await flushMapLibre();

    expect(container.textContent).toContain('Map couldn’t load.');
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(container.querySelectorAll('.mr-row')).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
