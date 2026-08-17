// observationStore.ts — fetched readings, one record per reading, in IndexedDB.
//
// Everything else a dashboard owns lives in ONE encrypted localStorage blob that is decrypted,
// mutated and re-encrypted in full on every write. That is tolerable for a board's definition — a
// deliberate artifact the user edits occasionally — and wrong for observations, which are the
// highest-frequency write in the product: every metric of every due tracker, every check. The
// existing store already carries generation counters, quota canaries and a whole "one persist per
// batch" optimisation whose entire purpose is to make that blob rewrite less often. That is the
// storage primitive telling you it is the wrong shape for this data.
//
// So a reading is its own record, written on its own, keyed by tracker. Nothing else is rewritten
// when a price moves.
//
// Two deliberate limits:
//  · This is HISTORY, not the value a card shows. The current value stays on the MetricSpec in the
//    main store, so nothing on screen depends on an async read completing — a tile renders from
//    memory exactly as before, and this file can be unavailable (private mode, blocked storage)
//    without the product losing a feature it had.
//  · Records are capped per tracker. A 15-minute cadence left running for a month is ~3k readings;
//    a sparkline needs the last few dozen.
//
// The reading itself is ENCRYPTED at rest, with the same content key the dashboards blob uses. A
// reading is the fetched value of a tracked metric — the CFO-reviewing-their-own-numbers case the
// main store encrypts for — so storing it in the clear here would have quietly weakened the
// product's stated posture by moving the same class of data to a laxer home. Only the routing
// fields (which tracker, when) stay readable, because the indexes have to sort on them.
import { decryptContent, encryptContent } from '../contentVault';
import type { ObservationData } from './observation';

const DB_NAME = 'mavea-dashboards';
const STORE = 'observations';
const DB_VERSION = 1;
/** Readings kept per tracker — comfortably more than any sparkline reads, bounded for a tab left
 *  open for weeks. Trimmed on write, so the cap costs one extra cursor pass per save, not a sweep. */
const PER_TRACKER_CAP = 200;

export interface StoredObservation {
  /** `${dashboardId}:${targetId}:${observedAt}` — unique, and sorts by time within a target. */
  id: string;
  dashboardId: string;
  targetId: string;
  observedAt: number;
  data: ObservationData;
  /** Hosts this reading grounded against, for a per-value receipt. */
  receipts?: string[];
}

/** What actually goes on disk: routing in the clear (the indexes sort on it), payload encrypted. */
interface StoredRow {
  id: string;
  dashboardId: string;
  targetId: string;
  observedAt: number;
  /** Ciphertext of `{ data, receipts }` — or plain JSON where Web Crypto is unavailable, the same
   *  documented fallback contentVault makes for every other content store. */
  payload: string;
}

function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // Read paths are always "this tracker's readings, newest first" — index the pair rather
        // than scanning every record the database holds.
        store.createIndex('byTarget', ['dashboardId', 'targetId', 'observedAt']);
        store.createIndex('byDashboard', 'dashboardId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
  // A failed open must not poison every later call — clear the memo so a retry can succeed.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
  });
}

/**
 * Save one reading. Never throws: observation history is a bonus on top of the value the card
 * already shows from the main store, so a browser that refuses IndexedDB (private mode, blocked
 * storage, a quota wall) loses history and nothing else.
 */
export async function saveObservation(
  dashboardId: string,
  targetId: string,
  data: ObservationData,
  observedAt = Date.now(),
  receipts?: string[],
): Promise<void> {
  if (!available()) return;
  try {
    const payload = await encryptContent({
      data,
      ...(receipts?.length ? { receipts } : {}),
    });
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const record: StoredRow = {
      id: `${dashboardId}:${targetId}:${observedAt}`,
      dashboardId,
      targetId,
      observedAt,
      payload,
    };
    store.put(record);
    await txDone(tx);
    await trim(dashboardId, targetId);
  } catch {
    /* history is best-effort by design — see the note above */
  }
}

/** Drop the oldest readings past the cap for one target. */
async function trim(dashboardId: string, targetId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const index = tx.objectStore(STORE).index('byTarget');
    const range = IDBKeyRange.bound([dashboardId, targetId, 0], [dashboardId, targetId, Infinity]);
    const keys: IDBValidKey[] = [];
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openKeyCursor(range, 'next'); // oldest first
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        keys.push(c.primaryKey);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error ?? new Error('cursor failed'));
    });
    const excess = keys.length - PER_TRACKER_CAP;
    if (excess > 0) {
      const store = tx.objectStore(STORE);
      for (const key of keys.slice(0, excess)) store.delete(key);
    }
    await txDone(tx);
  } catch {
    /* a failed trim leaves extra history, which is harmless */
  }
}

/** A target's readings, oldest first (the order a sparkline plots). Empty when unavailable. */
export async function observationsFor(
  dashboardId: string,
  targetId: string,
  limit = 60,
): Promise<StoredObservation[]> {
  if (!available()) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('byTarget');
    const range = IDBKeyRange.bound([dashboardId, targetId, 0], [dashboardId, targetId, Infinity]);
    const rows: StoredRow[] = [];
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openCursor(range, 'prev'); // newest first, so `limit` takes the latest
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c || rows.length >= limit) return resolve();
        rows.push(c.value as StoredRow);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error ?? new Error('cursor failed'));
    });
    const out: StoredObservation[] = [];
    for (const row of rows.reverse()) {
      // A row whose payload cannot be decrypted (this device's content key was rotated or cleared)
      // is skipped, not surfaced as an empty reading — history simply starts from what survives.
      const decoded = await decryptContent(row.payload).catch(() => null);
      if (!decoded || typeof decoded !== 'object') continue;
      const { data, receipts } = decoded as { data?: ObservationData; receipts?: string[] };
      if (!data) continue;
      out.push({
        id: row.id,
        dashboardId: row.dashboardId,
        targetId: row.targetId,
        observedAt: row.observedAt,
        data,
        ...(receipts?.length ? { receipts } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Delete every reading for a dashboard — called when the dashboard is, so history cannot outlive
 *  the tracker it describes (the same rule the open-history and flight recorder follow). */
export async function clearObservations(dashboardId: string): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const index = tx.objectStore(STORE).index('byDashboard');
    const store = tx.objectStore(STORE);
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openKeyCursor(IDBKeyRange.only(dashboardId));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        store.delete(c.primaryKey);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error ?? new Error('cursor failed'));
    });
    await txDone(tx);
  } catch {
    /* best effort */
  }
}
