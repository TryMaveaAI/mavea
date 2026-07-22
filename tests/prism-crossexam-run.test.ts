import { describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

// runCrossExam's contract is "exactly ONE objection per claim". A model that returns several for the
// same claim must collapse to one — otherwise the headline count and per-claim glow over-count.

let adapterReply: string | object = '{"objections":[]}';

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    generate: async () => ({ raw: adapterReply }),
  }),
}));

const { runCrossExam } = await import('../src/live/prism/crossexam/run');

const cfg = { provider: 'anthropic', model: 'claude' } as unknown as ModelConfig;
const corpus = [['the model assumes linear growth across every market it enters']];
const claims = [{ id: 'k', source: 0, page: 1, quote: 'growth is linear', title: 'Linear growth' }];

describe('runCrossExam', () => {
  it('keeps only one objection per claim even if the model returns several', async () => {
    adapterReply = JSON.stringify({
      objections: [
        {
          claimId: 'k',
          kind: 'unstated-assumption',
          question: 'why assume linearity?',
          anchorQuote: 'the model assumes linear growth',
          addressed: false,
        },
        {
          claimId: 'k', // a second, duplicate objection for the same claim
          kind: 'overgeneralization',
          question: 'does it hold in every market?',
          anchorQuote: 'across every market it enters',
          addressed: false,
        },
      ],
    });
    const out = await runCrossExam(claims, corpus, cfg);
    expect(out).toHaveLength(1);
    expect(out[0].claimId).toBe('k');
  });

  it('salvages the complete objections from a truncated stream instead of losing them all', async () => {
    // The stream was cut mid-JSON: the first objection is complete, the second is chopped off and
    // the closing braces never arrive, so the whole-object parse fails. Without salvage this drops
    // EVERY objection; with it, the one complete + grounded objection still lands.
    adapterReply =
      '{"objections":[{"claimId":"k","kind":"unstated-assumption","question":"why assume linearity?","anchorQuote":"the model assumes linear growth","addressed":false},{"claimId":"k","kind":"overgen';
    const out = await runCrossExam(claims, corpus, cfg);
    expect(out).toHaveLength(1);
    expect(out[0].claimId).toBe('k');
  });
});
