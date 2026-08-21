// A sourceless world is BIGGER for the same money, not more expensive. The quotes are the budget:
// QUOTE_MAX is 240 characters, and a grounded node carries a value quote plus a per-point series
// quote, so it costs several times what the same node costs with no receipts to write. Where nothing
// can be quoted, the ceiling is held and the node count rises to fill it.
import { describe, expect, it } from 'vitest';
import { __budgetForTest as budgetFor } from '../src/live/world/explode';

describe('the build budget', () => {
  it('holds the token ceiling whether or not the sources can be quoted', () => {
    for (const model of ['slow-model', 'gpt-4o', 'claude-opus-5']) {
      const grounded = budgetFor(model, true);
      const illustrative = budgetFor(model, false);
      expect(illustrative.maxTokens, model).toBe(grounded.maxTokens);
    }
  });

  it('buys more causes with the words the quotes were costing', () => {
    const grounded = budgetFor('slow-model', true);
    const illustrative = budgetFor('slow-model', false);
    expect(illustrative.nodeCap).toBeGreaterThan(grounded.nodeCap);
  });

  it('never asks for more than the gate keeps, or more than the layouts are drawn for', () => {
    for (const model of ['slow-model', 'gpt-4o', 'claude-opus-5']) {
      for (const quotable of [true, false]) {
        // NODE_CAP is 16; the compositions are art-directed for about a dozen.
        expect(budgetFor(model, quotable).nodeCap, `${model}/${quotable}`).toBeLessThanOrEqual(12);
      }
    }
  });
});
