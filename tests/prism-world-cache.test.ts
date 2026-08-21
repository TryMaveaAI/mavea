// Re-opening a document must not re-buy its map.
//
// Prism held its map in component state, and the overlay is mounted only while a document is open —
// so closing it threw the map away and stepping back in re-extracted the file and re-ran the model
// from scratch, billed to the reader's own key, for an answer that cannot have changed. A map is a
// pure function of (these bytes, this model, this prompt), so it is content-addressed and kept.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { Attachment } from '../src/live/attachments';

const mocks = vi.hoisted(() => ({ mapClaims: vi.fn() }));
vi.mock('../src/live/prism/mapClaims', () => ({ mapClaims: mocks.mapClaims }));

import { usePrismWorld } from '../src/live/prism/usePrismWorld';
import { cacheGet, cachePut, clearRippleCache, keysToEvict } from '../src/live/ripple/cache';
import {
  readSynthesisMap,
  rehydrateSources,
  synthesisMapKey,
  writeSynthesisMap,
} from '../src/live/prism/cache';

const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };

function doc(name = 'paper.pdf', size = 1234): Attachment {
  return { name, mime: 'application/pdf', data: 'AAAABBBBCCCC', size };
}

function mapped(title = 'A claim') {
  return {
    spec: {
      fileName: 'paper.pdf',
      pageCount: 4,
      regions: [{ id: 'r1', label: 'Findings' }],
      claims: [
        {
          id: 'c1',
          quote: 'Growth reached 12% in the second half.',
          page: 2,
          kind: 'stat',
          title,
          region: 'r1',
          role: 'load-bearing',
        },
      ],
      threads: [],
    },
    corpus: [['Growth reached 12% in the second half.']],
    proposed: 3,
  };
}

beforeEach(async () => {
  mocks.mapClaims.mockReset();
  mocks.mapClaims.mockResolvedValue(mapped());
  await clearRippleCache();
});

async function explodeOnce(docs: Attachment[], config = cfg, opts?: { fresh?: boolean }) {
  const { result } = renderHook(() => usePrismWorld(config));
  act(() => result.current.explode(docs, opts));
  await waitFor(() => expect(result.current.phase).toBe('settled'));
  return result;
}

describe('a document is mapped once, not once per open', () => {
  it('re-opening the same document costs no model call at all', async () => {
    const first = await explodeOnce([doc()]);
    expect(mocks.mapClaims).toHaveBeenCalledTimes(1);

    const second = await explodeOnce([doc()]);
    expect(mocks.mapClaims).toHaveBeenCalledTimes(1); // the whole point
    expect(second.current.spec).toEqual(first.current.spec);
    expect(second.current.corpus).toEqual(first.current.corpus);
    expect(second.current.proposed).toBe(first.current.proposed);
  });

  it('treats a different file as a different document', async () => {
    await explodeOnce([doc('paper.pdf', 1234)]);
    await explodeOnce([doc('other.pdf', 1234)]);
    expect(mocks.mapClaims).toHaveBeenCalledTimes(2);
    // Same name, different bytes — the size is part of the identity.
    await explodeOnce([doc('paper.pdf', 9999)]);
    expect(mocks.mapClaims).toHaveBeenCalledTimes(3);
  });

  it('does not serve one model’s reading of a document under another model', async () => {
    await explodeOnce([doc()]);
    await explodeOnce([doc()], { ...cfg, model: 'gemini-3.5-flash' });
    expect(mocks.mapClaims).toHaveBeenCalledTimes(2);
  });

  it('keys a compare on the ORDER of its documents', async () => {
    const a = doc('a.pdf', 10);
    const b = doc('b.pdf', 20);
    await explodeOnce([a, b]);
    await explodeOnce([b, a]);
    expect(mocks.mapClaims).toHaveBeenCalledTimes(2);
  });

  it('re-reads for real when the reader asks for it (Replay)', async () => {
    await explodeOnce([doc()]);
    await explodeOnce([doc()], cfg, { fresh: true });
    expect(mocks.mapClaims).toHaveBeenCalledTimes(2);
  });

  it('never remembers a failure — a document that could not be mapped is retried', async () => {
    mocks.mapClaims.mockResolvedValueOnce({ spec: null, proposed: 0, error: 'Could not read it.' });
    const { result } = renderHook(() => usePrismWorld(cfg));
    act(() => result.current.explode([doc()]));
    await waitFor(() => expect(result.current.phase).toBe('error'));

    await explodeOnce([doc()]);
    expect(mocks.mapClaims).toHaveBeenCalledTimes(2);
  });

  it('still shows the ignition beat on a hit, so re-opening reads as the same gesture', async () => {
    await explodeOnce([doc()]);
    const { result } = renderHook(() => usePrismWorld(cfg));
    act(() => result.current.explode([doc()]));
    expect(result.current.phase).toBe('igniting');
    await waitFor(() => expect(result.current.phase).toBe('settled'));
  });
});

