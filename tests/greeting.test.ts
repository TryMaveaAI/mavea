import { describe, it, expect } from 'vitest';
import { greetingFor, welcomeBackLine } from '../src/lib/greeting';

describe('greetingFor', () => {
  it('picks the part of day by hour', () => {
    expect(greetingFor(8)).toBe('Good morning');
    expect(greetingFor(13)).toBe('Good afternoon');
    expect(greetingFor(20)).toBe('Good evening');
  });

  it('uses the noon and 6pm boundaries', () => {
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good afternoon');
    expect(greetingFor(18)).toBe('Good evening');
  });
});

describe('welcomeBackLine', () => {
  it('opens with the time-of-day greeting and a single short, inviting line', () => {
    const line = welcomeBackLine(9);
    expect(line.startsWith('Good morning')).toBe(true);
    expect(line).toMatch(/explore/i);
    // Lean: one sentence's worth, not a speech.
    expect(line.length).toBeLessThan(60);
    // Not the first-run wake phrase.
    expect(line).not.toMatch(/awake/i);
  });
});
