// live-backup.test.ts — the whole-install backup must round-trip DECRYPTED state with full fidelity
// (ids, timestamps, and — the key regression a wrong seam would cause — flashcard SM-2 scheduling),
// MERGE without ever deleting existing data, reject junk files cleanly, and NEVER carry an API key.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, importBackup, CURRENT_VERSION } from '../src/live/backup/backup';
import { getDashboards, invalidate } from '../src/live/dashboards/store';
import { getAllCards, __resetSrsCacheForTests } from '../src/live/srs/store';
import { getMemoryNodes, forgetAll } from '../src/live/memory/store';
import { clearLibrary } from '../src/live/library/store';
import { clearAtlas } from '../src/live/atlas/store';
import { __resetCourseCacheForTests } from '../src/live/course/store';
import { getLiveConfigV2, setLiveConfigV2 } from '../src/live/useLiveConfig';

function resetAll(): void {
  localStorage.clear();
  invalidate();
  __resetSrsCacheForTests();
  forgetAll();
  clearLibrary();
  clearAtlas();
  __resetCourseCacheForTests();
}

const card = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  front: 'Q',
  back: 'A',
  deck: 'D',
  tags: [],
  origin: 'manual',
  interval: 10,
  easeFactor: 2.8,
  reps: 4,
  lapses: 1,
  nextReview: 5_000_000,
  addedAt: 1000,
  ...over,
});

const bundle = (over: Record<string, unknown> = {}) => ({
  app: 'mavea',
  kind: 'backup',
  version: CURRENT_VERSION,
  exportedAt: 123,
  data: {
    dashboards: [{ id: 'd-keep', title: 'Keep', updatedAt: 100 }],
    memory: [{ id: 'n1', concept: 'testing', body: 'a stored fact', updatedAt: 200, uses: 5 }],
    flashcards: [card()],
    ...over,
  },
});

beforeEach(resetAll);
afterEach(resetAll);

describe('importBackup — fidelity', () => {
  it('restores dashboards, memory provenance, and flashcard SM-2 scheduling verbatim', () => {
    const summary = importBackup(JSON.stringify(bundle()));
    expect(summary).toMatchObject({ dashboards: 1, memory: 1, flashcards: 1 });

    const d = getDashboards().find((x) => x.id === 'd-keep');
    expect(d?.updatedAt).toBe(100);

    const n = getMemoryNodes().find((x) => x.id === 'n1');
    expect(n?.uses).toBe(5); // provenance preserved (not reset by a lossy setter)

    const c = getAllCards().find((x) => x.id === 'c1');
    expect(c).toMatchObject({
      interval: 10,
      easeFactor: 2.8,
      reps: 4,
      lapses: 1,
      nextReview: 5_000_000,
    });
  });

  it('round-trips through buildBackup → importBackup', () => {
    importBackup(JSON.stringify(bundle()));
    const snapshot = buildBackup();
    resetAll();
    importBackup(JSON.stringify(snapshot));
    expect(getAllCards().find((x) => x.id === 'c1')?.easeFactor).toBe(2.8);
    expect(getDashboards().some((x) => x.id === 'd-keep')).toBe(true);
  });
});

describe('importBackup — merge never deletes', () => {
  it('keeps existing items a later bundle does not carry', () => {
    importBackup(JSON.stringify(bundle()));
    // A second bundle with a DIFFERENT card and no dashboards/memory.
    importBackup(
      JSON.stringify(
        bundle({
          dashboards: [],
          memory: [],
          flashcards: [card({ id: 'c2', front: 'Q2', back: 'A2' })],
        }),
      ),
    );
    const ids = getAllCards().map((c) => c.id);
    expect(ids).toContain('c1'); // untouched by the second import
    expect(ids).toContain('c2');
    expect(getDashboards().some((x) => x.id === 'd-keep')).toBe(true); // not erased
  });

  it('newer updatedAt wins on an id collision (a stale backup cannot roll back)', () => {
    importBackup(
      JSON.stringify(bundle({ dashboards: [{ id: 'd1', title: 'New', updatedAt: 500 }] })),
    );
    importBackup(
      JSON.stringify(bundle({ dashboards: [{ id: 'd1', title: 'Stale', updatedAt: 100 }] })),
    );
    expect(getDashboards().find((x) => x.id === 'd1')?.title).toBe('New');
  });
});

describe('importBackup — safety', () => {
  it('rejects unparseable JSON with a friendly error', () => {
    expect(() => importBackup('not json {')).toThrow(/valid JSON|backup/i);
  });

  it('rejects a file that is not a Mavéa backup', () => {
    expect(() => importBackup(JSON.stringify({ hello: 'world' }))).toThrow(/Mavéa backup/i);
  });

  it('rejects an oversized string before parsing', () => {
    const huge = `{"app":"mavea","kind":"backup","version":1,"data":{}, "pad":"${'x'.repeat(30_000_000)}"}`;
    expect(() => importBackup(huge)).toThrow(/too large/i);
  });

  it('flags a newer version but still imports the sections it understands', () => {
    const summary = importBackup(JSON.stringify(bundle({})).replace('"version":1', '"version":99'));
    expect(summary.versionAhead).toBe(true);
    expect(summary.flashcards).toBe(1);
  });

  it('drops a malformed item while keeping the valid ones', () => {
    const summary = importBackup(
      JSON.stringify(bundle({ flashcards: [card(), { id: 'bad' /* no front/back */ }] })),
    );
    expect(summary.flashcards).toBe(1); // the bad one was dropped by coerceCard
  });
});

describe('backup — never carries API keys', () => {
  it('excludes keys from a built backup even when a key is remembered', () => {
    setLiveConfigV2({ rememberKey: true, keys: { anthropic: 'sk-ant-SECRET' } });
    const json = JSON.stringify(buildBackup());
    expect(json).not.toContain('sk-ant-SECRET');
  });

  it('never persists a key injected into an imported backup', () => {
    const withKey = bundle({
      settings: {
        provider: 'anthropic',
        keys: { anthropic: 'sk-ant-INJECTED' },
        rememberKey: true,
      },
    });
    importBackup(JSON.stringify(withKey));
    expect(getLiveConfigV2().keys.anthropic).toBeUndefined();
    expect(getLiveConfigV2().rememberKey).toBe(false);
  });
});
