// cache.ts — remembering a document's exploded map, so re-opening one is instant and free.
//
// Prism holds its map in component state, and PrismOverlay is mounted only while a document is
// open. Closing it unmounted the hook and threw everything away, so stepping back in re-extracted
// the file and re-ran the model from scratch — the deep map call plus the same-document compare,
// each up to 8192 output tokens, billed to the reader's own key for an answer already computed.
//
// The map is a pure function of (these exact bytes, this model, this prompt), so it is safe to
// content-address. Stored through the shared device-local store the answer cache already uses
// (ripple/cache: IndexedDB, LRU-capped, in-memory fallback, never throws) — NOT localStorage, so
// none of this competes for the ~5MB budget lib/localBudget governs.
import { cacheGet, cachePut, fnv1a } from '../ripple/cache';
import type { Attachment } from '../attachments';
import type { ModelConfig } from '../../types/mavea';
import type { PrismSpec } from './types';
import type { CorpusSpec } from './synthesis/types';

/** Bump when the mapping PROMPT or the cached shape changes materially, so a map built by an older
 *  build misses cleanly instead of being served against new expectations. v1: first version. */
export const PRISM_CACHE_VERSION = 1;

/** Namespaces, so the two shapes below can never be read as each other. */
const PRISM_NS = 'prism-map';
const SYNTHESIS_NS = 'prism-corpus';

/** How much of a base64 payload feeds the fingerprint. The Live composer encodes even a 40MB PDF
 *  to base64 up front, and hashing ~54M characters on the main thread to open a document would
 *  cost more than the model call it saves. Exact byte size + name + type already pin the file
 *  hard; sampling head, middle and tail is what separates two files that happen to agree on all
 *  three, and it is O(1) rather than O(size). */
const SAMPLE = 4096;

/** A bounded fingerprint of an in-memory payload — see SAMPLE. */
function sampleHash(data: string): string {
  if (data.length <= SAMPLE * 3) return fnv1a(data);
  const mid = Math.floor((data.length - SAMPLE) / 2);
  return fnv1a(data.slice(0, SAMPLE) + data.slice(mid, mid + SAMPLE) + data.slice(-SAMPLE));
}

/** One document's identity: everything that decides what the model would read from it. A
 *  File-backed attachment carries `lastModified`, which catches a file edited in place under the
 *  same name and size — the one case name/size/type alone would miss. */
function docIdentity(a: Attachment): string {
  const base = `${a.name}|${a.size}|${a.mime}`;
  if (a.file) return `${base}|${a.file.lastModified}`;
  return `${base}|${sampleHash(a.data)}`;
}

/** The device-local key for the map of these documents, under this model. The document ORDER is
 *  part of the key: a compare reads differently depending on which document is first. */
function docsKey(ns: string, docs: readonly Attachment[], cfg: ModelConfig): string {
  const identity = docs.map(docIdentity).join('||');
  return `${ns}:${fnv1a(identity)}|${cfg.provider}:${cfg.model}|v${PRISM_CACHE_VERSION}`;
}

/** Above this, the map is not written. A cached entry that dwarfs everything else would evict the
 *  rest of the shared store to hold one document's page text; a miss simply behaves as it always
 *  has. Measured on the serialized entry, which is dominated by `corpus`. */
const MAX_ENTRY_CHARS = 4_000_000;

/** What a settled explode is worth keeping. Both worlds are claim maps over page text, so the
 *  stored shape is the same one twice — parameterized on the spec each world renders. */
interface CachedMap<S> {
  spec: S;
  corpus: string[][] | null;
  proposed: number;
}

export type CachedPrismMap = CachedMap<PrismSpec>;

/** A settled Synthesis run — the same, plus the per-source attachments the overlay resolves a
 *  claim's origin against. */
export interface CachedSynthesisMap extends CachedMap<CorpusSpec> {
  sourcesAtt: Attachment[] | null;
}

async function read<T extends CachedMap<{ claims: unknown[] }>>(key: string): Promise<T | null> {
  const hit = await cacheGet<T>(key);
  // Validate rather than trust: an older build under the same key could have written another
  // shape, and a spec with no claims would settle the world onto an empty map.
  if (!hit?.spec?.claims?.length) return null;
  return hit;
}

async function write<T extends CachedMap<unknown>>(key: string, value: T): Promise<void> {
  try {
    if (JSON.stringify(value).length > MAX_ENTRY_CHARS) return;
  } catch {
    return; // unserializable (a File handle slipped in) — never worth failing an open over
  }
  await cachePut(key, value);
}

/** What a cached source record keeps: enough to align a claim to its file and to find that file
 *  again in memory — never the file's bytes. A map is worth remembering; the reader's document is
 *  not. Only ONE of the two attachment paths would ever have stored bytes anyway (a `File` handle
 *  and an `ArrayBuffer` both serialize to `{}`, so the standalone route was already byte-less),
 *  and on the dock path a base64 pile of three or more documents overran MAX_ENTRY_CHARS and
 *  refused the write — so the store held whole documents exactly where the cache did not work. */
function identityOnly(a: Attachment): Attachment {
  return { name: a.name, mime: a.mime, size: a.size, data: '' };
}

/** Put the live bytes back on a cached source list, so the source panel still renders the real
 *  page after a hit. Matched on the same fields `docIdentity` is built from, so a rehydrated entry
 *  is the very file that was mapped; a source the caller no longer holds stays byte-less, which
 *  the panel already handles (it reads its page text from the cached corpus, not the file). */
export function rehydrateSources(
  cached: readonly Attachment[] | null,
  live: readonly Attachment[],
): Attachment[] | null {
  if (!cached) return null;
  const byIdentity = new Map(live.map((a) => [`${a.name}|${a.size}|${a.mime}`, a]));
  return cached.map((a) => byIdentity.get(`${a.name}|${a.size}|${a.mime}`) ?? a);
}

export function prismMapKey(docs: readonly Attachment[], cfg: ModelConfig): string {
  return docsKey(PRISM_NS, docs, cfg);
}
export function synthesisMapKey(docs: readonly Attachment[], cfg: ModelConfig): string {
  return docsKey(SYNTHESIS_NS, docs, cfg);
}

export const readPrismMap = (key: string): Promise<CachedPrismMap | null> =>
  read<CachedPrismMap>(key);
export const readSynthesisMap = (key: string): Promise<CachedSynthesisMap | null> =>
  read<CachedSynthesisMap>(key);

export const writePrismMap = (key: string, value: CachedPrismMap): Promise<void> =>
  write(key, value);
export const writeSynthesisMap = (key: string, value: CachedSynthesisMap): Promise<void> =>
  write(key, { ...value, sourcesAtt: value.sourcesAtt?.map(identityOnly) ?? null });
