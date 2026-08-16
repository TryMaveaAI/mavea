// world-detect.test.ts — the word-shape FALLBACK that decides whether a turn offers a world when
// the model did not judge its own answer (LiveResponse.causal is the primary signal, and it is
// authoritative — see offersWorld). Offering costs nothing, so this errs toward yes: the earlier
// causal-verb allowlist missed "how does photosynthesis work" and "explain the French Revolution"
// and made the feature invisible in ordinary use. What stays refused is only the shapes whose
// answer has no causal chain at all — a lookup, a procedure, a comparison, an artifact to write.
import { describe, it, expect } from 'vitest';
import { detectWorldAsk, detectWorldFollowUp, followUpPlan } from '../src/live/world/detect';
import type { WorldSpec } from '../src/live/world/types';

describe('detectWorldAsk', () => {
  it.each([
    'Why did the 2008 financial crisis happen?',
    'why did revenue fall last quarter',
    'Why is churn spiking in the self-serve tier?',
    'why has the backlog grown so much',
    'What caused the outage on Friday?',
    "what's driving our support volume",
    'what is the root cause of the delay',
    'what led to the collapse of the Roman economy',
    'What drove the spike in signups?',
    'How did cheap credit lead to the housing crash?',
    'how does a rate cut cause inflation',
    'The underlying causes of the famine',
    // Explanatory asks the old causal-verb allowlist missed — each has a mechanism to draw, and
    // each is exactly the question a reader would expect a world for.
    'how does a transformer work',
    'how does photosynthesis work',
    'explain the French Revolution',
    'what happened to Kodak',
    'why is the sky blue',
    'tell me about the fall of Rome',
    // A make-something VERB inside a causal question is the mechanism being asked about, not an
    // instruction — the refusal rule reads the shape of the ask, not the presence of the word.
    'why does the body make energy',
    'how do plants make oxygen from sunlight',
    'why did the bubble build up so fast',
    'how does the liver break down alcohol',
  ])('fires on the explanatory ask %j', (text) => {
    expect(detectWorldAsk(text)).toBe(true);
  });

  it.each([
    'how do I center a div in CSS',
    'how to reset my password',
    'what should I cook tonight',
    'compare Rust and Go for a CLI',
    'which is better, Postgres or MySQL',
    'summarise this paper',
    'write me a poem about rain',
    'what time is the meeting',
    'who is the CEO of Apple',
    'calculate 17 * 23',
    'thanks',
    // The artifact ask keeps its refusal whether it opens with the verb or names the thing.
    'make a marketing plan for Q3',
    'build me a website',
    'design the onboarding flow',
    'please write a cover letter',
  ])('stays quiet on the ask with no causal chain %j', (text) => {
    expect(detectWorldAsk(text)).toBe(false);
  });
});

describe('detectWorldFollowUp', () => {
  it.each([
    'show me that over time',
    'as a chart please',
    'can I see it as a timeline',
    'what if rates had stayed low?',
    'zoom into the lending node',
    'zoom in on defaults',
  ])('fires on the reshape ask %j', (text) => {
    expect(detectWorldFollowUp(text)).toBe(true);
  });

  it.each([
    'why did that happen',
    'give me the sources',
    'summarise this in one line',
    'add a table of the numbers',
  ])('stays quiet on %j', (text) => {
    expect(detectWorldFollowUp(text)).toBe(false);
  });
});

/** The standing world, with and without the measured series a time view is drawn from. */
const standing = (withSeries: boolean): WorldSpec => ({
  title: 'Why did lending blow up?',
  outcomeId: 'blowup',
  nodes: [
    {
      id: 'cheap-credit',
      label: 'Cheap credit',
      role: 'root',
      depth: 0,
      tier: 'T0',
      ...(withSeries
        ? {
            series: {
              tier: 'T2' as const,
              points: [
                { t: '2004', value: 1 },
                { t: '2006', value: 5 },
              ],
            },
          }
        : {}),
    },
    { id: 'blowup', label: 'Lending blew up', role: 'outcome', depth: 1, tier: 'T0' },
  ],
  edges: [],
  provenance: {},
});

describe('followUpPlan — free first, and a call only for data the world lacks', () => {
  it.each([
    ['show me that over time', 'timeline'],
    ['can I see it as a timeline', 'timeline'],
    ['as a chart please', 'chart'],
  ])('answers %j locally when the world already holds the series', (text, view) => {
    expect(followUpPlan(standing(true), text)).toEqual({ kind: 'local', view });
  });

  it.each(['what if rates had stayed low?', 'zoom into the lending node'])(
    'answers %j locally — a lever and a zoom are the surface’s own work',
    (text) => {
      expect(followUpPlan(standing(false), text)).toEqual({ kind: 'local', view: 'graph' });
    },
  );

  it('earns one call only when the ask needs a series the world does not have', () => {
    expect(followUpPlan(standing(false), 'show me that over time')).toEqual({ kind: 'evolve' });
  });

  it('is silent on an ask that is not about this world at all', () => {
    expect(followUpPlan(standing(true), 'add a table of the numbers')).toBeNull();
  });
});
