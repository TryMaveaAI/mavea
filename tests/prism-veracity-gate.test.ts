import { describe, expect, it } from 'vitest';
import { gateCitation, resolveVerdict, hostOf } from '../src/live/prism/veracity/gate';
import type { Evidence, RawVerdict } from '../src/live/prism/veracity/gate';

// The citation-must-verify gate is the line that keeps Prism honest about the WORLD: a verdict like
// "outdated"/"contradicted" may only stand if its citation is real — the quote verbatim in a retrieved
// snippet AND the URL one search actually returned. A mis-quote or an invented URL downgrades the
// whole verdict to the honest grey "unsupported". Never a fabricated world-receipt.

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
    expect(gateCitation({ citationQuote: '', citationUrl: 'https://x.com' }, evidence)).toBeNull();
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
