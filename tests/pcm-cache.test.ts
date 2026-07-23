// The synthesized-speech LRU (src/voice/pcmCache.ts): keys carry everything that shapes the
// audio, recency is refreshed on read, the byte cap evicts oldest-first, and one oversized
// monologue can never flush the hot lines.
import { afterEach, describe, expect, it } from 'vitest';
import {
  pcmCacheKey,
  pcmCacheGet,
  pcmCachePut,
  pcmCacheHas,
  pcmCacheBytes,
  pcmCacheClear,
  PCM_CACHE_MAX_BYTES,
  PCM_CACHE_MAX_CLIP_BYTES,
} from '../src/voice/pcmCache';

const bytes = (n: number, fill = 1): Uint8Array => new Uint8Array(n).fill(fill);

afterEach(() => pcmCacheClear());

describe('pcmCache', () => {
  it('keys on voice, speed, and text — a speed change is a different clip', () => {
    expect(pcmCacheKey('af_heart', 1, 'hello')).not.toBe(pcmCacheKey('af_heart', 1.25, 'hello'));
    expect(pcmCacheKey('af_heart', 1, 'hello')).not.toBe(pcmCacheKey('bm_george', 1, 'hello'));
    expect(pcmCacheKey('af_heart', 1, 'hello')).toBe(pcmCacheKey('af_heart', 1, 'hello'));
  });

  it('round-trips a clip and tracks total bytes', () => {
    pcmCachePut('a', bytes(100));
    expect(pcmCacheHas('a')).toBe(true);
    expect(pcmCacheGet('a')).toHaveLength(100);
    expect(pcmCacheBytes()).toBe(100);
    expect(pcmCacheGet('missing')).toBeNull();
  });

  it('re-putting a key replaces its bytes without double-counting', () => {
    pcmCachePut('a', bytes(100));
    pcmCachePut('a', bytes(300));
    expect(pcmCacheBytes()).toBe(300);
    expect(pcmCacheGet('a')).toHaveLength(300);
  });

  // The largest admissible clip; the total cap holds exactly MAX_BYTES / MAX_CLIP_BYTES of them,
  // so one more put must evict the least-recently-used entry.
  const clip = PCM_CACHE_MAX_CLIP_BYTES;
  const fills = Math.floor(PCM_CACHE_MAX_BYTES / clip);

  it('evicts least-recently-used until a new clip fits', () => {
    for (let i = 0; i < fills; i++) pcmCachePut(`k${i}`, bytes(clip));
    pcmCachePut('fresh', bytes(clip)); // over the cap → the oldest ('k0') is evicted
    expect(pcmCacheHas('k0')).toBe(false);
    expect(pcmCacheHas('k1')).toBe(true);
    expect(pcmCacheHas('fresh')).toBe(true);
    expect(pcmCacheBytes()).toBeLessThanOrEqual(PCM_CACHE_MAX_BYTES);
  });

  it('a read refreshes recency, so the untouched entry evicts instead', () => {
    for (let i = 0; i < fills; i++) pcmCachePut(`k${i}`, bytes(clip));
    pcmCacheGet('k0'); // 'k0' is hot again → 'k1' is now the oldest
    pcmCachePut('fresh', bytes(clip));
    expect(pcmCacheHas('k0')).toBe(true);
    expect(pcmCacheHas('k1')).toBe(false);
  });

  it('skips empty and oversized clips outright', () => {
    pcmCachePut('empty', bytes(0));
    pcmCachePut('monologue', bytes(PCM_CACHE_MAX_CLIP_BYTES + 1));
    expect(pcmCacheHas('empty')).toBe(false);
    expect(pcmCacheHas('monologue')).toBe(false);
    expect(pcmCacheBytes()).toBe(0);
  });
});
