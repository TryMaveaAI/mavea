// dashboards/opens.ts — how often the user actually OPENS each dashboard's detail page. Feeds the
// cadence optimizer's "you check this hourly but only opened it twice this week" rule (optimizer.ts).
// Plaintext (ids + timestamps only, nothing sensitive) — a plain localStorage map, no encryption,
// no cross-tab event broadcast (an opens-count being a beat behind in another tab is harmless).
const STORAGE_KEY = 'mavea-dash-opens-v1';

const MAX_PER_DASHBOARD = 30;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type OpensMap = Record<string, number[]>;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

function coerce(v: unknown, now: number): OpensMap {
  if (!isObj(v)) return {};
  const cutoff = now - RETENTION_MS;
  const out: OpensMap = {};
  for (const [id, raw] of Object.entries(v)) {
    if (!id || !Array.isArray(raw)) continue;
    const times = raw
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t >= cutoff)
      .slice(-MAX_PER_DASHBOARD);
    if (times.length) out[id] = times;
  }
  return out;
}

let cache: OpensMap | undefined;

function read(now: number): OpensMap {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? coerce(JSON.parse(raw), now) : {};
  } catch {
    return {};
  }
}

function get(now = Date.now()): OpensMap {
  cache ??= read(now);
  return cache;
}

function persist(next: OpensMap): void {
  cache = next;
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — opens keep working off the in-memory cache for this session */
  }
}

/** Record that the user opened this dashboard's detail page right now. */
export function recordOpen(id: string, now = Date.now()): void {
  if (!id) return;
  const all = get(now);
  const times = [...(all[id] ?? []), now]
    .filter((t) => t >= now - RETENTION_MS)
    .slice(-MAX_PER_DASHBOARD);
  persist({ ...all, [id]: times });
}

/** How many times a dashboard was opened since `sinceMs`. */
export function opensSince(id: string, sinceMs: number, now = Date.now()): number {
  return (get(now)[id] ?? []).filter((t) => t >= sinceMs).length;
}

export function getOpens(now = Date.now()): OpensMap {
  return get(now);
}

/** Drop open-history for dashboards that no longer exist, so a deleted dashboard's id doesn't sit
 *  in the map forever. Call this alongside dashboard deletion. */
export function pruneDeadOpens(liveIds: Set<string>): void {
  const all = get();
  const next: OpensMap = {};
  for (const [id, times] of Object.entries(all)) {
    if (liveIds.has(id)) next[id] = times;
  }
  persist(next);
}
