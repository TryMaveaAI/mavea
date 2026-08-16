// world-explode.test.ts — the two format-constrained model calls behind a living answer. Adapter
// and cache are mocked so this is deterministic and offline; what it pins is the HONESTY of the
// path: a fabricated payload comes back stripped of everything the corpus doesn't say, an evolve
// that barely lands on the standing world is discarded rather than half-applied, and an aborted
// call never returns a world.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateMock = vi.fn();

vi.mock('../src/live/providers/index', () => ({ getAdapter: () => ({ generate: generateMock }) }));
// The persistent cache is stubbed away, but its KEY is not: explodeWorld memoises in-session under
// exactly that key, so a constant here would serve one test's world to the next one.
vi.mock('../src/live/ripple/cache', () => ({
  cacheGet: async () => null,
  cachePut: async () => {},
  rippleCacheKey: (input: string, provider: string) => `${provider}:${input}`,
}));

import { BUILT_CAP, evolveWorld, explodeWorld } from '../src/live/world/explode';
import type { WorldSpec } from '../src/live/world/types';

const cfg = { provider: 'gemini', model: 'gemini-3.1-flash-lite' } as never;
const CORPUS =
  'Policy rates were held near 1 percent into 2004. Monthly defaults rose 6.2 points in March.';

/** One quotable fact, one invented one — the coercion gate must keep the first and strip the
 *  second, on the node AND on the edge that leans on it. */
const RAW = {
  title: 'Why did lending blow up?',
  outcomeId: 'blowup',
  nodes: [
    {
      id: 'cheap-credit',
      label: 'Cheap credit',
      role: 'root',
      depth: 0,
      tier: 'T2',
      value: 1,
      unit: '%',
      quote: 'Policy rates were held near 1 percent into 2004',
    },
    {
      id: 'blowup',
      label: 'Lending blew up',
      role: 'outcome',
      depth: 2,
      tier: 'T2',
      value: 41.7,
      unit: '%',
      quote: 'Lending grew 41.7% year on year',
    },
  ],
  edges: [
    {
      from: 'cheap-credit',
      to: 'blowup',
      verb: 'fuelled',
      sign: 1,
      weight: 0.7,
      tier: 'T2',
      relation: 'causes',
      quote: 'Policy rates were held near 1 percent into 2004',
    },
  ],
  provenance: {},
};

const STANDING: WorldSpec = {
  title: 'Why did lending blow up?',
  outcomeId: 'blowup',
  nodes: [
    { id: 'cheap-credit', label: 'Cheap credit', role: 'root', depth: 0, tier: 'T0' },
    { id: 'defaults', label: 'Defaults rose', role: 'mechanism', depth: 1, tier: 'T0' },
    { id: 'blowup', label: 'Lending blew up', role: 'outcome', depth: 2, tier: 'T0' },
  ],
  edges: [],
  provenance: {},
};

beforeEach(() => generateMock.mockReset());

describe('explodeWorld', () => {
  it('constrains the model to our schema and grounds every figure against the corpus', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify(RAW) });
    const world = await explodeWorld('Why did lending blow up?', CORPUS, cfg);
    expect(world).not.toBeNull();
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0][0].format).toBeDefined();

    const quoted = world!.nodes.find((n) => n.id === 'cheap-credit')!;
    expect(quoted.tier).toBe('T2');
    expect(quoted.value).toBe(1);
    // The outcome's 41.7% appears in no source sentence: demoted, and the number is GONE, not
    // merely unbadged.
    const invented = world!.nodes.find((n) => n.id === 'blowup')!;
    expect(invented.tier).toBe('T0');
    expect(invented.value).toBeUndefined();
    // The edge's own quote does ground, so it keeps its weight and its receipt.
    expect(world!.edges[0].weight).toBe(0.7);
    expect(world!.edges[0].receipt?.quote).toContain('1 percent');
  });

  it('with no corpus, comes back all-T0 — a structure with no numbers at all', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify(RAW) });
    const world = await explodeWorld('Why did lending blow up?', '', cfg);
    expect(world!.nodes.every((n) => n.tier === 'T0' && n.value === undefined)).toBe(true);
    expect(world!.edges.every((e) => e.weight === undefined)).toBe(true);
  });

  it('returns null when the provider throws, and on unparseable output', async () => {
    generateMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await expect(explodeWorld('q', CORPUS, cfg)).resolves.toBeNull();
    generateMock.mockResolvedValue({ raw: 'sorry, I cannot' });
    expect(await explodeWorld('q', CORPUS, cfg)).toBeNull();
  });

  it('returns null when the turn was aborted while the call was in flight', async () => {
    const ctrl = new AbortController();
    generateMock.mockImplementation(async () => {
      ctrl.abort();
      return { raw: JSON.stringify(RAW) };
    });
    expect(await explodeWorld('q', CORPUS, cfg, ctrl.signal)).toBeNull();
    // The signal is threaded to the adapter too, so a superseded turn stops the fetch itself.
    expect(generateMock.mock.calls[0][0].signal).toBe(ctrl.signal);
  });

  // The in-session memo is what makes a re-open free (world-cost pins that promise), so it has to
  // hold worlds — but it is a module-level Map keyed by question + corpus, and a reader who works
  // through a long session would otherwise accumulate every web they ever opened for the life of
  // the tab. Bounded, the worst case is one rebuild of a world nobody has looked at in a while.
  it(`memoises at most ${BUILT_CAP} worlds, evicting the least recently built`, async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify(RAW) });
    const question = (i: number): string => `why did thing ${i} happen?`;
    for (let i = 0; i <= BUILT_CAP; i += 1) await explodeWorld(question(i), CORPUS, cfg);
    const spent = generateMock.mock.calls.length;

    // The newest is still held: re-opening it is free, which is the whole point of the memo.
    await explodeWorld(question(BUILT_CAP), CORPUS, cfg);
    expect(generateMock.mock.calls.length).toBe(spent);

    // The oldest was let go, so it costs a real call again — honest, and bounded.
    await explodeWorld(question(0), CORPUS, cfg);
    expect(generateMock.mock.calls.length).toBe(spent + 1);
  });
});

