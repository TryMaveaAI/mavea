// world-expand.test.ts — buying a breakdown for one cause. Adapter and cache are mocked, so what
// this pins is the discipline around a call the READER pays for: it happens once per (world, node,
// corpus) and never again, a failure is not remembered as an answer, an authored breakdown is never
// overwritten, and everything the model says about a figure still has to survive the same grounding
// gate the initial explode applies.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateMock = vi.fn();

vi.mock('../src/live/providers/index', () => ({ getAdapter: () => ({ generate: generateMock }) }));
// The persistent cache is stubbed away, but its KEY is not: expandWorldNode memoises in-session
// under exactly that key, so a constant here would serve one test's children to the next one.
vi.mock('../src/live/ripple/cache', () => ({
  cacheGet: async () => null,
  cachePut: async () => {},
  rippleCacheKey: (input: string, provider: string) => `${provider}:${input}`,
}));

import { expandWorldNode } from '../src/live/world/expand';
import type { WorldSpec } from '../src/live/world/types';

const cfg = { provider: 'gemini', model: 'gemini-3.1-flash-lite' } as never;
const CORPUS = 'Subprime loans made up 620 billion of originations in 2006.';

/** A standing world: one plain cause, one that already carries an authored breakdown. */
const world = (title: string): WorldSpec => ({
  title,
  outcomeId: 'crisis',
  nodes: [
    { id: 'volume', label: 'Mortgage volume surged', role: 'root', depth: 0, tier: 'T0' },
    {
      id: 'already',
      label: 'Already broken down',
      role: 'mechanism',
      depth: 1,
      tier: 'T0',
      children: [
        { id: 'already.one', label: 'The authored part', role: 'mechanism', depth: 2, tier: 'T0' },
      ],
    },
    { id: 'crisis', label: 'Credit crisis', role: 'outcome', depth: 2, tier: 'T0' },
  ],
  edges: [],
  provenance: {},
});

const reply = (children: unknown): void => {
  generateMock.mockResolvedValueOnce({ raw: JSON.stringify({ children }) });
};

beforeEach(() => generateMock.mockReset());

describe('expandWorldNode', () => {
  it('attaches the parts of a cause, namespaced under it', async () => {
    reply([
      { id: 'subprime', label: 'Subprime' },
      { id: 'prime', label: 'Prime' },
    ]);
    const out = await expandWorldNode(world('w-attach'), 'volume', CORPUS, cfg);
    const children = out?.nodes.find((n) => n.id === 'volume')?.children;
    expect(children?.map((c) => c.id)).toEqual(['volume.subprime', 'volume.prime']);
    // A breakdown can never masquerade as a cause of its own: the top level is untouched.
    expect(out?.nodes.map((n) => n.id)).toEqual(['volume', 'already', 'crisis']);
  });

  it('keeps a figure the corpus says, and strips one it does not', async () => {
    reply([
      {
        id: 'subprime',
        label: 'Subprime',
        tier: 'T2',
        value: 620,
        unit: '$bn',
        quote: 'Subprime loans made up 620 billion of originations in 2006.',
      },
      { id: 'invented', label: 'Invented', tier: 'T2', value: 999, quote: 'Nobody wrote this.' },
    ]);
    const children = (await expandWorldNode(world('w-ground'), 'volume', CORPUS, cfg))?.nodes.find(
      (n) => n.id === 'volume',
    )?.children;
    expect(children?.[0]).toMatchObject({ tier: 'T2', value: 620 });
    expect(children?.[1]).toMatchObject({ tier: 'T0' });
    expect(children?.[1].value).toBeUndefined();
  });

  it('holds the four-child cap the gate enforces', async () => {
    reply(Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, label: `Part ${i}` })));
    const children = (await expandWorldNode(world('w-cap'), 'volume', CORPUS, cfg))?.nodes.find(
      (n) => n.id === 'volume',
    )?.children;
    expect(children).toHaveLength(4);
  });

  it('leaves the standing world untouched — the caller decides what to keep', async () => {
    reply([{ id: 'subprime', label: 'Subprime' }]);
    const prior = world('w-pure');
    const out = await expandWorldNode(prior, 'volume', CORPUS, cfg);
    expect(out).not.toBe(prior);
    expect(prior.nodes.find((n) => n.id === 'volume')?.children).toBeUndefined();
  });

  it('never overwrites a breakdown the answer already carried, and spends nothing trying', async () => {
    expect(await expandWorldNode(world('w-authored'), 'already', CORPUS, cfg)).toBeNull();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a node that is not on this world', 'nowhere'],
    ['a child, which IS the breakdown', 'already.one'],
  ])('refuses %s without a call', async (_why, nodeId) => {
    expect(await expandWorldNode(world('w-unknown'), nodeId, CORPUS, cfg)).toBeNull();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('says nothing rather than inventing parts for an atomic cause', async () => {
    reply([]);
    expect(await expandWorldNode(world('w-atomic'), 'volume', CORPUS, cfg)).toBeNull();
  });

  it('pays once for the same cause, however often it is opened', async () => {
    reply([{ id: 'subprime', label: 'Subprime' }]);
    const prior = world('w-cache');
    const first = await expandWorldNode(prior, 'volume', CORPUS, cfg);
    const second = await expandWorldNode(prior, 'volume', CORPUS, cfg);
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(second?.nodes.find((n) => n.id === 'volume')?.children).toEqual(
      first?.nodes.find((n) => n.id === 'volume')?.children,
    );
  });

  it('does not remember a failure as an answer', async () => {
    // A reader who presses again after a rate limit has to get a real attempt, not the shrug the
    // first press earned.
    generateMock.mockRejectedValueOnce(new Error('429'));
    const prior = world('w-retry');
    expect(await expandWorldNode(prior, 'volume', CORPUS, cfg)).toBeNull();

    reply([{ id: 'subprime', label: 'Subprime' }]);
    const retried = await expandWorldNode(prior, 'volume', CORPUS, cfg);
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(retried?.nodes.find((n) => n.id === 'volume')?.children).toHaveLength(1);
  });

  it('comes back empty-handed when the reader has left', async () => {
    reply([{ id: 'subprime', label: 'Subprime' }]);
    const controller = new AbortController();
    controller.abort();
    expect(await expandWorldNode(world('w-abort'), 'volume', CORPUS, cfg, controller.signal)).toBe(
      null,
    );
  });

  it('tells the model what is already on the web, so it splits the cause instead of restating it', async () => {
    reply([{ id: 'subprime', label: 'Subprime' }]);
    await expandWorldNode(world('w-prompt'), 'volume', CORPUS, cfg);
    const user = generateMock.mock.calls[0][0].user as string;
    expect(user).toContain('Mortgage volume surged');
    expect(user).toContain('Credit crisis'); // named as a sibling to stay out of the breakdown
    expect(user).toContain(CORPUS);
  });
});
