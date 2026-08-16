// world-story — the walk's script. Three things are worth pinning here and they are the three the
// surface's own rules turn on: a figure is only ever SPOKEN when the trust registry can back it,
// causes are narrated before what they caused, and the same world produces the same script twice.
import { describe, expect, it } from 'vitest';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { buildRegistry, type TrustRegistry } from '../src/live/trust';
import type { WorldValue } from '../src/live/trust';
import { worldStory } from '../src/live/world/worldStory';
import { nodeValueId } from '../src/live/world/valueIds';
import type { WorldSpec } from '../src/live/world/types';
import { ALL_WORLD_SCENARIOS } from '../src/live/world/scenarios/index';

const EMPTY: TrustRegistry = buildRegistry(new Map(), []);

/** A world shaped like the ones the gate actually admits: two roots, a mechanism, an outcome. */
function world(): WorldSpec {
  return {
    title: 'Why did it happen?',
    outcomeId: 'out',
    nodes: [
      { id: 'a', label: 'Cheap credit', role: 'root', depth: 0, tier: 'T0' },
      { id: 'b', label: 'Lending loosened', role: 'root', depth: 0, tier: 'T0' },
      {
        id: 'mid',
        label: 'Mortgage volume surged',
        role: 'mechanism',
        depth: 1,
        tier: 'T0',
        detail: 'Origination fees rewarded volume.',
      },
      { id: 'out', label: 'Credit crisis', role: 'outcome', depth: 2, tier: 'T2', value: 4.3 },
    ],
    edges: [
      { from: 'a', to: 'mid', sign: 1, tier: 'T0', relation: 'contributes' },
      { from: 'b', to: 'mid', sign: 1, tier: 'T0', relation: 'enables' },
      { from: 'mid', to: 'out', sign: 1, tier: 'T0', relation: 'causes' },
    ],
    provenance: {},
  };
}

const scriptOf = (spec: WorldSpec, registry: TrustRegistry = EMPTY): string[] =>
  worldStory(spec, worldToMorph(spec), registry).map((b) => b.say);

describe('worldStory', () => {
  it('opens wide on the causal view, so a second play tells the same story as the first', () => {
    const beats = worldStory(world(), worldToMorph(world()), EMPTY, { closeOn: 'timeline' });
    expect(beats[0]).toMatchObject({ wide: true, rep: 'graph' });
    expect(beats.at(-1)).toMatchObject({ wide: true, rep: 'timeline' });
  });

  it('narrates every cause before what it caused', () => {
    const beats = worldStory(world(), worldToMorph(world()), EMPTY);
    const at = new Map(beats.map((b, i) => [b.nodeId, i]));
    for (const [from, to] of [
      ['a', 'mid'],
      ['b', 'mid'],
      ['mid', 'out'],
    ]) {
      expect(at.get(from)!).toBeLessThan(at.get(to)!);
    }
  });

  it('is deterministic — the same world twice is the same script twice', () => {
    expect(scriptOf(world())).toEqual(scriptOf(world()));
  });

  it('names the link that brought each cause in, and the node leads its own sentence', () => {
    const beats = worldStory(world(), worldToMorph(world()), EMPTY);
    const mid = beats.find((b) => b.nodeId === 'mid')!;
    // The label leads and the cause trails as a prepositional phrase — the shape that survives a
    // label authored as a whole clause. "Lending loosened enabled Mortgage volume surged" is what
    // this is here to prevent.
    expect(mid.say).toMatch(/^Mortgage volume surged — (fed|made possible) by /);
    expect(mid.edgeId).toBeDefined();
  });

  it('folds an ordinary label into mid-sentence case but never an acronym', () => {
    // One cause each: a beat names the single link that brought it in, so two labels cannot both be
    // exercised on one node.
    const withCause = (label: string): string => {
      const spec = world();
      spec.nodes = [spec.nodes[0]!, spec.nodes[3]!];
      spec.nodes[0]!.label = label;
      spec.edges = [{ from: 'a', to: 'out', sign: 1, tier: 'T0', relation: 'causes' }];
      return scriptOf(spec).join('\n');
    };
    expect(withCause('A trigger fires')).toContain('by a trigger fires');
    expect(withCause('MBS exposure')).toContain('by MBS exposure');
  });

  it('speaks a figure ONLY when the registry can back it', () => {
    const spec = world();
    // The outcome carries `value: 4.3`, but nothing has grounded it.
    expect(scriptOf(spec).join('\n')).not.toContain('4.3');

    const backed: WorldValue = {
      id: nodeValueId('out'),
      label: 'Credit crisis',
      kind: 'grounded',
      resolution: {
        ok: true,
        tier: 'T2',
        value: 4.3,
        raw: '4.3%',
        receipt: { quote: 'fell 4.3% that year', host: 'example.test' },
        surface: 'web',
      },
    };
    const registry = buildRegistry(new Map([[backed.id, backed]]), []);
    expect(scriptOf(spec, registry).join('\n')).toContain('Measured at 4.3%');
  });

  it('hedges an illustrative magnitude rather than stating it as a measurement', () => {
    const value: WorldValue = {
      id: nodeValueId('out'),
      label: 'Credit crisis',
      kind: 'illustrative',
      resolution: {
        ok: true,
        tier: 'T3',
        value: 4.3,
        raw: '4.3%',
        illustrative: 'Shows the shape, not your numbers.',
        surface: 'model',
      },
    };
    const registry = buildRegistry(new Map([[value.id, value]]), []);
    const said = scriptOf(world(), registry).join('\n');
    expect(said).toContain('Illustratively, about 4.3%');
    expect(said).not.toContain('Measured at');
  });

  it('carries a node detail, trimmed on a sentence boundary', () => {
    const beats = worldStory(world(), worldToMorph(world()), EMPTY);
    expect(beats.find((b) => b.nodeId === 'mid')!.say).toContain(
      'Origination fees rewarded volume.',
    );
  });

  it('offers no walk for a world too small to have a story', () => {
    const spec = world();
    spec.nodes = spec.nodes.slice(0, 1);
    spec.edges = [];
    expect(worldStory(spec, worldToMorph(spec), EMPTY)).toEqual([]);
  });

  it('terminates and places every top-level cause, on every world in the corpus', () => {
    for (const scenario of ALL_WORLD_SCENARIOS) {
      const morph = worldToMorph(scenario.spec);
      const beats = worldStory(scenario.spec, morph, EMPTY);
      if (beats.length === 0) continue;
      const top = morph.nodes.filter((n) => n.parentId === undefined).map((n) => n.id);
      const walked = new Set(beats.map((b) => b.nodeId));
      for (const id of top) expect(walked.has(id), `${scenario.id} skipped ${id}`).toBe(true);
      // A breakdown's children are semantic zoom, not story beats.
      const children = morph.nodes.filter((n) => n.parentId !== undefined).map((n) => n.id);
      for (const id of children)
        expect(walked.has(id), `${scenario.id} narrated ${id}`).toBe(false);
    }
  });

  it('survives a cycle in the topology rather than hanging on it', () => {
    const spec = world();
    spec.edges.push({ from: 'out', to: 'a', sign: 1, tier: 'T0' });
    const beats = worldStory(spec, worldToMorph(spec), EMPTY);
    expect(new Set(beats.map((b) => b.nodeId))).toEqual(new Set(['a', 'b', 'mid', 'out']));
  });
});
