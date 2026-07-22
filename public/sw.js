// Retirement worker for releases that previously registered Mavéa's cache-first service worker.
//
// The old worker duplicated the browser's HTTP cache, retained obsolete content-hashed chunks, and
// could keep same-URL fonts stale. Fingerprinted /assets/* files now use the normal one-year
// immutable HTTP cache instead. Keep this tiny tombstone at /sw.js for at least one public release:
// an already-installed worker's update check can activate it, clear the old caches, and unregister.
const MAVEA_CACHE_PREFIX = 'mavea-static-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(MAVEA_CACHE_PREFIX))
              .map((key) => caches.delete(key)),
          ),
        ),
      self.registration.unregister(),
    ]),
  );
});

// Deliberately no fetch handler: every request follows the audited HTTP cache and edge policy.
