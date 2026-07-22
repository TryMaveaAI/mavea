import { describe, it, expect } from 'vitest';
import { TurnAudioStore } from '../src/live/scrubvoice/retain';
import type { TurnAudio } from '../src/live/scrubvoice/recorder';

const track = (samples: number): TurnAudio => ({
  pcm: new Float32Array(samples),
  sampleRate: 24000,
  duration: samples / 24000,
  spans: [],
  marks: [],
});

// Past turns' voice is retained so the scrubber works on a chat you scrolled back to, bounded by a
// total-samples budget so a long session can't grow memory without limit.
describe('TurnAudioStore', () => {
  it('returns a retained track and null for one never stored or aged out', () => {
    const store = new TurnAudioStore(1000);
    store.set(3, track(100));
    expect(store.get(3)).not.toBeNull();
    expect(store.get(99)).toBeNull();
  });

  it('evicts the OLDEST tracks first when over budget, keeping the most recent', () => {
    const store = new TurnAudioStore(250); // fits two 100-sample tracks, not three
    store.set(0, track(100));
    store.set(1, track(100));
    expect(store.get(0)).not.toBeNull();
    store.set(2, track(100)); // 300 > 250 → oldest (frame 0) falls off
    expect(store.get(0)).toBeNull();
    expect(store.get(1)).not.toBeNull();
    expect(store.get(2)).not.toBeNull();
    expect(store.size).toBe(2);
  });

  it('always keeps the track just stored, even if it alone exceeds the budget', () => {
    const store = new TurnAudioStore(50);
    store.set(7, track(500));
    expect(store.get(7)).not.toBeNull();
    expect(store.size).toBe(1);
  });
});
