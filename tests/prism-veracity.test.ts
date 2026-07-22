import { beforeEach, describe, expect, it, vi } from 'vitest';
import { equalityVerdict, growthVerdict } from '../src/live/prism/reconcile/check';
import { extractNumbers } from '../src/live/prism/reconcile/extractNumbers';
import { gateCitation, hostOf, resolveVerdict } from '../src/live/prism/veracity/gate';
import { standingLine } from '../src/live/prism/veracity/standingLine';
import type { NumberAtom } from '../src/live/prism/reconcile/types';
import type { Claim } from '../src/live/prism/types';
import type { Evidence, RawVerdict } from '../src/live/prism/veracity/gate';
import type { Verdict } from '../src/live/prism/veracity/types';
import type { SearchProvider } from '../src/live/search/types';
import type { ModelConfig } from '../src/types/mavea';

// The citation-must-verify gate is the line that keeps Prism honest about the WORLD: a verdict like
// "outdated"/"contradicted" may only stand if its citation is real — the quote verbatim in a retrieved
// snippet AND the URL one search actually returned. A mis-quote or an invented URL downgrades the
// whole verdict to the honest grey "unsupported". Never a fabricated world-receipt.
describe('veracity — the citation-must-verify gate', () => {
  const evidence: Evidence[] = [
    {
      title: 'Plant-based market size',
      url: 'https://www.gartner.com/market/plant-based',
      snippet: 'The most recent figure is $9.1B, growing about 11% CAGR as of March 2024.',
      date: '2024-03',
    },
    {
      title: 'Cultivated meat overview',
      url: 'https://en.wikipedia.org/wiki/Cultivated_meat',
      snippet: 'Cost parity with conventional beef has not yet been achieved at scale.',
    },
  ];

  describe('hostOf', () => {
    it('strips protocol and www', () => {
      expect(hostOf('https://www.gartner.com/x/y')).toBe('gartner.com');
      expect(hostOf('http://en.wikipedia.org/wiki/X')).toBe('en.wikipedia.org');
    });
    it('returns empty on a malformed url', () => {
      expect(hostOf('not a url')).toBe('');
    });
  });

  describe('gateCitation', () => {
    it('accepts a citation whose quote is verbatim in the matching result', () => {
      const c = gateCitation(
        {
          citationQuote: 'most recent figure is $9.1B',
          citationUrl: 'http://gartner.com/market/plant-based?utm=1', // different protocol/www/query
        },
        evidence,
      );
      expect(c).not.toBeNull();
      expect(c!.host).toBe('gartner.com');
      expect(c!.url).toBe('https://www.gartner.com/market/plant-based'); // the REAL retrieved url
    });

    it('rejects a quote that is not in the cited result', () => {
      const c = gateCitation(
        {
          citationQuote: 'profits tripled overnight',
          citationUrl: 'https://www.gartner.com/market/plant-based',
        },
        evidence,
      );
      expect(c).toBeNull();
    });

    it('rejects a URL that was never retrieved (invented source)', () => {
      const c = gateCitation(
        {
          citationQuote: 'most recent figure is $9.1B',
          citationUrl: 'https://totally-made-up.example/report',
        },
        evidence,
      );
      expect(c).toBeNull();
    });

    it('rejects when the quote belongs to a DIFFERENT retrieved result than the cited URL', () => {
      // the quote is real (it's in the wikipedia result) but the URL points at gartner → not tied
      const c = gateCitation(
        {
          citationQuote: 'Cost parity with conventional beef has not yet been achieved',
          citationUrl: 'https://www.gartner.com/market/plant-based',
        },
        evidence,
      );
      expect(c).toBeNull();
    });

    it('rejects an empty quote or url', () => {
      expect(
        gateCitation({ citationQuote: '', citationUrl: 'https://x.com' }, evidence),
      ).toBeNull();
      expect(gateCitation({ citationQuote: 'x', citationUrl: '' }, evidence)).toBeNull();
    });

    // verdict-precision floor: the gate must reject a PARAPHRASE — a citation that shares the source's
    // words but isn't a verbatim substring. This is what stops "outdated"/"contradicted" from standing
    // on a number the model reworded (e.g. "$9.1B" → "$9.1 billion"). Verbatim or it doesn't count.
    it('rejects a paraphrase that is not a verbatim substring of the snippet', () => {
      const c = gateCitation(
        {
          citationQuote: 'the recent figure of $9.1 billion',
          citationUrl: 'https://www.gartner.com/market/plant-based',
        },
        evidence,
      );
      expect(c).toBeNull();
    });

    it('rejects a reordered quote (same words, different order)', () => {
      const c = gateCitation(
        {
          citationQuote: '$9.1B is the most recent figure',
          citationUrl: 'https://www.gartner.com/market/plant-based',
        },
        evidence,
      );
      expect(c).toBeNull();
    });

    it('accepts a contiguous verbatim fragment (punctuation/case/whitespace forgiven)', () => {
      const c = gateCitation(
        {
          citationQuote: 'MOST   recent   figure   is   $9.1B',
          citationUrl: 'https://www.gartner.com/market/plant-based',
        },
        evidence,
      );
      expect(c).not.toBeNull();
    });

    it("prefers the source's real date over the model's unverified one", () => {
      const c = gateCitation(
        {
          citationQuote: 'most recent figure is $9.1B',
          citationUrl: 'https://www.gartner.com/market/plant-based',
          citationDate: '1999-01', // the model's date — must NOT override the retrieved one
        },
        evidence,
      );
      expect(c!.date).toBe('2024-03'); // the evidence's real date
    });

    it("falls back to the model's date only when the source exposes none", () => {
      const c = gateCitation(
        {
          citationQuote: 'Cost parity with conventional beef has not yet been achieved',
          citationUrl: 'https://en.wikipedia.org/wiki/Cultivated_meat', // this evidence has no date
          citationDate: '2023-08',
        },
        evidence,
      );
      expect(c!.date).toBe('2023-08');
    });
  });

  describe('resolveVerdict', () => {
    it('keeps a world-asserting verdict when its citation survives', () => {
      const raw: RawVerdict = {
        claimId: 'c1',
        verdict: 'outdated',
        note: 'A newer figure exists.',
        citationQuote: 'most recent figure is $9.1B',
        citationUrl: 'https://www.gartner.com/market/plant-based',
      };
      const v = resolveVerdict(raw, evidence);
      expect(v.verdict).toBe('outdated');
      expect(v.citation?.host).toBe('gartner.com');
    });

    it('downgrades a world-asserting verdict to unsupported when the citation is fabricated', () => {
      const raw: RawVerdict = {
        claimId: 'c2',
        verdict: 'contradicted',
        note: 'A competitor disagrees.',
        citationQuote: 'this exact text was never retrieved',
        citationUrl: 'https://www.gartner.com/market/plant-based',
      };
      const v = resolveVerdict(raw, evidence);
      expect(v.verdict).toBe('unsupported');
      expect(v.citation).toBeUndefined();
      expect(v.note).toMatch(/nothing in the searched sources/i);
    });

    it('leaves an unsupported verdict as-is (no citation required)', () => {
      const v = resolveVerdict({ claimId: 'c3', verdict: 'unsupported' }, evidence);
      expect(v.verdict).toBe('unsupported');
      expect(v.citation).toBeUndefined();
    });
  });
});

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

