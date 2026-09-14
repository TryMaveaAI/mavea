import { describe, it, expect } from 'vitest';
import {
  countDirective,
  targetBlockCount,
  LEAN_MAX_BLOCKS,
  LEAN_MIN_BLOCKS,
  MAX_BLOCKS,
  RICH_FLOOR_BLOCKS,
} from '../src/live/screen';

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

// Every tier hands the model BOTH ends of the range it may choose from. A directive that names
// only a target leaves the count to the model's own habits, and those differ sharply between
// models on the same ask — one overshoots, another lands short. Naming the floor is what lifts
// the short one, and it costs the other nothing.
describe('countDirective — the range the model is given', () => {
  it('states a floor and a ceiling for a substantive ask', () => {
    const d = countDirective('rich', 10);
    expect(d).toContain(`between ${RICH_FLOOR_BLOCKS} and ${MAX_BLOCKS} blocks`);
    expect(d).toContain('HARD FLOOR');
    expect(d).toContain('hard ceiling');
  });

  it('states a floor and a ceiling for a simple ask, below the substantive one', () => {
    const d = countDirective('lean', 4);
    expect(d).toContain(`between ${LEAN_MIN_BLOCKS} and ${LEAN_MAX_BLOCKS} blocks`);
    expect(LEAN_MIN_BLOCKS).toBeLessThan(RICH_FLOOR_BLOCKS);
    expect(LEAN_MAX_BLOCKS).toBeLessThan(MAX_BLOCKS);
  });

  it('keeps an explicitly brief ask tight, and never quotes the rich floor at it', () => {
    const d = countDirective('brief', 3);
    expect(d).toContain('1 to 3 blocks');
    expect(d).not.toContain(`${RICH_FLOOR_BLOCKS} blocks`);
  });

  it('never states a floor the schema would reject an answer for meeting', () => {
    // The prompt floor SHAPES; the schema's minItems REJECTS, and a rejection costs the reader
    // the recovery re-ask. So the stated floor may sit above minItems, never the other way round.
    expect(RICH_FLOOR_BLOCKS).toBeGreaterThanOrEqual(LEAN_MIN_BLOCKS);
  });

  it('asks for a count inside the range it just named', () => {
    for (const target of [5, 8, 10, 18]) {
      const d = countDirective('rich', target);
      expect(d).toContain(`around ${target} on this screen`);
    }
  });
});
