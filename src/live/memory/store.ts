// store.ts — Live's cross-session memory: a small wiki of named concept nodes about the user,
// kept LOCAL to the browser (never a server). Each node is a named knowledge card — "profile",
// "preferences", "topics.finance" — carrying the current best snapshot of that concept.
//
// Beyond a flat wiki, each node carries provenance: a `source` trust tier (did the USER say this,
// or did the MODEL infer it?), the single body it last superseded (`prevBody`, so Mavéa can say
// "you used to tell me…"), a reinforcement count (`uses`, which slows decay), and an optional link
// to the turn it came from. A second `kind` of node — `procedural` — records what worked and what
// the user corrected, so Mavéa answers this user better over time. All of this is OFF unless the
// user turns memory on, and it NEVER throws: storage failure or malformed JSON degrades to empty.
// Migration from v1 (flat facts) and v2 (untyped nodes) runs once on first load.
//
// Mirrors the useLiveConfig store pattern (in-memory cache + localStorage + CustomEvent).
//
// Content at rest: this is the single most PII-shaped store in the app, so it's encrypted on
// disk (contentVault.ts), never plaintext. Web Crypto is async-only, so a read is a two-step
// dance: a synchronous fast path handles legacy plaintext (v1/v2, and a pre-encryption v3 blob,
// or the crypto-unavailable fallback) directly via JSON.parse and re-encrypts it once read
// (migrate-on-read); real ciphertext isn't valid JSON, so that fast path degrades to "nothing
// yet" and a background hydrate decrypts it and broadcasts MEMORY_EVENT once it lands — the same
// async-gap trade-off already shipped for BYOK secrets in useLiveConfig.ts.
import { jaccard, tokenSet } from './text';
import { encryptContent, decryptContent } from '../contentVault';

/** Which kind of memory a node holds. */
export type MemoryKind = 'semantic' | 'procedural';

/** Where a fact came from — its trust tier. Only the high-trust tiers are ever injected AS FACT;
 *  `model-inferred` facts are injected only as clearly-labelled, unconfirmed guesses. */
export type MemorySource =
  | 'user-stated' // the user said it (their own words) — highest trust
  | 'user-edit' // the user typed/edited it directly in the memory panel
  | 'ink-correction' // the user corrected an answer by drawing on it
  | 'web-grounded' // grounded by a cited web source this turn
  | 'model-inferred'; // the model's own inference — a guess until grounded

export type MemoryState = 'active' | 'archived';

/** One named knowledge card in the user's concept graph. The fields beyond the original four are
 *  optional so the ~30 modules that read a node keep compiling unchanged; the store always fills
 *  them in on load and write, so a node read back from the store has them populated. */
export interface MemoryNode {
  id: string;
  /** Concept path (dot-separated): "profile", "preferences", "topics.finance", "threads.marathon".
   *  Procedural lessons use "corrections.<subject>" / "preferences.form" etc. */
  concept: string;
  /** The complete knowledge body for this concept — a short paragraph, updated wholesale. */
  body: string;
  updatedAt: number;
  /** 'semantic' (a fact/preference about the user) or 'procedural' (a learned lesson). Default 'semantic'. */
  kind?: MemoryKind;
  /** Provenance trust tier — gates fact-vs-guess injection. Default 'model-inferred' (fail safe). */
  source?: MemorySource;
  /** Lifecycle. Default 'active'. */
  state?: MemoryState;
  /** The single prior body this one replaced — one bounded snapshot, not an unbounded history. */
  prevBody?: string;
  /** Id of the turn/frame this fact came from (source-traceability). */
  turnId?: string;
  /** The user's question this fact was learned from ("why I remember this") — turn-level
   *  provenance for the graph/inspector, not a per-fact span. */
  quote?: string;
  /** How many times this fact has been reinforced (restated). Slows decay for well-worn facts. */
  uses?: number;
  // ── procedural-only (kind === 'procedural') ──
  /** Block types to favour / damp when this lesson's trigger matches a turn. */
  prefer?: string[];
  avoid?: string[];
  /** A learned depth / verification preference for this kind of ask. */
  depth?: 'tight' | 'standard' | 'deep';
  verify?: boolean;
  /** Outcome counters — confidence = wins / (wins + losses). */
  wins?: number;
  losses?: number;
}

