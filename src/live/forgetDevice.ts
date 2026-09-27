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
import { forgetVaultKeys } from './keyVault';
import { resetLiveConfig } from './useLiveConfig';
import { isMaveaStoreKey } from '../lib/localBudget';

/** Every IndexedDB database the app opens, by the names their modules export (a test pins the
 *  two lists together). A database missing here survives a forget. Each store lets go of its
 *  connection on `versionchange`, which a delete fires at every open connection first. */
export const FORGOTTEN_DATABASES: readonly string[] = [
  'mavea-key-vault',
  'mavea-ripple',
  'mavea-dashboards',
];

/** How long a database deletion may wait on another tab's open connection before it is reported
 *  as failed rather than left hanging the whole sweep. */
const DELETE_DB_TIMEOUT_MS = 5_000;

export interface ForgetDeviceSummary {
  /** Steps that did not complete, named for the reader (`indexedDB:mavea-key-vault`, `caches`…). */
  failed: string[];
}

function clearMaveaKeys(storage: Storage): void {
  const owned: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && isMaveaStoreKey(key)) owned.push(key);
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
  for (const name of owned) await root.removeEntry(name, { recursive: true });
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
  });
  await attempt('localStorage', () => clearMaveaKeys(localStorage));
  await attempt('sessionStorage', () => clearMaveaKeys(sessionStorage));
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