describe('evolveWorld', () => {
  it('maps an echoed follow-up onto the standing world and keeps its pinned identity', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        title: 'Why did lending blow up?',
        outcomeId: 'blowup',
        nodes: [
          {
            id: 'defaults',
            label: 'Defaults rose',
            role: 'mechanism',
            depth: 1,
            tier: 'T2',
            value: 6.2,
            quote: 'Monthly defaults rose 6.2 points in March',
          },
          { id: 'blowup', label: 'Lending blew up', role: 'outcome', depth: 2, tier: 'T0' },
        ],
        edges: [{ from: 'defaults', to: 'blowup', sign: 1, tier: 'T0' }],
        provenance: {},
      }),
    });
    const merged = await evolveWorld(STANDING, 'show me that over time', CORPUS, cfg);
    expect(merged).not.toBeNull();
    // The world's own identity is untouched by the follow-up.
    expect(merged!.title).toBe(STANDING.title);
    expect(merged!.nodes.map((n) => n.id)).toEqual(['cheap-credit', 'defaults', 'blowup']);
    // The enrichment landed on the node it named.
    const defaults = merged!.nodes.find((n) => n.id === 'defaults')!;
    expect(defaults.tier).toBe('T2');
    expect(defaults.value).toBe(6.2);
    expect(merged!.edges).toHaveLength(1);
    // The prior world is never mutated.
    expect(STANDING.nodes[1].tier).toBe('T0');
    expect(STANDING.edges).toHaveLength(0);
  });

  it('sends the existing id roster so the model has something to echo', async () => {
    generateMock.mockResolvedValue({ raw: '{}' });
    await evolveWorld(STANDING, 'over time', CORPUS, cfg);
    const user = generateMock.mock.calls[0][0].user as string;
    for (const node of STANDING.nodes) expect(user).toContain(`${node.id} = ${node.label}`);
  });

  it('discards a follow-up that barely lands on the standing world — never a wrong morph', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        title: 'Why did lending blow up?',
        outcomeId: 'tariffs',
        nodes: [
          { id: 'tariffs', label: 'Tariffs', role: 'root', depth: 0, tier: 'T0' },
          { id: 'shipping', label: 'Shipping costs', role: 'mechanism', depth: 1, tier: 'T0' },
          { id: 'prices', label: 'Prices', role: 'outcome', depth: 2, tier: 'T0' },
          { id: 'blowup', label: 'Lending blew up', role: 'outcome', depth: 2, tier: 'T0' },
        ],
        edges: [],
        provenance: {},
      }),
    });
    // Only 1 of 4 incoming nodes maps — below the 50% floor, so the whole payload is dropped.
    expect(await evolveWorld(STANDING, 'what about tariffs', CORPUS, cfg)).toBeNull();
  });

  it('returns null when the follow-up call fails', async () => {
    generateMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await expect(evolveWorld(STANDING, 'over time', CORPUS, cfg)).resolves.toBeNull();
  });
});

describe('what an ungrounded world is still allowed to carry', () => {
  it('asks for dates, so a world with no sources can still be read in time', async () => {
    // Every live world starts ungrounded, and a world with no dates can only ever be a graph — the
    // timeline is not offered when nothing can be placed on it. A date is not a measurement (the
    // gate takes one with no receipt), so withholding it bought no honesty and cost the reader a
    // whole way of seeing the answer.
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        title: 'Why did it happen?',
        outcomeId: 'b',
        nodes: [
          { id: 'a', label: 'A', role: 'root', date: '2003' },
          { id: 'b', label: 'B', role: 'outcome', date: '2008' },
        ],
        edges: [],
      }),
    });
    const world = await explodeWorld('Why did it happen?', '', cfg);

    const req = generateMock.mock.calls[0][0];
    // Asked for as a PLAIN STRING. As a nested {t, until} object the field was declared, prompted
    // and simply never emitted — verified against a live turn where every node came back with a
    // domain and not one with a date. coerceDate accepts either shape, so asking for the one the
    // model actually writes costs the gate nothing.
    expect(
      (
        req.format as {
          properties: { nodes: { items: { properties: Record<string, { type: string }> } } };
        }
      ).properties.nodes.items.properties.date.type,
    ).toBe('string');
    expect(req.system).toMatch(/needs NO source/i);
    // And the dates survive the gate on a world where nothing else could.
    expect(world?.nodes.map((n) => n.date?.t)).toEqual(['2003', '2008']);
    expect(world?.nodes.every((n) => n.tier === 'T0')).toBe(true);
  });
});
