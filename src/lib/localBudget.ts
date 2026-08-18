// localBudget — one shared ledger for the localStorage Mavéa owns.
//
// Every store here budgets itself and each ceiling is sensible alone: the course frame cache
// keeps 16 lessons of at most 150KB, the library 12 canvases of at most 240KB, the session 600KB
// of turns. But localStorage is ONE quota per origin — about 5MB wherever it ships — and those
// ceilings SUM to roughly 6MB before the dozen small keys are counted. A device that genuinely
// fills two of them hits the quota on whichever store writes LAST, and because a store's write
// failure is (correctly) never allowed to break a turn, the loss lands silently on data the user
// can still see on screen.
//
// Shrinking any one ceiling cannot fix a sum, so the stores stop competing blindly instead: they
// write through `writeLocal`, and a quota refusal sheds from the LARGEST store that volunteered
// a shedder before the write is retried. Two rules keep that safe:
//
//   * A store sheds ITSELF. `registerStoreShedder` takes a callback that runs the store's own
//     documented eviction — oldest first, newest kept — and rewrites its own blob, so an
//     encrypted store re-encrypts and nothing here ever parses, inspects or downgrades what it
//     holds.
//   * Nothing else is touched. A key with no registered shedder is never evicted however large
//     it is: the API-key vault, the theme, the legal acknowledgement, another app sharing the
//     origin. This module MEASURES the whole Mavéa keyspace and EVICTS only from the caches that
//     opted in.
//
// Sizes are counted in UTF-16 code units (`key.length + value.length`), the same unit the stores
// budget in via `JSON.stringify(...).length`; a browser charges roughly two bytes per unit.

/** Every key Mavéa writes starts with this — `mavea-…` for most, `mavea.…` for the ripple keys. */
const MAVEA_PREFIX = 'mavea';

/** How many times one blocked write may shed before it gives up. A rescue, not an eviction
 *  spree: past this the write fails loudly rather than emptying the user's library to fit it. */
const MAX_SHED_ROUNDS = 8;

/**
 * A store's own eviction, run only under quota pressure. Resolves to the units it actually freed
 * on disk — 0 when there is nothing left it is willing to drop, which retires it as a candidate
 * for the write in progress.
 */
export type Shedder = () => Promise<number>;

const shedders = new Map<string, Shedder>();

/**
 * Volunteer a store as a shed candidate. Register only caches whose oldest entry costs a
 * regeneration rather than the user's work, and whose `shed` drops from the same end the store's
 * own cap does.
 */
export function registerStoreShedder(key: string, shed: Shedder): void {
  shedders.set(key, shed);
}

function storedUnits(key: string): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const value = localStorage.getItem(key);
    return value === null ? 0 : key.length + value.length;
  } catch {
    return 0; // storage walled off (private mode, a sandboxed frame)
  }
}

export interface StorageUsage {
  /** Total units Mavéa occupies across every key it owns. */
  total: number;
  /** Every Mavéa key with something stored, largest first. */
  stores: { key: string; units: number }[];
}

/** What Mavéa currently occupies, largest store first. Read-only — measuring never evicts. */
export function measureMavea(): StorageUsage {
  const stores: { key: string; units: number }[] = [];
  let total = 0;
  try {
    if (typeof localStorage === 'undefined') return { total, stores };
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(MAVEA_PREFIX)) continue;
      const units = storedUnits(key);
      if (!units) continue;
      total += units;
      stores.push({ key, units });
    }
  } catch {
    /* storage walled off — nothing measurable, and nothing to shed either */
  }
  stores.sort((a, b) => b.units - a.units);
  return { total, stores };
}

/**
 * Swap a store's blob for a SMALLER one from inside its shedder, returning the units freed.
 * Removes the old value first: the replacement is smaller by construction, but a browser that
 * charges old and new at once during a set would refuse the very write meant to relieve the
 * pressure. If the replacement then fails to land the bytes are freed regardless and the store
 * still holds its copy in memory, so its next ordinary save rewrites it.
 */
export function replaceStored(key: string, value: string): number {
  const before = storedUnits(key);
  try {
    if (typeof localStorage === 'undefined') return 0;
    localStorage.removeItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* the shrunken blob didn't land — see above; the bytes are freed either way */
  }
  return Math.max(0, before - storedUnits(key));
}

