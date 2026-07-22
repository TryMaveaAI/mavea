import { describe, it, expect } from 'vitest';
import { heroSegments } from '../src/live/voice/emphasize';

/** The accented runs of a line, for terse assertions. */
function accents(text: string): string[] {
  return heroSegments(text)
    .filter((s) => s.accent)
    .map((s) => s.text);
}

describe('heroSegments — figure detection for the answer hero', () => {
  it('reassembles to the exact input (no characters invented or lost)', () => {
    const lines = [
      'Purpose-built buildings — 50–100kW racks, liquid cooling, 800Gbps fabric.',
      'At 5.9% it flips — you’d save $240/mo and break even in 11 months.',
      'Up 2.4% at $1,284.10 — volume ran 1.6× the 30-day average.',
      'No figures here at all.',
      '',
    ];
    for (const line of lines) {
      expect(
        heroSegments(line)
          .map((s) => s.text)
          .join(''),
      ).toBe(line);
    }
  });

  it('accents money, with signs, scales, and per-units', () => {
    expect(accents('a raise of +$12k lands in March')).toEqual(['+$12k']);
    expect(accents('you’d save $240/mo on the refi')).toEqual(['$240/mo']);
    expect(accents('closed at $1,284.10 today')).toEqual(['$1,284.10']);
    expect(accents('worth €30 billion to them')).toEqual(['€30 billion']);
  });

  it('does not swallow the first letter of a word after money', () => {
    expect(accents('A $5,000 monthly budget')).toEqual(['$5,000']);
    expect(heroSegments('A $5,000 monthly budget')).toEqual([
      { text: 'A ', accent: false },
      { text: '$5,000', accent: true },
      { text: ' monthly budget', accent: false },
    ]);
  });

  it('accents percentages and multipliers', () => {
    expect(accents('at 5.9% it flips')).toEqual(['5.9%']);
    expect(accents('up +2.4% on the day')).toEqual(['+2.4%']);
    expect(accents('volume ran 1.6× the average')).toEqual(['1.6×']);
    expect(accents('roughly 3x the cost')).toEqual(['3x']);
  });

  it('accents numbers glued to units and ranges', () => {
    expect(accents('96ms to first word')).toEqual(['96ms']);
    expect(accents('800Gbps between every GPU')).toEqual(['800Gbps']);
    expect(accents('50–100kW racks need liquid')).toEqual(['50–100kW']);
    expect(accents('a $6–8B opportunity')[0]).toContain('6–8B');
  });

  it('accents numbers with spelled-out units', () => {
    expect(accents('break even in 11 months')).toEqual(['11 months']);
    expect(accents('one pan, 22 min, done')).toEqual(['22 min']);
  });

  it('leaves bare numbers, codes, and words alone', () => {
    expect(accents('the Boeing 747 story')).toEqual([]);
    expect(accents('a B2B product, not B2C')).toEqual([]);
    expect(accents('see RFC 9110 for details')).toEqual([]);
    expect(accents('Tokyo in May sounds right')).toEqual([]);
  });

  it('catches several figures in one line, in order', () => {
    expect(accents('density is 50–100kW, fabric is 800Gbps, latency 96ms')).toEqual([
      '50–100kW',
      '800Gbps',
      '96ms',
    ]);
  });
});
