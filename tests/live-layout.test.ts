import { describe, it, expect } from 'vitest';
import { adaptiveCols, CORE_SPANS } from '../src/live/layout';
import { retileSection } from '../src/canvas/hooks/useResponsiveGrid';
import { catalogSpan } from '../src/live/select/catalog';
import { CATALOG_FACTS } from '../src/canvas/blocks/catalog/facts';
import type { Block } from '../src/data/conversation';

const blk = (type: string): Block =>
  ({ type, col: 6, delay: 0, props: { title: 't' } }) as unknown as Block;
const blkCol = (type: string, col: number): Block =>
  ({ type, col, delay: 0, props: { title: 't' } }) as unknown as Block;

/** Reconstruct the laid-out rows by accumulating spans up to a full 12. */
function rows(blocks: Block[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let sum = 0;
  for (const b of blocks) {
    cur.push(b.col);
    sum += b.col;
    if (sum >= 12) {
      out.push(cur);
      cur = [];
      sum = 0;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

describe('adaptiveCols', () => {
  it('passes an empty canvas through', () => {
    expect(adaptiveCols([])).toEqual([]);
  });

  it('fills every row to exactly 12 and never slivers, for 1..9 blocks', () => {
    for (let n = 1; n <= 9; n++) {
      const blocks = Array.from({ length: n }, (_, i) => blk(i % 2 ? 'chart' : 'insight'));
      const out = adaptiveCols(blocks);
      for (const b of out) {
        expect(b.col).toBeGreaterThanOrEqual(3); // no unreadable sliver
        expect(b.col).toBeLessThanOrEqual(12);
      }
      for (const row of rows(out)) {
        expect(row.reduce((a, c) => a + c, 0)).toBe(12);
      }
    }
  });

  it('makes a single block a full-width hero', () => {
    expect(adaptiveCols([blk('insight')])[0].col).toBe(12);
  });

  it('returns a block BY REFERENCE when its col is already right', () => {
    // The canvas's memoized cards skip re-rendering only while identity holds, so a re-tile
    // that changes nothing must hand back the same objects — never fresh clones.
    const first = adaptiveCols([blk('insight'), blk('chart'), blk('list')]);
    const again = adaptiveCols(first);
    expect(again[0]).toBe(first[0]);
    expect(again[1]).toBe(first[1]);
    expect(again[2]).toBe(first[2]);
    // And a block whose col must change still comes back as a new object (input untouched).
    const wrong = { ...first[0], col: 1 };
    const fixed = adaptiveCols([wrong])[0];
    expect(fixed).not.toBe(wrong);
    expect(wrong.col).toBe(1);
    expect(fixed.col).toBe(12);
  });

  it('splits two equal blocks down the middle', () => {
    expect(adaptiveCols([blk('insight'), blk('insight')]).map((b) => b.col)).toEqual([6, 6]);
  });

  it('tiles three compact blocks evenly', () => {
    const out = adaptiveCols([blk('insight'), blk('insight'), blk('insight')]);
    expect(out.map((b) => b.col)).toEqual([4, 4, 4]);
  });

  it('balances four compact blocks into 6+6 / 6+6 (no lone hero)', () => {
    const out = adaptiveCols([blk('insight'), blk('insight'), blk('insight'), blk('insight')]);
    expect(out.map((b) => b.col)).toEqual([6, 6, 6, 6]);
  });

  it('gives a wide block its own row instead of starving a neighbor', () => {
    // a comparison wants the full width; the two stats share the next row evenly
    const out = adaptiveCols([blk('compare'), blk('insight'), blk('insight')]);
    expect(out.map((b) => b.col)).toEqual([12, 6, 6]);
  });

  it('folds a trailing orphan into an even 3-up row instead of stranding it full-width', () => {
    // Three half-width blocks used to lay out 6+6 then a lone 12 with its content stranded in a
    // narrow strip — the void the screenshots showed. They now tile as one even 4+4+4 row.
    const out = adaptiveCols([blk('list'), blk('list'), blk('list')]);
    expect(out.map((b) => b.col)).toEqual([4, 4, 4]);
  });

  it('never strands the last block: five half-width blocks tile 6+6 / 4+4+4', () => {
    const out = adaptiveCols([blk('list'), blk('list'), blk('list'), blk('list'), blk('list')]);
    expect(out.map((b) => b.col)).toEqual([6, 6, 4, 4, 4]);
  });

  it('pairs a stat with a wide comparison instead of stranding both full-width (mid-canvas orphans)', () => {
    // The verdict-then-comparison case from the screenshots: an insight (min 4) can share a row with
    // a comparison (min 8) since 4+8 = 12, so they tile 4+8 rather than each ballooning to a lone 12.
    const out = adaptiveCols([blk('insight'), blk('compare'), blk('list'), blk('list')]);
    expect(out.map((b) => b.col)).toEqual([4, 8, 6, 6]);
  });

  it('keeps a genuinely wide block (min 8) full-width rather than crushing it into a pair', () => {
    // compare has min 8, so it can never legally share a 12-col row with another min-8 block —
    // the fold must respect that and leave each on its own full-width row.
    const out = adaptiveCols([blk('compare'), blk('compare')]);
    expect(out.map((b) => b.col)).toEqual([12, 12]);
  });

  it('respects catalog minima with the catalog span lookup (no sliver, full rows)', () => {
    const types = ['insight', 'breakdown', 'ring', 'kpi', 'gauge', 'donut', 'stack'];
    const blocks = types.map(blk);
    const out = adaptiveCols(blocks, (b) => catalogSpan((b as { type: string }).type));
    for (const b of out) expect(b.col).toBeGreaterThanOrEqual(3);
    for (const row of rows(out)) expect(row.reduce((a, c) => a + c, 0)).toBe(12);
  });
});

describe('retileSection — each concept section fills its own width', () => {
  // The flat pass packs blocks ACROSS section boundaries into full rows, so a section split back
  // out can inherit partial spans (e.g. two col-4 cards filling only 8/12 — a narrow, left-aligned
  // block with an empty right edge). Re-tiling the section on its own must refill it to full width.
  it('fills a 2-block section whose flat spans were col-4 (6+6, not a partial 4+4)', () => {
    const out = retileSection([blkCol('insight', 4), blkCol('list', 4)], 12);
    expect(rows(out)).toHaveLength(1);
    expect(out.reduce((a, b) => a + b.col, 0)).toBe(12);
  });
  it('leaves no partial/left-aligned row in a 3-block section (every row fills 12)', () => {
    // adaptiveCols may keep same-height blocks together (4+4+4) or split mixed heights into two
    // full rows (6+6, then 12) — either way EVERY row must fill the width, never a lonely col-4.
    const out = retileSection([blkCol('insight', 4), blkCol('chart', 4), blkCol('list', 4)], 12);
    for (const row of rows(out)) expect(row.reduce((a, c) => a + c, 0)).toBe(12);
  });
  it('gives a lone-block section the full width', () => {
    expect(retileSection([blkCol('insight', 4)], 12).map((b) => b.col)).toEqual([12]);
  });
  it('passes an empty section through unchanged', () => {
    expect(retileSection([], 12)).toEqual([]);
  });
});

// The re-tile path is a SECOND layout pass with a DIFFERENT span lookup, and it is the one that
// runs on every container resize (useResponsiveGrid's ResizeObserver). The suite above covers
// adaptiveCols with the catalog lookup (the generateLive path) and retileSection with core types
// only — insight/list/chart are all in CORE_SPANS. Neither combination can see an extended type
// losing its floor, which is how `colMin` came to be honoured at generation and discarded on
// resize for all 595 extended components.
describe('retileSection — the catalog floor survives a resize', () => {
  const floorOf = (type: string) => catalogSpan(type)?.min ?? 0;

  it('keeps a dense block at its declared floor instead of the generic fallback', () => {
    // datatable declares colMin 8; the generic FALLBACK is 4.
    expect(floorOf('datatable')).toBeGreaterThan(4);
    const out = retileSection([blkCol('datatable', 8), blkCol('insight', 4)], 12);
    const table = out.find((b) => (b as { type: string }).type === 'datatable')!;
    expect(table.col).toBeGreaterThanOrEqual(floorOf('datatable'));
  });

  it('never places ANY catalog type below its own declared floor, in the house silhouette', () => {
    // The floor only binds when the row is under PRESSURE. A dense block alone in a 2-block row
    // gets what it wants either way; put it beside two compact neighbours — insight + kpi, which
    // is the house silhouette — and the tiler packs three across, so `min` is what decides whether
    // the dense one keeps its width or is crushed to a quarter. Measured: at budgets 12 and 9 this
    // is the difference for all 541 types whose declared floor exceeds the generic fallback of 4
    // (e.g. `reasoning`, floor 6, was laid out at col-4).
    for (const budget of [12, 9]) {
      const offenders: string[] = [];
      for (const facts of CATALOG_FACTS) {
        const floor = floorOf(facts.type);
        const out = retileSection(
          [blkCol(facts.type, facts.colDefault), blkCol('insight', 4), blkCol('kpi', 4)],
          budget,
        );
        if (out[0].col < floor) offenders.push(`${facts.type} ${out[0].col} < ${floor}`);
      }
      expect({ budget, offenders }).toEqual({ budget, offenders: [] });
    }
  });

  it('holds the floor proportionally at every narrower budget', () => {
    // scaleSpec scales min by budget/12, and adaptiveCols maps the result back to CSS 12-col —
    // so a floor of 8 stays a floor of ~8 in CSS terms at budget 9, 6 and 4, not a collapse to 4.
    for (const budget of [12, 9, 6, 4]) {
      const out = retileSection([blkCol('datatable', 8), blkCol('insight', 4)], budget);
      expect(out[0].col).toBeGreaterThanOrEqual(8);
    }
  });

  it('is stable across a resize round-trip (12 → 6 → 12)', () => {
    const start = [blkCol('datatable', 8), blkCol('insight', 4)];
    const wide = retileSection(start, 12).map((b) => b.col);
    const narrow = retileSection(start, 6);
    const back = retileSection(narrow, 12).map((b) => b.col);
    expect(back).toEqual(wide);
  });

  it('applies the catalog floor to a core type too, where the two tables disagree', () => {
    // CORE_SPANS and the catalog disagree for 8 core types. generateLive passes catalogSpan AS the
    // lookup, and resolveSpan's order is `FALLBACK → CORE_SPANS → lookup`, so the catalog already
    // wins on the generation path. The re-tile has to enforce the same floor or the second pass
    // contradicts the first. (It may still differ on PREF — honouring the author's `col` is what
    // colPrefLookup is for — so this pins the floor, not the exact tiling.)
    const disagree = ['kpi', 'stack', 'bars', 'list', 'checklist', 'flow', 'gallery'] as const;
    for (const type of disagree) {
      const catalogFloor = floorOf(type);
      expect(catalogFloor).toBeGreaterThan(CORE_SPANS[type].min ?? 4);
      const out = retileSection([blkCol(type, 6), blkCol('insight', 4), blkCol('kpi', 4)], 12);
      expect({ type, belowFloor: out[0].col < catalogFloor }).toEqual({ type, belowFloor: false });
    }
  });
});
