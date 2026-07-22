// details.ts — the lazily-loaded half of the catalog.
//
// `blurb`, `optional`, `itemShapes`, `stringItems`, `propHints` and `defaultProps` are ~70% of the
// catalog's bytes and are read by exactly two consumers: the prompt menu (for the ≤30 components a
// turn offers) and the generic coercer (for the handful of blocks a turn produces). Neither is
// proportional to the library, so neither should pay for it.
//
// Details are therefore fetched in small canonical-order SHARDS rather than by family. Family-sized
// modules were the obvious unit and the wrong one: the selector caps its picks at two per family, so
// a menu spans ~17 of 23 families and a family module ships ~30× more prose than the turn quotes
// (measured: 126 KB of 138 KB fetched for a single ask). Shards make the bytes track the menu.
//
// The contract, and the reason `catalogMeta` returns undefined rather than a half-filled record:
// anything that needs a detail must `await ensureDetails(types)` first. A partially-populated meta
// would let the coercer run without the block's item contracts and silently emit a malformed block —
// failing closed is the only safe default. `tests/setup.ts` preloads everything so unit tests stay
// synchronous, and `generateLive` awaits the turn's types before the adapter streams.
import type { ComponentDetail } from './facts';
import { factIndex } from './facts';
import { SHARD_LOADERS, SHARD_SIZE } from './details/loaders.generated';

const loaded = new Set<number>();
const inFlight = new Map<number, Promise<void>>();
const DETAILS = new Map<string, ComponentDetail>();

/** How many shards the catalog is split across. */
export const SHARD_COUNT = SHARD_LOADERS.length;

/** Fetch one shard exactly once, even under concurrent callers. A shard that fails to load is simply
 *  absent: `catalogMeta` returns undefined for its types, the menu skips them, and the base floor
 *  still answers the turn. */
function loadShard(shard: number): Promise<void> {
  if (loaded.has(shard)) return Promise.resolve();
  const pending = inFlight.get(shard);
  if (pending) return pending;
  const loader = SHARD_LOADERS[shard];
  if (!loader) return Promise.resolve();
  const p = loader()
    .then(({ D }) => {
      for (const [type, detail] of Object.entries(D)) DETAILS.set(type, detail);
      loaded.add(shard);
    })
    .catch(() => {
      /* a missing shard degrades the menu, never the turn */
    })
    .finally(() => inFlight.delete(shard));
  inFlight.set(shard, p);
  return p;
}

/** The shard holding a component's details, or -1 when the type is unknown. */
export function shardOf(type: string): number {
  const i = factIndex(type);
  return i < 0 ? -1 : Math.floor(i / SHARD_SIZE);
}

/** Make sure the details for these block types are resident. Fetches each distinct shard once, in
 *  parallel; already-loaded shards cost nothing. */
export async function ensureDetails(types: Iterable<string>): Promise<void> {
  const shards = new Set<number>();
  for (const t of types) {
    const shard = shardOf(t);
    if (shard >= 0 && !loaded.has(shard)) shards.add(shard);
  }
  if (!shards.size) return;
  await Promise.all([...shards].map(loadShard));
}

/** Load the entire catalog's details. For tests and for offline tooling — never on a user path. */
export async function ensureAllDetails(): Promise<void> {
  await Promise.all(SHARD_LOADERS.map((_, i) => loadShard(i)));
}

/** The detail fields for a block type, or undefined when its shard hasn't been loaded yet. */
export function detailFor(type: string): ComponentDetail | undefined {
  return DETAILS.get(type);
}

/** True when this type's details are resident — the precondition for `catalogMeta(type)`. */
export function detailsReady(type: string): boolean {
  return DETAILS.has(type);
}
