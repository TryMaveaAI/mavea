import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mergeNodes,
  getMemoryNodes,
  editNode,
  forgetAll,
  isFactSource,
} from '../src/live/memory/store';

beforeEach(() => forgetAll());

describe('supersede vs reinforce (no more blind overwrite)', () => {
  it('REINFORCES a restated fact: keeps the wording, bumps uses, no prior snapshot', () => {
    mergeNodes([{ concept: 'profile', body: 'Software founder in Austin.' }], { now: 1000 });
    // Same fact, lightly reworded (high token overlap) → reinforcement.
    mergeNodes([{ concept: 'profile', body: 'A software founder based in Austin.' }], {
      now: 2000,
    });
    const n = getMemoryNodes()[0];
    expect(getMemoryNodes()).toHaveLength(1);
    expect(n.uses).toBe(1);
    expect(n.prevBody).toBeUndefined();
    expect(n.body).toContain('Austin');
  });

  it('SUPERSEDES a changed fact: stashes ONE prior snapshot, resets uses', () => {
    mergeNodes([{ concept: 'profile.city', body: 'Lives in Austin.' }], { now: 1000 });
    mergeNodes([{ concept: 'profile.city', body: 'Relocated to Berlin for a new role.' }], {
      now: 2000,
    });
    const n = getMemoryNodes()[0];
    expect(getMemoryNodes()).toHaveLength(1);
    expect(n.body).toContain('Berlin');
    expect(n.prevBody).toBe('Lives in Austin.'); // "you used to tell me…"
    expect(n.uses).toBe(0);
  });

  it('keeps only ONE superseded snapshot — history is bounded, not unbounded', () => {
    mergeNodes([{ concept: 'c', body: 'first distinct alpha.' }], { now: 1 });
    mergeNodes([{ concept: 'c', body: 'second distinct beta.' }], { now: 2 });
    mergeNodes([{ concept: 'c', body: 'third distinct gamma.' }], { now: 3 });
    const n = getMemoryNodes()[0];
    expect(n.body).toContain('gamma');
    expect(n.prevBody).toBe('second distinct beta.');
  });
});

describe('trust tiers', () => {
  it('trust can only be upgraded, never downgraded, on restatement', () => {
    mergeNodes([{ concept: 'profile', body: 'Is a teacher.', source: 'user-stated' }], { now: 1 });
    // A later model-inferred restatement of the same fact must not demote it back to a guess.
    mergeNodes([{ concept: 'profile', body: 'Works as a teacher.', source: 'model-inferred' }], {
      now: 2,
    });
    const n = getMemoryNodes()[0];
    expect(n.source).toBe('user-stated');
    expect(isFactSource(n.source)).toBe(true);
  });

  it('an inferred fact upgrades to user-stated when the user later states it', () => {
    mergeNodes([{ concept: 'profile', body: 'Seems to like trains.', source: 'model-inferred' }], {
      now: 1,
    });
    mergeNodes([{ concept: 'profile', body: 'Prefers trains to flying.', source: 'user-stated' }], {
      now: 2,
    });
    expect(getMemoryNodes()[0].source).toBe('user-stated');
  });

  it('editNode marks a node user-edit (trusted) and keeps the prior body', () => {
    mergeNodes([{ concept: 'profile', body: 'Old guess.', source: 'model-inferred' }]);
    const id = getMemoryNodes()[0].id;
    editNode(id, 'Corrected by the user.');
    const n = getMemoryNodes()[0];
    expect(n.source).toBe('user-edit');
    expect(isFactSource(n.source)).toBe(true);
    expect(n.body).toBe('Corrected by the user.');
    expect(n.prevBody).toBe('Old guess.');
  });
});

describe('procedural memory store', () => {
  it('creates a procedural lesson with prefer/avoid and an outcome', () => {
    mergeNodes([
      {
        concept: 'corrections.budget',
        body: 'User corrected the figure; verify numbers before stating.',
        kind: 'procedural',
        source: 'user-stated',
        avoid: ['donut'],
        prefer: ['compare'],
        verify: true,
        outcome: 'loss',
      },
    ]);
    const n = getMemoryNodes()[0];
    expect(n.kind).toBe('procedural');
    expect(n.prefer).toEqual(['compare']);
    expect(n.avoid).toEqual(['donut']);
    expect(n.verify).toBe(true);
    expect(n.losses).toBe(1);
  });

  it('bumps outcome counters without a body change (silent — not reported as a save)', () => {
    mergeNodes([{ concept: 'topics.finance', body: 'Finance asks.', kind: 'procedural' }]);
    const changed = mergeNodes([
      { concept: 'topics.finance', body: 'Finance asks.', kind: 'procedural', outcome: 'win' },
    ]);
    expect(changed).toHaveLength(0); // no body change → no "Saved" pill
    expect(getMemoryNodes()[0].wins).toBe(1);
  });

  it('reserves capacity for procedural lessons so a burst of facts cannot evict them', () => {
    mergeNodes(
      [
        {
          concept: 'corrections.key',
          body: 'A hard-won correction.',
          kind: 'procedural',
          source: 'user-stated',
        },
      ],
      { now: 1 },
    );
    // Flood with 80 fresh semantic facts (cap is 50).
    for (let i = 0; i < 80; i++) {
      mergeNodes([{ concept: `topic.t${i}`, body: `fact ${i}` }], { now: 100 + i });
    }
    const all = getMemoryNodes();
    expect(all.length).toBeLessThanOrEqual(50);
    expect(all.some((n) => n.concept === 'corrections.key')).toBe(true);
  });

  it('backfills unused slots with surplus procedural lessons — no wasted capacity', () => {
    for (let i = 0; i < 45; i++) {
      mergeNodes(
        [
          {
            concept: `corrections.c${i}`,
            body: `lesson ${i}`,
            kind: 'procedural',
            source: 'user-stated',
          },
        ],
        { now: 100 + i },
      );
    }
    for (let i = 0; i < 10; i++) {
      mergeNodes([{ concept: `topic.t${i}`, body: `fact ${i}` }], { now: 50 + i });
    }
    const all = getMemoryNodes();
    expect(all.length).toBe(50); // the full cap is used, not left short at 20 + 10
    expect(all.filter((n) => n.kind === 'procedural').length).toBeGreaterThan(20); // surplus backfilled
  });
});

describe('migration v2 → v3', () => {
  it('migrates untyped v2 nodes as model-inferred (safe default), preserving body + updatedAt', async () => {
    // Content is encrypted at rest (contentVault.ts), so a "forget" write is fire-and-forget
    // async. Reset modules and import FIRST, then set up the exact storage state and read it —
    // with no `await` between the final setItem and the read, a write orphaned by the module
    // reset above (from the stale instance's `forgetAll`) can only land before this point, never
    // in between, so it can't be silently overwritten by it.
    forgetAll();
    vi.resetModules();
    const fresh = await import('../src/live/memory/store');
    localStorage.clear();
    localStorage.setItem(
      'mavea-live-memory-v2',
      JSON.stringify({
        nodes: [{ id: 'x1', concept: 'profile', body: 'Founder in Austin.', updatedAt: 4242 }],
        updatedAt: 4242,
      }),
    );
    const nodes = fresh.getMemoryNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].body).toBe('Founder in Austin.');
    expect(nodes[0].updatedAt).toBe(4242);
    expect(nodes[0].source).toBe('model-inferred');
    expect(nodes[0].kind).toBe('semantic');
  });
});
