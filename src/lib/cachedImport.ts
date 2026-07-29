// cachedImport.ts — cache a dynamic import across calls, but never cache its FAILURE.
//
// A rejected chunk fetch is very often transient: a flaky connection, a dev-server re-optimize
// swapping dep URLs mid-session, a deploy rotating asset hashes. Every module-level
// `promise ??= import(…)` cache in the app used to pin that one rejection for the life of the
// page — so a single hiccup turned "Explode", the planner, or a voice module into a feature that
// stayed broken until a full reload, and every "Try again" replayed the cached failure. Clearing
// the slot on rejection makes a retry a real retry, while concurrent callers still share one
// in-flight request and a success is still fetched exactly once.
export function cachedImport<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    cached ??= load().catch((err: unknown) => {
      cached = null;
      throw err;
    });
    return cached;
  };
}
