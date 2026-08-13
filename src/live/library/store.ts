// store.ts — Live's Library: the canvases you actually generated, kept LOCAL to the browser so you
// can pick any one back up later. Nothing here is fabricated — each entry is a real answer you saw,
// and its card face (extractLead) is the genuine lead stat, or nothing. There is deliberately no
// "since you left" delta: a client-only BYOK app has no way to re-measure your bank or your watch in
// the background, so inventing a change would be a lie. "Live" means a real Refresh (re-asking the
// model), not passive monitoring.
//
// Mirrors the memory/useLiveConfig store idiom exactly (in-memory cache + localStorage + a
// CustomEvent so any view re-reads) — no dependency, no backend. OFF unless the user turns the
// Library on, fully user-managed, and it NEVER throws: storage failure or malformed JSON degrades
// to empty.
//
// Content at rest: a saved canvas is real conversation content, so it's encrypted on disk
// (contentVault.ts), never plaintext. Web Crypto is async-only, so reads stay a two-step dance:
// a synchronous fast path handles legacy plaintext (and the crypto-unavailable fallback) directly
// via JSON.parse and re-encrypts it once read (migrate-on-read); real ciphertext isn't valid
// JSON, so that fast path degrades to "nothing yet" and a background hydrate decrypts it and
// broadcasts the existing LIBRARY_EVENT once it lands — the same async-gap trade-off already
// shipped for BYOK secrets in useLiveConfig.ts.
import type { ConversationSpec } from '../../data/conversation';
import { extractLead, type LeadFace } from './extractLead';
import { friendlyAsk } from '../friendlyAsk';
import { encryptContent, decryptContent } from '../contentVault';

/** One saved canvas the user can resume. */
export interface LibraryEntry {
  id: string;
  /** The question that produced this canvas — the dedup key and the context we restore with. */
  question: string;
  title: string;
  /** When it was saved (epoch ms) — drives an honest "saved 2h ago", never an invented delta. */
  savedAt: number;
  /** The real headline of the canvas (stat + sparkline), or null when it has no stat. */
  lead: LeadFace | null;
  /** The full canvas to resume (heavy inline data stripped before storage). */
  spec: ConversationSpec;
  /** Semantic domain from the model (e.g. "Finance", "Biology") — drives atlas clustering. */
  topic?: string;
}

const STORAGE_KEY = 'mavea-live-library-v1';
export const LIBRARY_EVENT = STORAGE_KEY;
/** Keep the library bounded — newest canvases win once we hit the cap. */
const MAX_ENTRIES = 12;
/** Skip persisting a single monster canvas rather than blow the whole localStorage quota. */
const MAX_ENTRY_BYTES = 240_000;
/** Inline data: URIs (e.g. a generated image) above this are dropped before storage — the rest of
 *  the canvas restores fine and an image is cheap to regenerate. */
const MAX_INLINE_STRING = 4096;

let cache: LibraryEntry[] | null = null;
let idSeq = 0;

