// The three big local stores against ONE quota, which is the situation their individual caps
// can't see: the course frame cache reserves ~2.4MB, the library ~2.9MB and the session 600KB of
// an origin's ~5MB, so on a full device the browser refuses whichever store writes LAST — and a
// store's write failure is (correctly) never allowed to break a turn, which is exactly how the
// loss used to land silently on data the user could still see. These drive real store writes
// against a storage that really does run out, and pin what gets shed: the largest store's OLDEST
// entry, through its own eviction, never a key that didn't volunteer.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { installQuotaStorage } from './helpers/quotaStorage';
import { DASHBOARDS_QUOTA_EVENT } from '../src/live/dashboards/store';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';

// Real Web Crypto would make every stored size depend on AES padding and the device key; a
// transparent stand-in keeps the ciphertext's SIZE predictable while leaving the stores' encrypted
// write path exactly as it ships (vi.mock is hoisted, so the dynamic imports below get it too).
vi.mock('../src/live/contentVault', () => ({
  encryptContent: async (value: unknown) => `ENC:${JSON.stringify(value)}`,
  decryptContent: async (blob: string) => {
    if (!blob.startsWith('ENC:')) throw new Error('not ciphertext');
    return JSON.parse(blob.slice(4));
  },
}));

const SESSION_KEY = 'mavea-live-session-v1';
const LIBRARY_KEY = 'mavea-live-library-v1';
const FRAMES_KEY = 'mavea-course-frames-v1';
/** Small enough to fill deliberately, large enough to hold several realistic canvases. */
const LIMIT = 120_000;

const storage = installQuotaStorage(LIMIT);
afterAll(() => storage.uninstall());

// Imported after the quota storage is installed: each store reads localStorage and registers its
// shedder as it loads.
const { cacheLessonFrame, __resetCourseCacheForTests } = await import('../src/live/course/store');
const { saveSession, clearSession } = await import('../src/live/session/store');
const { saveCanvas, clearLibrary } = await import('../src/live/library/store');
const { writeLocal } = await import('../src/lib/localBudget');

/** Let the stores' encrypted writes (and any shed they trigger) settle — no fake timers, no
 *  arbitrary delay: one macrotask drains every microtask the write chain queues. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function spec(title: string, pad: number): ConversationSpec {
  const blocks: Block[] = [
    { type: 'insight', id: 'i1', col: 12, props: { title, summary: 'x'.repeat(pad) } } as Block,
  ];
  return {
    id: title,
    workspace: 'W',
    title,
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

function frame(question: string, at: number, pad: number): TurnFrame {
  return {
    question,
    narration: 'n'.repeat(pad),
    mode: 'replace',
    tour: [],
    spec: spec(question, 0),
    at,
  };
}

function history(...asks: string[]): ChatMessage[] {
  return asks.flatMap((q): ChatMessage[] => [
    { role: 'user', content: q },
    { role: 'assistant', content: 'ok' },
  ]);
}

function stored<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw.slice(4)) as T) : null;
}

/** The cached lesson ids on disk, oldest first — the order the cache itself evicts in. */
function cachedLessonIds(): string[] {
  const raw = localStorage.getItem(FRAMES_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { entries: { lessonId: string }[] };
  return parsed.entries.map((e) => e.lessonId);
}

async function seedLessonFrames(count: number, pad: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    cacheLessonFrame('course-1', `lesson-${i}`, frame(`Lesson ${i}`, 1_000 + i, pad));
  }
  await flush();
}

beforeEach(async () => {
  clearSession();
  clearLibrary();
  __resetCourseCacheForTests();
  await flush(); // the clears write too — let them land before wiping
  localStorage.clear();
});

