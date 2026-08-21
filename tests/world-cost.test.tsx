// world-cost.test.tsx — what a living answer is allowed to COST. Mavéa is BYOK: every model call
// is the reader's own money, so the world's whole economics are a testable contract, not a habit.
//
//   · offering a world is FREE — a gated causal turn spends exactly the one call the answer needed
//   · opening one spends exactly one more, and a second open spends nothing
//   · everything the surface does with a world it already has — morphing between representations,
//     pulling a lever, opening provenance, unfolding a breakdown that is already in the payload —
//     spends nothing at all
//
// The provider adapter and `fetch` are both spied, so "no call" means no call by any route.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { WorldSpec } from '../src/live/world/types';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({
    id: 'anthropic',
    capabilities: {
      constrainedDecoding: true,
      streaming: false,
      vision: false,
      contextWindow: 200000,
      strengthTier: 'frontier',
      nativeWebSearch: false,
    },
    generate: generateMock,
    probe: async () => ({ ok: true }),
  }),
}));
// No IndexedDB in the runner; the in-session memo is what serves a re-open here, exactly as it
// does in a private-mode browser. The key stays content-derived so two worlds can't collide.
vi.mock('../src/live/ripple/cache', () => ({
  cacheGet: async () => null,
  cachePut: async () => {},
  rippleCacheKey: (input: string, provider: string) => `${provider}:${input}`,
}));

import { WorldOverlay } from '../src/live/world/WorldOverlay';
import { WORLD_SEED } from '../src/live/world/seed';
import { useLiveTurn } from '../src/live/useLiveTurn';
import { generateLive } from '../src/live/generateLive';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };
const QUESTION = 'Why did the 2008 financial crisis happen?';

/** A minimal, valid model answer — one insight block and a narration. `causal` is set because what
 *  is measured here is COST, and the offer gate is a separate question: with the flag present the
 *  card is earned outright (offersWorld), so a change to how an answer is READ for a causal web
 *  cannot quietly turn these into tests of nothing. */
const ANSWER = JSON.stringify({
  title: 'The crisis, in four moves',
  sub: 'What actually happened',
  causal: true,
  narration: 'Cheap credit met securitization, and the market froze.',
  blocks: [
    {
      type: 'insight',
      props: { title: 'Cheap credit', summary: 'Rates were held low for years.' },
    },
  ],
});

/** The world a build would return — never reached in the turn path. */
const BUILT = {
  title: QUESTION,
  outcomeId: 'freeze',
  nodes: [
    { id: 'cheap-credit', label: 'Cheap credit', role: 'root', depth: 0, tier: 'T0' },
    { id: 'freeze', label: 'Credit froze', role: 'outcome', depth: 1, tier: 'T0' },
  ],
  edges: [{ from: 'cheap-credit', to: 'freeze', verb: 'fuelled', sign: 1, tier: 'T0' }],
  provenance: {},
};

const worldCard = (
  spec: ConversationSpec | null,
): (Block & { props: { world?: WorldSpec; title: string } }) | undefined =>
  spec?.blocks.find((b) => b.type === 'world') as
    (Block & { props: { world?: WorldSpec; title: string } }) | undefined;

/** Calls that built a WORLD, told apart from the turn's own canvas call (and its repair passes)
 *  by the one system prompt only world/explode sends. */
const worldCalls = (): unknown[] =>
  generateMock.mock.calls.filter(
    ([req]) => typeof req?.system === 'string' && req.system.includes('causal world-builder'),
  );

afterEach(cleanup);
beforeEach(() => generateMock.mockReset());

describe('a gated turn offers a world without paying for one', () => {
  it('spends exactly the answer’s own call and leaves the card unbuilt', async () => {
    generateMock.mockResolvedValue({ raw: ANSWER });
    const result = await generateLive(QUESTION, [], cfg, undefined, {
      caps: { worldEnabled: true },
    });

    // Not one world call: the turn spent what the ANSWER needed and nothing more.
    expect(worldCalls()).toHaveLength(0);
    const card = worldCard(result.spec);
    expect(card).toBeDefined();
    expect(card!.props.world).toBeUndefined();
    // What the card carries is what the turn already knew — the question, verbatim.
    expect(card!.props.title).toBe(QUESTION);
  });

  it('offers nothing at all when the capability is off', async () => {
    generateMock.mockResolvedValue({ raw: ANSWER });
    const result = await generateLive(QUESTION, [], cfg, undefined, { caps: {} });
    expect(worldCalls()).toHaveLength(0);
    expect(worldCard(result.spec)).toBeUndefined();
  });
});

describe('opening a world is what buys it', () => {
  /** A settled canvas carrying one unbuilt world card, landed through the real reducer. */
  async function surfaceWithOffer() {
    generateMock.mockResolvedValue({ raw: ANSWER });
    const hook = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getCaps: () => ({ worldEnabled: true }) }),
    );
    await act(async () => {
      await hook.result.current.run(QUESTION);
    });
    return hook;
  }

  it('spends one call on the first open, and nothing on the second', async () => {
    const hook = await surfaceWithOffer();
    const card = worldCard(hook.result.current.spec);
    expect(card?.props.world).toBeUndefined();
    expect(worldCalls()).toHaveLength(0);

    generateMock.mockResolvedValue({ raw: JSON.stringify(BUILT) });
    await act(async () => {
      await hook.result.current.generateWorld(card!.id!);
    });
    expect(worldCalls()).toHaveLength(1);

    // The built world is written back onto the card AND onto the frame a replay renders.
    const built = worldCard(hook.result.current.spec);
    expect(built?.props.world?.nodes.map((n) => n.id)).toEqual(['cheap-credit', 'freeze']);
    expect(worldCard(hook.result.current.frames[0].spec)?.props.world).toBeDefined();

    // Re-opening it costs nothing: the card already carries the world.
    await act(async () => {
      await hook.result.current.generateWorld(card!.id!);
    });
    expect(worldCalls()).toHaveLength(1);
  });
});

describe('a world you already have is free to use', () => {
  it('morphing, levers, provenance and a pre-authored breakdown make no call', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this test')));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} />);

      // Every representation, both ways — the same nodes re-laid out.
      for (const label of ['Over time', 'As a chart', 'Graph']) {
        fireEvent.click(screen.getByRole('tab', { name: label }));
      }
      expect(screen.getByRole('tab', { name: 'Graph' }).getAttribute('aria-selected')).toBe('true');
      // A lever: the counterfactual is a local cascade, not a question for the model.
      fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '30' } });
      expect(screen.getAllByText(/hypothetical/i).length).toBeGreaterThan(0);
      // Provenance / evidence: selecting a cause, then a link.
      fireEvent.click(container.querySelector<HTMLElement>('.mv-node')!);
      expect(container.querySelector('.wo-detail-title')).toBeTruthy();
      fireEvent.click(container.querySelector<SVGPathElement>('.morph-edge')!);
      // A breakdown that is already in the payload — unfolding it reads no new data.
      const expand = container.querySelector<HTMLButtonElement>('.wo-expand')!;
      fireEvent.click(expand);
      expect(expand.textContent).toMatch(/close/i);

      expect(generateMock).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
