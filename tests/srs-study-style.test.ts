import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCards,
  getAllCards,
  getCounts,
  getStudyPrefs,
  getStudyStyle,
  importCards,
  importStudyPrefs,
  markSeen,
  markStyleAsked,
  reviewCard,
  selectCards,
  setStudyStyle,
  updateCard,
  __resetSrsCacheForTests,
} from '../src/live/srs/store';
import { countStudyable, getStudyQueue } from '../src/live/srs/queue';
import type { SrsCard } from '../src/live/srs/store';

// A collection is either a plain pile of cards or a spaced schedule, and the promise is that
// choosing one never costs you the other. These are the contracts that promise rests on:
// the two styles write disjoint fields, nothing is due until you asked to be scheduled, a big
// pile enters the schedule gradually rather than all at once, and an existing SM-2 user is never
// silently demoted by the migration.

const DAY = 86_400_000;

beforeEach(() => {
  localStorage.clear();
  __resetSrsCacheForTests();
});

/** Seed storage directly so the derivation runs on load, the way it would for a real user. */
function seed(cards: Array<Partial<SrsCard>>, extra: Record<string, unknown> = {}): void {
  localStorage.setItem(
    'mavea-srs-v1',
    JSON.stringify({
      cards: cards.map((c, i) => ({ id: `c${i}`, front: `Q${i}`, back: `A${i}`, ...c })),
      ...extra,
    }),
  );
  __resetSrsCacheForTests();
}

describe('which style an existing collection lands in', () => {
  it('starts a brand-new collection as a plain pile, with the question still open', () => {
    expect(getStudyStyle()).toBe('collection');
    expect(getStudyPrefs().styleAsked).toBe(false);
  });

  it('keeps a collection that has actually been graded on the schedule, and never asks', () => {
    // interval past 1 is only reachable through reviewCard — real SM-2 use.
    seed([{ interval: 3, easeFactor: 2.6, nextReview: 0, addedAt: 1 }]);
    expect(getStudyStyle()).toBe('spaced');
    expect(getStudyPrefs().styleAsked).toBe(true);
  });

  it('reads schedule evidence off SM-2 state, not off reps — a legacy row carries no reps', () => {
    // The exact shape that a `reps > 0` or `nextReview > addedAt` test would misread: coerceCard
    // defaults a missing reps to 0 and a missing addedAt to now, either of which would demote a
    // real SM-2 user to a plain pile and throw away their schedule.
    seed([{ interval: 6, easeFactor: 2.5, lapses: 0, nextReview: 0 }]);
    expect(getStudyStyle()).toBe('spaced');
  });

  it('leaves a collection that was captured but never studied as a plain pile, still unasked', () => {
    seed([
      { interval: 1, easeFactor: 2.5, lapses: 0 },
      { interval: 1, easeFactor: 2.5 },
    ]);
    expect(getStudyStyle()).toBe('collection');
    expect(getStudyPrefs().styleAsked).toBe(false);
  });

  it('an explicit choice always wins over the derivation', () => {
    seed([{ interval: 9, easeFactor: 2.8 }], { style: 'collection', styleAsked: true });
    expect(getStudyStyle()).toBe('collection');
  });
});

describe('nothing is owed until the user asked to be scheduled', () => {
  it('reports no due cards, no badge, and no per-deck badges for a plain pile', () => {
    addCards(
      [
        { front: 'a', back: 'x' },
        { front: 'b', back: 'x' },
      ],
      { deck: 'D', now: 0 },
    );
    const counts = getCounts(0);
    expect(counts.total).toBe(2);
    expect(counts.due).toBe(0);
    expect(counts.decks.find((d) => d.name === 'D')?.due).toBe(0);
    expect(countStudyable(0)).toBe(0);
    expect(selectCards({ filter: 'due' }, 0)).toHaveLength(0);
  });

  it('surfaces the same cards the moment spaced study is switched on', () => {
    addCards(
      [
        { front: 'a', back: 'x' },
        { front: 'b', back: 'x' },
      ],
      { deck: 'D', now: 0 },
    );
    setStudyStyle('spaced');
    expect(getCounts(0).due).toBe(2);
    expect(countStudyable(0)).toBe(2);
  });
});

describe('a flip-through and a graded review write disjoint fields', () => {
  it('markSeen never touches anything SM-2 owns', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
    const before = getAllCards()[0];
    markSeen(c.id, false, 5000);
    markSeen(c.id, false, 6000);
    const after = getAllCards()[0];
    expect(after.interval).toBe(before.interval);
    expect(after.easeFactor).toBe(before.easeFactor);
    expect(after.reps).toBe(0);
    expect(after.lapses).toBe(0);
    expect(after.nextReview).toBe(before.nextReview);
    expect(after.lastReviewedAt).toBeUndefined();
    // …and does record the flip.
    expect(after.seen).toBe(2);
    expect(after.lastSeenAt).toBe(6000);
    expect(after.missedLast).toBe(true);
  });

  it('"Missed" means missed last time, so drilling a card until it sticks clears it', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
    markSeen(c.id, false, 1000);
    expect(selectCards({ filter: 'missed' }).map((x) => x.id)).toEqual([c.id]);
    markSeen(c.id, true, 2000);
    expect(selectCards({ filter: 'missed' })).toHaveLength(0);
    expect(selectCards({ filter: 'unseen' })).toHaveLength(0);
  });

  it('switching styles in both directions leaves the schedule byte-identical', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
    setStudyStyle('spaced');
    reviewCard(c.id, 4, 0);
    const scheduled = getAllCards()[0];

    setStudyStyle('collection');
    markSeen(c.id, true, 1000);
    markSeen(c.id, false, 2000);
    setStudyStyle('spaced');

    const back = getAllCards()[0];
    expect(back.interval).toBe(scheduled.interval);
    expect(back.easeFactor).toBe(scheduled.easeFactor);
    expect(back.reps).toBe(scheduled.reps);
    expect(back.lapses).toBe(scheduled.lapses);
    expect(back.nextReview).toBe(scheduled.nextReview);
  });
});

