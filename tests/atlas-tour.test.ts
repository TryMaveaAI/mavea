// atlas-tour.test.ts — "Fly the tour" must show the whole map, not just the handful of neighborhoods
// the current session happened to touch. The bug it guards: the tour used to iterate tonight's trail
// (usually 1–2 stops), so on a busy atlas it stalled after a node or two. tourOrder now opens on the
// trail, then covers the rest by proximity, capped so a large atlas still finishes in one breath.
import { describe, expect, it } from 'vitest';
import { tourOrder, MAX_TOUR_STOPS, type HoodPlace } from '../src/live/atlas/flight';

/** A line of places along the x axis, so nearest-neighbour order is easy to reason about. */
function lineOfPlaces(n: number): HoodPlace[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * 100, y: 0, rx: 40, ry: 25 }));
}

describe('tourOrder', () => {
  it('covers every neighborhood, not just the session trail', () => {
    const places = lineOfPlaces(5);
    const order = tourOrder([2], places); // session only touched hood 2
    expect(order).toHaveLength(5);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('opens on the session trail, in order', () => {
    const places = lineOfPlaces(5);
    const order = tourOrder([3, 1], places);
    expect(order.slice(0, 2)).toEqual([3, 1]);
    expect(order).toHaveLength(5);
  });

  it('fills the rest by nearest-neighbour from the last stop', () => {
    const places = lineOfPlaces(4); // x = 0,100,200,300
    // Start at 0; nearest unvisited each step walks 0→1→2→3 along the line.
    expect(tourOrder([0], places)).toEqual([0, 1, 2, 3]);
  });

  it('caps a large atlas at MAX_TOUR_STOPS', () => {
    const order = tourOrder([], lineOfPlaces(40));
    expect(order).toHaveLength(MAX_TOUR_STOPS);
  });

  it('starts from the largest hood when the session touched nothing', () => {
    // Index 0 is the largest neighborhood by construction (the layout sizes from hoods[0]).
    expect(tourOrder([], lineOfPlaces(3))[0]).toBe(0);
  });

  it('is empty for an empty map', () => {
    expect(tourOrder([1, 2], [])).toEqual([]);
  });
});
