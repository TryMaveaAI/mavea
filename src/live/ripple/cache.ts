// cache.ts — a small, device-local cache for Ripple's EXPENSIVE, repeatable model output: the course
// outline and each lesson's deep, in-depth content. Keys are content-addressed (the inputs that
// determine the answer + the model + a schema version), so a hit is always the right answer for that
// exact input — reopening the same repo/lesson is instant and FREE, never re-spending tokens on work
// already done. "Regenerate" busts a key to force a fresh build. Stored in IndexedDB (a deep lesson is
// far too big and frequent for the synchronous localStorage that `tracked.ts` uses), LRU-capped, with
// an in-memory fallback when IndexedDB is unavailable (private mode / SSR / tests). Zero deps.
import { fnv1a } from '../../lib/hash';
export { fnv1a } from '../../lib/hash';

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
/** Bumped to 2 to add the `bytes` index the size budget walks. Entries written by v1 carry no
 *  `bytes`, so IndexedDB leaves them out of that index and they count as 0 until they are rewritten
 *  or age out — the COUNT cap still bounds them meanwhile. */
const DB_VERSION = 2;
const MAX_ENTRIES = 60;
/** And a real ceiling on the space, not just the count. Once whole documents started living here a
 *  count alone stopped bounding anything: a cached answer is a few KB while a mapped 40-page paper
 *  is ~150 KB, and the per-entry guard allowed far more — 60 of those is not a number anyone would
 *  agree to give a website. This is the number to quote when asked how much room it takes. */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/** Build a cache key from the content identity, the model, and the schema version. */
export function rippleCacheKey(identity: string, model: string): string {
  return `${fnv1a(identity)}|${model}|v${CACHE_VERSION}`;
}

interface Entry<T> {
  key: string;
  value: T;
  /** Last OPENED (refreshed by cacheGet), which is the order eviction walks. */
  savedAt: number;
  /** Roughly what this entry costs, so the budget above can be enforced without reading values. */
  bytes: number;
}

/**
 * Which keys to drop so the store fits BOTH bounds, given every key in last-opened order (oldest
 * first) and what each one costs. Pure, so the rule can be checked without allocating a cache the
 * size of the real budget — and so the IndexedDB path and the in-memory fallback cannot drift into
 * two different ideas of "full".
 *
 * There is deliberately no age rule here. A document's map is keyed to its exact bytes, the exact
 * model, and a prompt version, so it cannot go stale — expiring it on a calendar would charge the
 * reader a fresh model call for an identical answer. Space and last-opened are the honest limits;
 * things that DO go stale (a web-grounded answer) carry their own TTL where they are read.
 */
export function keysToEvict(
  orderedKeys: readonly string[],
  sizeOfKey: (key: string) => number,
  maxEntries: number,
  maxBytes: number,
): string[] {
  let count = orderedKeys.length;
  let total = 0;
  for (const k of orderedKeys) total += sizeOfKey(k);
  const drop: string[] = [];
  for (const k of orderedKeys) {
    if (count <= maxEntries && total <= maxBytes) break;
    drop.push(k);
    count -= 1;
    total -= sizeOfKey(k);
  }
  return drop;
}

/** Approximate stored size. Never throws: a value that will not serialize is one the caller should
 *  not have cached, and counting it as 0 is safer than failing the write it rides on. */
function sizeOf(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

// In-memory fallback (also the test path): a plain Map with the same LRU semantics.
const mem = new Map<string, Entry<unknown>>();

function memGet<T>(key: string): T | null {
  const e = mem.get(key);
  if (!e) return null;
  e.savedAt = Date.now(); // same last-opened rule as the IndexedDB path
  return e.value as T;
}
function memPut<T>(key: string, value: T): void {
  mem.set(key, { key, value, savedAt: Date.now(), bytes: sizeOf(value) });
  // The same rule the IndexedDB path applies, so the fallback cannot grow past what the real store
  // would have allowed.
  const ordered = [...mem.values()].sort((a, b) => a.savedAt - b.savedAt).map((e) => e.key);
  for (const k of keysToEvict(
    ordered,
    (key) => mem.get(key)?.bytes ?? 0,
    MAX_ENTRIES,
    MAX_TOTAL_BYTES,
  )) {
    mem.delete(k);
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
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.objectStoreNames.contains(STORE)
          ? req.transaction?.objectStore(STORE)
          : db.createObjectStore(STORE, { keyPath: 'key' });
        if (!store) return;
        if (!store.indexNames.contains('savedAt')) store.createIndex('savedAt', 'savedAt');
        // Walked as a KEY cursor during eviction: the index key IS the size, so the whole store can
        // be totalled without reading a single (large) value.
        if (!store.indexNames.contains('bytes')) store.createIndex('bytes', 'bytes');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** The cached value for this key, or null — and mark it as just used, so eviction below means
 *  LEAST RECENTLY OPENED rather than oldest-written.
 *
 *  It mattered once whole documents started living here. `savedAt` was stamped on write and never
 *  touched again, so a paper mapped a month ago and re-opened every day counted as older than one
 *  mapped yesterday and never looked at again — and the one you actually use is the one that fell
 *  off the end. Re-mapping it is not free: on a BYOK key it is a fresh model call the reader pays
 *  for. The touch is fire-and-forget, so a read never waits on a write. Never throws. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!hasIdb()) return memGet<T>(key);
  const db = await openDb();
  if (!db) return memGet<T>(key);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const e = req.result as Entry<T> | undefined;
        resolve(e ? e.value : null);
        if (e) {
          try {
            store.put({ ...e, savedAt: Date.now() });
          } catch {
            /* a refused touch only costs this entry its place in the queue */
          }
        }
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
      tx.objectStore(STORE).put({
        key,
        value,
        savedAt: Date.now(),
        bytes: sizeOf(value),
      } satisfies Entry<T>);
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

/** Drop the LEAST RECENTLY OPENED entries until the store is under BOTH bounds — the entry count
 *  and the total size. `savedAt` is refreshed on every read (see cacheGet), so this evicts what
 *  nobody has come back to rather than what happens to be old.
 *
 *  Both passes are KEY cursors: an index cursor exposes its index key and primary key without
 *  deserializing the record, so the whole store is measured without reading one cached document.
 *  Never throws — a cache that cannot tidy itself is still a working cache. */
function evict(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      // Pass 1: size per key (the `bytes` index key IS the size).
      const sizes = new Map<string, number>();
      const sizeReq = store.index('bytes').openKeyCursor();
      sizeReq.onsuccess = () => {
        const c = sizeReq.result;
        if (c) {
          sizes.set(String(c.primaryKey), typeof c.key === 'number' ? c.key : 0);
          c.continue();
          return;
        }
        // Pass 2: keys in last-opened order, oldest first.
        const order: string[] = [];
        const orderReq = store.index('savedAt').openKeyCursor();
        orderReq.onsuccess = () => {
          const oc = orderReq.result;
          if (oc) {
            order.push(String(oc.primaryKey));
            oc.continue();
            return;
          }
          // An entry written before the `bytes` index existed contributes 0, so the count cap is
          // what retires those.
          for (const k of keysToEvict(
            order,
            (key) => sizes.get(key) ?? 0,
            MAX_ENTRIES,
            MAX_TOTAL_BYTES,
          )) {
            store.delete(k);
          }
          resolve();
        };
        orderReq.onerror = () => resolve();
      };
      sizeReq.onerror = () => resolve();
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
