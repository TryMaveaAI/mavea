// ground-verify.test.ts — the pure honesty core: the verbatim gates, the citation gate, the number
// and JSON readers, the transcript grounder's fail-closed default, and the tier→conf bridge. These
// lock the behavior the whole spine (and every feature that consumes it) depends on.
import { describe, it, expect } from 'vitest';
import { isVerbatimOnPage, normalizePdfText, groundedPageOf } from '../src/live/ground/verbatim';
import { gateCitation, canonUrl, hostOf } from '../src/live/ground/citation';
import { makeTranscriptGrounder, normalizeForMatch } from '../src/live/ground/transcript';
import { parseAmount, toNumber, digitsOf } from '../src/live/ground/number';
import { parseLooseJson, extractJsonSlice } from '../src/live/ground/json';
import { tierToConf } from '../src/live/ground/tier';

describe('verbatim gate', () => {
  it('accepts a real quote and preserves accents/ligatures', () => {
    expect(isVerbatimOnPage('café', 'we sat in the café at noon')).toBe(true);
    expect(isVerbatimOnPage('office', 'the oﬃce was quiet')).toBe(true); // ﬃ ligature via NFKC
  });
  it('rejects an empty quote and a fabricated one', () => {
    expect(isVerbatimOnPage('', 'anything')).toBe(false);
    expect(isVerbatimOnPage('quarterly revenue tripled', 'the weather was mild today')).toBe(false);
  });
  it('binds a currency symbol to its number and rejoins hyphenation', () => {
    expect(isVerbatimOnPage('$10,253', 'cost was $ 10,253 total')).toBe(true);
    expect(normalizePdfText('manage-\nment')).toBe('management');
  });
  it('finds the true page and returns 0 when the quote is nowhere', () => {
    const pages = ['intro text', 'the metric rose 12% in march', 'closing'];
    expect(groundedPageOf('rose 12%', pages)).toBe(2);
    expect(groundedPageOf('rose 40%', pages)).toBe(0);
  });
});

describe('citation gate', () => {
  const evidence = [
    {
      title: 'Acme Q1',
      url: 'https://www.acme.com/q1?utm=x',
      snippet: 'Revenue grew to $4.2M in Q1.',
    },
  ];
  it('verifies a real quote against the matching returned URL and uses the real URL', () => {
    const c = gateCitation(
      { citationQuote: 'Revenue grew to $4.2M', citationUrl: 'http://acme.com/q1' },
      evidence,
    );
    expect(c).not.toBeNull();
    expect(c!.host).toBe('acme.com');
    expect(c!.url).toBe('https://www.acme.com/q1?utm=x'); // the retrieved URL, not the model's
  });
  it('drops an invented URL and a mis-quote', () => {
    expect(
      gateCitation(
        { citationQuote: 'Revenue grew to $4.2M', citationUrl: 'https://evil.com/x' },
        evidence,
      ),
    ).toBeNull();
    expect(
      gateCitation(
        { citationQuote: 'Revenue fell to $1', citationUrl: 'http://acme.com/q1' },
        evidence,
      ),
    ).toBeNull();
  });
  it('canonicalizes URLs and derives hosts', () => {
    expect(canonUrl('https://www.x.com/a/?q=1#h')).toBe('x.com/a');
    expect(hostOf('https://www.gartner.com/x')).toBe('gartner.com');
  });
});

describe('transcript grounder — fail-closed by default', () => {
  it('no transcript: default drops; failOpen:true passes', () => {
    expect(makeTranscriptGrounder(undefined)('anything')).toBe(false);
    expect(makeTranscriptGrounder(undefined, { failOpen: true })('anything')).toBe(true);
    expect(makeTranscriptGrounder('', { failOpen: false })('x')).toBe(false);
  });
  it('grounds a contiguous quote and tolerates one misheard word (90% window)', () => {
    const g = makeTranscriptGrounder(
      'i really want to move to seattle next spring for the new job soon',
    );
    expect(g('move to seattle next spring')).toBe(true); // exact contiguous span
    expect(g('move to seattle next summer for the new job soon')).toBe(true); // 9/10 tokens ≥ 90%
    expect(g('sell the house in boston')).toBe(false);
  });
  it('normalizeForMatch folds apostrophes and punctuation', () => {
    expect(normalizeForMatch("It's a Test!")).toBe('its a test');
  });
});

describe('number + json readers', () => {
  it('parseAmount reads clean tokens and rejects ranges/prose', () => {
    expect(parseAmount('$1,800')).toEqual({ value: 1800, kind: 'amount', raw: '$1,800' });
    expect(parseAmount('36%')).toEqual({ value: 36, kind: 'pct', raw: '36%' });
    expect(parseAmount('≈3.2k')?.value).toBe(3200);
    expect(parseAmount('$5,000/mo')?.value).toBe(5000);
    expect(parseAmount('3 to 5')).toBeNull();
    expect(parseAmount('lots')).toBeNull();
  });
  it('toNumber is lenient but requires a digit', () => {
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber(42)).toBe(42);
    expect(toNumber('')).toBeNull();
    expect(toNumber('$')).toBeNull();
  });
  it('digitsOf strips grouping', () => {
    expect(digitsOf(12300)).toBe('12300');
  });
  it('parseLooseJson peels prose/fences; passes objects through; null on garbage', () => {
    expect(parseLooseJson('here: {"a":1}. done')).toEqual({ a: 1 });
    expect(parseLooseJson('```json\n{"b":2}\n```')).toEqual({ b: 2 });
    expect(parseLooseJson({ c: 3 })).toEqual({ c: 3 });
    expect(parseLooseJson('not json at all')).toBeNull();
    expect(extractJsonSlice('x {"y":1} z')).toBe('{"y":1}');
  });
});

describe('tier → conf bridge', () => {
  it('maps every tier to a canvas confidence level', () => {
    expect(tierToConf('T1')).toBe('strong');
    expect(tierToConf('T2')).toBe('partial');
    expect(tierToConf('T3')).toBe('inferred');
    expect(tierToConf('T0')).toBe('unverified');
  });
});