/** A write into the store. Only concept + body are required; provenance defaults are filled in. */
export interface MemoryUpdate {
  concept: string;
  body: string;
  kind?: MemoryKind;
  source?: MemorySource;
  turnId?: string;
  quote?: string;
  prefer?: string[];
  avoid?: string[];
  depth?: 'tight' | 'standard' | 'deep';
  verify?: boolean;
  /** Bump a procedural lesson's confidence without necessarily changing its body. */
  outcome?: 'win' | 'loss';
}

interface MemoryStore {
  nodes: MemoryNode[];
  updatedAt: number;
}

const STORAGE_KEY = 'mavea-live-memory-v3';
const LEGACY_V2 = 'mavea-live-memory-v2';
const LEGACY_V1 = 'mavea-live-memory-v1';
/** Stable event channel (version-agnostic); readers import this constant, never the literal. */
export const MEMORY_EVENT = 'mavea-live-memory';
/** Keep the graph bounded — oldest nodes are evicted once we hit the cap. */
const MAX_NODES = 50;
/** Of the cap, this many slots are reserved for procedural lessons so a burst of fresh facts can't
 *  evict a hard-won correction. */
const MAX_PROCEDURAL = 20;
/** A node body is a dense paragraph, not a book. */
const MAX_BODY_LEN = 400;
/** A grounding quote is a short span, not a transcript. */
const MAX_QUOTE_LEN = 200;
/** Concept slugs: lowercase, dots for hierarchy, no spaces. */
const VALID_CONCEPT = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
/** Two bodies this similar (token Jaccard) are the SAME fact restated → reinforce, not supersede. */
const REINFORCE_SIM = 0.5;

/** Trust ordering — a fact's source can only ever be upgraded, never silently downgraded. */
const TRUST_RANK: Record<MemorySource, number> = {
  'model-inferred': 0,
  'web-grounded': 1,
  'ink-correction': 2,
  'user-stated': 3,
  'user-edit': 3,
};

const FACT_SOURCES: ReadonlySet<MemorySource> = new Set<MemorySource>([
  'user-stated',
  'user-edit',
  'ink-correction',
  'web-grounded',
]);

/** True when a node's source is trusted enough to inject as established fact (not a guess). */
export function isFactSource(source: MemorySource | undefined): boolean {
  return FACT_SOURCES.has(source ?? 'model-inferred');
}

function higherTrust(a: MemorySource, b: MemorySource): MemorySource {
  return TRUST_RANK[b] > TRUST_RANK[a] ? b : a;
}

const EMPTY: MemoryStore = { nodes: [], updatedAt: 0 };

let cache: MemoryStore | null = null;
let idSeq = 0;

