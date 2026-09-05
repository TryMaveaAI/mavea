// budget.ts — what a thinking level costs out of a turn's output ceiling.
//
// A leaf on purpose: both the turn (which sizes the ask) and an adapter (which may have to
// substitute a level its model actually supports) need this one table, and neither should pull
// the other's module graph in to read it.
import type { ThinkingLevel } from './types';

/**
 * Output tokens to reserve for the model's own thinking at a given level.
 *
 * Thinking is metered out of `maxOutputTokens` on Gemini and Anthropic, so a ceiling that ignores
 * it truncates the ANSWER rather than the thought. `low` reserves as much as `high` on purpose: a
 * real low pass runs to the low hundreds-to-~1200 tokens, and at 500 it can take the JSON's own
 * allowance with it. `maxOutputTokens` is a ceiling, so an unused reserve is never spent.
 */
export function thinkingReserve(level: ThinkingLevel | undefined): number {
  if (level === 'high' || level === 'low') return 1500;
  if (level === 'medium') return 900;
  return 200;
}
