import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCards,
  addTag,
  getAllCards,
  getCounts,
  moveDeck,
  removeCard,
  removeTag,
  reviewCard,
  selectCards,
  setSuspended,
  updateCard,
  setStudyStyle,
  __resetSrsCacheForTests,
} from '../src/live/srs/store';
import { countStudyable, getStudyQueue } from '../src/live/srs/queue';

// The SRS store: SM-2 scheduling plus organisation (deck + tags), provenance, and origin. The hard
// contracts tested here: a legacy {front,back,tag} row upgrades losslessly on read; dedup is per
// deck (same front allowed across decks); reviews track reps/lapses; the smart-filter queues behave;
// CRUD round-trips; and eviction NEVER drops a card the user made, reviewed, or suspended.

beforeEach(() => {
  localStorage.clear();
  __resetSrsCacheForTests();
});

describe('migration / coercion', () => {
  it('upgrades a legacy {front,back,tag} row: tag → deck + first tag, origin auto, SM-2 kept', () => {
    localStorage.setItem(
      'mavea-srs-v1',
      JSON.stringify({
        cards: [
          {
            id: 'x',
            front: 'Q',
            back: 'A',
            tag: 'Bio',
            interval: 3,
            easeFactor: 2.6,
            nextReview: 0,
            addedAt: 1,
          },
        ],
      }),
    );
    __resetSrsCacheForTests();
    const [c] = getAllCards();
    expect(c.deck).toBe('Bio');
    expect(c.tags).toEqual(['Bio']);
    expect(c.origin).toBe('auto');
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(c.interval).toBe(3);
    expect(c.easeFactor).toBeCloseTo(2.6);
  });

  it('garbage in storage degrades to empty', () => {
    localStorage.setItem('mavea-srs-v1', '{not json');
    __resetSrsCacheForTests();
    expect(getAllCards()).toEqual([]);
  });
});

describe('add + dedup (deck ⊕ front)', () => {
  it('dedupes within a deck (case/space-insensitive) but allows the same front in another deck', () => {
    addCards([{ front: 'Mass', back: 'm' }], { deck: 'Physics', now: 1 });
    addCards([{ front: '  mass ', back: 'm again' }], { deck: 'Physics', now: 2 });
    addCards([{ front: 'Mass', back: 'a religious service' }], { deck: 'History', now: 3 });
    expect(selectCards({ deck: 'Physics' })).toHaveLength(1);
    expect(selectCards({ deck: 'History' })).toHaveLength(1);
    expect(getAllCards()).toHaveLength(2);
  });

  it('applies opts (deck/tags/origin) and merges the per-card tag', () => {
    const [c] = addCards([{ front: 'Q', back: 'A', tag: 'unit1' }], {
      deck: 'Chem',
      tags: ['exam'],
      origin: 'block',
      now: 1,
    });
    expect(c.deck).toBe('Chem');
    expect([...c.tags].sort()).toEqual(['exam', 'unit1']);
    expect(c.origin).toBe('block');
  });
});

describe('review (SM-2 + reps/lapses)', () => {
  it('bumps reps + lastReviewedAt on every review, lapses + interval reset on a fail', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
    reviewCard(c.id, 5, 1000);
    let card = getAllCards()[0];
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(0);
    expect(card.lastReviewedAt).toBe(1000);
    reviewCard(c.id, 1, 2000);
    card = getAllCards()[0];
    expect(card.reps).toBe(2);
    expect(card.lapses).toBe(1);
    expect(card.interval).toBe(1);
  });
});

describe('queues + filters', () => {
  it('study excludes suspended, and a graded card only returns once it comes due', () => {
    const [a] = addCards([{ front: 'new1', back: 'x' }], { deck: 'D', now: 0 });
    const [b] = addCards([{ front: 'studied', back: 'x' }], { deck: 'D', now: 0 });
    reviewCard(b.id, 4, 0);
    setSuspended(a.id, true);
    setStudyStyle('spaced');
    expect(getStudyQueue({ deck: 'D', filter: 'new' }).map((c) => c.id)).not.toContain(a.id);
    expect(selectCards({ filter: 'suspended' }).map((c) => c.id)).toEqual([a.id]);
    // Grading b "Good" pushes it three days out, so nothing is studyable yet; once it comes back
    // round, the suspended card still stays out of the queue.
    expect(countStudyable(0)).toBe(0);
    expect(getStudyQueue({}, 4 * 86_400_000).map((c) => c.id)).toEqual([b.id]);
  });

  it('struggling filter picks high-lapse cards', () => {
    const [c] = addCards([{ front: 'hard', back: 'x' }], { now: 0 });
    for (let i = 0; i < 3; i++) reviewCard(c.id, 0, i + 1);
    expect(selectCards({ filter: 'struggling' }).map((x) => x.id)).toContain(c.id);
  });

  it('search matches front/back/deck/tags', () => {
    addCards([{ front: 'Mitochondria', back: 'powerhouse' }], {
      deck: 'Bio',
      tags: ['cell'],
      now: 0,
    });
    expect(selectCards({ search: 'power' })).toHaveLength(1);
    expect(selectCards({ search: 'cell' })).toHaveLength(1);
    expect(selectCards({ search: 'nope' })).toHaveLength(0);
  });
});

describe('CRUD round-trips', () => {
  it('update / tag / move / remove', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { deck: 'D1', now: 0 });
    updateCard(c.id, { front: 'Q2', deck: 'D2', tags: ['t1', 't1', 'T1'] });
    const card = getAllCards()[0];
    expect(card.front).toBe('Q2');
    expect(card.deck).toBe('D2');
    expect(card.tags).toEqual(['t1']);
    addTag(c.id, 'extra');
    removeTag(c.id, 't1');
    expect(getAllCards()[0].tags).toEqual(['extra']);
    moveDeck([c.id], 'D3');
    expect(getAllCards()[0].deck).toBe('D3');
    removeCard(c.id);
    expect(getAllCards()).toHaveLength(0);
  });

  it('updateCard ignores blank front/back', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
    updateCard(c.id, { front: '   ' });
    expect(getAllCards()[0].front).toBe('Q');
  });
});

describe('eviction never drops the user’s own cards', () => {
  it('over the cap, evicts only untouched auto cards — keeps manual', () => {
    const auto = Array.from({ length: 1000 }, (_, i) => ({ front: `auto${i}`, back: 'x' }));
    addCards(auto, { origin: 'auto', now: 0 });
    const [mine] = addCards([{ front: 'mine', back: 'x' }], { origin: 'manual', now: 1 });
    expect(getAllCards()).toHaveLength(1000);
    expect(getAllCards().some((c) => c.id === mine.id)).toBe(true);
  });
});

describe('counts', () => {
  it('tallies per filter and per deck', () => {
    addCards(
      [
        { front: 'a', back: 'x' },
        { front: 'b', back: 'x' },
      ],
      { deck: 'D', now: 0 },
    );
    // Due is a spaced-study concept; a collection that never opted in owes nothing.
    setStudyStyle('spaced');
    const counts = getCounts(0);
    expect(counts.total).toBe(2);
    expect(counts.due).toBe(2);
    expect(counts.new).toBe(2);
    expect(counts.decks.find((d) => d.name === 'D')?.total).toBe(2);
  });
});
