import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { Block, ConversationSpec } from '../src/data/conversation';

// The bug this guards against: session content is encrypted at rest (contentVault.ts), so a
// fresh page load's synchronous mount check can only ever answer "nothing here YET" while the
// async decrypt of a real prior session is still in flight. On a slow device — or right after a
// crash-triggered reload, exactly when the browser is already under load — that race can be lost:
// the app shows the wizard instead of resuming, the user asks a new question believing they're
// starting fresh, and the very first save of that "fresh" conversation must not blindly overwrite
// the still-good prior session the moment the slow decrypt finally resolves.
//
// contentVault's real Web Crypto calls are stood in for a controllable, hand-resolved promise so
// the exact interleaving (save arrives BEFORE decrypt resolves) can be driven deterministically —
// vi.mock is hoisted, so this applies to every dynamic re-import of store.ts below.
let resolveDecrypt: ((v: unknown) => void) | null = null;
vi.mock('../src/live/contentVault', () => ({
  encryptContent: async (value: unknown) => 'ENC:' + JSON.stringify(value),
  decryptContent: () =>
    new Promise((resolve) => {
      resolveDecrypt = (v: unknown) => resolve(v);
    }),
}));

const SESSION_STORAGE_KEY = 'mavea-live-session-v1';

function spec(title: string): ConversationSpec {
  const blocks: Block[] = [
    { type: 'insight', id: 'i1', col: 12, props: { title, summary: 's' } } as Block,
  ];
  return {
    id: 'x',
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

function frame(question: string, at: number): TurnFrame {
  return {
    question,
    narration: `About ${question}.`,
    mode: 'replace',
    tour: [],
    spec: spec(question),
    at,
  };
}

function history(...asks: string[]): ChatMessage[] {
  return asks.flatMap((q): ChatMessage[] => [
    { role: 'user', content: q },
    { role: 'assistant', content: `Answer to ${q}` },
  ]);
}

/** Seed localStorage with an already-encrypted "prior session" — as if written by an earlier
 *  page load, exactly what a fresh module instance finds on disk before it has decrypted it. */
function seedEncryptedSession(frames: TurnFrame[], savedAt: number): void {
  const session = { v: 1, savedAt, history: history(...frames.map((f) => f.question)), frames };
  localStorage.setItem(SESSION_STORAGE_KEY, 'ENC:' + JSON.stringify(session));
}

/** A fresh module instance, as a real page load would get — module-level `cache`/`settled` reset,
 *  and its eager `void hydrateAsync()` kicked off (racing against the mocked, hand-resolved decrypt). */
async function freshStore() {
  vi.resetModules();
  return import('../src/live/session/store');
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  localStorage.clear();
  resolveDecrypt = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('session store — the crash/slow-decrypt race', () => {
  it('a save arriving before the prior session is decrypted merges it in, not overwrites it', async () => {
    seedEncryptedSession([frame('old q1', 100), frame('old q2', 200)], 100);
    const store = await freshStore();

    // The wizard's mount check races the still-decrypting prior session and loses — exactly the
    // scenario this test simulates by never awaiting resolveDecrypt before this call.
    expect(store.loadSession(300)).toBeNull();

    // The user, believing they're starting fresh, asks one question — the very first save.
    store.saveSession(history('new q'), [frame('new q', 300)], 300);

    // The decrypt was still in flight when the save landed; only now does it resolve.
    resolveDecrypt?.({
      v: 1,
      savedAt: 100,
      history: history('old q1', 'old q2'),
      frames: [frame('old q1', 100), frame('old q2', 200)],
    });
    await flush();

    const restored = store.loadSession(300);
    expect(restored).not.toBeNull();
    // Both the abandoned prior conversation AND the new question survive, oldest first.
    expect(restored!.frames.map((f) => f.question)).toEqual(['old q1', 'old q2', 'new q']);
  });

  it('a burst of saves before the decrypt resolves merges the prior session exactly once (no loss, no duplication)', async () => {
    seedEncryptedSession([frame('old q1', 100)], 100);
    const store = await freshStore();
    expect(store.loadSession(300)).toBeNull();

    // Two saves land back to back — e.g. a turn streaming in fires the persist effect more than
    // once — before the decrypt has had a chance to resolve.
    store.saveSession(history('new q1'), [frame('new q1', 300)], 300);
    store.saveSession(
      history('new q1', 'new q2'),
      [frame('new q1', 300), frame('new q2', 310)],
      310,
    );

    resolveDecrypt?.({
      v: 1,
      savedAt: 100,
      history: history('old q1'),
      frames: [frame('old q1', 100)],
    });
    await flush();

    const restored = store.loadSession(310);
    expect(restored).not.toBeNull();
    // The old turn appears exactly once, followed by both new turns — not lost (dropped by the
    // second save undoing the first merge) and not duplicated (re-merged by every save forever).
    expect(restored!.frames.map((f) => f.question)).toEqual(['old q1', 'new q1', 'new q2']);
  });

  it('an ordinary resume (frames already include the old ones) never double-merges', async () => {
    seedEncryptedSession([frame('old q1', 100)], 100);
    const store = await freshStore();
    // Resolve the decrypt FIRST, as the common fast path does — the mount check sees it and
    // resumes normally, so the live frames array already carries the old turn forward.
    resolveDecrypt?.({
      v: 1,
      savedAt: 100,
      history: history('old q1'),
      frames: [frame('old q1', 100)],
    });
    await flush();
    expect(store.loadSession(300)!.frames.map((f) => f.question)).toEqual(['old q1']);

    store.saveSession(history('old q1', 'new q'), [frame('old q1', 100), frame('new q', 300)], 300);
    await flush();

    const restored = store.loadSession(300);
    expect(restored!.frames.map((f) => f.question)).toEqual(['old q1', 'new q']);
  });

  it('an explicit clear (deliberate fresh start) is never resurrected by a late-resolving decrypt', async () => {
    seedEncryptedSession([frame('old q1', 100)], 100);
    const store = await freshStore();
    expect(store.loadSession(300)).toBeNull();

    // A landing hand-off deliberately bypasses resuming and clears the old session outright.
    store.clearSession();

    // The slow decrypt of the now-abandoned session resolves after the clear.
    resolveDecrypt?.({
      v: 1,
      savedAt: 100,
      history: history('old q1'),
      frames: [frame('old q1', 100)],
    });
    await flush();

    store.saveSession(history('fresh q'), [frame('fresh q', 300)], 300);
    await flush();

    const restored = store.loadSession(300);
    // Only the deliberate fresh conversation is present — the cleared session never comes back.
    expect(restored!.frames.map((f) => f.question)).toEqual(['fresh q']);
  });
});

describe('session store — the settled contract (freeze regression)', () => {
  it('the very first save on a fresh device (nothing stored) persists immediately and never spins', async () => {
    // Empty storage: the eager read concludes "nothing here" synchronously at module load. The
    // regression this guards: that conclusion once failed to mark the store settled, so the
    // wait-then-retry save re-waited forever — an unbounded resolved-promise chain that starves
    // the event loop (microtasks never yield) and froze the whole tab on the first completed
    // turn of any fresh origin. If this test hangs, that loop is back.
    const store = await freshStore();
    store.saveSession(history('first q'), [frame('first q', 100)], 100);
    await flush();
    expect(store.loadSession(100)!.frames.map((f) => f.question)).toEqual(['first q']);
  });

  it('a prior session past the TTL is never resurrected into a new conversation', async () => {
    const OLD = 100;
    seedEncryptedSession([frame('ancient q', OLD)], OLD);
    const store = await freshStore();
    const NOW = OLD + 8 * 24 * 60 * 60 * 1000; // past the 7-day TTL
    expect(store.loadSession(NOW)).toBeNull();

    // The first save races the decrypt and defers; the decrypt then resolves with a session
    // loadSession itself would refuse to restore — it must not be folded into the new one.
    store.saveSession(history('new q'), [frame('new q', NOW)], NOW);
    resolveDecrypt?.({
      v: 1,
      savedAt: OLD,
      history: history('ancient q'),
      frames: [frame('ancient q', OLD)],
    });
    await flush();

    expect(store.loadSession(NOW)!.frames.map((f) => f.question)).toEqual(['new q']);
  });

  it('a clear issued while the first save still waits on the disk read wins over that save', async () => {
    seedEncryptedSession([frame('old q', 100)], 100);
    const store = await freshStore();

    store.saveSession(history('new q'), [frame('new q', 300)], 300); // defers — decrypt pending
    store.clearSession(); // the user discards the conversation before the read concludes
    resolveDecrypt?.({
      v: 1,
      savedAt: 100,
      history: history('old q'),
      frames: [frame('old q', 100)],
    });
    await flush();

    // Neither the old session nor the pre-clear save survives — the clear was the last word.
    expect(store.loadSession(300)).toBeNull();
  });
});

describe('session store — whenSessionSettled (the mount gate)', () => {
  it('resolves immediately on a fresh device, and the mount decision is still "nothing"', async () => {
    const store = await freshStore();
    await store.whenSessionSettled();
    expect(store.loadSession(100)).toBeNull();
  });

  it('holds the mount until the decrypt concludes, so resume is deterministic — not a race', async () => {
    seedEncryptedSession([frame('old q', 100)], 100);
    const store = await freshStore();

    // The route factory awaits this before LiveApp ever renders. Once it resolves, the
    // synchronous mount decision MUST see the stored conversation — on every machine.
    const gate = store.whenSessionSettled();
    resolveDecrypt?.({
      v: 1,
      savedAt: 100,
      history: history('old q'),
      frames: [frame('old q', 100)],
    });
    await gate;

    expect(store.loadSession(200)!.frames.map((f) => f.question)).toEqual(['old q']);
  });

  it('a wedged decrypt cannot hold the boot hostage — the cap releases the mount', async () => {
    seedEncryptedSession([frame('old q', 100)], 100);
    const store = await freshStore();
    // decryptContent never resolves in this test — the cap is the only way out.
    await store.whenSessionSettled(25);
    // Unsettled mount = the wizard, exactly the pre-gate behavior; the data stays on disk and
    // the foreignPrior merge still protects it from the first save.
    expect(store.loadSession(200)).toBeNull();
  });
});
