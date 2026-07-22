import { describe, expect, it } from 'vitest';
import { isThoughtsTrigger, bankable, sortAsk } from '../src/live/thinkaloud/thinkaloud';

// Think-out-loud: the wake phrase is generous but bounded; banked lines ride verbatim into
// ONE sorting ask that forbids invented content.

describe('isThoughtsTrigger', () => {
  it('accepts the natural variants', () => {
    for (const t of ['thoughts?', 'Thoughts', 'any thoughts?', 'OK, thoughts?', 'so, thoughts!']) {
      expect(isThoughtsTrigger(t)).toBe(true);
    }
  });
  it('rejects sentences that merely contain the word', () => {
    expect(isThoughtsTrigger('my thoughts on this are complicated')).toBe(false);
    expect(isThoughtsTrigger('what are your thoughts on the refi')).toBe(false);
  });
});

describe('bankable + sortAsk', () => {
  it('banks real utterances, skips the trigger itself', () => {
    expect(bankable('skip the conference this year')).toBe(true);
    expect(bankable('thoughts?')).toBe(false);
    expect(bankable('  ')).toBe(false);
  });

  it('the sorting ask carries every line verbatim, in order, with the honest directive', () => {
    const ask = sortAsk(['skip the conference', 'plan the booth demo'], 11);
    expect(ask).toContain('(1) skip the conference');
    expect(ask).toContain('(2) plan the booth demo');
    expect(ask).toContain('11 minutes');
    expect(ask).toMatch(/do NOT add ideas/);
    expect(ask).toMatch(/CONTRADICTIONS/);
  });
});
