// world-stress.test.ts — "does this explanation still stand if I only believe what is sourced?"
//
// The surface has always known which links are evidenced; the knowledge was only ever a line weight,
// so a reader could see that one arrow was fainter than another and had no way to ask what that
// meant for the answer as a whole. These pin the two readings that turn the distinction into a
// finding: what survives on sourced links alone, and which unsourced link the whole thing leans on.
import { describe, expect, it } from 'vitest';
import { ALL_WORLD_SCENARIOS } from '../src/live/world/scenarios/index';
import { groundedOnly, weakestLink } from '../src/live/world/stress';
import type { WorldEdge, WorldSpec } from '../src/live/world/types';

const link = (from: string, to: string, status: WorldEdge['status']): WorldEdge => ({
  from,
  to,
  sign: 1,
  tier: status === 'supported' ? 'T2' : 'T0',
  status,
});

/** a → mid → out, plus b → out. Which links are sourced is the whole variable. */
const world = (edges: WorldEdge[]): WorldSpec => ({
  title: 'Why did it happen?',
  outcomeId: 'out',
  provenance: {},
  nodes: [
    { id: 'a', label: 'A', role: 'root', depth: 0, tier: 'T0' },
    { id: 'b', label: 'B', role: 'root', depth: 0, tier: 'T0' },
    { id: 'mid', label: 'Mid', role: 'mechanism', depth: 1, tier: 'T0' },
    { id: 'out', label: 'Out', role: 'outcome', depth: 2, tier: 'T0' },
  ],
  edges,
});

describe('groundedOnly', () => {
  it('keeps every cause whose route to the outcome is sourced end to end', () => {
    const { standing, cutOff } = groundedOnly(
      world([
        link('a', 'mid', 'supported'),
        link('mid', 'out', 'supported'),
        link('b', 'out', 'supported'),
      ]),
    );
    expect([...standing].sort()).toEqual(['a', 'b', 'mid', 'out']);
    expect(cutOff).toEqual([]);
  });

  it('cuts off a cause whose ONLY route runs through something unsourced', () => {
    // a reaches the outcome only via mid→out, and nobody sourced that link.
    const { standing, cutOff } = groundedOnly(
      world([
        link('a', 'mid', 'supported'),
        link('mid', 'out', 'provisional'),
        link('b', 'out', 'supported'),
      ]),
    );
    expect([...standing].sort()).toEqual(['b', 'out']);
    expect([...cutOff].sort()).toEqual(['a', 'mid']);
  });

  it('treats a CONTESTED link as unsourced — an objection is a reason to doubt it', () => {
    const { cutOff } = groundedOnly(
      world([link('a', 'mid', 'supported'), link('mid', 'out', 'contested')]),
    );
    expect([...cutOff].sort()).toEqual(['a', 'mid']);
  });

  it('never cuts off the outcome itself, however little survives', () => {
    // The thing being explained does not stop existing because the explanation thinned out.
    const { standing, cutOff } = groundedOnly(
      world([link('a', 'mid', 'provisional'), link('mid', 'out', 'provisional')]),
    );
    expect([...standing]).toEqual(['out']);
    expect([...cutOff].sort()).toEqual(['a', 'mid']);
  });
});

describe('weakestLink', () => {
  it('names the unsourced link the most causes depend on', () => {
    // mid→out carries both a and mid; b→out carries only b. The first is what the answer rests on.
    const spec = world([
      link('a', 'mid', 'supported'),
      link('mid', 'out', 'provisional'),
      link('b', 'out', 'provisional'),
    ]);
    expect(weakestLink(spec)).toEqual({ index: 1, isolates: 2 });
  });

  it('is silent when every link is sourced', () => {
    expect(
      weakestLink(world([link('a', 'mid', 'supported'), link('mid', 'out', 'supported')])),
    ).toBeNull();
  });

  it('is silent when no unsourced link is load-bearing', () => {
    // a reaches the outcome through mid as well, so cutting a→out isolates nobody. A provisional
    // link on a cause the outcome reaches another way is decoration, not a dependency.
    const spec = world([
      link('a', 'out', 'provisional'),
      link('a', 'mid', 'supported'),
      link('mid', 'out', 'supported'),
    ]);
    expect(weakestLink(spec)).toBeNull();
  });

  it('breaks ties on the lowest index, so one world always names one link', () => {
    const spec = world([link('a', 'out', 'provisional'), link('b', 'out', 'provisional')]);
    expect(weakestLink(spec)?.index).toBe(0);
    expect(weakestLink(spec)).toEqual(weakestLink(spec));
  });

  it('terminates on a world with a cycle in it rather than walking it forever', () => {
    const spec = world([
      link('a', 'mid', 'provisional'),
      link('mid', 'out', 'provisional'),
      link('out', 'a', 'provisional'),
    ]);
    expect(weakestLink(spec)).not.toBeNull();
  });

  it('holds up on every world in the corpus, and never names a sourced link', () => {
    for (const scenario of ALL_WORLD_SCENARIOS) {
      const { standing } = groundedOnly(scenario.spec);
      expect(standing.has(scenario.spec.outcomeId), scenario.id).toBe(true);
      const weakest = weakestLink(scenario.spec);
      if (!weakest) continue;
      const edge = scenario.spec.edges[weakest.index];
      expect(edge.status, `${scenario.id} named a supported link`).not.toBe('supported');
      expect(weakest.isolates).toBeGreaterThan(0);
    }
  });
});
