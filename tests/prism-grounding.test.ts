import { describe, expect, it } from 'vitest';
import {
  isClaimGrounded,
  isVerbatimOnPage,
  normalizePdfText,
  groundedPageOf,
} from '../src/live/prism/grounding';

describe('groundedPageOf', () => {
  const pages = ['intro about widgets', 'the market reaches $87B by 2030', 'closing remarks'];

  it('returns the claimed page when the quote is there', () => {
    expect(groundedPageOf('reaches $87B', pages, 2)).toBe(2);
  });

  it('corrects a wrong page to the page that actually has the quote', () => {
    expect(groundedPageOf('reaches $87B', pages, 1)).toBe(2);
  });

  it('finds the page even with no claimed page', () => {
    expect(groundedPageOf('closing remarks', pages)).toBe(3);
  });

  it('returns 0 when the quote appears on no page (fabricated)', () => {
    expect(groundedPageOf('profits tripled overnight', pages, 1)).toBe(0);
  });

  it('returns 0 for an empty quote', () => {
    expect(groundedPageOf('   ', pages, 1)).toBe(0);
  });
});

describe('isVerbatimOnPage', () => {
  it('accepts a quote that appears verbatim on the page', () => {
    expect(
      isVerbatimOnPage('cost parity with beef', 'In Q1 it reached cost parity with beef.'),
    ).toBe(true);
  });

  it('rejects a fabricated quote that is not on the page', () => {
    expect(
      isVerbatimOnPage('cost parity with chicken', 'In Q1 it reached cost parity with beef.'),
    ).toBe(false);
  });

  it('rejects a high-overlap fabrication (shares most words but is not a real substring)', () => {
    const page = 'revenue increased by twelve percent in the third quarter of the year';
    // Differs only at "twenty" vs "twelve" — the loose mindshape grounder would pass this; we must not.
    expect(isVerbatimOnPage('revenue increased by twenty percent in the third quarter', page)).toBe(
      false,
    );
  });

  it('matches across the ﬁ/ﬂ ligatures (NFKC), where the ASCII-only grounder would fail', () => {
    expect(isVerbatimOnPage('the ﬁnal report', 'Here is the final report summary.')).toBe(true);
  });

  it('preserves accented letters (café stays café, not "caf")', () => {
    expect(isVerbatimOnPage('café revenue grew', 'The café revenue grew sharply.')).toBe(true);
    expect(isVerbatimOnPage('cafe revenue grew', 'The naïve model failed.')).toBe(false);
  });

  it('rejoins line-wrap hyphenation', () => {
    expect(
      isVerbatimOnPage('improved management of costs', 'improved manage- ment of costs here'),
    ).toBe(true);
  });

  it('binds a currency symbol to its number, so "$10,253" matches a table\'s "$ 10,253"', () => {
    // pdf.js puts the "$" column and the number in separate cells, so the extracted row reads
    // "Total net revenue $ 10,253"; the model writes "$10,253". Both must ground.
    const row = 'Total net revenue $ 10,253 $ 10,270 $ 7,438';
    expect(isVerbatimOnPage('Total net revenue $10,253', row)).toBe(true);
    expect(
      isVerbatimOnPage('Data Center Segment $5,775', 'Data Center Segment $ 5,775 $ 5,380'),
    ).toBe(true);
  });

  it('flattens smart quotes and dashes, and NBSP', () => {
    expect(
      isVerbatimOnPage("the firm's q3–q4 results", 'The firm’s Q3—Q4 results were strong.'),
    ).toBe(true);
    expect(isVerbatimOnPage('cost of goods sold', 'cost of goods sold rose')).toBe(true);
  });

  it('never grounds an empty quote', () => {
    expect(isVerbatimOnPage('', 'anything at all')).toBe(false);
    expect(isVerbatimOnPage('   ', 'anything at all')).toBe(false);
  });
});

describe('normalizePdfText', () => {
  it('is idempotent', () => {
    const once = normalizePdfText('The  ﬁrm’s  Q3—Q4 results');
    expect(normalizePdfText(once)).toBe(once);
  });
});

describe('isClaimGrounded', () => {
  const pages = ['alpha intro text', 'the management plan is on this page', 'closing remarks'];

  it('grounds a claim whose quote is verbatim on its cited page', () => {
    expect(isClaimGrounded({ quote: 'the management plan', page: 2 }, pages)).toBe(true);
  });

  it('rejects a quote that exists, but on a different page than claimed (mis-citation)', () => {
    expect(isClaimGrounded({ quote: 'the management plan', page: 1 }, pages)).toBe(false);
  });

  it('rejects out-of-range, zero, negative, and non-integer pages', () => {
    expect(isClaimGrounded({ quote: 'closing remarks', page: 4 }, pages)).toBe(false);
    expect(isClaimGrounded({ quote: 'alpha intro text', page: 0 }, pages)).toBe(false);
    expect(isClaimGrounded({ quote: 'alpha intro text', page: -1 }, pages)).toBe(false);
    expect(isClaimGrounded({ quote: 'alpha intro text', page: 1.5 }, pages)).toBe(false);
  });
});
