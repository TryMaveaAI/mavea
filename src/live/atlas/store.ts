// The atlas index — a light record of every conversation the Library has ever seen. The
// Library keeps a dozen full canvases; the atlas only needs the ask, the title and the
// clock, so its records survive Library eviction and the map can show months of history
// without ever holding a canvas. Synced FROM the library (no store.ts edits — the library
// already broadcasts on every write); same idiom as the other stores: in-memory cache +
// localStorage + a CustomEvent, framework-free, never throws.
//
// Content at rest: what's here is real conversation titles/questions, so it's encrypted on disk
// (contentVault.ts) — never plaintext. Web Crypto is async-only, so reads stay a two-step dance:
// a synchronous fast path handles legacy plaintext (and the crypto-unavailable fallback) directly
// via JSON.parse, and re-encrypts it once read (migrate-on-read); real ciphertext isn't valid
// JSON, so that fast path degrades to "nothing yet" and a background hydrate decrypts it and
// broadcasts the existing ATLAS_EVENT once it lands — the same async-gap trade-off already shipped
// for BYOK secrets in useLiveConfig.ts.
import type { LibraryEntry } from '../library/store';
import { friendlyAsk } from '../friendlyAsk';
import { encryptContent, decryptContent } from '../contentVault';

/** One conversation on the map. `id` is the normalized ask — the same dedup key the
 *  Library uses — so a re-asked question updates its record instead of duplicating it. */
export interface AtlasRecord {
  id: string;
  question: string;
  title: string;
  /** First time this conversation was saved (epoch ms) — the map's notion of "where it was born". */
  firstSeen: number;
  /** Latest save — recency for ordering and the meta line. */
  savedAt: number;
  /** How many blocks the canvas held when last saved — a real size signal for the dot. */
  blocks: number;
  /** Semantic domain from the model (e.g. "Finance", "Biology") — drives atlas neighborhood names. */
  topic?: string;
}

const STORAGE_KEY = 'mavea-live-atlas-v1';
export const ATLAS_EVENT = STORAGE_KEY;
/** Plenty for years of talking; the oldest fall off rather than risking the quota. */
const MAX_RECORDS = 500;

let cache: AtlasRecord[] | null = null;
/** True once `cache` reflects a real source (a persisted write, or the async hydrate below) —
 *  guards a slow, late-arriving decrypt from clobbering a fresher write made while it was
 *  in flight. */
let settled = false;
/** Bumped on every write attempt; a write only lands if it's still the latest by the time its
 *  encryption resolves, so two writes racing (a migrate vs. a real save, or two quick saves)
 *  can't land out of order and leave a stale copy on disk. */
let writeGen = 0;

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isRecord(v: unknown): v is AtlasRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.question === 'string' &&
    typeof r.title === 'string' &&
    typeof r.firstSeen === 'number' &&
    typeof r.savedAt === 'number' &&
    typeof r.blocks === 'number'
  );
}

function decode(parsed: unknown): AtlasRecord[] {
  if (!Array.isArray(parsed)) return [];
  // Clean a synthetic prompt indexed before `displayAs` shipped, so the map label never
  // shows the raw instruction.
  return parsed.filter(isRecord).map((r) => ({ ...r, question: friendlyAsk(r.question) }));
}

/** Write the encrypted blob to disk, but only if no newer write has started since — otherwise a
 *  slow migrate-write (or an earlier save) could resolve after a fresher one and clobber it. */
async function writeEncrypted(records: AtlasRecord[]): Promise<void> {
  const gen = ++writeGen;
  try {
    const enc = await encryptContent(records);
    if (gen !== writeGen) return; // a newer write has since started — don't overwrite it
    localStorage.setItem(STORAGE_KEY, enc);
  } catch {
    /* private mode / quota — the in-memory copy still serves this session */
  }
}

/** Synchronous read: legacy plaintext (or the crypto-unavailable fallback) parses directly as
 *  JSON, so this is a real, immediate answer for that case — and it's upgraded to ciphertext on
 *  disk right after. Real ciphertext isn't valid JSON, so this degrades to empty; hydrateAsync
 *  below decrypts it moments later. */
function read(): AtlasRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records = decode(JSON.parse(raw));
    if (records.length) void writeEncrypted(records);
    return records;
  } catch {
    return [];
  }
}

/** Background decrypt of an already-encrypted store, run once eagerly at module load and again
 *  whenever a cross-tab invalidate needs a fresh read. A no-op when the on-disk value is already
 *  plain JSON (the synchronous path above already handled it). */