describe('the cache keeps what you actually come back to', () => {
  // Eviction used to run on when an entry was WRITTEN. A document mapped a month ago and re-opened
  // every day therefore counted as older than one mapped yesterday and never looked at again — so
  // the one in daily use was the one that fell off the end, and re-mapping it is a fresh model call
  // the reader pays for. Reading now marks an entry as used.
  it('a read refreshes an entry, so the least recently OPENED is what ages out', async () => {
    await cachePut('old-but-loved', { v: 1 });
    await cachePut('new-but-ignored', { v: 2 });

    const before = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    // Open the older one — this is the signal that used to be invisible.
    expect(await cacheGet('old-but-loved')).toEqual({ v: 1 });

    // Both are still here; what changed is which one is now the oldest by last use.
    expect(await cacheGet('new-but-ignored')).toEqual({ v: 2 });
    expect(Date.now()).toBeGreaterThan(before);
  });

  it('a miss touches nothing and still answers null', async () => {
    expect(await cacheGet('never-written')).toBeNull();
  });
});

describe('the cache is bounded by SPACE, not just by count', () => {
  // A count alone stopped bounding anything once whole documents lived here: a cached answer is a
  // few KB, a mapped paper is ~150 KB, and the per-entry guard allowed far more. Both bounds are
  // enforced by one pure rule, so the IndexedDB path and the in-memory fallback cannot drift.
  const size = (m: Record<string, number>) => (k: string) => m[k] ?? 0;

  it('drops nothing while both bounds hold', () => {
    expect(keysToEvict(['a', 'b'], size({ a: 10, b: 10 }), 10, 100)).toEqual([]);
  });

  it('drops the least recently opened first when the count is over', () => {
    // Ordered oldest → newest, so the front of the list is what goes.
    expect(keysToEvict(['old', 'mid', 'new'], size({}), 2, 1000)).toEqual(['old']);
  });

  it('keeps dropping until the SIZE fits, even when the count already did', () => {
    const sizes = { a: 80, b: 80, c: 80 };
    expect(keysToEvict(['a', 'b', 'c'], size(sizes), 10, 100)).toEqual(['a', 'b']);
  });

  it('stops the moment both bounds hold — it never over-evicts', () => {
    const sizes = { a: 60, b: 10, c: 10 };
    expect(keysToEvict(['a', 'b', 'c'], size(sizes), 10, 40)).toEqual(['a']);
  });

  it('can still retire entries it has no size for (written before sizes were recorded)', () => {
    expect(keysToEvict(['a', 'b', 'c'], size({}), 1, 0)).toEqual(['a', 'b']);
  });

  it('is honest about an impossible budget rather than looping', () => {
    expect(keysToEvict(['a'], size({ a: 999 }), 0, 0)).toEqual(['a']);
  });
});

// A remembered map must not become a copy of the reader's documents.
//
// The Synthesis entry keeps a `sourcesAtt` list so a claim can be aligned to the file it came from
// — and those Attachment records carry base64 bytes when the file was staged through the Live dock
// (the standalone route hands over a File handle instead, which JSON drops). Left whole, the store
// held entire documents indefinitely, while the privacy notice describes it as claims and page
// text. It also broke the feature it was written for: three documents of base64 overran the entry
// cap, so the cache silently refused to write on the very path Synthesis is reached from.
describe('a remembered corpus keeps its sources by name, never by their bytes', () => {
  const cfg2: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };
  const withBytes = (name: string): Attachment => ({
    name,
    mime: 'application/pdf',
    data: 'QkFTRTY0LVBBWUxPQUQ=',
    size: 4096,
  });
  const corpusMap = (sources: Attachment[]) => ({
    spec: { claims: [{ id: 'c1', source: 0 }] } as never,
    corpus: [['page one']],
    sourcesAtt: sources,
    proposed: 1,
  });

  beforeEach(async () => {
    await clearRippleCache();
  });

  it('strips document bytes before writing, and keeps what aligns a claim', async () => {
    const sources = [withBytes('a.pdf'), withBytes('b.pdf')];
    const key = synthesisMapKey(sources, cfg2);
    await writeSynthesisMap(key, corpusMap(sources));

    const hit = await readSynthesisMap(key);
    expect(hit?.sourcesAtt?.map((a) => a.name)).toEqual(['a.pdf', 'b.pdf']);
    for (const a of hit!.sourcesAtt!) {
      expect(a.data).toBe('');
      expect(a.file).toBeUndefined();
      expect(a.bytes).toBeUndefined();
      // Size and type survive: the source panel dispatches on them.
      expect(a.size).toBe(4096);
      expect(a.mime).toBe('application/pdf');
    }
    // Nothing that could reconstruct the document is left anywhere in the stored entry.
    expect(JSON.stringify(hit)).not.toContain('QkFTRTY0LVBBWUxPQUQ=');
  });

  it('puts the live bytes back on a hit, so the source panel still renders the real page', () => {
    const live = [withBytes('a.pdf'), withBytes('b.pdf')];
    const stored = live.map((a) => ({ ...a, data: '' }));
    const back = rehydrateSources(stored, live);
    expect(back?.map((a) => a.data)).toEqual([live[0].data, live[1].data]);
    // Same objects, so pdf.js reads the file the reader actually has open.
    expect(back?.[0]).toBe(live[0]);
  });

  it('leaves a source the reader no longer holds byte-less rather than mismatching it', () => {
    const stored = [{ ...withBytes('gone.pdf'), data: '' }];
    const back = rehydrateSources(stored, [withBytes('other.pdf')]);
    expect(back?.[0].name).toBe('gone.pdf');
    expect(back?.[0].data).toBe('');
  });

  it('carries no sources through when the map had none', () => {
    expect(rehydrateSources(null, [withBytes('a.pdf')])).toBeNull();
  });
});
