// A chip is a promise that there is something to see. `representationHolds` used to check only that
// a view could PLACE enough nodes, which is a different question — and the corpus contains worlds
// where every node places and the picture still says nothing. These are those worlds, by name.
import { describe, expect, it } from 'vitest';
import { ALL_WORLD_SCENARIOS, allWorldScenario } from '../src/live/world/scenarios/index';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import {
  REPRESENTATIONS,
  fillOf,
  firstRead,
  readingsOf,
  representationHolds,
} from '../src/canvas/spatial/morph/useMorphStage';
import { placeableOnTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import { followUpPlan } from '../src/live/world/detect';
import { placeableOnChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
import type { Representation } from '../src/canvas/spatial/morph/types';

const morphOf = (id: string) => {
  const s = allWorldScenario(id);
  if (!s) throw new Error(`fixture ${id} is gone — this test is about that world specifically`);
  return worldToMorph(s.spec);
};

describe('a view has to say something, not merely place something', () => {
  it('refuses a timeline for a world that happens all at once', () => {
    const world = morphOf('edge-same-day');
    const top = world.nodes.filter((n) => n.parentId === undefined);

    // It PLACES everything — that was never the problem, and is why counting was not enough.
    expect(top.length).toBeGreaterThan(1);
    expect(top.every((n) => placeableOnTimeline(n))).toBe(true);
    expect(fillOf('timeline', world)).toBe(1);

    // …and the axis would still be a single instant given a width, so it is not offered.
    expect(representationHolds('timeline', world)).toBe(false);
  });

  it('refuses a chart with no y-extent', () => {
    const world = morphOf('edge-no-variance');
    const plotted = world.nodes.filter((n) => n.parentId === undefined && placeableOnChart(n));
    expect(plotted.length).toBeGreaterThanOrEqual(2);
    expect(representationHolds('chart', world)).toBe(false);
  });

  it('still offers a timeline where the dates genuinely spread', () => {
    // The gate must not be a blanket refusal: the seed world is the reference chronology.
    expect(representationHolds('timeline', morphOf('seed-2008'))).toBe(true);
  });
});

describe('the causal web is the floor', () => {
  it('holds on every scenario in the corpus, so the chip row is never empty', () => {
    const refused = ALL_WORLD_SCENARIOS.filter(
      (s) => !representationHolds('graph', worldToMorph(s.spec)),
    ).map((s) => s.id);
    expect(refused).toEqual([]);
  });
});

describe('first read', () => {
  const shuffle = <T>(xs: readonly T[]): T[] => {
    // Deterministic reversal + interleave: a fixed permutation, so the test cannot flake.
    const out = [...xs].reverse();
    for (let i = 0; i + 1 < out.length; i += 2) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    return out;
  };

  it('never opens on a view this world does not hold', () => {
    for (const s of ALL_WORLD_SCENARIOS) {
      const world = worldToMorph(s.spec);
      expect(representationHolds(firstRead(world), world), s.id).toBe(true);
    }
  });

  it('does not depend on the order nodes arrive in', () => {
    for (const s of ALL_WORLD_SCENARIOS) {
      const world = worldToMorph(s.spec);
      const shuffled = { ...world, nodes: shuffle(world.nodes), edges: shuffle(world.edges) };
      expect(firstRead(shuffled), s.id).toBe(firstRead(world));
      expect(readingsOf(shuffled), s.id).toEqual(readingsOf(world));
    }
  });

  it('meets different worlds in different ways', () => {
    const opened = new Set(ALL_WORLD_SCENARIOS.map((s) => firstRead(worldToMorph(s.spec))));
    expect(opened.size).toBeGreaterThan(1);
  });
});

describe('the ranking', () => {
  it('orders readings by how much of the world each one holds, best first', () => {
    for (const s of ALL_WORLD_SCENARIOS) {
      const world = worldToMorph(s.spec);
      const fills = readingsOf(world).map((r) => fillOf(r, world));
      expect(
        [...fills].sort((a, b) => b - a),
        s.id,
      ).toEqual(fills);
    }
  });

  it('offers only readings that hold', () => {
    for (const s of ALL_WORLD_SCENARIOS) {
      const world = worldToMorph(s.spec);
      const held = REPRESENTATIONS.filter((r: Representation) => representationHolds(r, world));
      expect(new Set(readingsOf(world)), s.id).toEqual(new Set(held));
    }
  });
});

describe('the turn promises only what the surface keeps', () => {
  // The reader asks "show me that as a chart". If the turn answers "free, opening there" and the
  // overlay then refuses the view, they get the causal web with no chart chip and nothing saying
  // why. So a `local` plan naming a view has to imply that view is actually offered.
  it.each([['show me that over time'], ['can I see it as a timeline'], ['as a chart please']])(
    'never answers %j locally for a world that would refuse the view',
    (ask) => {
      for (const s of ALL_WORLD_SCENARIOS) {
        const plan = followUpPlan(s.spec, ask);
        if (plan?.kind !== 'local' || plan.view === 'graph') continue;
        expect(representationHolds(plan.view, worldToMorph(s.spec)), `${s.id} · ${ask}`).toBe(true);
      }
    },
  );
});
