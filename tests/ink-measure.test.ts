// The pen's computed caption: a bracket writes the gap it can prove from its own two anchors,
// and falls back to exactly today's behaviour whenever it cannot measure one honestly.
import { describe, it, expect } from 'vitest';
import { measuredLabel } from '../src/live/annotate/measure';

describe('measuredLabel', () => {
  describe('measures what the reader can see', () => {
    it('writes a multiple when the far end is at least twice the near one', () => {
      expect(measuredLabel('$1,200', '$2,760')).toBe('2.3×');
    });

    it('drops a trailing .0 rather than writing "3.0×"', () => {
      expect(measuredLabel('$100', '$300')).toBe('3×');
    });

    it('writes a percentage for a rise under the multiple floor', () => {
      expect(measuredLabel('$1,000', '$1,380')).toBe('+38%');
    });

    it('writes a percentage for a fall — never a fraction like "0.4×"', () => {
      expect(measuredLabel('$2,760', '$1,200')).toBe('−57%');
    });

    it('compares percentages in POINTS, never as a ratio of percentages', () => {
      expect(measuredLabel('24%', '36%')).toBe('+12 pts');
    });

    it('reads the compact and per-unit forms parseAmount already understands', () => {
      expect(measuredLabel('≈3.2k', '9.6k')).toBe('3×');
      expect(measuredLabel('$5,000/mo', '$2,000/mo')).toBe('−60%');
    });

    it('keeps one decimal below ten and none above', () => {
      expect(measuredLabel('100', '104.25')).toBe('+4.3%');
      expect(measuredLabel('100', '138')).toBe('+38%');
    });
  });

  describe('a figure nothing proves gives way to one the screen proves', () => {
    it('replaces a model label that states a figure', () => {
      expect(measuredLabel('$1,000', '$1,380', '+50%')).toBe('+38%');
    });

    it('keeps a model label that names something instead of measuring it', () => {
      expect(measuredLabel('$1,000', '$1,380', 'vs. last year')).toBe('vs. last year');
    });

    it('keeps a NAME that merely contains a digit — the test is shape, not the presence of one', () => {
      // The bug a plain /\d/ check would cause: these measure nothing, so replacing them with a
      // computed figure would delete the meaning the model chose.
      for (const name of ['Q4 gap', '2 weeks out', 'H1 vs H2', 'Day 1 premium', 'top 3 only']) {
        expect(measuredLabel('$1,000', '$1,380', name)).toBe(name);
      }
    });

    it('replaces every shape that IS just a figure', () => {
      for (const figure of ['+50%', '-50%', '−50%', '2.9×', '$1,560', '12 pts', '1,560', '3.2k']) {
        expect(measuredLabel('$1,000', '$1,380', figure)).toBe('+38%');
      }
    });

    it('writes a caption where the model left none', () => {
      expect(measuredLabel('$1,000', '$1,380', undefined)).toBe('+38%');
    });
  });

  describe('falls back to the model label rather than guessing', () => {
    it('refuses an unparseable anchor', () => {
      expect(measuredLabel('Seattle', '$1,380', '+38%')).toBe('+38%');
      expect(measuredLabel('$1,000', 'the rest', '+38%')).toBe('+38%');
    });

    it('refuses a range or a qualitative phrase (parseAmount is strict on purpose)', () => {
      expect(measuredLabel('$1,000–$2,000', '$3,000', 'more')).toBe('more');
    });

    it('refuses to compare a percentage with an amount', () => {
      expect(measuredLabel('36%', '$1,380', 'wider')).toBe('wider');
    });

    it('refuses a zero base — no ratio and no percentage change exist', () => {
      expect(measuredLabel('0', '$1,380')).toBeUndefined();
      expect(measuredLabel('0', '$1,380', 'up')).toBe('up');
    });

    it('says nothing at all when the move is inside the noise floor', () => {
      expect(measuredLabel('$1,000', '$1,004')).toBeUndefined();
      expect(measuredLabel('24%', '24.2%')).toBeUndefined();
    });
  });

  it('never exceeds the label cap the schema already enforces', () => {
    const out = measuredLabel('0.0001', '999999999');
    expect(out && out.length).toBeLessThanOrEqual(28);
  });
});
