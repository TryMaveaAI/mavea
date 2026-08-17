// The gate's REACH, pinned by example — now on the ANSWER rather than the ask.
//
// The world is meant to be how you read an ordinary explanation, not a trick a few phrasings
// unlock: an early causal-verb allowlist over the question missed "how does X work", "what happened
// to X" and every "explain …", which made the feature invisible in normal use. Widening that regex
// until only lookups, artifact asks, procedures, comparisons and arithmetic were refused fixed the
// reach and broke the precision — "tell me about elephants" got a card too.
//
// Both failures came from reading the question. The model's `causal` flag is the primary judge, and
// this is the fallback: what the answer turned out to BE. Each row below is the answer a real turn
// would write for the ask in its comment, which is the only thing that could have known.
import { describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { worldFitness } from '../src/live/world/fitness';
import { getLiveConfigV2 } from '../src/live/useLiveConfig';

const blocks = (...types: string[]): Block[] =>
  types.map((type, i) => ({ id: `b${i}`, type, props: {} }) as unknown as Block);

describe('the world gate reaches ordinary explanatory answers', () => {
  it.each([
    // "why did the 2008 financial crisis happen"
    'Cheap credit drove a lending boom, and defaults rose because payments reset upward.',
    // "how does photosynthesis work"
    'Light splits water, which drives the electron chain, and that leads to sugar.',
    // "what happened to Kodak"
    'Digital sensors got cheap, therefore film volume collapsed, which meant the plants closed.',
    // "why is churn spiking"
    'Onboarding got slower since the rewrite, and that drove first-week drop-off.',
    // "how did the Roman empire decline"
    'Frontier pressure caused higher military spend, which resulted in currency debasement.',
  ])('offers a world for the answer %#', (narration) => {
    expect(worldFitness({ blocks: blocks('verse'), narration }).offer).toBe(true);
  });
});

describe('the world gate refuses an answer with no causal web in it', () => {
  it.each([
    // "what is the capital of France" — a lookup has one fact and no mechanism.
    'Paris is the capital of France.',
    // "tell me about elephants" — descriptive, and the ask-shaped gate handed this one a card.
    'Elephants live in matriarchal herds across Africa and Asia and are known for long memories.',
    // "describe Brooklyn"
    'Brooklyn is New York City’s most populous borough, spanning brownstones and beaches.',
    // "compare Rust and Go for a CLI" — a choice between options, not a cascade.
    'Rust gives you tighter control and Go gives you faster builds; both ship a single binary.',
    // "thanks"
    'Any time.',
    '',
  ])('offers nothing for the answer %#', (narration) => {
    expect(worldFitness({ blocks: blocks('verse'), narration }).offer).toBe(false);
  });
});

describe('the capability is on by default', () => {
  // Offering costs nothing, so an opt-in default only hid the feature from the readers who would
  // never go looking for it in settings.
  it('ships worldEnabled true for a reader who has never opened settings', () => {
    localStorage.clear();
    expect(getLiveConfigV2().worldEnabled).toBe(true);
  });
});
