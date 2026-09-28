// "Forget everything on this device": one sweep over every place Mavéa keeps anything in this
// browser. Removing the saved keys alone is not enough — their ciphertext may already sit in a
// disk backup, and as long as the device key that sealed it survives in IndexedDB that backup can
// be read again. So the vault database goes too, along with every store, cache and scratch file,
// and the page is then reloaded from the landing so no module state outlives the wipe.
//
// Every step is independent: an API a browser lacks, a database another tab still holds open, a
// storage wall in private mode — each is reported by name and never stops the steps after it.
//
// Ownership is decided by NAME, with the one rule every Mavéa store already follows (the `mavea`
// prefix, `isMaveaStoreKey`): a key, a cache or a scratch file that carries it is swept, anything
// else on the origin is left alone. That is also why this module imports no store — pulling the
// clip or dashboard modules in here would split them out of the chunks that load them today.
import { DEVICE_FORGOTTEN_CHANNEL, forgetVaultKeys } from './keyVault';
import { resetLiveConfig } from './useLiveConfig';
import { forgetReadiness } from './providers/readiness';
import { isMaveaStoreKey } from '../lib/localBudget';

/** Every IndexedDB database the app opens, by the names their modules export (a test pins the
 *  two lists together, and fails on a module that opens a database not named here). The vault
 *  and the Ripple cache close after every operation; the dashboards store holds its connection
 *  and lets go on `versionchange`, which a delete fires at every open connection first. */
export const FORGOTTEN_DATABASES: readonly string[] = [
  'mavea-key-vault',
  'mavea-ripple',
  'mavea-dashboards',
];

/** Keys an older build wrote without the `mavea` prefix, which the name rule cannot find. The
 *  app still reads them (so nobody sees a first-run moment twice), so they are swept by name; a
 *  test fails on any unprefixed key the app reads that is missing here. */
export const LEGACY_UNPREFIXED_KEYS: readonly string[] = [
  'ripple.seenWorkedExample',
  'ripple.hint.fastModel.dismissed',
];

/** How long a database deletion may wait on another tab's open connection before it is reported
 *  as failed rather than left hanging the whole sweep. */
const DELETE_DB_TIMEOUT_MS = 5_000;

export interface ForgetDeviceSummary {
  /** Steps that did not complete, named for the reader (`indexedDB:mavea-key-vault`, `caches`…). */
  failed: string[];
}

/** A storage a browser walls off (a sandboxed frame, some private modes) throws on the accessor
 *  itself. That is nothing to remove, not a failed step: reporting it as failed would keep the
 *  page here telling the reader to close other tabs, and a retry would fail the same way. */
function storageOrNone(read: () => Storage): Storage | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function clearMaveaKeys(storage: Storage | undefined): void {
  if (!storage) return;
  const owned: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && (isMaveaStoreKey(key) || LEGACY_UNPREFIXED_KEYS.includes(key))) owned.push(key);
  }
  for (const key of owned) storage.removeItem(key);
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    const timer = setTimeout(
      () => reject(new Error('another tab is still holding the database open')),
      DELETE_DB_TIMEOUT_MS,
    );
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error ?? new Error('indexedDB delete failed'));
    };
  });
}

async function clearMaveaCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = (await caches.keys()).filter(isMaveaStoreKey);
  await Promise.all(names.map((name) => caches.delete(name)));
}

/** The origin-private file system holds the video export's scratch files (`mavea-video-…`, see
 *  clip/storage.ts). Bounded by name like everything else: a dev origin is shared with whatever
 *  else was ever served on that port. */
async function clearMaveaFiles(): Promise<void> {
  const storage = (typeof navigator === 'undefined' ? undefined : navigator.storage) as
    (StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }) | undefined;
  if (!storage?.getDirectory) return;
  const root = await storage.getDirectory();
  const owned: string[] = [];
  for await (const name of root.keys()) if (isMaveaStoreKey(name)) owned.push(name);
  // Every file gets its turn: one locked mid-write must not leave the ones after it behind.
  const results = await Promise.allSettled(
    owned.map((name) => root.removeEntry(name, { recursive: true })),
  );
  if (results.some((r) => r.status === 'rejected')) throw new Error('a scratch file is in use');
}

/** Other tabs of this origin still hold the keys in memory and would write them back to disk on
 *  their next settings change. Tell them; `useLiveConfig` answers by forgetting and reloading. */
function announceForgotten(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(DEVICE_FORGOTTEN_CHANNEL);
  channel.postMessage('forgotten');
  channel.close();
}

/** Wipe everything Mavéa holds in this browser. Resolves with the steps that failed; the caller
 *  decides what to tell the reader and reloads the page. */
export async function forgetDevice(): Promise<ForgetDeviceSummary> {
  const failed: string[] = [];
  const attempt = async (step: string, run: () => void | Promise<void>): Promise<void> => {
    try {
      await run();
    } catch {
      failed.push(step);
    }
  };

  // In-memory secrets first: the reload below ends them anyway, but a step that fails must not
  // leave a live key behind while the reader reads about it.
  await attempt('secrets', () => {
    forgetVaultKeys();
    resetLiveConfig();
    // Which key and model passed a paid readiness check is knowledge about a forgotten key.
    forgetReadiness();
  });
  // Before the stores go, not after: removing the legal acknowledgement below puts the gate up in
  // every other tab, which unmounts the surface holding the listener — the message would arrive
  // to nobody, and that tab's memory still has the keys.
  await attempt('tabs', announceForgotten);
  await attempt('localStorage', () => clearMaveaKeys(storageOrNone(() => localStorage)));
  await attempt('sessionStorage', () => clearMaveaKeys(storageOrNone(() => sessionStorage)));
  await attempt('indexedDB', async () => {
    if (typeof indexedDB === 'undefined') return;
    // Deletions run together (each is its own step) rather than one after another, so a database
    // that waits on another tab costs the sweep one timeout, not one per database.
    await Promise.all(
      FORGOTTEN_DATABASES.map((name) => attempt(`indexedDB:${name}`, () => deleteDatabase(name))),
    );
  });
  await attempt('caches', clearMaveaCaches);
  await attempt('files', clearMaveaFiles);
  return { failed };
}

/** Leave for the landing with a full document load, so no module state — a resolved key, a
 *  hydrated config, a cached renderer — outlives the sweep. A replace, not an assign: the page
 *  that held the secrets should not be one Back away. */
export function reloadToLanding(): void {
  window.location.replace(window.location.pathname);
}
