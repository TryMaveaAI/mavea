import { describe, it, expect } from 'vitest';
import { rhythmDirective } from '../src/live/story/rhythm';

// The rhythm directive carries the one cadence rule the HARD CAPS and the arc don't: never
// stack two text-heavy blocks, and anchor with a bold visual.
describe('rhythmDirective', () => {
  it('states the cadence rules', () => {
    const d = rhythmDirective();
    expect(d).toMatch(/RHYTHM/);
    expect(d).toMatch(/text-heavy/i);
    expect(d).toMatch(/back to back/i);
    expect(d).toMatch(/anchor/i);
  });
});
