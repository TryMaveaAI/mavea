// world-detect.test.ts — the FOLLOW-UP gates: what a reader asking the standing world to change
// shape costs. Whether a turn offers a world in the first place is not decided here — the model's
// own `causal` flag judges the answer it wrote, and world/fitness reads that answer when the flag is
// absent (see world-fitness.test.ts). A follow-up is the case where the words ARE the instruction:
// "over time", "what if", "zoom in" name an operation on a world already on the canvas, and there
// is no new answer to read.
import { describe, it, expect } from 'vitest';
import { detectWorldFollowUp, followUpPlan } from '../src/live/world/detect';
import type { WorldSpec } from '../src/live/world/types';

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
