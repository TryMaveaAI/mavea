import { beforeEach, describe, expect, it } from 'vitest';
import {
  recorderTap,
  beginTurn,
  endTurn,
  setTapSuspended,
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

beforeEach(() => {
  setTapSuspended(false);
  beginTurn();
});

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

  // The track is stored as the SOURCE ints Kokoro streamed: the decoder hands the tap exactly
  // s / 0x8000 per sample, so quantizing back is lossless — half the bytes, the same audio.
  it('stores the decoded floats as their exact source ints', () => {
    const ints = [0, 1, -1, 12345, -12345, 32767, -32768];
    recorderTap.begin('Round trip.');
    recorderTap.push(new Float32Array(ints.map((s) => s / 0x8000)));
    recorderTap.end(true);
    const audio = snapshot()!;
    expect(audio.pcm).toBeInstanceOf(Int16Array);
    expect([...audio.pcm]).toEqual(ints);
  });

  // snapshot() is cached between changes (the settle effect re-runs more often than lines land),
  // so anything a reader could observe — a new line, a new mark — must drop the cache.
  it('a cached snapshot still picks up the next line and the next mark', () => {
    recorderTap.begin('First.');
    recorderTap.push(secs(1));
    recorderTap.end(true);
    expect(snapshot()).toBe(snapshot()); // unchanged between reads — one shared concatenation
    markBlocks(2);
    expect(snapshot()!.marks).toEqual([{ t: 1, blocks: 2 }]);
    recorderTap.begin('Second.');
    recorderTap.push(secs(1));
    recorderTap.end(true);
    const audio = snapshot()!;
    expect(audio.duration).toBeCloseTo(2, 5);
    expect(audio.spans.map((s) => s.text)).toEqual(['First.', 'Second.']);
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

  // Replaying an older answer narrates through the SAME streaming tap. Left unguarded, the
  // replayed lines appended themselves to the live turn's track — and the retain effect then
  // wrote that corrupted track over the head turn's snapshot (and any reel exported from it).
  it('is deaf while the tap is suspended: replayed audio never joins the turn', () => {
    recorderTap.begin('The live answer.');
    recorderTap.push(secs(1));
    recorderTap.end(true);

    setTapSuspended(true);
    markBlocks(9);
    recorderTap.begin('A replayed answer from three turns ago.');
    recorderTap.push(secs(4));
    recorderTap.end(true);
    setTapSuspended(false);

    const audio = snapshot()!;
    expect(audio.spans.map((s) => s.text)).toEqual(['The live answer.']);
    expect(audio.duration).toBeCloseTo(1, 5);
    expect(audio.marks.some((m) => m.blocks === 9)).toBe(false);
  });

  it('drops a line the suspension caught mid-sentence, clock included', () => {
    recorderTap.begin('Interrupted by a replay.');
    recorderTap.push(secs(2));
    setTapSuspended(true);
    recorderTap.end(true);
    setTapSuspended(false);

    recorderTap.begin('The next live line.');
    recorderTap.push(secs(1));
    recorderTap.end(true);
    const audio = snapshot()!;
    expect(audio.spans).toHaveLength(1);
    expect(audio.spans[0].t0).toBeCloseTo(0, 5); // the discarded samples left the clock
    expect(audio.duration).toBeCloseTo(1, 5);
  });

  // Voice previews and the Watch-Me-Think settle line speak AFTER the answer is done. The
  // recording used to stay open forever, so they were appended to the settled turn's track.
  it('endTurn closes the recording — post-turn speech is not this answer', () => {
    recorderTap.begin('The answer.');
    recorderTap.push(secs(1));
    recorderTap.end(true);
    endTurn();

    recorderTap.begin('Voice preview audition.');
    recorderTap.push(secs(3));
    recorderTap.end(true);
    markBlocks(9);
    const audio = snapshot()!;
    expect(audio.spans.map((s) => s.text)).toEqual(['The answer.']);
    expect(audio.duration).toBeCloseTo(1, 5);
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
