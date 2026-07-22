// ripple-enrich-failure.test.ts — enrichShipModel must resolve `null` on a GENUINE failure (no
// key, a refusal, malformed JSON) so the overlay can say so honestly, but resolve the unchanged
// floor when the call was merely superseded (an in-flight run cancelled by a newer one) — that's
// not a failure worth reporting. Exercises the real function against a stubbed provider adapter;
// only the network boundary is faked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

const fake = {
  raw: 'not json at all',
  shouldThrow: false,
  throwName: 'Error',
};

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    id: 'anthropic',
    capabilities: {
      constrainedDecoding: false,
      streaming: false,
      vision: false,
      contextWindow: 8192,
      strengthTier: 'mid' as const,
      nativeWebSearch: false,
    },
    probe: async () => ({ ok: true, model: true }),
    generate: async () => {
      if (fake.shouldThrow) {
        if (fake.throwName === 'AbortError') throw new DOMException('aborted', 'AbortError');
        throw new Error('no credentials configured');
      }
      return { raw: fake.raw };
    },
  }),
}));

// Import AFTER the mock is registered (vi.mock is hoisted, so this is safe).
import { enrichShipModel } from '../src/live/ripple/ingest/generate';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';

const FLOOR = buildShipFromDiff(
  parseUnifiedDiff(`diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -42 +42 @@
-validateToken(t: string)
+validateToken(t: string, opts: VerifyOpts)
`),
);

const CFG: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };

beforeEach(() => {
  fake.raw = 'not json at all';
  fake.shouldThrow = false;
  fake.throwName = 'Error';
});

describe('enrichShipModel — honest failure vs. superseded', () => {
  it('resolves null when the model replies with an unparseable read', async () => {
    fake.raw = 'not json at all';
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).toBeNull();
  });

  it('resolves null when the provider call throws (no key, a refusal, a network error)', async () => {
    fake.shouldThrow = true;
    fake.throwName = 'Error';
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).toBeNull();
  });

  it('resolves the unchanged floor — not null — when the call is aborted (superseded, not a failure)', async () => {
    fake.shouldThrow = true;
    fake.throwName = 'AbortError';
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).toBe(FLOOR);
  });

  it('still resolves a real merged model on a genuinely successful read', async () => {
    fake.raw = JSON.stringify({ summary: 'Threads a VerifyOpts through token validation.' });
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).not.toBeNull();
    expect(result?.pr.summary).toBe('Threads a VerifyOpts through token validation.');
  });
});
