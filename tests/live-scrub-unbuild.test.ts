import { describe, expect, it } from 'vitest';
import { unbuiltCount } from '../src/live/scrubvoice/unbuild';
import type { TurnAudio } from '../src/live/scrubvoice/recorder';

// The said-based un-build: before a tour line is spoken, its block isn't there yet; at the
// track's end the canvas is whole; reveal-time marks remain the floor for slow streams.

const audio: TurnAudio = {
  pcm: new Float32Array(0),
  sampleRate: 24000,
  duration: 20,
  spans: [
    { text: 'Here is the plan.', t0: 0, t1: 6 }, // narration
    { text: 'First, the route.', t0: 6, t1: 12 }, // tour stop → block 1
    { text: 'And the budget lands here.', t0: 12, t1: 20 }, // tour stop → block 4
  ],
  marks: [{ t: 0, blocks: 1 }],
};

const tour = [
  { index: 1, say: 'First, the route.' },
  { index: 4, say: 'And the budget lands here.', saySpoken: 'and the budget lands here' },
];

describe('unbuiltCount', () => {
  it('during the narration only the lead block stands', () => {
    expect(unbuiltCount(audio, 2, tour, 6)).toBe(1);
  });

  it('each spoken tour line brings its block (and everything before it)', () => {
    expect(unbuiltCount(audio, 7, tour, 6)).toBe(2); // stop at index 1 → blocks 0-1
    expect(unbuiltCount(audio, 13, tour, 6)).toBe(5); // stop at index 4 → blocks 0-4
  });

  it('at the end of the track the canvas is whole', () => {
    expect(unbuiltCount(audio, 20, tour, 6)).toBe(6);
  });

  it('reveal-time marks floor the count when blocks genuinely streamed mid-speech', () => {
    const streamed = { ...audio, marks: [{ t: 0, blocks: 3 }] };
    expect(unbuiltCount(streamed, 2, tour, 6)).toBe(3);
  });
});