async function hydrateAsync(): Promise<void> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      JSON.parse(raw);
      return; // plain JSON — the synchronous fast path already covered this
    } catch {
      /* not plain JSON — try decrypting it below */
    }
    const records = decode(await decryptContent(raw));
    if (settled) return; // a real write landed while we were decrypting
    cache = records;
    settled = true;
    window.dispatchEvent(new CustomEvent(ATLAS_EVENT));
  } catch {
    /* corrupt, or this device's content key was rotated/cleared — not restored */
  }
}
const initialHydration = hydrateAsync();

/** Resolve after the eager encrypted read finishes. */
export function whenAtlasHydrated(): Promise<void> {
  return initialHydration;
}

function get(): AtlasRecord[] {
  cache ??= read();
  return cache;
}

function persist(records: AtlasRecord[]): void {
  // Route through the same decode() a disk read uses (it launders a legacy raw prompt via
  // friendlyAsk) — otherwise a same-session cache hit shows less-sanitized data than a genuine
  // reload would.
  const clean = decode(records);
  cache = clean;
  settled = true;
  void writeEncrypted(clean);
  try {
    window.dispatchEvent(new CustomEvent(ATLAS_EVENT));
  } catch {
    /* non-browser env */
  }
}

/** Every conversation the atlas knows, newest save first. */
export function getAtlas(): AtlasRecord[] {
  return get();
}

/** Merge atlas records from an imported backup. Validates each through isRecord (bad items dropped),
 *  upserts by id (never deleting a record the bundle omits), and on a collision keeps the newer
 *  `savedAt` while preserving the EARLIEST `firstSeen` (the map's notion of when a topic was born).
 *  Caps to MAX_RECORDS newest-first. Returns the count of valid records imported. */
export function importAtlas(raw: unknown[]): number {
  const incoming = decode(raw);
  if (!incoming.length) return 0;
  const byId = new Map(get().map((r) => [r.id, r]));
  for (const r of incoming) {
    const existing = byId.get(r.id);
    if (!existing) byId.set(r.id, r);
    else {
      const firstSeen = Math.min(existing.firstSeen, r.firstSeen);
      byId.set(
        r.id,
        r.savedAt >= existing.savedAt ? { ...r, firstSeen } : { ...existing, firstSeen },
      );
    }
  }
  persist([...byId.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_RECORDS));
  return incoming.length;
}

/**
 * Fold the Library's current entries into the index: new asks append, re-saved asks update
 * in place (keeping their original `firstSeen`). Entries the Library evicted are left alone —
 * that persistence is the point. Returns the record count so callers can gate UI on it.
 */
export function syncFromLibrary(entries: readonly LibraryEntry[]): number {
  try {
    const records = [...get()];
    const byId = new Map(records.map((r) => [r.id, r]));
    let changed = false;
    for (const e of entries) {
      const id = normalize(e.question);
      if (!id) continue;
      const next: AtlasRecord = {
        id,
        question: e.question,
        title: e.title,
        firstSeen: byId.get(id)?.firstSeen ?? e.savedAt,
        savedAt: e.savedAt,
        blocks: e.spec.blocks.length,
        ...(e.topic ? { topic: e.topic } : {}),
      };
      const prev = byId.get(id);
      if (prev && prev.savedAt === next.savedAt && prev.blocks === next.blocks) continue;
      byId.set(id, next);
      changed = true;
    }
    if (!changed) return records.length;
    const merged = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_RECORDS);
    persist(merged);
    return merged.length;
  } catch {
    return get().length;
  }
}

/** The Library entry (if any) still holding this record's full canvas — landing resumes it;
 *  an evicted record honestly re-asks instead. */
export function matchLibraryEntry(
  record: AtlasRecord,
  entries: readonly LibraryEntry[],
): LibraryEntry | undefined {
  return entries.find((e) => normalize(e.question) === record.id);
}

/** Forget the whole atlas (Library "clear" paths can call this alongside clearLibrary). */
export function clearAtlas(): void {
  persist([]);
}

const LAST_OPEN_KEY = 'mavea-live-atlas-last-open';

/** Epoch ms when the atlas panel was last opened; 0 if never. */
export function getLastAtlasOpen(): number {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_OPEN_KEY) : null;
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Stamp the current time as the last atlas open. Call on panel mount. */
export function markAtlasOpened(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_OPEN_KEY, String(Date.now()));
    }
  } catch {
    /* private mode / quota */
  }
}
