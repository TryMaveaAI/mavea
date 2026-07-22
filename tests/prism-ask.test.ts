import { describe, expect, it } from 'vitest';
import { groundSpans, selectPages } from '../src/live/prism/ask';

// groundSpans is the anti-hallucination gate for an Ask It answer: a span may only point at a quote
// that appears VERBATIM in the cited document. Same sacred rule as a claim card — anything the page
// can't prove is dropped, never shown.
describe('groundSpans', () => {
  const corpus = [['intro about widgets', 'the market reaches $87B by 2030', 'closing remarks']];

  it('keeps a verbatim span and corrects a drifted page', () => {
    const out = groundSpans([{ doc: 0, page: 1, quote: 'reaches $87B' }], corpus);
    expect(out).toEqual([{ doc: 0, page: 2, quote: 'reaches $87B' }]);
  });

  it('drops a fabricated span that appears on no page', () => {
    expect(groundSpans([{ doc: 0, page: 1, quote: 'profits tripled overnight' }], corpus)).toEqual(
      [],
    );
  });

  it('clamps an out-of-range doc index to a real document', () => {
    const out = groundSpans([{ doc: 9, page: 3, quote: 'closing remarks' }], corpus);
    expect(out).toEqual([{ doc: 0, page: 3, quote: 'closing remarks' }]);
  });

  it('grounds against the right document in multi-document mode', () => {
    const multi = [['alpha one'], ['beta two']];
    expect(groundSpans([{ doc: 1, page: 1, quote: 'beta two' }], multi)).toEqual([
      { doc: 1, page: 1, quote: 'beta two' },
    ]);
  });

  it('de-duplicates identical spans', () => {
    const out = groundSpans(
      [
        { doc: 0, page: 2, quote: 'reaches $87B' },
        { doc: 0, page: 2, quote: 'reaches $87B' },
      ],
      corpus,
    );
    expect(out).toHaveLength(1);
  });

  it('caps the number of spans so an answer never floods the eye', () => {
    const pages = Array.from({ length: 9 }, (_, i) => `page ${i} marker${i}`);
    const spans = Array.from({ length: 9 }, (_, i) => ({
      doc: 0,
      page: i + 1,
      quote: `marker${i}`,
    }));
    expect(groundSpans(spans, [pages])).toHaveLength(8);
  });

  it('ignores a non-array or malformed input', () => {
    expect(groundSpans(null, corpus)).toEqual([]);
    expect(groundSpans([{ doc: 0 }, 'nope', null], corpus)).toEqual([]);
  });

  it('never grounds an empty quote', () => {
    expect(groundSpans([{ doc: 0, page: 1, quote: '   ' }], corpus)).toEqual([]);
  });
});

// selectPages is the free, local retrieval that keeps the one ask cheap on a big pile: a small corpus
// goes whole (in reading order); a large one is ranked by keyword overlap and trimmed to budget.
describe('selectPages', () => {
  it('returns every non-empty page in reading order for a small corpus', () => {
    const out = selectPages([['a', '', 'b']], 'anything');
    expect(out).toEqual([
      { doc: 0, page: 1, text: 'a' },
      { doc: 0, page: 3, text: 'b' },
    ]);
  });

  it('picks the most relevant page when the corpus exceeds the budget', () => {
    const corpus = [['apples and oranges', 'rockets to mars', 'bananas everywhere']];
    // Tiny budget forces ranking: only the page matching the question's keywords survives.
    const out = selectPages(corpus, 'mars rockets', 12);
    expect(out).toEqual([{ doc: 0, page: 2, text: 'rockets to mars' }]);
  });
});
