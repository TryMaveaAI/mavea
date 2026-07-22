import { describe, it, expect } from 'vitest';
import { remapTour } from '../src/live/tourRemap';
import { mergeForMode } from '../src/live/lifecycle';
import type { Block } from '../src/data/conversation';

const block = (title: string): Block =>
  ({ type: 'insight', props: { title, stat: 'x', summary: 's' } }) as unknown as Block;

const PRIOR = [block('Old one'), block('Old two')];

describe('remapTour — tours survive the canvas merge', () => {
  it('is the identity on a clean replace', () => {
    const next = [block('A'), block('B'), block('C')];
    const merge = mergeForMode([], next, 'replace');
    const tour = [
      { index: 0, say: 'a' },
      { index: 2, say: 'c', mark: { kind: 'circle' as const, at: 'C' } },
    ];
    expect(remapTour(tour, next, merge.blocks)).toEqual(tour);
  });

  it('augment: fresh blocks map past the prior canvas, marks intact', () => {
    const next = [block('New one'), block('New two')];
    const merge = mergeForMode(PRIOR, next, 'augment');
    const tour = [
      { index: 0, say: 'first new', mark: { kind: 'underline' as const, at: '5' } },
      { index: 1, say: 'second new' },
    ];
    const out = remapTour(tour, next, merge.blocks);
    expect(out).toEqual([
      { index: 2, say: 'first new', mark: { kind: 'underline', at: '5' } },
      { index: 3, say: 'second new' },
    ]);
  });

  it('augment: a duplicate stop points at the existing prior block', () => {
    // The response repeats a block already on canvas; the merge filters it out, but the
    // stop should land on the original — the model was talking about exactly that block.
    const next = [block('Old two'), block('New one')];
    const merge = mergeForMode(PRIOR, next, 'augment');
    const out = remapTour(
      [
        { index: 0, say: 'as we saw' },
        { index: 1, say: 'and now this' },
      ],
      next,
      merge.blocks,
    );
    expect(out).toEqual([
      { index: 1, say: 'as we saw' },
      { index: 2, say: 'and now this' },
    ]);
  });

  it('refine: an in-place update keeps its slot, an appended block lands at the end', () => {
    const next = [block('Old one'), block('Fresh')];
    const merge = mergeForMode(PRIOR, next, 'refine');
    const out = remapTour(
      [
        { index: 0, say: 'updated' },
        { index: 1, say: 'added' },
      ],
      next,
      merge.blocks,
    );
    expect(out).toEqual([
      { index: 0, say: 'updated' },
      { index: 2, say: 'added' },
    ]);
  });

  it('drops out-of-range stops and never maps two stops onto one block', () => {
    const next = [block('A'), block('A')];
    const merge = mergeForMode([], next, 'replace');
    // duplicate signatures claim distinct slots, in order
    expect(remapTour([{ index: 0 }, { index: 1 }, { index: 7 }], next, merge.blocks)).toEqual([
      { index: 0 },
      { index: 1 },
    ]);
  });

  it("remaps a connect mark's cross-block onIndex alongside its own stop", () => {
    const next = [block('New one'), block('New two')];
    const merge = mergeForMode(PRIOR, next, 'augment');
    const tour = [
      { index: 0, say: 'a', mark: { kind: 'connect' as const, at: 'x', to: 'y', onIndex: 1 } },
      { index: 1, say: 'b' },
    ];
    const out = remapTour(tour, next, merge.blocks);
    // PRIOR has 2 blocks, so the fresh pair lands at merged slots 2 and 3 (see the augment
    // test above) — the connect mark's onIndex (originally 1, "New two") must follow.
    expect(out[0]).toEqual({
      index: 2,
      say: 'a',
      mark: { kind: 'connect', at: 'x', to: 'y', onIndex: 3 },
    });
  });

  it('drops a connect mark whose target block vanished from the merge, keeping the stop and its other marks', () => {
    const responseBlocks = [block('A'), block('Ghost')];
    const mergedBlocks = [block('A')]; // 'Ghost' never made it into the merged canvas
    const tour = [
      {
        index: 0,
        say: 'a',
        marks: [
          { kind: 'underline' as const, at: 'x' },
          { kind: 'connect' as const, at: 'x', to: 'y', onIndex: 1 },
        ],
      },
    ];
    const out = remapTour(tour, responseBlocks, mergedBlocks);
    expect(out).toHaveLength(1);
    expect(out[0].index).toBe(0);
    expect(out[0].mark).toEqual({ kind: 'underline', at: 'x' });
    expect(out[0].marks).toBeUndefined();
  });
});
