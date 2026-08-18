// examples.ts — a real, correct props example for each block type, derived from the authored demo
// conversations and explicit fallbacks. `referenceExamples.generated.json` is checked against
// those sources in every verification run, so it cannot drift; `pnpm gen:examples` then shards
// that JSON into ./examples/ (small canonical-order chunks Vite code-splits), mirroring how the
// block catalog shards its own detail fields (canvas/blocks/catalog/details.ts) — a turn's menu
// quotes at most a handful of hero types, so the ~380 KB of demo-sourced prop shapes should never
// sit parsed and resident for the whole session just to answer that.
//
// Why an example at all: the per-turn menu tells the model a component's required/optional field
// NAMES, but for the advanced components that isn't enough — the model has to guess the nested
// shape (e.g. that `cats` is `[{label, pct, color}]`) and fills it wrong, so the block renders
// broken or the coercer drops it. A concrete example is what an LLM copies most reliably — far
// better per token than a JSON-Schema/Zod description, and it teaches the token idioms (color
// vars, 0–100 percents) a schema can't. We show it ONLY for the turn's advanced picks (core blocks
// are already taught in the base prompt), so the prompt cost stays minimal.
import { EXAMPLE_TYPES, SHARD_SIZE } from './examples/index.generated';
import { SHARD_LOADERS } from './examples/loaders.generated';

const shardIndex = new Map<string, number>(
  EXAMPLE_TYPES.map((type, i) => [type, Math.floor(i / SHARD_SIZE)]),
);
const loaded = new Set<number>();
const inFlight = new Map<number, Promise<void>>();
const PROPS_BY_TYPE = new Map<string, unknown>();

/** How many shards the example set is split across. */
export const SHARD_COUNT = SHARD_LOADERS.length;

/** The shard holding a type's example, or -1 when it has none. */
export function shardOf(type: string): number {
  return shardIndex.get(type) ?? -1;
}

/** Fetch one shard exactly once, even under concurrent callers. A shard that fails to load simply
 *  leaves its types without an example — `describe()` in rank.ts falls back to the plain shape
 *  clause, so a chunk error degrades the prompt, never the turn. */
function loadShard(shard: number): Promise<void> {
  if (loaded.has(shard)) return Promise.resolve();
  const pending = inFlight.get(shard);
  if (pending) return pending;
  const loader = SHARD_LOADERS[shard];
  if (!loader) return Promise.resolve();
  const p = loader()
    .then(({ E }) => {
      for (const [type, props] of Object.entries(E)) PROPS_BY_TYPE.set(type, props);
      loaded.add(shard);
    })
    .catch(() => {
      /* a missing shard degrades the menu (no example), never the turn */
    })
    .finally(() => inFlight.delete(shard));
  inFlight.set(shard, p);
  return p;
}

/** Make sure these types' examples are resident. Fetches each distinct shard once, in parallel;
 *  already-loaded shards cost nothing. */
export async function ensureExamples(types: Iterable<string>): Promise<void> {
  const shards = new Set<number>();
  for (const t of types) {
    const shard = shardOf(t);
    if (shard >= 0 && !loaded.has(shard)) shards.add(shard);
  }
  if (!shards.size) return;
  await Promise.all([...shards].map(loadShard));
}

/** Load every example shard. For tests and any offline tooling that wants the whole example set
 *  at once — never on a user path. */
export async function ensureAllExamples(): Promise<void> {
  await Promise.all(SHARD_LOADERS.map((_, i) => loadShard(i)));
}

/** The same real fixture used to teach a hero component's shape. The generic runtime coercer uses
 * it as a structural contract too, so a model cannot be shown one nested shape and then have an
 * incompatible object passed through to React. Values are never copied into an answer.
 *
 * Returns null both when a type genuinely has no example AND before its shard has loaded — same
 * fail-closed contract as `catalogMeta`: callers that need the full set (tests, the catalog
 * generator) must `await ensureAllExamples()` first. */
export function referencePropsFor(type: string): Readonly<Record<string, unknown>> | null {
  const props = PROPS_BY_TYPE.get(type);
  return props && typeof props === 'object' && !Array.isArray(props)
    ? (props as Readonly<Record<string, unknown>>)
    : null;
}

/** Two density tiers for an example. COMPACT is the default for every hero (a thin SHAPE the
 *  menu can afford for all ~24 picks + the gauntlet). DENSE is reserved for the 2-3 LEAD heroes
 *  the prompt orders the model to "build the canvas AROUND" — they get demo-grade item counts so
 *  the model FILLS them richly (the demos run a median ~4-5 items/block; the old 2-item cap taught
 *  thin canvases). Defaults are unchanged, so every existing caller behaves exactly as before. */
interface DensityCaps {
  maxStr: number;
  maxArray: number;
}
const COMPACT: DensityCaps = { maxStr: 48, maxArray: 2 }; // the thin default — keeps the menu small
const DENSE: DensityCaps = { maxStr: 90, maxArray: 5 }; //   demo-grade, for the lead heroes only

/** Shrink a props value for the prompt: cap long strings and trim arrays per `caps`, while
 *  preserving the exact object/array STRUCTURE the model must reproduce. */
function compact(v: unknown, caps: DensityCaps): unknown {
  if (typeof v === 'string') return v.length > caps.maxStr ? `${v.slice(0, caps.maxStr - 1)}…` : v;
  if (Array.isArray(v)) return v.slice(0, caps.maxArray).map((x) => compact(x, caps));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>))
      out[k] = compact(val, caps);
    return out;
  }
  return v; // number, boolean, null
}

/** Memoized per (type, tier): the source props and the caps are both fixed, so the compacted +
 *  stringified result is stable for the whole session — compute it once, not on every menu build. */
const EXAMPLE_CACHE = new Map<string, string | null>();

/** A JSON example of this block type's props, or null if the demos don't use it (or its shard
 *  hasn't loaded yet — callers reach this only after `ensureExamples` has resolved for the turn's
 *  types, so in practice this is only ever "no example exists"). Stable across turns (the source
 *  props are computed once). `dense` gives a fuller, demo-grade example (more items, longer
 *  strings) for a lead hero; the default thin shape keeps ordinary heroes cheap. */
export function exampleFor(type: string, dense = false): string | null {
  const key = `${dense ? 'd' : 'c'}:${type}`;
  const cached = EXAMPLE_CACHE.get(key);
  if (cached !== undefined) return cached;
  // The generated map already preserves demo-first priority, then explicit authored fallbacks.
  const props = referencePropsFor(type);
  const shard = shardOf(type);
  if (props === null && shard >= 0 && !loaded.has(shard)) {
    // The type genuinely has an example, but its shard hasn't arrived yet — a transient absence,
    // not "no example". Don't memoize it: a caller that queries before its own `await
    // ensureExamples(...)` resolves would otherwise freeze a wrong "no example" answer into the
    // cache for the rest of the session, even after the shard loads.
    return null;
  }
  let out: string | null = null;
  if (props !== null) {
    try {
      out = JSON.stringify(compact(props, dense ? DENSE : COMPACT));
    } catch {
      out = null;
    }
  }
  EXAMPLE_CACHE.set(key, out);
  return out;
}
