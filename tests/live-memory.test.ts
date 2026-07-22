import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mergeNodes,
  deleteNode,
  editNode,
  forgetAll,
  getMemoryNodes,
  MEMORY_EVENT,
} from '../src/live/memory/store';
import { buildMemoryContext, ageHint } from '../src/live/memory/inject';
import { extractUserFacts } from '../src/live/memory/extract';
import { validateLiveResponse } from '../src/engine/liveSchema';

beforeEach(() => forgetAll());

describe('MEMORY_EVENT broadcast contract', () => {
  // The LiveApp "Memory updated" pill keys off `detail.changed`: non-empty only on a genuine save,
  // empty on edit/delete/forget. Pin the field name + semantics so the glow can't silently break.
  function captureDetail(fn: () => void): { nodes?: unknown[]; changed?: unknown[] } | null {
    let detail: { nodes?: unknown[]; changed?: unknown[] } | null = null;
    const handler = (e: Event) => {
      detail = (e as CustomEvent<{ nodes?: unknown[]; changed?: unknown[] }>).detail;
    };
    window.addEventListener(MEMORY_EVENT, handler);
    try {
      fn();
    } finally {
      window.removeEventListener(MEMORY_EVENT, handler);
    }
    return detail;
  }

  it('carries non-empty `changed` on a save', () => {
    const detail = captureDetail(() => mergeNodes([{ concept: 'profile', body: 'Founder.' }]));
    expect(detail?.changed).toHaveLength(1);
  });

  it('carries empty `changed` on delete and forget (so the pill stays quiet)', () => {
    const node = mergeNodes([{ concept: 'profile', body: 'Founder.' }])[0];
    expect(captureDetail(() => deleteNode(node.id))?.changed).toHaveLength(0);
    mergeNodes([{ concept: 'topic', body: 'Likes maps.' }]);
    expect(captureDetail(() => forgetAll())?.changed).toHaveLength(0);
  });
});

describe('memory store — concept nodes', () => {
  it('creates a new node and returns it as changed', () => {
    const changed = mergeNodes([{ concept: 'profile', body: 'Software founder in Austin.' }]);
    expect(changed).toHaveLength(1);
    expect(changed[0].concept).toBe('profile');
    expect(changed[0].body).toBe('Software founder in Austin.');
    expect(changed[0].id).toBeTruthy();
    expect(getMemoryNodes()).toHaveLength(1);
  });

  it('upserts by concept slug — second write REPLACES the body, does not append', () => {
    mergeNodes([{ concept: 'profile', body: 'Founder.' }]);
    const changed = mergeNodes([{ concept: 'profile', body: 'Founder building Mavéa.' }]);
    expect(changed).toHaveLength(1);
    expect(getMemoryNodes()).toHaveLength(1);
    expect(getMemoryNodes()[0].body).toBe('Founder building Mavéa.');
  });

  it('returns [] when nothing actually changed (identical body)', () => {
    mergeNodes([{ concept: 'profile', body: 'Founder.' }]);
    const changed = mergeNodes([{ concept: 'profile', body: 'Founder.' }]);
    expect(changed).toHaveLength(0);
  });

  it('creates multiple distinct concepts in one call', () => {
    mergeNodes([
      { concept: 'profile', body: 'Founder.' },
      { concept: 'preferences', body: 'Dense answers.' },
    ]);
    expect(getMemoryNodes()).toHaveLength(2);
    expect(
      getMemoryNodes()
        .map((n) => n.concept)
        .sort(),
    ).toEqual(['preferences', 'profile']);
  });

  it('normalises concept slugs (spaces→dots, uppercase→lower, special chars stripped)', () => {
    mergeNodes([{ concept: 'Topics Finance', body: 'Startup metrics.' }]);
    expect(getMemoryNodes()[0].concept).toBe('topics.finance');
  });

  it('drops invalid concept slugs silently', () => {
    mergeNodes([{ concept: '!!bad!!', body: 'Ignored.' }]);
    expect(getMemoryNodes()).toHaveLength(0);
  });

  it('truncates over-long bodies to 400 chars', () => {
    mergeNodes([{ concept: 'profile', body: 'x'.repeat(600) }]);
    expect(getMemoryNodes()[0].body.length).toBe(400);
  });

  it('drops empty bodies', () => {
    mergeNodes([
      { concept: 'profile', body: '' },
      { concept: 'profile', body: '   ' },
    ]);
    expect(getMemoryNodes()).toHaveLength(0);
  });

  it('editNode replaces a node body in place', () => {
    mergeNodes([{ concept: 'profile', body: 'Old.' }]);
    const id = getMemoryNodes()[0].id;
    editNode(id, 'Updated.');
    expect(getMemoryNodes()[0].body).toBe('Updated.');
  });

  it('deleteNode removes a node by id', () => {
    mergeNodes([
      { concept: 'profile', body: 'A.' },
      { concept: 'preferences', body: 'B.' },
    ]);
    const id = getMemoryNodes().find((n) => n.concept === 'profile')!.id;
    deleteNode(id);
    expect(getMemoryNodes()).toHaveLength(1);
    expect(getMemoryNodes()[0].concept).toBe('preferences');
  });

  it('forgetAll clears everything', () => {
    mergeNodes([{ concept: 'profile', body: 'A.' }]);
    forgetAll();
    expect(getMemoryNodes()).toHaveLength(0);
  });

  it('tolerates malformed stored JSON (degrades to empty, never throws)', async () => {
    localStorage.setItem('mavea-live-memory-v3', '{ not valid json');
    vi.resetModules();
    const fresh = await import('../src/live/memory/store');
    expect(fresh.getMemoryNodes()).toEqual([]);
  });

  it('returns nodes sorted by most recently updated first', () => {
    mergeNodes([{ concept: 'a', body: 'A.' }], { now: 1000 });
    mergeNodes([{ concept: 'b', body: 'B.' }], { now: 3000 });
    mergeNodes([{ concept: 'c', body: 'C.' }], { now: 2000 });
    const concepts = getMemoryNodes().map((n) => n.concept);
    expect(concepts).toEqual(['b', 'c', 'a']);
  });
});

