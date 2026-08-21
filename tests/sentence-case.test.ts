// The reader's own words, shown back to them. The rules here are all about what this must NOT do:
// every extra transformation is a way to put words in someone's mouth.
import { describe, expect, it } from 'vitest';
import { sentenceCase } from '../src/lib/sentenceCase';

describe('sentenceCase', () => {
  it('opens a typed question with a capital', () => {
    expect(sentenceCase('tell me about event driven edge in investing')).toBe(
      'Tell me about event driven edge in investing',
    );
  });

  it('changes nothing else — no title case, no invented punctuation', () => {
    expect(sentenceCase('why did the 2008 crash happen')).toBe('Why did the 2008 crash happen');
  });

  it('leaves an acronym the reader typed alone', () => {
    expect(sentenceCase('CDO tranches, explained')).toBe('CDO tranches, explained');
    expect(sentenceCase('how do ETFs work')).toBe('How do ETFs work');
  });

  it('is a no-op on a string that does not start with a letter', () => {
    expect(sentenceCase('401(k) limits')).toBe('401(k) limits');
    expect(sentenceCase('¿por qué')).toBe('¿por qué');
  });

  // `text[0]` is half a surrogate pair here, so upper-casing it would corrupt the string.
  it('does not corrupt a leading astral character', () => {
    expect(sentenceCase('🎯 pick a target')).toBe('🎯 pick a target');
    expect(sentenceCase('𝑥 marks the spot')).toBe('𝑥 marks the spot');
  });

  it('trims, and survives an empty or blank string', () => {
    expect(sentenceCase('  spaced out  ')).toBe('Spaced out');
    expect(sentenceCase('')).toBe('');
    expect(sentenceCase('   ')).toBe('');
  });
});
