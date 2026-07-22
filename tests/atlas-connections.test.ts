// atlas-connections.test.ts — the cross-life arcs only join neighborhoods that genuinely co-occur in
// time, and the time window narrows what counts. The real-data-only rule applied to the prettiest
// part of the map: never invent a relationship, and never show a stale one when scoped to "recent".
import { describe, expect, it } from 'vitest';
import { connectionArcs } from '../src/live/atlas/connections';
import type { Neighborhood } from '../src/live/atlas/neighborhoods';
import type { HoodPlace } from '../src/live/atlas/flight';
import type { AtlasRecord } from '../src/live/atlas/store';

const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;

function rec(id: string, savedAt: number): AtlasRecord {
  return { id, question: id, title: id, firstSeen: savedAt, savedAt, blocks: 3 };
}

/** A neighborhood active in the given week-offsets from `base` (one record per week). */
function hood(id: string, base: number, weekOffsets: number[]): Neighborhood {
  return {
    id,
    name: id.toUpperCase(),
    color: 'var(--presence)',
    records: weekOffsets.map((w, i) => rec(`${id}-${i}`, base + w * WEEK)),
  };
}

const places: HoodPlace[] = [
  { x: 100, y: 100, rx: 60, ry: 40 },
  { x: 300, y: 100, rx: 60, ry: 40 },
  { x: 200, y: 300, rx: 60, ry: 40 },
];

describe('connectionArcs', () => {
  it('joins two neighborhoods that share enough active weeks', () => {
    const base = 1_000_000 * WEEK; // a fixed, deterministic epoch
    const hoods = [
      hood('a', base, [0, 1, 2]),
      hood('b', base, [0, 1, 2]),
      hood('c', base, [10, 20, 30]), // active, but never overlapping a or b
    ];
    const arcs = connectionArcs(hoods, places, 0);
    expect(arcs).toHaveLength(1);
    expect([arcs[0].a, arcs[0].b].sort()).toEqual([0, 1]);
    expect(arcs[0].label).toContain('weeks');
  });

  it('draws nothing when no two neighborhoods co-occur', () => {
    const base = 1_000_000 * WEEK;
    const hoods = [hood('a', base, [0, 1, 2]), hood('b', base, [50, 51, 52])];
    expect(connectionArcs(hoods, places, 0)).toEqual([]);
  });

  it('narrows to the time window — a recent window drops an old co-occurrence', () => {
    const now = 2_000_000 * WEEK;
    // a & b co-occurred long ago (40+ weeks back) but not recently.
    const hoods = [hood('a', now - 40 * WEEK, [0, 1, 2]), hood('b', now - 40 * WEEK, [0, 1, 2])];
    // All time: the old overlap counts.
    expect(connectionArcs(hoods, places, 0)).toHaveLength(1);
    // Last month: nothing recent → no arc.
    expect(connectionArcs(hoods, places, now - 30 * DAY)).toEqual([]);
  });

  it('surfaces a recent co-occurrence within the window', () => {
    const now = 2_000_000 * WEEK;
    const hoods = [hood('a', now - 2 * WEEK, [0, 1, 2]), hood('b', now - 2 * WEEK, [0, 1, 2])];
    // The records span the last ~3 weeks, so even a one-month window keeps the overlap.
    expect(connectionArcs(hoods, places, now - 30 * DAY)).toHaveLength(1);
  });

  it('draws more than one arc when several neighborhoods co-occur', () => {
    const base = 1_000_000 * WEEK;
    // Three neighborhoods all sharing the same active weeks → all three pairs co-occur.
    const hoods = [
      hood('a', base, [0, 1, 2]),
      hood('b', base, [0, 1, 2]),
      hood('c', base, [0, 1, 2]),
    ];
    const arcs = connectionArcs(hoods, places, 0);
    // a-b, a-c, b-c — a constellation, not a single hero line.
    expect(arcs).toHaveLength(3);
    const pairs = arcs.map((a) => `${a.a}-${a.b}`).sort();
    expect(pairs).toEqual(['0-1', '0-2', '1-2']);
  });

  it('finds a day-level co-occurrence inside a last-week window', () => {
    const now = 2_000_000 * WEEK;
    // Both active on the same two days within the last week — too short to ever share two *weeks*,
    // so the window must co-occur by day or it would always come up empty.
    const recOn = (id: string, days: number[]): AtlasRecord[] =>
      days.map((d, i) => rec(`${id}-${i}`, now - d * DAY));
    const hoods: Neighborhood[] = [
      { id: 'a', name: 'A', color: 'var(--presence)', records: recOn('a', [1, 3]) },
      { id: 'b', name: 'B', color: 'var(--presence)', records: recOn('b', [1, 3]) },
    ];
    const arcs = connectionArcs(hoods, places, now - 7 * DAY);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].label).toContain('day');
  });
});
