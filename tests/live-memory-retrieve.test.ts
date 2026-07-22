import { describe, it, expect, beforeEach } from 'vitest';
import { mergeNodes, getMemoryNodes, forgetAll } from '../src/live/memory/store';
import { rankForInjection, scoreNode } from '../src/live/memory/retrieve';
import { tokenSet } from '../src/live/memory/text';
import { buildMemoryContext } from '../src/live/memory/inject';

beforeEach(() => forgetAll());

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

describe('scored retrieval — query-conditioned ranking', () => {
  it('ranks a card whose words match the question above an unrelated one', () => {
    mergeNodes(
      [
        {
          concept: 'topics.finance',
          body: 'Tracks mortgage rates closely.',
          source: 'user-stated',
        },
      ],
      { now: NOW },
    );
    mergeNodes(
      [
        {
          concept: 'topics.cooking',
          body: 'Enjoys baking sourdough bread.',
          source: 'user-stated',
        },
      ],
      { now: NOW },
    );
    const ranked = rankForInjection(getMemoryNodes(), 'what are mortgage rates doing?', NOW);
    expect(ranked[0].concept).toBe('topics.finance');
  });

  it('a grounded fact outranks an equally-relevant model guess (importance/trust)', () => {
    const q = tokenSet('tell me about my marathon training');
    const fact = mergeNodes(
      [{ concept: 'a', body: 'Marathon training plan in progress.', source: 'user-stated' }],
      { now: NOW },
    )[0];
    const guess = mergeNodes(
      [{ concept: 'b', body: 'Marathon training plan in progress.', source: 'model-inferred' }],
      { now: NOW },
    )[0];
    expect(scoreNode(fact, q, NOW)).toBeGreaterThan(scoreNode(guess, q, NOW));
  });

  it('a recent fact outranks an older one of equal relevance', () => {
    const q = tokenSet('budget');
    const recent = mergeNodes([{ concept: 'r', body: 'Budget is tight.', source: 'user-stated' }], {
      now: NOW,
    })[0];
    const old = mergeNodes([{ concept: 'o', body: 'Budget is tight.', source: 'user-stated' }], {
      now: NOW - 200 * DAY,
    })[0];
    expect(scoreNode(recent, q, NOW)).toBeGreaterThan(scoreNode(old, q, NOW));
  });

  it('reinforced facts decay slower than once-stated facts of the same age', () => {
    const q = tokenSet('city');
    // Same age, same content; one has been reinforced several times.
    const wornNode = {
      id: 'w',
      concept: 'city',
      body: 'Lives in Austin.',
      updatedAt: NOW - 120 * DAY,
      source: 'user-stated' as const,
      uses: 5,
    };
    const freshOnce = {
      id: 'f',
      concept: 'city2',
      body: 'Lives in Austin.',
      updatedAt: NOW - 120 * DAY,
      source: 'user-stated' as const,
      uses: 0,
    };
    expect(scoreNode(wornNode, q, NOW)).toBeGreaterThan(scoreNode(freshOnce, q, NOW));
  });

  it('feeds buildMemoryContext so the most relevant card leads the injected block', () => {
    mergeNodes(
      [{ concept: 'topics.taxes', body: 'Worried about quarterly taxes.', source: 'user-stated' }],
      { now: NOW },
    );
    mergeNodes([{ concept: 'profile', body: 'Lives by the beach.', source: 'user-stated' }], {
      now: NOW,
    });
    const ctx = buildMemoryContext(
      rankForInjection(getMemoryNodes(), 'help me plan my taxes', NOW),
      NOW,
    );
    const lines = ctx.split('\n').filter((l) => l.startsWith('['));
    expect(lines[0]).toContain('topics.taxes');
  });
});
