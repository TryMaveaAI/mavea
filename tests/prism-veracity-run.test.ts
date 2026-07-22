import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';
import type { Claim } from '../src/live/prism/types';
import type { SearchProvider } from '../src/live/search/types';

// runVeracity checks a settled map's LOAD-BEARING claims against the world: it retrieves real snippets
// per claim (here, a fake provider), makes ONE batched model call, and gates every citation. We assert
// the whole flow: a good citation survives, a fabricated one downgrades to "unsupported", a claim with
// no evidence is "unsupported" without a model call, and non-load-bearing claims are never checked.

let adapterReply: string | object = '{"verdicts":[]}';
let generateCalls = 0;

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    generate: async () => {
      generateCalls += 1;
      return { raw: adapterReply };
    },
  }),
}));

const { runVeracity } = await import('../src/live/prism/veracity/verify');

const cfg = { provider: 'anthropic', model: 'claude' } as unknown as ModelConfig;

// A fake search provider that returns canned snippets keyed off the claim's title (which queryFor
// puts at the front of the query): "TAM" → a Gartner figure, "NoEvidence" → nothing, else → neutral.
const fakeProvider: SearchProvider = {
  id: 'wikipedia',
  needsKey: false,
  async search(query: string) {
    if (query.includes('TAM'))
      return [
        { title: 'Gartner', url: 'https://gartner.com/x', snippet: 'most recent figure is $9.1B' },
      ];
    if (query.includes('NoEvidence')) return [];
    return [
      { title: 'Wiki', url: 'https://en.wikipedia.org/wiki/Y', snippet: 'some neutral background' },
    ];
  },
};

function claim(id: string, title: string, role: Claim['role']): Claim {
  return {
    id,
    quote: `quote for ${title}`,
    page: 1,
    kind: 'stat',
    title,
    ask: 'why?',
    role,
    region: 'R',
    source: 0,
  };
}

beforeEach(() => {
  generateCalls = 0;
  adapterReply = '{"verdicts":[]}';
});

describe('runVeracity', () => {
  it('checks only load-bearing claims; gates citations; one batched model call', async () => {
    const claims: Claim[] = [
      claim('k1', 'TAM market size', 'load-bearing'),
      claim('k2', 'NeutralClaim', 'load-bearing'),
      claim('k3', 'NoEvidence here', 'load-bearing'),
      claim('s1', 'A supporting fact', 'supporting'),
    ];
    adapterReply = JSON.stringify({
      verdicts: [
        {
          claimId: 'k1',
          verdict: 'outdated',
          note: 'A 2024 source reports a lower figure.',
          citationQuote: 'most recent figure is $9.1B',
          citationUrl: 'https://gartner.com/x',
        },
        {
          // fabricated citation quote — not in k2's snippet → must downgrade
          claimId: 'k2',
          verdict: 'contradicted',
          note: 'A source disagrees.',
          citationQuote: 'this text was never retrieved',
          citationUrl: 'https://en.wikipedia.org/wiki/Y',
        },
      ],
    });

    const out = await runVeracity(claims, { cfg, provider: fakeProvider });
    const by = new Map(out.map((v) => [v.claimId, v]));

    // non-load-bearing is never checked
    expect(by.has('s1')).toBe(false);
    // k1: valid citation survives
    expect(by.get('k1')!.verdict).toBe('outdated');
    expect(by.get('k1')!.citation?.host).toBe('gartner.com');
    // k2: fabricated citation → honest unsupported, no citation
    expect(by.get('k2')!.verdict).toBe('unsupported');
    expect(by.get('k2')!.citation).toBeUndefined();
    // k3: no evidence found → unsupported (deterministic)
    expect(by.get('k3')!.verdict).toBe('unsupported');
    // exactly ONE batched model call (k3 needed none)
    expect(generateCalls).toBe(1);
  });

  it('returns nothing when there are no load-bearing claims (no search, no model call)', async () => {
    const out = await runVeracity([claim('s1', 'x', 'supporting'), claim('c1', 'y', 'context')], {
      cfg,
      provider: fakeProvider,
    });
    expect(out).toEqual([]);
    expect(generateCalls).toBe(0);
  });

  it('degrades every claim to unsupported (never fabricated) when the model is unreachable', async () => {
    const failProvider = { ...fakeProvider };
    const claims = [claim('k1', 'TAM market size', 'load-bearing')];
    // make the adapter throw
    adapterReply = '';
    const mod = await import('../src/live/providers');
    const spy = vi.spyOn(mod, 'getAdapter').mockReturnValue({
      generate: async () => {
        throw new Error('network');
      },
    } as unknown as ReturnType<typeof mod.getAdapter>);

    const out = await runVeracity(claims, { cfg, provider: failProvider });
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe('unsupported');
    expect(out[0].citation).toBeUndefined();
    spy.mockRestore();
  });
});
