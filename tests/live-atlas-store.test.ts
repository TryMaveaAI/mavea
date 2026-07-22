import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAtlas, syncFromLibrary, matchLibraryEntry, clearAtlas } from '../src/live/atlas/store';
import type { LibraryEntry } from '../src/live/library/store';
import type { ConversationSpec } from '../src/data/conversation';

// The atlas index: a light, eviction-proof record per conversation, synced from the Library.
// (a) library entries become records; (b) a re-save updates in place keeping firstSeen;
// (c) records OUTLIVE library eviction — that persistence is the feature;
// (d) matchLibraryEntry pairs a record back to a surviving entry by the normalized ask;
// (e) garbage in storage degrades to empty, never throws.

const spec = (blocks: number): ConversationSpec =>
  ({
    title: 'Budget',
    blocks: Array.from({ length: blocks }, (_, i) => ({
      id: 'b' + i,
      type: 'insight',
      props: { title: 'x', body: 'y' },
    })),
  }) as unknown as ConversationSpec;

const entry = (question: string, savedAt: number, blocks = 3): LibraryEntry => ({
  id: 'lib-' + question + savedAt,
  question,
  title: question.toUpperCase(),
  savedAt,
  lead: null,
  spec: spec(blocks),
});

beforeEach(() => {
  localStorage.clear();
  clearAtlas();
});

describe('atlas store', () => {
  it('(a) folds library entries into per-conversation records', () => {
    const n = syncFromLibrary([entry('budget plan', 1000), entry('moon sky', 2000)]);
    expect(n).toBe(2);
    const recs = getAtlas();
    expect(recs).toHaveLength(2);
    expect(recs[0].question).toBe('moon sky'); // newest save first
    expect(recs[0].blocks).toBe(3);
    expect(recs[0].firstSeen).toBe(2000);
  });

  it('(b) a re-saved ask updates in place and keeps its firstSeen', () => {
    syncFromLibrary([entry('budget plan', 1000)]);
    syncFromLibrary([entry('Budget  Plan', 5000, 7)]); // same ask, different spacing/case
    const recs = getAtlas();
    expect(recs).toHaveLength(1);
    expect(recs[0].firstSeen).toBe(1000);
    expect(recs[0].savedAt).toBe(5000);
    expect(recs[0].blocks).toBe(7);
  });

  it('(c) records survive library eviction', () => {
    syncFromLibrary([entry('budget plan', 1000), entry('moon sky', 2000)]);
    // The library evicted "budget plan" — the next sync only carries the survivor.
    syncFromLibrary([entry('moon sky', 2000)]);
    expect(getAtlas().map((r) => r.question)).toContain('budget plan');
  });

  it('(d) matchLibraryEntry pairs a record with a surviving entry, or nothing', () => {
    syncFromLibrary([entry('budget plan', 1000)]);
    const rec = getAtlas()[0];
    const live = entry('BUDGET PLAN', 9000);
    expect(matchLibraryEntry(rec, [live])).toBe(live);
    expect(matchLibraryEntry(rec, [])).toBeUndefined();
  });

  it('(e) garbage in storage degrades to empty (fresh module, no cache)', async () => {
    localStorage.setItem('mavea-live-atlas-v1', '{not json');
    vi.resetModules();
    const fresh = await import('../src/live/atlas/store');
    expect(fresh.getAtlas()).toEqual([]);
    expect(fresh.syncFromLibrary([])).toBe(0);
  });
});
