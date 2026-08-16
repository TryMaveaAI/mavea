// The gate's REACH, pinned by example. The world is meant to be how you read an ordinary answer,
// not a trick a few phrasings unlock — an earlier causal-verb allowlist missed "how does X work",
// "what happened to X" and every "explain …", which made the feature invisible in normal use.
// Offering is free, so the honest refusal list is only the asks whose answer has no causal web at
// all: a lookup, an artifact to make, a calculation, or talking to Mavéa.
import { describe, expect, it } from 'vitest';
import { detectWorldAsk } from '../src/live/world/detect';
import { getLiveConfigV2 } from '../src/live/useLiveConfig';

describe('the world gate reaches ordinary explanatory asks', () => {
  it.each([
    'why did the 2008 financial crisis happen',
    'explain the 2008 crisis',
    'how does photosynthesis work',
    'what happened to Kodak',
    'why is churn spiking',
    'explain the French Revolution',
    'how did the Roman empire decline',
    'what drove the housing shortage',
    'walk me through how a transformer model works',
  ])('offers a world for %j', (ask) => {
    expect(detectWorldAsk(ask)).toBe(true);
  });
});

describe('the world gate still refuses asks with no causal web', () => {
  it.each([
    'what is the capital of France',
    'who is the CEO of Apple',
    'write me a poem about rain',
    'summarize this document',
    'translate this to French',
    'calculate 17 * 23',
    'convert 40 miles to km',
    'hi',
    'thanks',
    '',
  ])('offers nothing for %j', (ask) => {
    expect(detectWorldAsk(ask)).toBe(false);
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
