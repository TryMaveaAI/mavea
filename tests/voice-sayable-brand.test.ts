// The product name is written, never spoken: TTS engines mangle the accented "Mavéa"
// ("mah-vay-yah"), so sayable() drops it from every spoken line while captions keep the
// full written text. This guards the strip for the shapes real copy uses — a leading
// subject, a possessive, mid-sentence mentions, and the accentless spelling.
import { describe, expect, it } from 'vitest';
import { sayable } from '../src/voice/tts';

describe('sayable — the product name is never spoken', () => {
  it('drops the bare name wherever it sits in a sentence', () => {
    expect(sayable('Mavéa is standing by.')).toBe('is standing by.');
    expect(sayable('Ask Mavéa anything worth checking.')).toBe('Ask anything worth checking.');
    expect(sayable('That’s Mavéa.')).toBe('That’s.');
  });

  it('drops the possessive form with its trailing space', () => {
    expect(sayable('Mavéa’s voice reads the headline.')).toBe('voice reads the headline.');
    expect(sayable("Mavéa's weekly recap is ready.")).toBe('weekly recap is ready.');
  });

  it('covers the accentless spelling and any casing', () => {
    expect(sayable('MAVEA noticed a change.')).toBe('noticed a change.');
    expect(sayable('mavea compiled the briefing.')).toBe('compiled the briefing.');
  });

  it('never strips words that merely contain the letters', () => {
    expect(sayable('The maven made a move.')).toBe('The maven made a move.');
  });

  it('leaves no doubled spaces or stranded punctuation behind', () => {
    expect(sayable('Your week with Mavéa , recapped.')).toBe('Your week with, recapped.');
  });
});
