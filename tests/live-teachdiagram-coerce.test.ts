import { describe, it, expect } from 'vitest';
import { validateLiveResponse, ALLOWED_BLOCK_TYPES } from '../src/engine/liveSchema';
import type { TeachDiagramProps } from '../src/canvas/blocks/learn/types';

// teachdiagram is nested (steps[].add[] / labels[]), so it needs a custom builder the generic
// coercer can't provide. These lock that builder: additive steps survive, every coordinate is
// clamped/validated through the shared diagram coercers, captions split into shown/spoken twins,
// and a build with no real step is dropped rather than rendered empty.
const ALLOWED = new Set<string>([...ALLOWED_BLOCK_TYPES, 'teachdiagram']);

function coerce(props: Record<string, unknown>): TeachDiagramProps | null {
  const r = validateLiveResponse(
    { title: 'T', blocks: [{ type: 'teachdiagram', props: { title: 'Build', ...props } }] },
    ALLOWED,
  );
  const b = r?.blocks.find((x) => x.type === 'teachdiagram');
  return b ? (b.props as unknown as TeachDiagramProps) : null;
}

describe('buildTeachDiagram — the animated step-by-step figure', () => {
  it('keeps the ordered, additive steps with their shapes and labels', () => {
    const d = coerce({
      steps: [
        { caption: 'Draw the base', add: [{ kind: 'line', x1: 10, y1: 50, x2: 90, y2: 50 }] },
        {
          caption: 'Add a peak',
          add: [{ kind: 'circle', cx: 50, cy: 20, r: 8 }],
          labels: [{ x: 50, y: 20, text: 'apex' }],
        },
      ],
    });
    expect(d).not.toBeNull();
    expect(d!.steps).toHaveLength(2);
    expect(d!.steps[0].add[0]).toMatchObject({ kind: 'line', x1: 10, x2: 90 });
    expect(d!.steps[1].labels?.[0]).toMatchObject({ text: 'apex' });
  });

  it('splits a [[shown|said]] caption into display + spoken twins', () => {
    const d = coerce({
      steps: [
        {
          caption: '[[a²+b²=c²|a squared plus b squared equals c squared]]',
          add: [{ kind: 'circle', cx: 50, cy: 50, r: 10 }],
        },
      ],
    });
    expect(d!.steps[0].caption).toBe('a²+b²=c²');
    expect(d!.steps[0].captionSpoken).toBe('a squared plus b squared equals c squared');
  });

  it('clamps coordinates and drops degenerate shapes inside a step', () => {
    const d = coerce({
      steps: [
        {
          caption: 'mixed',
          add: [
            { kind: 'circle', cx: 250, cy: -10, r: 5 }, // clamped to 100,0
            { kind: 'line', x1: 5, y1: 5, x2: 5, y2: 5 }, // zero-length → dropped
          ],
        },
      ],
    });
    expect(d!.steps[0].add).toHaveLength(1);
    expect(d!.steps[0].add[0]).toMatchObject({ cx: 100, cy: 0 });
  });

  it('drops a step that adds neither a shape nor a label', () => {
    const d = coerce({
      steps: [
        { caption: 'nothing here', add: [] },
        { caption: 'real', add: [{ kind: 'rect', x: 10, y: 10, w: 20, h: 20 }] },
      ],
    });
    expect(d!.steps).toHaveLength(1);
    expect(d!.steps[0].caption).toBe('real');
  });

  it('drops the whole block when no step survives (never an empty build)', () => {
    expect(coerce({ steps: [{ caption: 'x', add: [] }] })).toBeNull();
    expect(coerce({ steps: [] })).toBeNull();
  });

  it('caps runaway step counts and filters out-of-range emphasize indices', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      caption: `step ${i}`,
      add: [{ kind: 'circle', cx: 50, cy: 50, r: 4 }],
      emphasize: [0, 5], // 5 is out of range for a 1-shape step → filtered
    }));
    const d = coerce({ steps: many });
    expect(d!.steps.length).toBeLessThanOrEqual(8);
    expect(d!.steps[0].emphasize).toEqual([0]);
  });

  it('carries an optional base figure and ratio', () => {
    const d = coerce({
      ratio: 2,
      baseShapes: [{ kind: 'line', x1: 0, y1: 50, x2: 100, y2: 50 }],
      steps: [{ caption: 'go', add: [{ kind: 'circle', cx: 50, cy: 50, r: 6 }] }],
    });
    expect(d!.ratio).toBe(2);
    expect(d!.baseShapes).toHaveLength(1);
  });
});
