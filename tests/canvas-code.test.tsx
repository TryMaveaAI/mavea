import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GitGraph } from '../src/canvas/blocks/code/GitGraph';
import type { GitCommit } from '../src/canvas/blocks/code/types';

// An authored `branches` list is a LEGEND — the order the reader sees lanes in — and it was being
// read as a whitelist. A commit sitting on a branch the list left out resolved to `indexOf` -1,
// which `Math.max(0, …)` turned into lane 0: the commit was drawn in the FIRST branch's position
// and painted in its colour, so a feature branch or a near-miss spelling appeared as a clean
// linear history on main, and nothing on the card said otherwise. That is the reference seam's own
// rule broken in the renderer — an unresolvable name must be skipped or stated, never coerced into
// a confident wrong one — and here it cannot be skipped, because the commit is real and has to go
// somewhere. So the lane list states what the commits say: the legend first, then any branch the
// drawn commits actually sit on that it omitted.
describe('GitGraph', () => {
  /** The commit dots, left to right as drawn — one per row, in row order. */
  function dotX(container: HTMLElement): number[] {
    return [...container.querySelectorAll('svg.gg-graph > g')].map((g) => {
      const dot = [...g.querySelectorAll('circle')].at(-1);
      return Number(dot?.getAttribute('cx'));
    });
  }

  const onMain: GitCommit[] = [
    { id: 'a1b2c3d', message: 'Fix the parser', branch: 'main' },
    { id: 'e4f5a6b', message: 'Add the lexer', branch: 'main' },
  ];

  it('gives a branch the legend left out its own lane, not main’s', () => {
    const { container } = render(
      <GitGraph
        title="Recent history"
        branches={['main']}
        commits={[
          { id: 'c0ffee1', message: 'Start the rewrite', branch: 'feat/rewrite' },
          ...onMain,
        ]}
      />,
    );

    const [ghost, ...mains] = dotX(container);
    expect(mains.every((x) => x === mains[0])).toBe(true);
    // The whole point: it is NOT drawn where main is drawn.
    expect(ghost).not.toBe(mains[0]);
    expect(Number.isFinite(ghost)).toBe(true);
    // And the card names the lane it just drew, so the reader can tell what they are looking at.
    expect(container.querySelector('.gg-legend')?.textContent).toContain('feat/rewrite');
  });

  it('keeps a near-miss spelling apart from the branch it nearly names', () => {
    // "origin/main" against "main" is the case that reads as correct and is not: the commits merge
    // onto one lane and the graph asserts a history that never happened.
    const { container } = render(
      <GitGraph
        branches={['main']}
        commits={[{ id: '9911aab', message: 'Push the tag', branch: 'origin/main' }, ...onMain]}
      />,
    );

    const [remote, ...mains] = dotX(container);
    expect(remote).not.toBe(mains[0]);
    expect(container.querySelector('.gg-legend')?.textContent).toContain('origin/main');
  });

  it('draws a connector to the parent’s real lane, in the parent’s colour', () => {
    const { container } = render(
      <GitGraph
        branches={['main']}
        commits={[
          { id: 'ff00112', message: 'Merge the rewrite', branch: 'main', parents: ['c0ffee1'] },
          { id: 'c0ffee1', message: 'Start the rewrite', branch: 'feat/rewrite' },
        ]}
      />,
    );

    const path = container.querySelector('svg.gg-graph path');
    // A curve, because the two lanes differ — a straight `L` would be the collapse this fixes.
    expect(path?.getAttribute('d')).toContain('C');
    const lanes = [...container.querySelectorAll('.gg-leg-dot')].map(
      (d) => (d as HTMLElement).style.background,
    );
    expect(lanes).toHaveLength(2);
    expect(path?.getAttribute('stroke')).toBe(lanes[1]);
  });

  it('still derives its lanes from the commits when no legend is authored', () => {
    const { container } = render(
      <GitGraph commits={[{ id: 'abc1234', message: 'Only commit', branch: 'trunk' }]} />,
    );

    expect(dotX(container)).toEqual([16]);
    // One lane names nothing worth a legend.
    expect(container.querySelector('.gg-legend')).toBeNull();
  });
});