describe('a large pile enters the schedule gradually, never all at once', () => {
  it('admits at most newPerDay never-graded cards, so switching on is not a wall', () => {
    addCards(
      Array.from({ length: 200 }, (_, i) => ({ front: `q${i}`, back: 'x' })),
      { now: 0 },
    );
    setStudyStyle('spaced', 20);
    // Every one of them is nominally "due" — addCards marks new cards due immediately — but the
    // queue is what the user meets, and it hands over 20.
    expect(getCounts(0).due).toBe(200);
    expect(getStudyQueue({}, 0)).toHaveLength(20);
    expect(countStudyable(0)).toBe(20);
  });

  it('caps any session so it ends, however much is overdue', () => {
    addCards(
      Array.from({ length: 300 }, (_, i) => ({ front: `q${i}`, back: 'x' })),
      { now: 0 },
    );
    setStudyStyle('spaced', 200);
    expect(getStudyQueue({}, 0).length).toBeLessThanOrEqual(40);
  });

  it('never starves a freshly saved card behind a long backlog', () => {
    const old = addCards(
      Array.from({ length: 60 }, (_, i) => ({ front: `old${i}`, back: 'x' })),
      { now: 0 },
    );
    setStudyStyle('spaced', 20);
    for (const c of old) reviewCard(c.id, 0, 0); // all lapsed → overdue tomorrow
    const [fresh] = addCards([{ front: 'brand new', back: 'x' }], { now: 2 * DAY });
    const queue = getStudyQueue({}, 2 * DAY);
    expect(queue.map((c) => c.id)).toContain(fresh.id);
  });

  it('a plain pile rotates coldest-first instead of replaying the same faces', () => {
    const [a] = addCards([{ front: 'a', back: 'x' }], { now: 1 });
    const [b] = addCards([{ front: 'b', back: 'x' }], { now: 2 });
    const [c] = addCards([{ front: 'c', back: 'x' }], { now: 3 });
    markSeen(a.id, true, 9000);
    markSeen(b.id, true, 8000);
    // c has never been seen, then b (older look), then a.
    expect(getStudyQueue({}).map((x) => x.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe('the collection survives its own bookkeeping', () => {
  it('never evicts a card the user has flipped through', () => {
    addCards(
      Array.from({ length: 1000 }, (_, i) => ({ front: `auto${i}`, back: 'x' })),
      { origin: 'auto', now: 0 },
    );
    const flipped = getAllCards()[0];
    markSeen(flipped.id, true, 1);
    // Push past the cap; only untouched auto cards may go.
    addCards([{ front: 'one more', back: 'x' }], { origin: 'auto', now: 2 });
    expect(getAllCards().some((c) => c.id === flipped.id)).toBe(true);
  });

  it('keeps the study style when any card is edited', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
    setStudyStyle('spaced', 10);
    updateCard(c.id, { front: 'Q2' });
    expect(getStudyStyle()).toBe('spaced');
    expect(getStudyPrefs().newPerDay).toBe(10);
  });

  it('a stale backup cannot wipe a newer flip-through', () => {
    const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
    markSeen(c.id, true, 50_000);
    // The same card as it looked before the session — older by lastSeenAt.
    importCards([{ ...getAllCards()[0], seen: undefined, lastSeenAt: undefined, addedAt: 0 }]);
    expect(getAllCards()[0].seen).toBe(1);
  });
});

describe('study preferences round-trip through a backup', () => {
  it('restores the style and intake rate', () => {
    setStudyStyle('spaced', 40);
    const saved = getStudyPrefs();
    localStorage.clear();
    __resetSrsCacheForTests();
    expect(getStudyStyle()).toBe('collection');
    expect(importStudyPrefs(saved)).toBe('spaced');
    expect(getStudyPrefs().newPerDay).toBe(40);
  });

  it('a bundle with no study section leaves the current choice alone', () => {
    setStudyStyle('spaced');
    expect(importStudyPrefs(undefined)).toBe('spaced');
    expect(getStudyStyle()).toBe('spaced');
  });

  it('restoring an older bundle can never re-open a settled question', () => {
    markStyleAsked();
    importStudyPrefs({ style: 'collection', styleAsked: false });
    expect(getStudyPrefs().styleAsked).toBe(true);
  });
});