function newId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* no crypto */
  }
  idSeq += 1;
  return `mn-${idSeq.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function trimBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, MAX_BODY_LEN);
}

function normConcept(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, '.');
}

const ALL_SOURCES: ReadonlySet<string> = new Set(Object.keys(TRUST_RANK));
function isSource(v: unknown): v is MemorySource {
  // Set membership, not `in` — `in` would accept inherited keys like 'constructor'/'toString'.
  return typeof v === 'string' && ALL_SOURCES.has(v);
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, 12);
  return out.length ? out : undefined;
}

function isDepth(v: unknown): v is 'tight' | 'standard' | 'deep' {
  return v === 'tight' || v === 'standard' || v === 'deep';
}

function posInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

function coerceNode(v: unknown): MemoryNode | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const concept = typeof o.concept === 'string' ? normConcept(o.concept) : '';
  if (!concept || !VALID_CONCEPT.test(concept)) return null;
  const body = typeof o.body === 'string' ? trimBody(o.body) : '';
  if (!body) return null;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId(),
    concept,
    body,
    updatedAt: typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : 0,
    kind: o.kind === 'procedural' ? 'procedural' : 'semantic',
    source: isSource(o.source) ? o.source : 'model-inferred',
    state: o.state === 'archived' ? 'archived' : 'active',
    prevBody: typeof o.prevBody === 'string' ? trimBody(o.prevBody) : undefined,
    turnId: typeof o.turnId === 'string' ? o.turnId : undefined,
    quote:
      typeof o.quote === 'string'
        ? o.quote.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE_LEN)
        : undefined,
    uses: posInt(o.uses) ?? 0,
    prefer: strArray(o.prefer),
    avoid: strArray(o.avoid),
    depth: isDepth(o.depth) ? o.depth : undefined,
    verify: typeof o.verify === 'boolean' ? o.verify : undefined,
    wins: posInt(o.wins),
    losses: posInt(o.losses),
  };
}

/** One-time migration from v1 (flat MemoryFact[]) → all facts joined into a single "profile" node.
 *  Honest provenance: these are model-authored inferences, so they migrate as `model-inferred` and
 *  self-heal to `user-stated` the next time the user restates them (reinforcement upgrades trust). */
function migrateFromV1(): MemoryStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LEGACY_V1);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const facts = Array.isArray(o.facts)
      ? (o.facts as unknown[])
          .map((f) => {
            if (f && typeof f === 'object') {
              const fo = f as Record<string, unknown>;
              return typeof fo.text === 'string' ? fo.text.trim() : '';
            }
            return '';
          })
          .filter((t) => t.length > 0)
      : [];
    if (!facts.length) return null;
    const node = coerceNode({
      concept: 'profile',
      body: facts.join('. '),
      source: 'model-inferred',
    });
    return node ? { nodes: [node], updatedAt: 0 } : null;
  } catch {
    return null;
  }
}

/** One-time migration from v2 (untyped {concept, body, updatedAt} nodes) → v3. Existing nodes were
 *  model-authored, so they migrate as `model-inferred` (the safe default); the guard applies going
 *  forward and existing nodes upgrade organically as the user restates or edits them. */
function migrateFromV2(): MemoryStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LEGACY_V2);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const nodes = Array.isArray(o.nodes)
      ? o.nodes.map(coerceNode).filter((n): n is MemoryNode => n !== null)
      : [];
    if (!nodes.length) return null;
    return {
      nodes: nodes.slice(-MAX_NODES),
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/** True once `cache` reflects a real source (a persisted write, or the async hydrate below) —
 *  guards a slow, late-arriving decrypt from clobbering a fresher write made while it was
 *  in flight. */
let settled = false;
/** Bumped on every write attempt; a write only lands if it's still the latest by the time its
 *  encryption resolves, so two writes racing (a migrate vs. a real save, or two quick saves)
 *  can't land out of order and leave a stale copy on disk. */
let writeGen = 0;

function decode(raw: unknown): MemoryStore {
  const o = (raw ?? {}) as Record<string, unknown>;
  const nodes = Array.isArray(o.nodes)
    ? o.nodes.map(coerceNode).filter((n): n is MemoryNode => n !== null)
    : [];
  return {
    nodes: nodes.slice(-MAX_NODES),
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
  };
}

/** Write the encrypted blob to disk, but only if no newer write has started since — otherwise a
 *  slow migrate-write (or an earlier save) could resolve after a fresher one and clobber it. */
async function writeEncrypted(store: MemoryStore): Promise<void> {
  const gen = ++writeGen;
  try {
    if (typeof localStorage === 'undefined') return;
    const enc = await encryptContent(store);
    if (gen !== writeGen) return; // a newer write has since started — don't overwrite it
    localStorage.setItem(STORAGE_KEY, enc);
  } catch {
    /* storage full/unavailable */
  }
}

function fromStorage(): MemoryStore {
  try {
    if (typeof localStorage === 'undefined') return { ...EMPTY };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return migrateFromV2() ?? migrateFromV1() ?? { ...EMPTY };
    }
    // Synchronous fast path: legacy plaintext (or the crypto-unavailable fallback) parses
    // directly as JSON — upgrade it to ciphertext right after. Real ciphertext doesn't parse,
    // so this degrades to empty and hydrateAsync below decrypts it moments later.
    const store = decode(JSON.parse(raw));
    if (store.nodes.length) void writeEncrypted(store);
    return store;
  } catch {
    return { ...EMPTY };
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
    const store = decode(await decryptContent(raw));
    if (settled) return; // a real write landed while we were decrypting
    cache = store;
    settled = true;
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(MEMORY_EVENT, { detail: { nodes: store.nodes, changed: [] } }),
      );
    }
  } catch {
    /* corrupt, or this device's content key was rotated/cleared — not restored */
  }
}
const initialHydration = hydrateAsync();

/** Resolve after the eager encrypted read finishes so backup/export cannot snapshot the temporary
 *  empty cache exposed while Web Crypto is still decrypting. */
export function whenMemoryHydrated(): Promise<void> {
  return initialHydration;
}

function get(): MemoryStore {
  if (cache) return cache;
  cache = fromStorage();
  return cache;
}

function persist(next: MemoryStore, changed: MemoryNode[]): void {
  cache = next;
  settled = true;
  void writeEncrypted(next);
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(MEMORY_EVENT, { detail: { nodes: next.nodes, changed } }),
      );
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** Evict down to the cap, reserving slots for procedural lessons so fresh facts can't crowd out a
 *  hard-won correction. Newest-updated wins within each kind. */
function evict(nodes: MemoryNode[]): MemoryNode[] {
  if (nodes.length <= MAX_NODES) return nodes;
  const byRecency = (a: MemoryNode, b: MemoryNode): number => b.updatedAt - a.updatedAt;
  const allProc = nodes.filter((n) => n.kind === 'procedural').sort(byRecency);
  const allSem = nodes.filter((n) => n.kind !== 'procedural').sort(byRecency);
  const proc = allProc.slice(0, MAX_PROCEDURAL); // procedural's reserved slots
  const sem = allSem.slice(0, MAX_NODES - proc.length); // semantic fills the rest
  // Any slots semantic didn't use go back to surplus procedural — never leave the graph short.
  const spillRoom = Math.max(0, MAX_NODES - proc.length - sem.length);
  const spill = allProc.slice(MAX_PROCEDURAL, MAX_PROCEDURAL + spillRoom);
  return [...proc, ...spill, ...sem];
}

/** All concept nodes, sorted by most recently updated first. */
export function getMemoryNodes(): MemoryNode[] {
  return [...get().nodes].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Merge memory nodes from an imported backup, PRESERVING full provenance (id, uses, prevBody,
 *  source, quote) — unlike mergeNodes, which takes only concept+body and re-derives the rest. Coerces
 *  each through coerceNode (a bad item is dropped), upserts by id (never deleting a node the bundle
 *  omits), and on a collision keeps the newer `updatedAt`. Returns the count of valid nodes imported. */
export function importMemoryNodes(raw: unknown[]): number {
  const incoming = raw.map(coerceNode).filter((n): n is MemoryNode => n !== null);
  if (!incoming.length) return 0;
  const byId = new Map(get().nodes.map((n) => [n.id, n]));
  for (const n of incoming) {
    const existing = byId.get(n.id);
    if (!existing || n.updatedAt >= existing.updatedAt) byId.set(n.id, n);
  }
  persist({ nodes: evict([...byId.values()]), updatedAt: Date.now() }, incoming);
  return incoming.length;
}

/**
 * Upsert concept nodes into the graph. For each update:
 *  - new concept → create the node (with provenance + defaults);
 *  - same concept, body unchanged → no-op (unless an `outcome`/procedural payload bumps it);
 *  - same concept, body RESTATED (similar) → reinforce: refresh wording, bump `uses`, upgrade trust;
 *  - same concept, body CHANGED (different) → supersede: stash the old body in `prevBody`, take new.
 * Returns the nodes whose body was created/replaced (a genuine "save" — what the UI pill keys off);
 * silent reinforcement and outcome bumps persist but are NOT reported as changed.
 */
export function mergeNodes(
  updates: readonly MemoryUpdate[],
  opts: { now?: number } = {},
): MemoryNode[] {
  const cur = get();
  const now = opts.now ?? Date.now();
  const changed: MemoryNode[] = [];
  let touched = false;
  let nodes = [...cur.nodes];

  for (const u of updates) {
    const concept = normConcept(u.concept);
    if (!concept || !VALID_CONCEPT.test(concept)) continue;
    const body = trimBody(u.body);
    const src: MemorySource = isSource(u.source) ? u.source : 'model-inferred';
    const kind: MemoryKind = u.kind === 'procedural' ? 'procedural' : 'semantic';
    const quote = u.quote ? u.quote.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE_LEN) : undefined;

    const idx = nodes.findIndex((n) => n.concept === concept && n.state !== 'archived');

    if (idx < 0) {
      if (!body) continue; // a brand-new node needs a body
      const created: MemoryNode = {
        id: newId(),
        concept,
        body,
        updatedAt: now,
        kind,
        source: src,
        state: 'active',
        turnId: u.turnId,
        quote,
        uses: 0,
        prefer: u.prefer,
        avoid: u.avoid,
        depth: u.depth,
        verify: u.verify,
        wins: u.outcome === 'win' ? 1 : undefined,
        losses: u.outcome === 'loss' ? 1 : undefined,
      };
      nodes.push(created);
      changed.push(created);
      touched = true;
      continue;
    }

    const ex = nodes[idx];
    const next: MemoryNode = { ...ex };
    let saved = false; // body created/replaced → a real "save"
    let localTouch = false;

    // Procedural payload + outcome merge (may carry no body change).
    if (kind === 'procedural' && next.kind !== 'procedural') {
      next.kind = 'procedural';
      localTouch = true;
    }
    if (u.prefer) {
      next.prefer = Array.from(new Set([...(ex.prefer ?? []), ...u.prefer])).slice(0, 12);
      localTouch = true;
    }
    if (u.avoid) {
      next.avoid = Array.from(new Set([...(ex.avoid ?? []), ...u.avoid])).slice(0, 12);
      localTouch = true;
    }
    if (u.depth && u.depth !== ex.depth) {
      next.depth = u.depth;
      localTouch = true;
    }
    if (typeof u.verify === 'boolean' && u.verify !== ex.verify) {
      next.verify = u.verify;
      localTouch = true;
    }
    if (u.outcome === 'win') {
      next.wins = (ex.wins ?? 0) + 1;
      localTouch = true;
    } else if (u.outcome === 'loss') {
      next.losses = (ex.losses ?? 0) + 1;
      localTouch = true;
    }

    // Body change: reinforce (similar) vs supersede (different).
    if (body && body !== ex.body) {
      const sim = jaccard(tokenSet(ex.body), tokenSet(body));
      if (sim >= REINFORCE_SIM) {
        next.uses = (ex.uses ?? 0) + 1; // same fact restated — reinforce
      } else {
        next.prevBody = ex.body; // genuinely different — keep one prior snapshot
        next.uses = 0;
      }
      next.body = body;
      if (quote) next.quote = quote;
      if (u.turnId) next.turnId = u.turnId;
      saved = true;
      localTouch = true;
    }

    // Trust can only be upgraded (a later, better-grounded restatement strengthens a fact).
    const up = higherTrust(ex.source ?? 'model-inferred', src);
    if (up !== (ex.source ?? 'model-inferred')) {
      next.source = up;
      localTouch = true;
    }

    if (localTouch) {
      next.updatedAt = now;
      nodes[idx] = next;
      touched = true;
      if (saved) changed.push(next);
    }
  }

  if (!touched) return [];
  nodes = evict(nodes);
  persist({ nodes, updatedAt: now }, changed);
  return changed;
}

/** Edit a node's body in place (user correction). Upgrades trust to `user-edit` — the user typed it,
 *  so it's no longer a guess. No-op if id is unknown or body is empty. */
export function editNode(id: string, body: string): void {
  const cur = get();
  const trimmed = trimBody(body);
  if (!trimmed) return;
  let hit = false;
  const nodes = cur.nodes.map((n) => {
    if (n.id !== id) return n;
    hit = true;
    return {
      ...n,
      prevBody: n.body !== trimmed ? n.body : n.prevBody,
      body: trimmed,
      source: 'user-edit' as MemorySource,
      updatedAt: Date.now(),
    };
  });
  if (!hit) return;
  persist({ nodes, updatedAt: Date.now() }, []);
}

/** Forget a single concept node. */
export function deleteNode(id: string): void {
  const cur = get();
  const nodes = cur.nodes.filter((n) => n.id !== id);
  if (nodes.length === cur.nodes.length) return;
  persist({ nodes, updatedAt: Date.now() }, []);
}

/** Forget everything. */
export function forgetAll(): void {
  persist({ nodes: [], updatedAt: Date.now() }, []);
}
