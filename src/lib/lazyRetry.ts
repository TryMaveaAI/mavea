// lazyRetry.ts — wrap a dynamic import so a stale or dropped chunk recovers instead of crashing.
//
// A deploy that rotates asset hashes, or a flaky connection that drops the request mid-fetch,
// makes `import()` reject. React's lazy() has no retry of its own — the rejection propagates
// straight to the nearest error boundary and the surface never mounts. Reloading once picks up
// the freshly deployed chunk map; a marker that SURVIVES the reload stops a genuinely broken chunk
// from looping forever, and a successful load clears it so a later, unrelated failure still gets
// its own retry.
//
// The marker has to outlive the reload, which is the whole subtlety here: an in-memory flag is
// useless (the reload wipes it), and sessionStorage can be walled off (private mode, embedded
// webviews, storage-partitioned iframes). When storage is unavailable we fall back to a URL
// parameter — the one thing guaranteed to cross a page load. Getting this wrong doesn't degrade
// gracefully; it reload-loops the browser forever.
const RELOAD_FLAG = 'mavea-chunk-retry';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface LazyRetryDeps {
  reload?: () => void;
  storage?: StorageLike;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Has this page life already spent its one retry? */
function alreadyRetried(storage: StorageLike | null): boolean {
  if (storage) {
    try {
      return storage.getItem(RELOAD_FLAG) === '1';
    } catch {
      /* fall through to the URL marker */
    }
  }
  try {
    return new URLSearchParams(window.location.search).has(RELOAD_FLAG);
  } catch {
    // We can't tell whether we already retried. Refuse to reload rather than risk a loop: the
    // error boundary showing a "reload" button beats the browser thrashing on its own.
    return true;
  }
}

/** Record the retry so it survives the reload we're about to trigger. */
function markRetried(storage: StorageLike | null): void {
  if (storage) {
    try {
      storage.setItem(RELOAD_FLAG, '1');
      return;
    } catch {
      /* quota/denied — fall through to the URL marker */
    }
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(RELOAD_FLAG, '1');
    window.location.replace(url.toString());
  } catch {
    /* nothing left to try; the caller's reload() still runs */
  }
}

/** A load worked — give the next unrelated failure its own retry, and tidy the URL. */
function clearRetried(storage: StorageLike | null): void {
  try {
    storage?.removeItem(RELOAD_FLAG);
  } catch {
    /* best-effort */
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(RELOAD_FLAG)) {
      url.searchParams.delete(RELOAD_FLAG);
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    /* best-effort */
  }
}

export function lazyRetry<T>(
  factory: () => Promise<T>,
  deps: LazyRetryDeps = {},
): () => Promise<T> {
  const reload = deps.reload ?? (() => window.location.reload());
  return () =>
    factory()
      .then((mod) => {
        clearRetried(resolveStorage(deps.storage));
        return mod;
      })
      .catch((err: unknown) => {
        const storage = resolveStorage(deps.storage);
        if (alreadyRetried(storage)) throw err;
        markRetried(storage);
        reload();
        // The reload is async and tears the page down; never resolve so React doesn't try to
        // render with a module that failed to load.
        return new Promise<T>(() => {});
      });
}
