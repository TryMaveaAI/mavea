import { describe, it, expect } from 'vitest';
import { liveTourBeats, shouldRevealTour, REVEAL_TOUR_MIN } from '../src/live/generateBeats';
import type { Block } from '../src/data/conversation';

const blk = (id?: string, title = 'T'): Block =>
  ({
    type: 'insight',
    col: 4,
    delay: 0,
    ...(id ? { id } : {}),
    props: { title },
  }) as unknown as Block;

const spots = (beats: ReturnType<typeof liveTourBeats>) =>
  beats.filter((b) => b.set && b.set.spot).map((b) => b.set!.spot);

describe('liveTourBeats', () => {
  it('has no beats for an empty canvas', () => {
    expect(liveTourBeats([])).toEqual([]);
  });

  it('spotlights each block in order, then releases', () => {
    const beats = liveTourBeats([blk('live-1'), blk('live-2'), blk('live-3')], { opener: 'hi' });
    expect(beats).toHaveLength(4); // 3 spotlights + 1 release
    expect(spots(beats)).toEqual(['live-1', 'live-2', 'live-3']);
    const release = beats[beats.length - 1];
    expect(release.set?.spot).toBeNull();
    expect(release.set?.pstate).toBe('idle');
  });

  it('shows the spoken opener as the first caption (audio matches the lit block)', () => {
    const beats = liveTourBeats([blk('live-1'), blk('live-2')], { opener: 'the spoken line' });
    expect(beats[0].set?.caption).toBe('the spoken line');
  });

  it('walks a model tour in its order and drops unresolved stops', () => {
    const beats = liveTourBeats([blk('live-1'), blk('live-2')], {
      tour: [{ spot: 'live-2', say: 'two' }, { spot: 'ghost' }, { spot: 'live-1', say: 'one' }],
    });
    expect(spots(beats)).toEqual(['live-2', 'live-1']);
  });

  it('only spotlights blocks that carry an id', () => {
    const beats = liveTourBeats([blk(), blk('live-2')]);
    expect(spots(beats)).toEqual(['live-2']);
  });

  it('starts the tour at startId (the first new block on an augment)', () => {
    const blocks = [blk('live-1'), blk('live-2'), blk('live-3'), blk('live-4')];
    const beats = liveTourBeats(blocks, { maxStops: 2, startId: 'live-3' });
    expect(spots(beats)).toEqual(['live-3', 'live-4']);
  });
});

// The reveal decision gates whether a freshly-landed canvas walks. Its FALSE branch is the one
// that bit us: a small replace canvas opens the lead-block spotlight but runs no walk, so the
// spotlight must be released explicitly (LiveApp does this) instead of staying stuck-dimmed.
describe('shouldRevealTour', () => {
  it('does NOT walk a small, simple replace canvas (the no-spotlight-leak case)', () => {
    expect(
      shouldRevealTour({ blockCount: 2, mode: 'replace', hasModelTour: false, teach: false }),
    ).toBe(false);
    expect(
      shouldRevealTour({
        blockCount: REVEAL_TOUR_MIN - 1,
        mode: 'replace',
        hasModelTour: false,
        teach: false,
      }),
    ).toBe(false);
  });

  it('walks a substantial canvas', () => {
    expect(
      shouldRevealTour({
        blockCount: REVEAL_TOUR_MIN,
        mode: 'replace',
        hasModelTour: false,
        teach: false,
      }),
    ).toBe(true);
  });

  it('always walks a model-authored tour, an augment, or a teach turn — even when small', () => {
    expect(
      shouldRevealTour({ blockCount: 1, mode: 'replace', hasModelTour: true, teach: false }),
    ).toBe(true);
    expect(
      shouldRevealTour({ blockCount: 1, mode: 'augment', hasModelTour: false, teach: false }),
    ).toBe(true);
    expect(
      shouldRevealTour({ blockCount: 1, mode: 'replace', hasModelTour: false, teach: true }),
    ).toBe(true);
  });
});
