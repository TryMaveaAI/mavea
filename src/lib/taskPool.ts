// taskPool — map over a list with a hard cap on how many promises run at once. Shared by the
// seams that fan out over per-item async work (chunk loads, prefetches) where firing everything
// simultaneously would stampede the network or the main thread. Ordered results, first failure
// rejects the whole map — an AbortSignal-driven caller unwinds instead of draining the queue.

/** Map `items` through `fn` with at most `limit` in flight; results keep input order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true; // stop the other workers pulling new items; theirs still settle
        throw err;
      }
    }
  };
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
