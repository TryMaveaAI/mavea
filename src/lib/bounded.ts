// bounded — race a promise against a deadline without ever leaking the deadline's timer.
//
// Shared by every "wait, but never hang" seam: the export rasterizer waiting for figures to
// settle, and the reveal walk waiting on audio/chunk readiness. Both need the same contract —
// a wait that degrades to "proceed with what we have" instead of stalling the experience on a
// slow machine or a dead resource.

/** Race a promise against a timeout that resolves to undefined; always clears its timer. */
export async function bounded<T>(p: Promise<T>, ms: number): Promise<T | void> {
  let id: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<void>((resolve) => {
        id = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    if (id !== undefined) clearTimeout(id);
  }
}
