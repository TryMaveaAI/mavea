import { describe, it, expect } from 'vitest';
import { targetBlockCount } from '../src/live/screen';

// targetBlockCount sizes the canvas to the ask. A teaching ask lifts the FLOOR so the first answer
// is a complete lesson (the user should never have to say "more in depth"), without changing the
// ceiling or the lean/brief paths. Robust to the test environment's viewport (node off-DOM or jsdom).
describe('targetBlockCount — teaching floor', () => {
  it('raises the floor for a teaching ask (>= 11) without exceeding the ceiling (<= 18)', () => {
    const teach = targetBlockCount('rich', { teaching: true });
    expect(teach).toBeGreaterThanOrEqual(11);
    expect(teach).toBeLessThanOrEqual(18);
  });

  it('a teaching ask never targets fewer blocks than a generic rich ask', () => {
    expect(targetBlockCount('rich', { teaching: true })).toBeGreaterThanOrEqual(
      targetBlockCount('rich'),
    );
  });

  it('does not inflate an explicitly brief or lean ask (teaching flag is ignored there)', () => {
    expect(targetBlockCount('brief', { teaching: true })).toBe(targetBlockCount('brief'));
    expect(targetBlockCount('lean', { teaching: true })).toBe(targetBlockCount('lean'));
  });
});