describe('one quota, three stores', () => {
  it('sheds the largest store (cached lessons) so a saved canvas still lands', async () => {
    await seedLessonFrames(4, 20_000);
    localStorage.setItem('mavea-key-vault', 'k'.repeat(4_000)); // Mavéa's, but no shedder
    localStorage.setItem('theme', 'dark'); // not Mavéa's at all
    const before = cachedLessonIds();
    expect(before).toHaveLength(4);

    saveCanvas(spec('Big canvas', 40_000), 'the big one');
    await flush();

    const library = stored<{ question: string }[]>(LIBRARY_KEY);
    expect(library?.[0]?.question).toBe('the big one'); // the write that hit the quota landed

    const after = cachedLessonIds();
    expect(after.length).toBeLessThan(before.length);
    expect(after).toEqual(before.slice(before.length - after.length)); // oldest lessons went first

    expect(localStorage.getItem('mavea-key-vault')).toHaveLength(4_000);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('sheds the session from its oldest turn, keeping the latest canvas', async () => {
    saveSession(
      history('First', 'Second', 'Third'),
      [frame('First', 1, 15_000), frame('Second', 2, 15_000), frame('Third', 3, 15_000)],
      Date.now(),
    );
    await flush();
    localStorage.setItem('mavea-key-vault', 'k'.repeat(4_000));

    // Stands in for any other Mavéa store writing last on a nearly-full device.
    const landed = await writeLocal('mavea-dashboards-v1', 'd'.repeat(80_000));

    expect(landed).toBe(true);
    const session = stored<{ frames: { question: string }[] }>(SESSION_KEY);
    expect(session?.frames.map((f) => f.question)).toEqual(['Second', 'Third']);
  });

  // Dashboards are the user's own work, so they are a BENEFICIARY of shedding, never a victim of
  // it — and a write the ledger rescues must not tell the user their board was dropped.
  it('rescues a dashboard write by shedding a cache, and stays silent when it lands', async () => {
    await seedLessonFrames(4, 20_000);
    const heard: string[] = [];
    window.addEventListener(DASHBOARDS_QUOTA_EVENT, () => heard.push('quota'));
    const before = cachedLessonIds();

    const landed = await writeLocal('mavea-dashboards-v1', 'd'.repeat(80_000));

    expect(landed).toBe(true);
    expect(cachedLessonIds().length).toBeLessThan(before.length); // a cache paid for the room
    expect(heard).toEqual([]); // …and nobody was told anything was lost, because nothing was
    expect(localStorage.getItem('mavea-dashboards-v1')).toHaveLength(80_000);
  });

  it('sheds the library from its oldest canvas, keeping the newest', async () => {
    saveCanvas(spec('One', 15_000), 'first question');
    saveCanvas(spec('Two', 15_000), 'second question');
    saveCanvas(spec('Three', 15_000), 'third question');
    await flush();
    localStorage.setItem('mavea-key-vault', 'k'.repeat(4_000));

    const landed = await writeLocal('mavea-dashboards-v1', 'd'.repeat(80_000));

    expect(landed).toBe(true);
    const library = stored<{ question: string }[]>(LIBRARY_KEY);
    expect(library?.map((e) => e.question)).toEqual(['third question', 'second question']);
  });

  it('gives up rather than emptying a store — and never touches what nobody volunteered', async () => {
    await seedLessonFrames(2, 20_000);
    saveSession(
      history('First', 'Second', 'Third'),
      [frame('First', 1, 8_000), frame('Second', 2, 8_000), frame('Third', 3, 8_000)],
      Date.now(),
    );
    saveCanvas(spec('One', 10_000), 'first question');
    saveCanvas(spec('Two', 10_000), 'second question');
    localStorage.setItem('mavea-key-vault', 'k'.repeat(4_000));
    localStorage.setItem('theme', 'dark');
    await flush();

    // Bigger than the whole quota once the un-sheddable keys are counted: no amount of shedding
    // can make room, so the write must fail rather than strip-mine every store to try.
    const landed = await writeLocal('mavea-dashboards-v1', 'd'.repeat(119_000));

    expect(landed).toBe(false);
    expect(localStorage.getItem('mavea-dashboards-v1')).toBeNull();
    expect(localStorage.getItem('mavea-key-vault')).toHaveLength(4_000);
    expect(localStorage.getItem('theme')).toBe('dark');
    // The floors hold: a store gives up its oldest, never the user's last turn or last canvas.
    expect(stored<{ frames: unknown[] }>(SESSION_KEY)?.frames).toHaveLength(1);
    expect(stored<unknown[]>(LIBRARY_KEY)).toHaveLength(1);
  });
});
