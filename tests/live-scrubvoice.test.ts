import { beforeEach, describe, expect, it } from 'vitest';
import {
  recorderTap,
  beginTurn,
  markBlocks,
  snapshot,
  blocksAt,
  subscribe,
} from '../src/live/scrubvoice/recorder';

// The scrub-the-voice recorder: lines concatenate gap-free into one track, block marks ride
// the audio clock, unheard lines vanish, and the un-build lookup maps any time to the exact
// block count the screen held.

const SR = 24000;
const secs = (n: number) => new Float32Array(Math.round(n * SR));

beforeEach(beginTurn);

describe('recorder', () => {
  it('concatenates heard lines into spans on one timeline', () => {
    recorderTap.begin('First line.');
    recorderTap.push(secs(1));
    recorderTap.end(true);
    recorderTap.begin('Second line.');
    recorderTap.push(secs(0.5));
    recorderTap.end(true);
    const audio = snapshot()!;
    expect(audio.duration).toBeCloseTo(1.5, 5);
    expect(audio.spans.map((s) => s.text)).toEqual(['First line.', 'Second line.']);
    expect(audio.spans[1].t0).toBeCloseTo(1, 5);
  });

  it('a line that never made a sound contributes nothing', () => {
    recorderTap.begin('Heard.');
    recorderTap.push(secs(1));
    recorderTap.end(true);
    recorderTap.begin('Silent fallback.');
    recorderTap.push(secs(2));
    recorderTap.end(false);
    const audio = snapshot()!;
    expect(audio.duration).toBeCloseTo(1, 5);
    expect(audio.spans).toHaveLength(1);
  });

  it('returns null when nothing was recorded (muted / whole-clip fallback)', () => {
    expect(snapshot()).toBeNull();
  });

  it('block marks ride the audio clock and drive the un-build lookup', () => {
    recorderTap.begin('Narration.');
    markBlocks(1);
    recorderTap.push(secs(1));
    markBlocks(3);
    recorderTap.push(secs(1));
    markBlocks(3); // duplicate collapses
    markBlocks(6);
    recorderTap.end(true);
    const audio = snapshot()!;
    expect(audio.marks).toHaveLength(3);
    expect(blocksAt(audio, 0.2)).toBe(1);
    expect(blocksAt(audio, 1.5)).toBe(3);
    expect(blocksAt(audio, 2)).toBe(6);
  });

  it('beginTurn drops the previous turn entirely', () => {
    recorderTap.begin('Old.');
    recorderTap.push(secs(1));
    recorderTap.end(true);
    beginTurn();
    expect(snapshot()).toBeNull();
  });

  it('notifies the UI when a spoken line settles after the turn has rendered', () => {
    let notifications = 0;
    const unsubscribe = subscribe(() => {
      notifications += 1;
    });

    beginTurn();
    expect(notifications).toBe(1);

    recorderTap.begin('Late audio.');
    recorderTap.push(secs(0.4));
    expect(notifications).toBe(1);

    recorderTap.end(true);
    expect(notifications).toBe(2);
    expect(snapshot()?.duration).toBeCloseTo(0.4, 5);

    unsubscribe();
    recorderTap.begin('Ignored after unsubscribe.');
    recorderTap.push(secs(0.2));
    recorderTap.end(true);
    expect(notifications).toBe(2);
  });
});
