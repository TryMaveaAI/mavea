import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

// A real, cited outcome means a prediction's horizon has arrived — so runAutopsy must grade it even
// when the model forgets to echo `due: true`. Only an explicit `due: false` keeps it "not due". This
// guards the bug where a settled, perfectly-cited prediction was mislabeled NOT DUE on a missing flag.

let adapterReply: string | object = '{"grades":[]}';

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({ generate: async () => ({ raw: adapterReply }) }),
}));

vi.mock('../src/live/search', () => ({
  getSearchProvider: () => ({
    id: 'wikipedia',
    needsKey: false,
    search: async () => [
      { title: 'Outcome', url: 'https://ex.com/a', snippet: 'reported growth was 6% last year' },
    ],
  }),
}));

const { runAutopsy } = await import('../src/live/prism/autopsy/run');

const cfg = { provider: 'anthropic', model: 'claude' } as unknown as ModelConfig;
const claims = [{ id: 'f', page: 1, quote: 'We expect 30% growth by 2024.' }];

describe('runAutopsy', () => {
  it('grades a cited outcome even when the model omits the `due` flag', async () => {
    adapterReply = JSON.stringify({
      grades: [
        {
          claimId: 'f',
          actual: '6%',
          comparable: true,
          // no `due` field — the cited outcome should still count as due
          citationQuote: 'reported growth was 6%',
          citationUrl: 'https://ex.com/a',
        },
      ],
    });
    const out = await runAutopsy(claims, { cfg });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('missed');
    expect(out[0].factor).toBe(5);
  });

  it('respects an explicit due:false (still not-due) even with an outcome', async () => {
    adapterReply = JSON.stringify({
      grades: [
        {
          claimId: 'f',
          actual: '6%',
          comparable: true,
          due: false,
          citationQuote: 'reported growth was 6%',
          citationUrl: 'https://ex.com/a',
        },
      ],
    });
    const out = await runAutopsy(claims, { cfg });
    expect(out[0].status).toBe('not-due');
  });
});
