// connections.ts — the atlas's cross-life arcs. The mockup draws faint threads between neighborhoods
// that "spike together" — Money and Health flaring the same weeks. We only draw a connection we can
// actually justify from the record set: two neighborhoods whose conversations recurrently land in the
// same time bucket. No co-occurrence in the real data → no arc. This is the real-data-only rule
// applied to the prettiest part of the map: never invent a relationship.
import type { Neighborhood } from './neighborhoods';
import type { HoodPlace } from './flight';

export interface Connection {
  /** The two neighborhood indices this arc joins. */
  a: number;
  b: number;
  /** SVG path (a gentle quadratic arc) in world coordinates. */
  d: string;
  /** Label anchor (the arc's apex) in world coordinates. */
  lx: number;
  ly: number;
  /** Human label, e.g. "spikes together · 3 weeks". */
  label: string;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Below this window span we bucket co-occurrence by DAY rather than week — otherwise a "last week"
 *  scope can never contain two shared weeks and would always come up empty. */
const SHORT_WINDOW_MS = 16 * DAY_MS;

/** At most this many arcs are drawn. The mockup favours a legible constellation over a hairball, so
 *  we show the strongest few co-occurrences rather than every faint one — or just the single hero. */
const MAX_ARCS = 6;

/** Bucket index for a timestamp at the chosen granularity ("the same week" or "the same day"). */
function bucketOf(ms: number, unit: number): number {
  return Math.floor(ms / unit);
}

/** The set of time buckets a neighborhood was active in, within the window (records saved before
 *  `sinceMs` are ignored). */
function activeBuckets(h: Neighborhood, sinceMs: number, unit: number): Set<number> {
  const s = new Set<number>();
  for (const r of h.records) if (r.savedAt >= sinceMs) s.add(bucketOf(r.savedAt, unit));
  return s;
}

/** Count a neighborhood's records that fall within the window — connections only consider
 *  neighborhoods with enough in-window history to make a co-occurrence meaningful. */
function sizeWithin(h: Neighborhood, sinceMs: number): number {
  let n = 0;
  for (const r of h.records) if (r.savedAt >= sinceMs) n += 1;
  return n;
}

/** The latest record across all neighborhoods inside the window — used to gauge how wide the window
 *  actually is (so "all time" buckets by week while a recent scope buckets by day). 0 if none. */
function latestWithin(hoods: readonly Neighborhood[], sinceMs: number): number {
  let latest = 0;
  for (const h of hoods) {
    for (const r of h.records) {
      if (r.savedAt >= sinceMs && r.savedAt > latest) latest = r.savedAt;
    }
  }
  return latest;
}

/** "3 weeks" / "2 days" / "same day", matching the bucket granularity in play. */
function cooccurLabel(shared: number, unit: number): string {
  if (unit === DAY_MS) return shared <= 1 ? 'same day' : `together · ${shared} days`;
  return `spikes together · ${shared} weeks`;
}

/**
 * Find genuine cross-life connections: pairs of neighborhoods that share active time buckets within
 * the chosen window. Returns up to MAX_ARCS arcs, strongest first, so the map reads as a constellation
 * of real relationships rather than a single hero line or an invented web. Deterministic for a given
 * input (ties break by neighborhood index, so the same atlas always draws the same arcs).
 *
 * `sinceMs` is the start of the window (records saved earlier are ignored); pass 0 for "all time".
 * The bucket granularity adapts to the window: a wide window co-occurs by week, a recent one (≤16d)
 * by day — otherwise "last week" could never contain two shared weeks and would always be empty.
 */
export function connectionArcs(
  hoods: readonly Neighborhood[],
  places: readonly HoodPlace[],
  sinceMs = 0,
): Connection[] {
  // Gauge the real window width from the newest in-window record; a recent scope co-occurs by day.
  const latest = latestWithin(hoods, sinceMs);
  if (latest === 0) return [];
  const span = latest - sinceMs;
  const short = sinceMs > 0 && span <= SHORT_WINDOW_MS;
  const unit = short ? DAY_MS : WEEK_MS;
  // A day-scoped window can justify an arc from a single shared day; a week-scoped one needs a
  // recurring overlap (≥2 weeks) so it reads as a pattern, not a coincidence.
  const minShared = short ? 1 : 2;

  // Only neighborhoods with enough in-window history to make a co-occurrence meaningful.
  const eligible = hoods
    .map((h, i) => ({ i, buckets: activeBuckets(h, sinceMs, unit), size: sizeWithin(h, sinceMs) }))
    .filter((x) => x.size >= 2 && x.buckets.size >= 1);

  const pairs: { a: number; b: number; shared: number }[] = [];
  for (let m = 0; m < eligible.length; m += 1) {
    for (let n = m + 1; n < eligible.length; n += 1) {
      const A = eligible[m];
      const B = eligible[n];
      let shared = 0;
      for (const w of A.buckets) if (B.buckets.has(w)) shared += 1;
      if (shared >= minShared) pairs.push({ a: A.i, b: B.i, shared });
    }
  }
  // Strongest first; ties break deterministically by the pair's indices so the draw is stable.
  pairs.sort((p, q) => q.shared - p.shared || p.a - q.a || p.b - q.b);

  return pairs.slice(0, MAX_ARCS).map(({ a, b, shared }) => {
    const pa = places[a];
    const pb = places[b];
    // A gentle arc bowed perpendicular to the chord, so it reads as a relationship, not an edge.
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(120, len * 0.22);
    const cx = mx + (-dy / len) * bow;
    const cy = my + (dx / len) * bow;
    return {
      a,
      b,
      d: `M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`,
      lx: (mx + cx) / 2,
      ly: (my + cy) / 2,
      label: cooccurLabel(shared, unit),
    };
  });
}
