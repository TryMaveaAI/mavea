import { describe, it, expect } from 'vitest';
import { packLane } from '../src/canvas/blocks/flows/roadmapLayout';
import type { RoadmapItem } from '../src/canvas/blocks/flows/types';

const it_ = (startQ: number, spanQ: number, label = ''): RoadmapItem => ({ label, startQ, spanQ });

// The roadmap places lane bars by column. Before this, every bar sat on grid-row 1, so two items in
// the same column rendered on top of each other (the "negotiation lifecycle" overlap). packLane is
// the interval-partitioning that drops overlapping bars onto separate rows.
describe('packLane — overlapping roadmap bars stack instead of colliding', () => {
  it('puts two items that share a column on different rows', () => {
    const { rowOf, rows } = packLane([it_(0, 1, 'Define BATNA'), it_(0, 1, 'Identify Goals')], 3);
    expect(rows).toBe(2);
    expect(rowOf[0]).not.toBe(rowOf[1]);
  });

  it('keeps non-overlapping items on a single row', () => {
    const { rowOf, rows } = packLane([it_(0, 1), it_(1, 1), it_(2, 1)], 3);
    expect(rows).toBe(1);
    expect(rowOf).toEqual([0, 0, 0]);
  });

  it('packs minimally — a third overlapping item reuses the first freed row', () => {
    // A spans [0,2), B spans [0,1), C spans [1,2): A forces a second row for B; C fits beside A's
    // row only if it starts at/after A ends (it doesn't), so it shares B's row (both end-to-start ok).
    const { rows, rowOf } = packLane([it_(0, 2, 'A'), it_(0, 1, 'B'), it_(1, 1, 'C')], 2);
    expect(rows).toBe(2);
    // A and B overlap → different rows; B ends at col 1 and C starts at col 1 → C reuses B's row.
    expect(rowOf[0]).not.toBe(rowOf[1]);
    expect(rowOf[2]).toBe(rowOf[1]);
  });

  it('clamps an over-long span to the grid when detecting overlap', () => {
    // spanQ 9 on a 3-column grid is clamped to reach the edge; a second item at col 0 still overlaps.
    const { rows } = packLane([it_(0, 9), it_(0, 1)], 3);
    expect(rows).toBe(2);
  });

  it('handles an empty lane', () => {
    expect(packLane([], 3)).toEqual({ rowOf: [], rows: 1 });
  });
});