/** Firefox reports NS_ERROR_DOM_QUOTA_REACHED/1014, and an error crossing a realm (an iframe)
 *  fails `instanceof DOMException` even when it is a genuine quota failure — so match on shape. */
function isQuotaError(err: unknown): boolean {
  const e = err as { name?: unknown; code?: unknown } | null;
  return (
    !!e &&
    (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 ||
      e.code === 1014)
  );
}

type SetOutcome = 'ok' | 'quota' | 'unavailable';

function trySet(key: string, value: string): SetOutcome {
  try {
    if (typeof localStorage === 'undefined') return 'unavailable';
    localStorage.setItem(key, value);
    return 'ok';
  } catch (err) {
    return isQuotaError(err) ? 'quota' : 'unavailable';
  }
}

/** Largest registered store with something left on disk, ignoring the ones already spent. */
function largestSheddable(spent: ReadonlySet<string>): { key: string; shed: Shedder } | null {
  let best: { key: string; shed: Shedder } | null = null;
  let bestUnits = 0;
  for (const [key, shed] of shedders) {
    if (spent.has(key)) continue;
    const units = storedUnits(key);
    if (units > bestUnits) {
      best = { key, shed };
      bestUnits = units;
    }
  }
  return best;
}

function kb(units: number): string {
  return `${Math.max(1, Math.round(units / 512))}KB`; // ~2 bytes per UTF-16 unit
}

// Warned at most once each per page. A full quota repeats on every subsequent write, and a user
// who is out of disk is not helped by being told a hundred times — the console line exists so a
// lost canvas is diagnosable, not to nag.
let shedWarned = false;
let failWarned = false;

/**
 * Write a Mavéa-owned key, shedding from the largest volunteered store if the quota refuses it.
 * Never throws and never rejects — storage is a convenience everywhere it is used here. Resolves
 * true when the value is on disk. The first attempt is synchronous (before any `await`), so a
 * caller that fires this off with `void` still gets today's immediate write in the common case.
 */
export async function writeLocal(key: string, value: string): Promise<boolean> {
  const first = trySet(key, value);
  if (first === 'ok') return true;
  if (first === 'unavailable') return false; // private mode / storage disabled — not our quota

  // The store being written is never its own victim: the value in hand was serialized before the
  // shed, so writing it back would simply restore what was just dropped. Its own cap already
  // bounds it; this is about the OTHER stores crowding it out.
  // Terminates by construction: every pass either sheds (bounded by MAX_SHED_ROUNDS) or retires
  // a store into `spent`, which only ever grows and is bounded by the registry.
  const spent = new Set<string>([key]);
  let sheds = 0;
  while (sheds < MAX_SHED_ROUNDS) {
    const victim = largestSheddable(spent);
    if (!victim) break;
    let freed: number;
    try {
      freed = await victim.shed();
    } catch {
      freed = 0; // a shedder that throws is simply a shedder that freed nothing
    }
    if (freed <= 0) {
      spent.add(victim.key);
      continue;
    }
    sheds += 1;
    if (!shedWarned) {
      shedWarned = true;
      console.warn(
        `[storage] localStorage is full — dropping the oldest entries of "${victim.key}" to make room for "${key}". See lib/localBudget.ts.`,
      );
    }
    if (trySet(key, value) === 'ok') return true;
  }

  if (!failWarned) {
    failWarned = true;
    const usage = measureMavea();
    const biggest = usage.stores
      .slice(0, 3)
      .map((s) => `${s.key} ${kb(s.units)}`)
      .join(', ');
    console.warn(
      `[storage] localStorage is full — "${key}" (${kb(key.length + value.length)}) was not saved and will not survive a reload. Mavéa holds ${kb(usage.total)} across ${usage.stores.length} keys (largest: ${biggest}). See lib/localBudget.ts.`,
    );
  }
  return false;
}

/** Test-only: forget the registered shedders and the once-per-page warning latches. Stores
 *  re-register as they are (re-)imported. */
export function __resetLocalBudgetForTests(): void {
  shedders.clear();
  shedWarned = false;
  failWarned = false;
}
