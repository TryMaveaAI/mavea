import { describe, expect, it } from 'vitest';
import { buildDefaultPath, planZoomIn, scaleColor, scaleStops } from '../src/live/deepzoom/nav';
import type { ZoomLevel, ZoomNode, ZoomTree } from '../src/live/deepzoom/types';

function level(partial: Partial<ZoomLevel> & { subtopics: string[] }): ZoomLevel {
  return {
    scale: 0,
    multiplier: '×1',
    scaleLabel: 'THE FIELD',
    title: 'Title',
    body: 'Body.',
    selectedIndex: 0,
    ...partial,
  };
}

// Trunk: 0 →(A)→ 1 →(A2)→ 2. A pre-generated sibling fork hangs off node 0 via
// chip "B": 10 →(B1)→ 11. Node 0 also exposes chip "C" that nothing was built for.
function makeTree(): ZoomTree {
  const nodes: ZoomNode[] = [
    {
      id: 0,
      parentId: null,
      viaSubtopic: null,
      depth: 0,
      level: level({
        multiplier: '×1',
        scaleLabel: 'THE FIELD',
        subtopics: ['A', 'B', 'C'],
        selectedIndex: 0,
      }),
    },
    {
      id: 1,
      parentId: 0,
      viaSubtopic: 'A',
      depth: 1,
      level: level({
        multiplier: '×10',
        scaleLabel: 'THE ZONE',
        subtopics: ['A1', 'A2'],
        selectedIndex: 1,
      }),
    },
    {
      id: 2,
      parentId: 1,
      viaSubtopic: 'A2',
      depth: 2,
      level: level({
        multiplier: '×100',
        scaleLabel: 'THE SPOT',
        subtopics: ['x'],
        selectedIndex: 0,
      }),
    },
    {
      id: 10,
      parentId: 0,
      viaSubtopic: 'B',
      depth: 1,
      level: level({
        multiplier: '×10',
        scaleLabel: 'THE OTHER',
        subtopics: ['B1'],
        selectedIndex: 0,
      }),
    },
    {
      id: 11,
      parentId: 10,
      viaSubtopic: 'B1',
      depth: 2,
      level: level({
        multiplier: '×100',
        scaleLabel: 'THE END',
        subtopics: ['y'],
        selectedIndex: 0,
      }),
    },
  ];
  return { query: 'q', rangeStart: 'all', nodes, trunkIds: [0, 1, 2] };
}

describe('scaleColor', () => {
  it('maps each depth to its --dz accent and cycles every ten', () => {
    expect(scaleColor(0)).toBe('var(--dz-0)');
    expect(scaleColor(9)).toBe('var(--dz-9)');
    expect(scaleColor(10)).toBe('var(--dz-0)');
    expect(scaleColor(23)).toBe('var(--dz-3)');
  });

  it('never returns an out-of-range index for negative depths', () => {
    expect(scaleColor(-1)).toBe('var(--dz-9)');
  });
});

describe('buildDefaultPath', () => {
  it('follows each level default-selected chip down through existing children', () => {
    const tree = makeTree();
    const start = tree.nodes.find((n) => n.id === 0)!;
    expect(buildDefaultPath(tree.nodes, start).map((n) => n.id)).toEqual([0, 1, 2]);
  });

  it('returns just the start node when it has no matching child', () => {
    const tree = makeTree();
    const leaf = tree.nodes.find((n) => n.id === 2)!;
    expect(buildDefaultPath(tree.nodes, leaf).map((n) => n.id)).toEqual([2]);
  });
});

describe('planZoomIn', () => {
  it('resumes the existing path when the selected chip already continues it', () => {
    const tree = makeTree();
    const plan = planZoomIn(tree, [0, 1, 2], [0, 1, 0], 0);
    expect(plan).toEqual({ kind: 'navigate', navPath: [0, 1, 2], chipSels: [0, 1, 0], target: 1 });
  });

  it('forks onto a pre-generated sibling subtree and drops stale forward history', () => {
    const tree = makeTree();
    // At node 0 pick chip "B" (index 1) instead of the default "A".
    const plan = planZoomIn(tree, [0, 1, 2], [1, 1, 0], 0);
    expect(plan).toEqual({
      kind: 'navigate',
      navPath: [0, 10, 11],
      chipSels: [1, 0, 0],
      target: 1,
    });
  });

  it('requests a branch when nothing has been generated for the chosen chip', () => {
    const tree = makeTree();
    // At node 0 pick chip "C" (index 2) — no child exists.
    const plan = planZoomIn(tree, [0, 1, 2], [2, 1, 0], 0);
    expect(plan).toEqual({
      kind: 'branch',
      navPath: [0], // stale [1, 2] dropped at the fork point
      chipSels: [2],
      parentId: 0,
      subtopic: 'C',
      parentLevel: tree.nodes[0].level,
      parentDepth: 0,
    });
  });

  it('requests a branch at the frontier so the descent never dead-ends', () => {
    const tree = makeTree();
    const plan = planZoomIn(tree, [0, 1, 2], [0, 1, 0], 2);
    expect(plan?.kind).toBe('branch');
    if (plan?.kind === 'branch') {
      expect(plan.parentId).toBe(2);
      expect(plan.subtopic).toBe('x');
      expect(plan.parentDepth).toBe(2);
    }
  });

  it('falls back to the first chip when the selected index is out of range', () => {
    const tree = makeTree();
    const plan = planZoomIn(tree, [0, 1, 2], [99, 1, 0], 0);
    // chip index 99 → subtopics[0] === 'A', which already continues the path.
    expect(plan).toEqual({ kind: 'navigate', navPath: [0, 1, 2], chipSels: [99, 1, 0], target: 1 });
  });

  it('returns null when the node at the index is missing', () => {
    const tree = makeTree();
    expect(planZoomIn(tree, [404], [0], 0)).toBeNull();
  });
});

describe('scaleStops', () => {
  it('labels each stop past / current / future relative to the active level', () => {
    const tree = makeTree();
    const navNodes = [0, 1, 2].map((id) => tree.nodes.find((n) => n.id === id)!);
    const stops = scaleStops(navNodes, 1);
    expect(stops.map((s) => s.state)).toEqual(['past', 'current', 'future']);
    expect(stops.map((s) => s.multiplier)).toEqual(['×1', '×10', '×100']);
    expect(stops.map((s) => s.label)).toEqual(['THE FIELD', 'THE ZONE', 'THE SPOT']);
    expect(stops.map((s) => s.color)).toEqual(['var(--dz-0)', 'var(--dz-1)', 'var(--dz-2)']);
  });
});
