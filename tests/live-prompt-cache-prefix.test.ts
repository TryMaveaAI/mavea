// The whole prompt-cache scheme rests on one property: the session-invariant head must be an
// EXACT byte prefix of the depth-keyed base, for every tier and every complexity. Most providers
// match a cached prefix by longest common prefix and would forgive a reordering; Anthropic hashes
// the prefix up to a breakpoint, so a head that is not really the head marks bytes the model is
// never sent first — a cache that is written, billed, and never read.
import { describe, it, expect } from 'vitest';
import { buildStableTurnBase, buildStableTurnInvariant } from '../src/live/generateLive';
import { liveSystemPrompt, liveSystemPromptInvariant } from '../src/engine/liveSchema';
import type { AskComplexity } from '../src/live/select/complexity';

const TIERS = ['frontier', 'mid', 'small'] as const;
const DEPTHS: AskComplexity[] = ['brief', 'lean', 'rich'];

describe('prompt cache: the invariant head is a real prefix', () => {
  it('holds for the system prompt across every tier, depth and generative setting', () => {
    for (const tier of TIERS)
      for (const generativeOn of [false, true])
        for (const complexity of DEPTHS) {
          const invariant = liveSystemPromptInvariant(tier, generativeOn);
          expect(liveSystemPrompt(tier, complexity, generativeOn).startsWith(invariant)).toBe(true);
        }
  });

  it('holds for the full stable turn base', () => {
    for (const tier of TIERS)
      for (const generativeOn of [false, true])
        for (const complexity of DEPTHS) {
          const invariant = buildStableTurnInvariant(tier, generativeOn);
          expect(buildStableTurnBase(tier, complexity, generativeOn).startsWith(invariant)).toBe(
            true,
          );
        }
  });

  // The head has to be worth a breakpoint: if the shared part were a sliver, marking it would buy
  // nothing and the depth-keyed entry would still be the whole prompt.
  it('carries the bulk of the prompt, so a change of depth re-writes only a remainder', () => {
    const invariant = buildStableTurnInvariant('frontier');
    const rich = buildStableTurnBase('frontier', 'rich');
    expect(invariant.length / rich.length).toBeGreaterThan(0.6);
  });
});
