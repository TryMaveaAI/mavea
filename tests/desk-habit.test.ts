// The desk habit — "this reader uses the desk" — and the migration that must not lose them.
//
// Three things key off it and none is "which view is on screen": the Study's margin notes are
// PREFETCHED at settle time, the pen is generous, and the margin gutter reserves. The prefetch
// costs a model call, so the flag has to recognise exactly the readers it used to recognise —
// no more (a reader who never opened the desk must never be billed) and no fewer (a long-standing
// desk reader must not quietly lose their pre-annotated desk).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VIEW_KEY = 'mavea-view-mode';
const DESK_KEY = 'mavea-desk-first';

async function fresh() {
  vi.resetModules();
  return import('../src/live/study/deskHabit');
}

describe('deskHabit — who counts as a desk reader', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['study', 'room'])(
    'recognises a reader whose standing view was the desk (%s)',
    async (stored) => {
      localStorage.setItem(VIEW_KEY, stored);
      const m = await fresh();
      expect(m.deskFirst()).toBe(true);
    },
  );

  it.each(['everything', 'focus', 'board'])(
    'does not recognise a reader whose standing view was %s',
    async (stored) => {
      localStorage.setItem(VIEW_KEY, stored);
      const m = await fresh();
      expect(m.deskFirst()).toBe(false);
    },
  );

  it('does not recognise a reader with no stored preference at all', async () => {
    const m = await fresh();
    expect(m.deskFirst()).toBe(false);
  });

  // THE regression this file exists for. The legacy signal lives in the view key, and the very
  // first setViewMode('board') overwrites it — so recognising a desk reader on read alone (the
  // read-only shape useFocusMode uses for its own renames) would greet them once and forget them
  // the next time they changed anything.
  it('latches, so writing the view preference cannot erase a recognised desk reader', async () => {
    localStorage.setItem(VIEW_KEY, 'study');
    const m = await fresh();
    expect(m.deskFirst()).toBe(true);

    // What the app does on the reader's first view change after the upgrade.
    const view = await import('../src/canvas/focus/useFocusMode');
    view.setViewMode('board');
    expect(localStorage.getItem(VIEW_KEY)).toBe('board'); // the legacy signal is gone…

    const later = await fresh(); // …a later session, empty in-session cache
    expect(later.deskFirst()).toBe(true); // …and they are still a desk reader
  });

  it('remembers a reader who opens the desk for the first time', async () => {
    const m = await fresh();
    expect(m.deskFirst()).toBe(false);
    m.markDeskFirst();
    expect(m.deskFirst()).toBe(true);

    const later = await fresh();
    expect(later.deskFirst()).toBe(true);
  });

  it('is idempotent — marking twice writes the same habit', async () => {
    const m = await fresh();
    m.markDeskFirst();
    m.markDeskFirst();
    expect(localStorage.getItem(DESK_KEY)).toBe('yes');
  });

  it('degrades to "not a desk reader" when storage is walled off, and never throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const m = await fresh();
    expect(() => m.deskFirst()).not.toThrow();
    expect(m.deskFirst()).toBe(false);
    expect(() => m.markDeskFirst()).not.toThrow();
    // The in-session cache still holds, so the desk the reader just opened stays annotated.
    expect(m.deskFirst()).toBe(true);
  });
});

// A source scan, because both regressions below are invisible in the browser AND invisible to
// every behavioural test: nothing fails, the prefetch simply stops arming and the pen quietly
// stops being generous for the readers who had earned both.
describe('the desk habit cannot silently revert to a view comparison', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('LiveApp asks the habit, never the standing view', () => {
    const src = read('src/live/LiveApp.tsx');
    // The desk is a takeover now, so this comparison is permanently false — it would not throw,
    // it would just stop recognising every existing desk reader.
    expect(src).not.toMatch(/savedViewMode\(\)\s*===\s*['"]study['"]/);
    expect(src).toMatch(/deskFirst\(\)/);
  });

  it('the view union does not readmit a value that is now a takeover or a rename', () => {
    const src = read('src/canvas/focus/useFocusMode.ts');
    const union = /export type ViewMode =([^;]+);/.exec(src)?.[1] ?? '';
    expect(union).toContain("'board'");
    expect(union).not.toContain("'everything'");
    // Both must stay in TRANSIENT: Focus persisted once, and a reader who closed the tab
    // mid-presentation kept it as their standing view forever.
    const transient = /const TRANSIENT[^=]*=([^;]+);/.exec(src)?.[1] ?? '';
    for (const takeover of ['study', 'focus', 'canvas', 'world']) {
      expect(transient).toContain(`'${takeover}'`);
    }
  });
});
