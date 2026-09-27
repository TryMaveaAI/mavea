// "Forget everything on this device" has to reach every store, and a browser missing one API
// (or refusing one database) must cost that one step, not the rest of the sweep.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetDevice, FORGOTTEN_DATABASES } from '../src/live/forgetDevice';
import { getLiveConfigV2, setLiveConfigV2 } from '../src/live/useLiveConfig';
import { KEY_VAULT_DB_NAME } from '../src/live/keyVault';
import { isVerified, sharedPaidCheck } from '../src/live/providers/readiness';
import { RIPPLE_CACHE_DB_NAME } from '../src/live/ripple/cache';
import { OBSERVATION_DB_NAME } from '../src/live/dashboards/observationStore';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface FakeDeleteRequest {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  error: null;
}

function fakeIndexedDb(deleteDatabase: (name: string) => FakeDeleteRequest) {
  return { deleteDatabase: vi.fn(deleteDatabase) };
}

function succeedingDelete(): FakeDeleteRequest {
  const req: FakeDeleteRequest = { onsuccess: null, onerror: null, error: null };
  queueMicrotask(() => req.onsuccess?.());
  return req;
}

function fakeCaches(names: string[]) {
  return { keys: vi.fn(async () => names), delete: vi.fn(async () => true) };
}

function seedStorage(): void {
  localStorage.setItem('mavea-live-v2:secrets', 'ciphertext');
  localStorage.setItem('mavea-legal-acceptance-v1', '{"accepted":true}');
  localStorage.setItem('mavea-ripple-gh-token', 'ciphertext');
  localStorage.setItem('mavea.ripple.tracked.v1', '[]');
  localStorage.setItem('maveaLegalAnchor', 'terms');
  localStorage.setItem('unrelated-app', 'keep me');
  sessionStorage.setItem('mavea-live-seed', 'a question');
  sessionStorage.setItem('other-session', 'keep me');
}

function storedKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) keys.push(storage.key(i)!);
  return keys.sort();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('forgetDevice', () => {
  it('names every database the app opens, as their modules name them', () => {
    expect([...FORGOTTEN_DATABASES].sort()).toEqual(
      [KEY_VAULT_DB_NAME, RIPPLE_CACHE_DB_NAME, OBSERVATION_DB_NAME].sort(),
    );
  });

  it('knows every module that opens a database', () => {
    // A store added later must be swept too; the names it exports have to reach the list.
    const files = execFileSync('git', ['grep', '-l', 'indexedDB.open(', '--', 'src'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const named = FORGOTTEN_DATABASES.some((name) => source.includes(`'${name}'`));
      expect(named, `${file} opens a database that forgetDevice does not delete`).toBe(true);
    }
  });

  it('treats a walled-off storage as nothing to remove, and tells the other tabs', async () => {
    const posted: string[] = [];
    class FakeChannel {
      constructor(public name: string) {}
      postMessage(message: string) {
        posted.push(`${this.name}:${message}`);
      }
      close() {}
    }
    vi.stubGlobal('indexedDB', fakeIndexedDb(succeedingDelete));
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      const summary = await forgetDevice();
      expect(summary.failed).toEqual([]);
      expect(posted).toEqual(['mavea-device-forgotten:forgotten']);
    } finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
      else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    }
  });

  it('clears every Mavéa key, every Mavéa database and cache, and leaves the rest alone', async () => {
    seedStorage();
    setLiveConfigV2({ keys: { gemini: 'sk-live-secret' }, rememberKey: true });
    const idb = fakeIndexedDb(succeedingDelete);
    const cacheStore = fakeCaches(['mavea-static-v3', 'someone-elses-cache']);
    vi.stubGlobal('indexedDB', idb);
    vi.stubGlobal('caches', cacheStore);

    const summary = await forgetDevice();

    expect(summary.failed).toEqual([]);
    expect(getLiveConfigV2().keys).toEqual({});
    expect(storedKeys(localStorage)).toEqual(['unrelated-app']);
    expect(storedKeys(sessionStorage)).toEqual(['other-session']);
    const deleted = idb.deleteDatabase.mock.calls.map(([name]) => name).sort();
    expect(deleted).toEqual(['mavea-dashboards', 'mavea-key-vault', 'mavea-ripple']);
    expect(cacheStore.delete).toHaveBeenCalledTimes(1);
    expect(cacheStore.delete).toHaveBeenCalledWith('mavea-static-v3');
  });

  it('forgets which keys passed a readiness check, including one still in flight', async () => {
    await sharedPaidCheck('passed', async () => ({ ok: true, model: true }));
    let settle!: () => void;
    const inFlight = sharedPaidCheck(
      'pending',
      () =>
        new Promise((resolve) => {
          settle = () => resolve({ ok: true, model: true });
        }),
    );
    expect(isVerified('passed')).toBe(true);
    vi.stubGlobal('indexedDB', fakeIndexedDb(succeedingDelete));

    await forgetDevice();
    settle();
    await inFlight;

    expect(isVerified('passed')).toBe(false);
    expect(isVerified('pending')).toBe(false);
  });

  it('removes its own scratch files from the origin directory and nothing else', async () => {
    const removed: string[] = [];
    const names = ['mavea-video-1700000000000-abc123.webm', 'notes.txt', 'mavea-scratch'];
    const root = {
      keys: () => names.values(),
      removeEntry: vi.fn(async (name: string) => {
        if (name === 'mavea-scratch')
          throw new DOMException('in use', 'NoModificationAllowedError');
        removed.push(name);
      }),
    };
    vi.stubGlobal('indexedDB', fakeIndexedDb(succeedingDelete));
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });

    const summary = await forgetDevice();

    // The locked file is reported, and it did not stop the file after it from going.
    expect(summary.failed).toEqual(['files']);
    expect(removed).toEqual(['mavea-video-1700000000000-abc123.webm']);
    expect(root.removeEntry).toHaveBeenCalledWith('mavea-scratch', { recursive: true });
    expect(root.removeEntry).not.toHaveBeenCalledWith('notes.txt', expect.anything());
  });

  it('reports a step that throws and still runs the ones after it', async () => {
    seedStorage();
    const idb = fakeIndexedDb(() => {
      throw new Error('indexedDB is walled off');
    });
    const cacheStore = fakeCaches(['mavea-static-v3']);
    vi.stubGlobal('indexedDB', idb);
    vi.stubGlobal('caches', cacheStore);

    const summary = await forgetDevice();

    expect(summary.failed.sort()).toEqual([
      'indexedDB:mavea-dashboards',
      'indexedDB:mavea-key-vault',
      'indexedDB:mavea-ripple',
    ]);
    expect(storedKeys(localStorage)).toEqual(['unrelated-app']);
    expect(cacheStore.delete).toHaveBeenCalledWith('mavea-static-v3');
  });

  it('reports a refused database by name while the others are still deleted', async () => {
    const idb = fakeIndexedDb((name) => {
      const req: FakeDeleteRequest = { onsuccess: null, onerror: null, error: null };
      queueMicrotask(() => (name === 'mavea-ripple' ? req.onerror?.() : req.onsuccess?.()));
      return req;
    });
    vi.stubGlobal('indexedDB', idb);
    vi.stubGlobal('caches', { keys: vi.fn(async () => Promise.reject(new Error('no caches'))) });

    const summary = await forgetDevice();

    expect(summary.failed.sort()).toEqual(['caches', 'indexedDB:mavea-ripple']);
    expect(idb.deleteDatabase).toHaveBeenCalledTimes(3);
  });

  it('treats a browser without IndexedDB or Cache Storage as nothing to remove', async () => {
    seedStorage();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('caches', undefined);

    const summary = await forgetDevice();

    expect(summary.failed).toEqual([]);
    expect(storedKeys(localStorage)).toEqual(['unrelated-app']);
  });
});
