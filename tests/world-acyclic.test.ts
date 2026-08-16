// world-acyclic.test.ts — the structural half of the world gate, exercised on RAW payloads rather
// than on corpus fixtures, because that is where a self-link and a ring actually come from: a model
// writing down a self-sustaining process. Both are refused, and both refusals are RECORDED — a link
// that vanishes without a word is indistinguishable from a link the model never proposed.
//
// The rule behind it: why/engine's topoOrder REFUSES a cycle rather than resolving it to an
// arbitrary fixed point, so a world that keeps one arrives on screen with every contribution null,
// every lever dead, and nothing saying why. Cutting the back-edge keeps the rest of the world alive.
import { describe, expect, it } from 'vitest';
import { topoOrder } from '../src/live/why/engine';
import { asWhyDag } from '../src/live/world/asWhyDag';
import { coerceWorldSpec, mapOntoWorld } from '../src/live/world/validate';
import type { WorldSpec } from '../src/live/world/types';

const node = (id: string, role: 'root' | 'mechanism' | 'outcome', depth: number) => ({
  id,
  label: id.toUpperCase(),
  role,
  depth,
  tier: 'T0',
});

/** A payload as a model would emit it: plain JSON, no receipts, so everything lands at T0. */
const payload = (
  nodes: ReadonlyArray<ReturnType<typeof node>>,
  edges: ReadonlyArray<{ from: string; to: string }>,
  notes?: string[],
): unknown => ({
  title: 'Why does the alarm keep re-arming itself?',
  outcomeId: nodes[nodes.length - 1].id,
  nodes,
  edges: edges.map((e) => ({ ...e, sign: 1, tier: 'T0' })),
  ...(notes ? { provenance: { notes } } : {}),
});

const RING = payload(
  [node('warming', 'root', 0), node('thaw', 'mechanism', 1), node('methane', 'mechanism', 2)],
  [
    { from: 'warming', to: 'thaw' },
    { from: 'thaw', to: 'methane' },
    { from: 'methane', to: 'warming' },
  ],
);

describe('coerceWorldSpec — the acyclic guard', () => {
  it('cuts the link that closes a ring, keeps the rest, and names the cut', () => {
    const world = coerceWorldSpec(RING, '')!;
    expect(world.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
      'warming->thaw',
      'thaw->methane',
    ]);
    expect(world.provenance.notes?.join(' ')).toMatch(/closed a causal loop \(methane → warming\)/);
  });

  it('leaves the cut world orderable — which is the whole point of cutting it', () => {
    // Before the guard this payload round-tripped untouched and topoOrder returned null, so every
    // contribution in the cascade was null and every lever on the rail did nothing.
    expect(topoOrder(asWhyDag(coerceWorldSpec(RING, '')!))).not.toBeNull();
  });

  it('leaves an acyclic web alone, notes and all', () => {
    const raw = payload(
      [node('a', 'root', 0), node('b', 'mechanism', 1), node('c', 'outcome', 2)],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
      ['One note the model wrote.'],
    );
    const world = coerceWorldSpec(raw, '')!;
    expect(world.edges).toHaveLength(3);
    expect(world.provenance.notes).toEqual(['One note the model wrote.']);
  });

  it('cuts a self-link and says so, rather than dropping it in silence', () => {
    const raw = payload(
      [node('reset', 'root', 0), node('alarm', 'outcome', 1)],
      [
        { from: 'reset', to: 'reset' },
        { from: 'reset', to: 'alarm' },
      ],
    );
    const world = coerceWorldSpec(raw, '')!;
    expect(world.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['reset->alarm']);
    expect(world.provenance.notes?.join(' ')).toMatch(/self-link \(reset → reset\)/);
  });

  it('keeps the structural record even when the model filled the notes cap itself', () => {
    const raw = payload(
      [node('warming', 'root', 0), node('thaw', 'mechanism', 1), node('methane', 'mechanism', 2)],
      [
        { from: 'warming', to: 'thaw' },
        { from: 'thaw', to: 'methane' },
        { from: 'methane', to: 'warming' },
      ],
      ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'],
    );
    const notes = coerceWorldSpec(raw, '')!.provenance.notes!;
    expect(notes).toHaveLength(6);
    expect(notes[notes.length - 1]).toMatch(/closed a causal loop/);
  });
});

describe('mapOntoWorld — the second way into the world', () => {
  it('breaks a loop the merge itself creates, and records it on the standing world', () => {
    // Nothing re-coerces a merged world (world/explode's evolveWorld returns it straight to the
    // surface), so the guard has to run here too: both sides are perfectly acyclic on their own.
    const standing = coerceWorldSpec(
      payload([node('a', 'root', 0), node('b', 'outcome', 1)], [{ from: 'a', to: 'b' }], ['first']),
      '',
    )!;
    const followUp = coerceWorldSpec(
      payload([node('a', 'root', 0), node('b', 'outcome', 1)], [{ from: 'b', to: 'a' }]),
      '',
    )!;
    expect(followUp.edges).toHaveLength(1); // acyclic on its own

    const merged = mapOntoWorld(standing, followUp);
    expect(merged.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['a->b']);
    expect(merged.provenance.notes).toEqual([
      'first',
      expect.stringMatching(/closed a causal loop \(b → a\)/) as unknown as string,
    ]);
    expect(topoOrder(asWhyDag(merged))).not.toBeNull();
  });

  it('leaves a merge that stays acyclic untouched', () => {
    const standing = coerceWorldSpec(
      payload([node('a', 'root', 0), node('b', 'outcome', 1)], [{ from: 'a', to: 'b' }], ['first']),
      '',
    )!;
    const followUp = coerceWorldSpec(
      payload(
        [node('a', 'root', 0), node('c', 'mechanism', 1), node('b', 'outcome', 2)],
        [{ from: 'a', to: 'c' }],
      ),
      '',
    )!;
    const merged: WorldSpec = mapOntoWorld(standing, followUp);
    expect(merged.edges).toHaveLength(2);
    expect(merged.provenance.notes).toEqual(['first']);
  });
});