function newId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* no crypto */
  }
  idSeq += 1;
  return `lib-${idSeq.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Deep-clone a spec, dropping large inline data: URIs so one image can't fill the quota.
 *  Exported so the Atlas snapshot store can reuse the exact same data-URI rule. */
export function stripHeavy(spec: ConversationSpec): ConversationSpec {
  const json = JSON.stringify(spec, (_k, v) =>
    typeof v === 'string' && v.length > MAX_INLINE_STRING && v.startsWith('data:') ? '' : v,
  );
  return JSON.parse(json) as ConversationSpec;
}

function isSpec(v: unknown): v is ConversationSpec {
  return !!v && typeof v === 'object' && Array.isArray((v as { blocks?: unknown }).blocks);
}

function coerceEntry(v: unknown): LibraryEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isSpec(o.spec)) return null;
  // Clean a synthetic prompt saved before `displayAs` shipped (the dedup key is the question,
  // so a legacy raw-prompt entry stays distinct from its label — acceptable; the point is the
  // card/atlas/replay never SHOW the instruction).
  const question = typeof o.question === 'string' ? friendlyAsk(o.question) : '';
  if (!question.trim()) return null;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId(),
    question,
    title: typeof o.title === 'string' ? o.title : (o.spec.title ?? ''),
    savedAt: typeof o.savedAt === 'number' && Number.isFinite(o.savedAt) ? o.savedAt : 0,
    lead: o.lead && typeof o.lead === 'object' ? (o.lead as LeadFace) : null,
    spec: o.spec,
    ...(typeof o.topic === 'string' && o.topic ? { topic: o.topic } : {}),
  };
}

/** True once `cache` reflects a real source (a persisted write, or the async hydrate below) —
 *  guards a slow, late-arriving decrypt from clobbering a fresher write made while it was
 *  in flight. */
let settled = false;
/** Bumped on every write attempt; a write only lands if it's still the latest by the time its
 *  encryption resolves, so two writes racing (a migrate vs. a real save, or two quick saves)
 *  can't land out of order and leave a stale copy on disk. */
let writeGen = 0;

function decode(parsed: unknown): LibraryEntry[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(coerceEntry)
    .filter((e): e is LibraryEntry => e !== null)
    .slice(0, MAX_ENTRIES);
}

/** Write the encrypted blob to disk, but only if no newer write has started since — otherwise a
 *  slow migrate-write (or an earlier save) could resolve after a fresher one and clobber it. */
async function writeEncrypted(entries: LibraryEntry[]): Promise<void> {
  const gen = ++writeGen;
  try {
    if (typeof localStorage === 'undefined') return;
    const enc = await encryptContent(entries);
    if (gen !== writeGen) return; // a newer write has since started — don't overwrite it
    localStorage.setItem(STORAGE_KEY, enc);
  } catch {
    /* storage full/unavailable */
  }
}

function fromStorage(): LibraryEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // Synchronous fast path: legacy plaintext (or the crypto-unavailable fallback) parses
    // directly as JSON — upgrade it to ciphertext right after. Real ciphertext doesn't parse,
    // so this degrades to empty and hydrateAsync below decrypts it moments later.
    const entries = decode(JSON.parse(raw));
    if (entries.length) void writeEncrypted(entries);
    return entries;
  } catch {
    return [];
  }
}

/** Background decrypt of an already-encrypted store, run once eagerly at module load. A no-op
 *  when the on-disk value is already plain JSON (the synchronous path above already handled it). */
async function hydrateAsync(): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      JSON.parse(raw);
      return; // plain JSON — the synchronous fast path already covered this
    } catch {
      /* not plain JSON — try decrypting it below */
    }
    const entries = decode(await decryptContent(raw));
    if (settled) return; // a real write landed while we were decrypting
    cache = entries;
    settled = true;
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LIBRARY_EVENT, { detail: entries }));
    }
  } catch {
    /* corrupt, or this device's content key was rotated/cleared — not restored */
  }
}
const initialHydration = hydrateAsync();

/** Resolve after the eager encrypted read finishes. Backup/export callers must await this before
 *  treating the synchronous getter as a complete snapshot. */
export function whenLibraryHydrated(): Promise<void> {
  return initialHydration;
}

function get(): LibraryEntry[] {
  if (cache) return cache;
  cache = fromStorage();
  return cache;
}

function persist(next: LibraryEntry[]): void {
  // Route through the same decode() a disk read uses (it also caps to MAX_ENTRIES) — otherwise a
  // same-session cache hit could exceed the cap or skip validation a genuine reload would apply.
  const clean = decode(next);
  cache = clean;
  settled = true;
  void writeEncrypted(clean);
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LIBRARY_EVENT, { detail: clean }));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** Every saved canvas, most-recent first. */
export function getLibrary(): LibraryEntry[] {
  return get();
}

/** Merge saved canvases from an imported backup, PRESERVING id/savedAt/lead — unlike saveCanvas,
 *  which mints a new id and re-stamps savedAt. Coerces each through coerceEntry (bad items dropped),
 *  upserts by id (never deleting an entry the bundle omits), keeps the newer `savedAt` on a
 *  collision, then persists newest-first (persist caps to MAX_ENTRIES). Returns the valid count. */
export function importLibrary(raw: unknown[]): number {
  const incoming = raw.map(coerceEntry).filter((e): e is LibraryEntry => e !== null);
  if (!incoming.length) return 0;
  const byId = new Map(get().map((e) => [e.id, e]));
  for (const e of incoming) {
    const existing = byId.get(e.id);
    if (!existing || e.savedAt >= existing.savedAt) byId.set(e.id, e);
  }
  persist([...byId.values()].sort((a, b) => b.savedAt - a.savedAt));
  return incoming.length;
}

/**
 * Save a canvas the user just saw. Dedupes against an existing entry for the same question (the new
 * one wins, moved to the front), strips heavy inline data, caps the store, and broadcasts. A canvas
 * too large to store safely is skipped rather than risking the quota. Best-effort — never throws.
 */
export function saveCanvas(
  spec: ConversationSpec,
  question: string,
  now: number = Date.now(),
): void {
  try {
    const q = question.trim();
    if (!q || !isSpec(spec) || spec.blocks.length === 0) return;
    const lean = stripHeavy(spec);
    const entry: LibraryEntry = {
      id: newId(),
      question: q,
      title: lean.title ?? '',
      savedAt: now,
      lead: extractLead(lean),
      spec: lean,
      ...(lean.topic ? { topic: lean.topic } : {}),
    };
    // Skip a canvas too big to store rather than evicting everything to fit it.
    if (JSON.stringify(entry).length > MAX_ENTRY_BYTES) return;
    const key = normalize(q);
    const rest = get().filter((e) => normalize(e.question) !== key);
    persist([entry, ...rest].slice(0, MAX_ENTRIES));
  } catch {
    /* the library is a convenience — a save failure must never affect the conversation */
  }
}

/** Forget a single saved canvas. */
export function removeEntry(id: string): void {
  const rest = get().filter((e) => e.id !== id);
  if (rest.length !== get().length) persist(rest);
}

/** Forget the whole library. */
export function clearLibrary(): void {
  persist([]);
}
