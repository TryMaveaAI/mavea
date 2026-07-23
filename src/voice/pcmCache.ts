// pcmCache.ts — a small LRU for synthesized speech, keyed by exactly what shaped the audio
// (voice, speed, text). Two things fill it: a finished streamed line, so a replayed moment or a
// re-asked question speaks instantly with zero re-synthesis; and the one-ahead prefetch, which
// hides a tour stop's synthesis latency behind the previous line's playback. Byte-capped so a
// marathon session can never grow it without bound. Pure and dependency-free; never throws.

/** Total cache budget — ~2.8 minutes of 24 kHz 16-bit mono, plenty for a session's hot lines. */
export const PCM_CACHE_MAX_BYTES = 8 * 1024 * 1024;
/** A single clip past ~40s is a monologue, not a hot line — caching it would evict everything
 *  else for audio that will never repeat. */
export const PCM_CACHE_MAX_CLIP_BYTES = 2 * 1024 * 1024;

// Map iterates in insertion order, so re-inserting on every hit makes the first key the
// least-recently-used — the standard Map-as-LRU idiom.
const store = new Map<string, Uint8Array>();
let totalBytes = 0;

/** The identity of one synthesized clip. Voice and speed are baked into the audio itself, so
 *  they belong in the key — a speed change mid-session simply misses and re-synthesizes. */
export function pcmCacheKey(voice: string, speed: number, text: string): string {
  return `${voice}::${speed}::${text}`;
}

/** The cached PCM for a key, refreshing its recency; null on a miss. */
export function pcmCacheGet(key: string): Uint8Array | null {
  const bytes = store.get(key);
  if (!bytes) return null;
  store.delete(key);
  store.set(key, bytes);
  return bytes;
}

export function pcmCacheHas(key: string): boolean {
  return store.has(key);
}

/** Cache one clip, evicting least-recently-used entries until it fits. Oversized clips are
 *  skipped rather than admitted (one monologue must not flush the whole cache). */
export function pcmCachePut(key: string, bytes: Uint8Array): void {
  if (bytes.length === 0 || bytes.length > PCM_CACHE_MAX_CLIP_BYTES) return;
  const prior = store.get(key);
  if (prior) {
    store.delete(key);
    totalBytes -= prior.length;
  }
  while (totalBytes + bytes.length > PCM_CACHE_MAX_BYTES && store.size > 0) {
    const oldest = store.keys().next().value as string;
    totalBytes -= (store.get(oldest) as Uint8Array).length;
    store.delete(oldest);
  }
  store.set(key, bytes);
  totalBytes += bytes.length;
}

/** Bytes currently held (tests + diagnostics). */
export function pcmCacheBytes(): number {
  return totalBytes;
}

/** Drop everything (tests). */
export function pcmCacheClear(): void {
  store.clear();
  totalBytes = 0;
}
