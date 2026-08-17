// ground-share.test.ts — the proof a SHARE has to carry.
//
// A share is the one measured field nobody writes the way it is stored: a source says "72%", the
// model hands back 0.72, and `valueInQuote` — which compares digit runs — reads that as "072" and
// rejects it. So the quote check was skipped for edge weights altogether, and an edge could carry a
// verbatim sentence next to a number that sentence never said. The graph then drew the link thicker
// for it and the contribution ribbons sized themselves by it: a measured-looking pixel with nothing
// behind it but a citation for a different claim.
import { describe, expect, it } from 'vitest';
import { shareInQuote, valueInQuote } from '../src/live/ground/number';

describe('shareInQuote', () => {
  it('accepts the share written as a percentage, which is how a source writes one', () => {
    expect(shareInQuote(0.72, 'Subprime accounted for 72% of the writedowns')).toBe(true);
    expect(shareInQuote(0.72, 'Subprime accounted for 72 percent of the writedowns')).toBe(true);
    expect(shareInQuote(0.45, 'roughly 45% of the total')).toBe(true);
    expect(shareInQuote(1, 'all 100% of it')).toBe(true);
  });

  it('accepts the share written as a fraction, which is how a model writes one', () => {
    expect(shareInQuote(0.72, 'the coefficient was 0.72 in the regression')).toBe(true);
    expect(shareInQuote(0.5, 'a weight of 0.5 was applied')).toBe(true);
  });

  it('allows the rounding a source and a model honestly disagree by, and no more', () => {
    expect(shareInQuote(0.72, 'accounted for 71.6% of the fall')).toBe(true); // 71.6 → 0.72
    expect(shareInQuote(0.72, 'accounted for 71% of the fall')).toBe(false); // a whole point out
  });

  it('REFUSES a real sentence that states no share at all — the bug this closes', () => {
    expect(shareInQuote(0.72, 'Low interest rates contributed to the housing boom')).toBe(false);
    expect(shareInQuote(0.6, 'Losses drove panic across the interbank market')).toBe(false);
  });

  it('refuses a number from the same sentence that is measuring something else', () => {
    // The quote is real and full of digits; none of them is this share.
    expect(shareInQuote(0.3, 'Home prices fell 30% from the 2006 peak')).toBe(true); // it IS 30%
    expect(shareInQuote(0.5, 'Home prices fell 30% from the 2006 peak')).toBe(false);
    expect(shareInQuote(0.2006, 'Home prices fell 30% from the 2006 peak')).toBe(false);
  });

  it('refuses what is not a number at all', () => {
    expect(shareInQuote(Number.NaN, 'anything at all')).toBe(false);
    expect(shareInQuote(0.5, '')).toBe(false);
  });

  it('is the reason valueInQuote could not do this job', () => {
    // 0.72 reduces to the digit run "072", which "72%" does not contain — every honestly-quoted
    // share failed, which is exactly why the check ended up being skipped.
    expect(valueInQuote(0.72, 'Subprime accounted for 72% of the writedowns')).toBe(false);
    expect(shareInQuote(0.72, 'Subprime accounted for 72% of the writedowns')).toBe(true);
  });
});
