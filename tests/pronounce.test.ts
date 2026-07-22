import { describe, expect, it } from 'vitest';
import { pronounceForSpeech } from '../src/voice/pronounce';
import { sayable } from '../src/voice/tts';

// pronounceForSpeech is the single transform at the speech chokepoint: it resolves the said side
// of any [[shown|said]] annotation, then respells the common acronyms the model left un-annotated
// ("CUDA" → "kooda") — while leaving genuine letter-by-letter initialisms (API, GPU) alone.
describe('pronounceForSpeech', () => {
  it('resolves the said side of an inline annotation', () => {
    expect(pronounceForSpeech('Use [[CUDA|koo-dah]] here.')).toBe('Use koo-dah here.');
  });

  it('respells a common acronym the model did not annotate (static floor)', () => {
    expect(pronounceForSpeech('Run it on the GPU with CUDA.')).toBe(
      'Run it on the GPU with kooda.',
    );
  });

  it('leaves genuine letter-by-letter initialisms alone', () => {
    const line = 'The API talks to the GPU over USB; check the URL and HTML.';
    expect(pronounceForSpeech(line)).toBe(line);
  });

  it('only matches whole words, never an acronym buried inside another word', () => {
    expect(pronounceForSpeech('A barracuda is a fish.')).toBe('A barracuda is a fish.');
  });

  it('preserves a trailing plural on a floor term', () => {
    expect(pronounceForSpeech('Modern GUIs feel instant.')).toBe('Modern gooeys feel instant.');
  });

  it('handles an annotation and a floor term together', () => {
    expect(pronounceForSpeech('[[$5k|five thousand]] on CUDA.')).toBe('five thousand on kooda.');
  });

  it('is a no-op for text with no annotations and no floor terms', () => {
    expect(pronounceForSpeech('A calm sentence with nothing tricky.')).toBe(
      'A calm sentence with nothing tricky.',
    );
  });

  it('does not respell the product name — it is never spoken at all', () => {
    // The lexicon used to teach the synthesizer a spelling for the name. That is the wrong shape
    // of fix: the respelling that works in one engine mangles in the next, and there are two
    // engines and three OSes now. sayable() drops the name from every spoken line instead, so a
    // respelling here would be unreachable — and would speak the name aloud for any caller that
    // skipped sayable(). Left verbatim so that path stays visibly wrong rather than quietly said.
    expect(pronounceForSpeech('Talk to Mavéa anytime.')).toBe('Talk to Mavéa anytime.');
  });

  it('uses the native-oriented pronunciation floor for Omakase in common casing', () => {
    expect(pronounceForSpeech('Try Omakase or omakase tonight.')).toBe(
      'Try oh-mah-kah-seh or oh-mah-kah-seh tonight.',
    );
  });

  // Month-abbreviation floor: the reported bug was "coming back Aug 2" voiced as the literal
  // word "Aug". The model SHOULD annotate ("[[Aug 2|august second]]"), but the floor guarantees
  // the month is at least spoken in full when it forgot.
  it('expands a bare month abbreviation before a day number', () => {
    expect(pronounceForSpeech('Coming back Aug 2.')).toBe('Coming back August 2.');
    expect(pronounceForSpeech('Due Sept 30, 2026.')).toBe('Due September 30, 2026.');
    expect(pronounceForSpeech('Shipped Dec. 12.')).toBe('Shipped December 12.');
  });

  it('expands a month abbreviation before a year', () => {
    expect(pronounceForSpeech('Since Jan 2024 growth doubled.')).toBe(
      'Since January 2024 growth doubled.',
    );
  });

  it('never rewrites a month-like word that is not a date', () => {
    expect(pronounceForSpeech('Jan said hello to Mar.')).toBe('Jan said hello to Mar.');
    expect(pronounceForSpeech('Aug was warm this year.')).toBe('Aug was warm this year.');
  });

  it('a model annotation on a date always wins over the floor', () => {
    expect(pronounceForSpeech('Back [[Aug 2|august second]].')).toBe('Back august second.');
  });
});

// The REAL speech chokepoint composes both cleaners — kokoro.ts/webSpeech.ts speak
// pronounceForSpeech(sayable(text)), and the streamed narration reaches them with its
// [[shown|said]] annotations still inline. The bug this pins down: sayable's decorative-glyph
// strip ate the span's `|`, degrading the annotation into a bare [[…]] whose WHOLE content
// survived — so the voice said the value twice, shown side then said side ("$1,600 sixteen
// hundred dollars"), on every streamed annotated span.
describe('the speech chokepoint composition — sayable then pronounceForSpeech', () => {
  it('speaks an annotated money value exactly once, said side only', () => {
    const line = 'and [[$1,600|sixteen hundred dollars]] to secure your future.';
    expect(pronounceForSpeech(sayable(line))).toBe(
      'and sixteen hundred dollars to secure your future.',
    );
  });

  it('speaks an annotated term exactly once even alongside markdown', () => {
    const line = '**Bottom line:** [[CUDA|kooda]] wins on [[$5,000/mo|five thousand a month]].';
    expect(pronounceForSpeech(sayable(line))).toBe(
      'Bottom line: kooda wins on five thousand a month.',
    );
  });

  it('still strips a genuine decorative pipe outside any annotation', () => {
    expect(sayable('Fast | Cheap | Good')).toBe('Fast Cheap Good');
  });
});