// runVeracity checks a settled map's LOAD-BEARING claims against the world: it retrieves real snippets
// per claim (here, a fake provider), makes ONE batched model call, and gates every citation. We assert
// the whole flow: a good citation survives, a fabricated one downgrades to "unsupported", a claim with
// no evidence is "unsupported" without a model call, and non-load-bearing claims are never checked.
describe('veracity — the whole world-check flow', () => {
  const cfg = { provider: 'anthropic', model: 'claude' } as unknown as ModelConfig;

  // A fake search provider that returns canned snippets keyed off the claim's title (which queryFor
  // puts at the front of the query): "TAM" → a Gartner figure, "NoEvidence" → nothing, else → neutral.
  const fakeProvider: SearchProvider = {
    id: 'wikipedia',
    needsKey: false,
    async search(query: string) {
      if (query.includes('TAM'))
        return [
          {
            title: 'Gartner',
            url: 'https://gartner.com/x',
            snippet: 'most recent figure is $9.1B',
          },
        ];
      if (query.includes('NoEvidence')) return [];
      return [
        {
          title: 'Wiki',
          url: 'https://en.wikipedia.org/wiki/Y',
          snippet: 'some neutral background',
        },
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
});

// The Standing line is the one screenshottable summary of a document's veracity. It must be HONEST:
// count only what was checked, list only the trouble that exists, never overclaim.
describe('veracity — the Standing line', () => {
  describe('standingLine', () => {
    it('is empty when nothing was checked', () => {
      expect(standingLine([])).toBe('');
    });

    it('reads clean when everything holds', () => {
      const v: Verdict[] = ['holds', 'holds', 'holds'];
      expect(standingLine(v)).toBe('All 3 checked claims hold up against the public record.');
    });

    it('singularizes a single checked claim', () => {
      expect(standingLine(['holds'])).toBe(
        'All 1 checked claim holds up against the public record.',
      );
    });

    it('summarizes the trouble buckets, severity-first', () => {
      const v: Verdict[] = ['holds', 'outdated', 'contradicted', 'unsupported', 'holds', 'holds'];
      expect(standingLine(v)).toBe(
        '3 of 6 checked claims need a second look: 1 contradicted · 1 outdated · 1 unsupported.',
      );
    });

    it('counts duplicates within a bucket', () => {
      const v: Verdict[] = ['outdated', 'outdated', 'holds'];
      expect(standingLine(v)).toBe('2 of 3 checked claims need a second look: 2 outdated.');
    });

    it('omits empty buckets', () => {
      const v: Verdict[] = ['disputed', 'holds'];
      expect(standingLine(v)).toBe('1 of 2 checked claims need a second look: 1 disputed.');
    });
  });
});

// extractNumbers pulls figures out of grounded quotes in pure code; the verdicts decide a contradiction
// in pure code (the model never does the arithmetic). These pin the parsing + the calculator-checkable
// math — the part that must never be wrong in front of an expert.
describe('reconcile — numbers pulled from quotes, verdicts in pure code', () => {
  function atom(over: Partial<NumberAtom>): NumberAtom {
    return {
      id: 'a',
      claimId: 'c',
      page: 1,
      raw: '1',
      value: 1,
      unit: 'count',
      label: '',
      quote: 'q',
      ...over,
    };
  }

  describe('extractNumbers', () => {
    it('reads currency, magnitude scale, and percent verbatim from one quote', () => {
      const atoms = extractNumbers([
        { id: 'c1', page: 4, quote: 'Revenue rose from $10M to $13M, a 40% increase.' },
      ]);
      const byRaw = new Map(atoms.map((a) => [a.raw, a]));
      expect(byRaw.get('$10M')).toMatchObject({
        value: 10_000_000,
        unit: 'currency',
        page: 4,
        claimId: 'c1',
      });
      expect(byRaw.get('$13M')).toMatchObject({ value: 13_000_000, unit: 'currency' });
      expect(byRaw.get('40%')).toMatchObject({ value: 40, unit: '%' });
      expect(atoms).toHaveLength(3);
    });

    it('handles decimals, billions, and multipliers', () => {
      const atoms = extractNumbers([
        { id: 'c', page: 1, quote: 'It grew 3× to $1.2B from 5 million users.' },
      ]);
      const byRaw = new Map(atoms.map((a) => [a.raw, a]));
      expect(byRaw.get('3×')).toMatchObject({ value: 3, unit: 'x' });
      expect(byRaw.get('$1.2B')).toMatchObject({ value: 1_200_000_000, unit: 'currency' });
      expect(byRaw.get('5 million')).toMatchObject({ value: 5_000_000, unit: 'count' });
    });

    it('does not double-count the number inside a currency figure', () => {
      const atoms = extractNumbers([{ id: 'c', page: 1, quote: 'costs of $10M' }]);
      expect(atoms).toHaveLength(1);
      expect(atoms[0]).toMatchObject({ raw: '$10M', unit: 'currency' });
    });
  });

  describe('equalityVerdict', () => {
    it('flags two percentages stated as the same quantity but differing', () => {
      const v = equalityVerdict(
        atom({ raw: '40%', value: 40, unit: '%', page: 2 }),
        atom({ raw: '30%', value: 30, unit: '%', page: 4 }),
        'growth',
      );
      expect(v).not.toBeNull();
      expect(v?.detail).toBe('p.2: 40%  ✕  p.4: 30%');
    });

    it('stays silent on a rounding-level difference', () => {
      expect(
        equalityVerdict(atom({ value: 40, unit: '%' }), atom({ value: 40.2, unit: '%' }), 'x'),
      ).toBeNull();
    });

    it('refuses to compare different units', () => {
      expect(
        equalityVerdict(atom({ value: 40, unit: '%' }), atom({ value: 40, unit: 'currency' }), 'x'),
      ).toBeNull();
    });

    it('uses a relative tolerance for currency', () => {
      expect(
        equalityVerdict(
          atom({ value: 10_000, unit: 'currency' }),
          atom({ value: 10_100, unit: 'currency' }),
          'x',
        ),
      ).toBeNull(); // within 2%
      expect(
        equalityVerdict(
          atom({ value: 10_000, unit: 'currency' }),
          atom({ value: 12_000, unit: 'currency' }),
          'x',
        ),
      ).not.toBeNull();
    });
  });

  describe('growthVerdict', () => {
    const pct = (v: number) => atom({ raw: `${v}%`, value: v, unit: '%', page: 4 });
    const money = (v: number, raw: string) => atom({ raw, value: v, unit: 'currency', page: 4 });

    it('catches a stated growth that the values do not support', () => {
      const v = growthVerdict(
        pct(40),
        money(10_000_000, '$10M'),
        money(13_000_000, '$13M'),
        'revenue',
      );
      expect(v).not.toBeNull();
      expect(v?.computed).toBe('30%');
      expect(v?.detail).toContain('$10M→$13M = 30%');
    });

    it('stays silent when the stated growth matches', () => {
      expect(
        growthVerdict(pct(30), money(10_000_000, '$10M'), money(13_000_000, '$13M'), 'r'),
      ).toBeNull();
    });

    it('refuses a zero base or mixed units', () => {
      expect(growthVerdict(pct(40), money(0, '$0'), money(13_000_000, '$13M'), 'r')).toBeNull();
      expect(
        growthVerdict(pct(40), atom({ value: 10, unit: 'count' }), money(13, '$13'), 'r'),
      ).toBeNull();
    });
  });
});