describe('buildMemoryContext', () => {
  it('returns an empty string when there are no nodes', () => {
    expect(buildMemoryContext([])).toBe('');
  });

  it('ageHint renders a compact relative freshness', () => {
    const now = 1_000_000_000_000;
    const d = 86_400_000;
    expect(ageHint(now, now)).toBe('today');
    expect(ageHint(now - d, now)).toBe('yesterday');
    expect(ageHint(now - 5 * d, now)).toBe('5d ago');
    expect(ageHint(now - 90 * d, now)).toBe('~3mo ago');
    expect(ageHint(now - 800 * d, now)).toBe('~2y ago');
  });

  it('builds a compact [concept] body block with the advisory header', () => {
    // Grounded facts (user-stated) render as plain cards; see the provenance suite for how
    // model-inferred guesses get the "· unconfirmed" tag instead.
    mergeNodes([
      { concept: 'profile', body: 'Software founder.', source: 'user-stated' },
      { concept: 'preferences', body: 'Dense answers.', source: 'user-stated' },
    ]);
    const ctx = buildMemoryContext(getMemoryNodes());
    // Each card carries its concept + a freshness hint ("[profile · today] …") so the model can
    // discount stale facts.
    expect(ctx).toContain('[profile · today]');
    expect(ctx).toContain('[preferences · today]');
    expect(ctx).toContain('Software founder.');
    expect(ctx.toLowerCase()).toContain('current question');
    expect(ctx.toLowerCase()).toContain('discount anything stale');
  });

  it('is bounded — never exceeds MAX_CHARS', () => {
    for (let i = 0; i < 20; i++) {
      mergeNodes([{ concept: `topic.t${i}`, body: 'x'.repeat(390) }]);
    }
    const ctx = buildMemoryContext(getMemoryNodes());
    expect(ctx.length).toBeLessThanOrEqual(800);
  });
});

describe('liveSchema memory parsing', () => {
  const base = {
    title: 't',
    narration: 'n',
    blocks: [{ type: 'insight', props: { title: 'x' } }],
  };

  it('parses concept-node memory[], dropping invalid concepts and over-long bodies', () => {
    const v = validateLiveResponse({
      ...base,
      memory: [
        { concept: 'profile', body: 'Founder in Austin.' },
        { concept: '!!bad!!', body: 'Ignored.' },
        { concept: 'preferences', body: 'b'.repeat(600) },
      ],
    });
    expect(v?.memory).toHaveLength(2);
    expect(v?.memory![0]).toEqual({ concept: 'profile', body: 'Founder in Austin.' });
    expect(v?.memory![1].body.length).toBeLessThanOrEqual(400);
  });

  it('accepts plain strings from local models, slotting them into "profile"', () => {
    const v = validateLiveResponse({
      ...base,
      memory: ['Prefers trains', 'Has a cat'] as unknown[],
    });
    expect(v?.memory![0]).toEqual({ concept: 'profile', body: 'Prefers trains' });
    expect(v?.memory![1]).toEqual({ concept: 'profile', body: 'Has a cat' });
  });

  it('omits memory when the model returns none', () => {
    const v = validateLiveResponse(base);
    expect(v?.memory).toBeUndefined();
  });
});

describe('extractUserFacts (heuristic fallback)', () => {
  it('captures durable first-person statements as third-person facts', () => {
    expect(extractUserFacts('I am running a marathon in November')).toEqual([
      'Running a marathon in November',
    ]);
    expect(extractUserFacts('I have a cat')).toEqual(['Has a cat']);
    expect(extractUserFacts("I'm a teacher")).toEqual(['Is a teacher']);
    expect(extractUserFacts('I prefer trains over flying')).toEqual(['Prefers trains over flying']);
    expect(extractUserFacts('my name is Alex')).toEqual(['Name is Alex']);
  });

  it('ignores questions, commands, and small talk (no noise)', () => {
    expect(extractUserFacts('what am I doing in November?')).toEqual([]);
    expect(extractUserFacts('show me a chart of sales')).toEqual([]);
    expect(extractUserFacts('thanks, that was helpful')).toEqual([]);
    expect(extractUserFacts('')).toEqual([]);
  });
});

describe('memory end-to-end (capture → store → recall across sessions)', () => {
  it('a concept written one turn becomes context in the next', () => {
    mergeNodes([{ concept: 'profile', body: 'Running a marathon in November.' }]);
    expect(getMemoryNodes()[0].body).toContain('marathon');

    const recall = buildMemoryContext(getMemoryNodes());
    expect(recall).toContain('marathon');
    expect(recall.toLowerCase()).toContain('current question');
  });

  it('upserting the same concept updates it rather than duplicating', () => {
    mergeNodes([{ concept: 'profile', body: 'Founder.' }]);
    mergeNodes([{ concept: 'profile', body: 'Founder building Mavéa, a React AI app.' }]);
    expect(getMemoryNodes()).toHaveLength(1);
    expect(getMemoryNodes()[0].body).toContain('React AI app');
  });
});
