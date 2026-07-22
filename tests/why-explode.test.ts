// why-explode.test.ts — the generation call. Verifies it constrains the local model to OUR schema
// (passes `format`), grounds the result against the corpus, and fails safe to null. Adapter + cache
// mocked so it's deterministic and offline.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateMock = vi.fn();

vi.mock('../src/live/providers/index', () => ({ getAdapter: () => ({ generate: generateMock }) }));
vi.mock('../src/live/ripple/cache', () => ({
  cacheGet: async () => null,
  cachePut: async () => {},
  rippleCacheKey: () => 'k',
}));

import { explodeWhy } from '../src/live/why/explode';

const cfg = { provider: 'gemini', model: 'gemini-3.1-flash-lite' } as never;
const CORPUS = 'Monthly churn rose 6.2 points in March. List price rose 18% on Feb 28.';

const RAW = {
  center: 'Why did churn spike?',
  outcomeId: 'O',
  nodes: [
    {
      id: 'A',
      label: 'Price +18%',
      role: 'root',
      depth: 0,
      tier: 'T2',
      quote: 'List price rose 18% on Feb 28',
    },
    {
      id: 'O',
      label: 'Churn +6.2pp',
      role: 'outcome',
      depth: 1,
      tier: 'T2',
      value: 6.2,
      quote: 'Monthly churn rose 6.2 points in March',
    },
  ],
  edges: [
    {
      from: 'A',
      to: 'O',
      weight: 0.5,
      sign: 1,
      tier: 'T2',
      quote: 'List price rose 18% on Feb 28',
    },
  ],
  provenance: {},
};

beforeEach(() => generateMock.mockReset());

describe('explodeWhy', () => {
  it('passes a structured format and grounds the result', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify(RAW) });
    const dag = await explodeWhy('Why did churn spike?', CORPUS, cfg);
    expect(dag).not.toBeNull();
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0][0].format).toBeDefined(); // Ollama schema constraint
    expect(dag!.nodes.find((n) => n.id === 'O')!.value).toBe(6.2);
    expect(dag!.edges[0].tier).toBe('T2');
  });

  it('with no corpus, comes back all-T0 (no fabricated numbers)', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify(RAW) });
    const dag = await explodeWhy('Why did churn spike?', '', cfg);
    expect(dag!.nodes.every((n) => n.tier === 'T0')).toBe(true);
    expect(dag!.edges.every((e) => e.weight === undefined)).toBe(true);
  });

  it('returns null when the model call throws', async () => {
    generateMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await expect(explodeWhy('q', CORPUS, cfg)).resolves.toBeNull();
  });

  it('returns null on unparseable output', async () => {
    generateMock.mockResolvedValue({ raw: 'sorry, I cannot' });
    expect(await explodeWhy('q', CORPUS, cfg)).toBeNull();
  });
});
