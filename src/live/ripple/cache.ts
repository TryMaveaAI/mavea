// cache.ts — a small, device-local cache for Ripple's EXPENSIVE, repeatable model output: the course
// outline and each lesson's deep, in-depth content. Keys are content-addressed (the inputs that
// determine the answer + the model + a schema version), so a hit is always the right answer for that
// exact input — reopening the same repo/lesson is instant and FREE, never re-spending tokens on work
// already done. "Regenerate" busts a key to force a fresh build. Stored in IndexedDB (a deep lesson is
// far too big and frequent for the synchronous localStorage that `tracked.ts` uses), LRU-capped, with
// an in-memory fallback when IndexedDB is unavailable (private mode / SSR / tests). Zero deps.

/** Bump when a cached shape or a prompt changes materially, so old entries miss cleanly. v3: the
 *  lesson key is now content-addressed (a hash of the lesson's real files, not the branch name) and
 *  the outline's stored value gained a `commitSha` field — both old shapes are incompatible with v3
 *  readers. v4: the courses prompt now asks for a real multiple-choice quiz + a capstone, and the
 *  lesson prompt's exercise gained a `check` field — old cached outlines/lessons predate both and
 *  would otherwise serve stale content missing them. v5: the outline went LIGHT — quiz + capstone
 *  left the outline for a lazy per-course "closing" call (its own cache key), so an old v4 outline
 *  carries quiz/capstone the new light outline no longer expects. */
export const CACHE_VERSION = 5;

const DB_NAME = 'mavea-ripple';
const STORE = 'analyses';
const MAX_ENTRIES = 60;

/** FNV-1a — a tiny, fast, dependency-free string hash for the content key (not cryptographic). */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Build a cache key from the content identity, the model, and the schema version. */
export function rippleCacheKey(identity: string, model: string): string {
  return `${fnv1a(identity)}|${model}|v${CACHE_VERSION}`;
}

interface Entry<T> {
  key: string;
  value: T;
  savedAt: number;
}

// In-memory fallback (also the test path): a plain Map with the same LRU semantics.
const mem = new Map<string, Entry<unknown>>();

function memGet<T>(key: string): T | null {
  return (mem.get(key)?.value as T | undefined) ?? null;
}
function memPut<T>(key: string, value: T): void {
  mem.set(key, { key, value, savedAt: Date.now() });
  if (mem.size > MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const e of mem.values()) {
      if (e.savedAt < oldest) {
        oldest = e.savedAt;
        oldestKey = e.key;
      }
    }
    if (oldestKey) mem.delete(oldestKey);
  }
}

function hasIdb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('savedAt', 'savedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** The cached value for this key, or null. Never throws. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!hasIdb()) return memGet<T>(key);
  const db = await openDb();
  if (!db) return memGet<T>(key);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const e = req.result as Entry<T> | undefined;
        resolve(e ? e.value : null);
        db.close();
      };
      req.onerror = () => {
        resolve(null);
        db.close();
      };
    } catch {
      resolve(memGet<T>(key));
    }
  });
}

/** Store a value under this key and trim to the LRU cap. Never throws. */
export async function cachePut<T>(key: string, value: T): Promise<void> {
  if (!hasIdb()) {
    memPut(key, value);
    return;
  }
  const db = await openDb();
  if (!db) {
    memPut(key, value);
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, value, savedAt: Date.now() } satisfies Entry<T>);
      tx.oncomplete = () => {
        void evict(db).finally(() => {
          resolve();
          db.close();
        });
      };
      tx.onerror = () => {
        resolve();
        db.close();
      };
    } catch {
      memPut(key, value);
      resolve();
    }
  });
}

/** Drop the oldest entries past the cap (by savedAt). */
function evict(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const over = countReq.result - MAX_ENTRIES;
        if (over <= 0) {
          resolve();
          return;
        }
        let removed = 0;
        const cursorReq = store.index('savedAt').openCursor(); // ascending → oldest first
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && removed < over) {
            cursor.delete();
            removed++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => resolve();
      };
      countReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Clear the whole Ripple cache (memory + IndexedDB). Never throws. */
export async function clearRippleCache(): Promise<void> {
  mem.clear();
  if (!hasIdb()) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => {
        resolve();
        db.close();
      };
      tx.onerror = () => {
        resolve();
        db.close();
      };
    } catch {
      resolve();
    }
  });
}
