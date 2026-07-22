// Shared scale engine for the canvas charts.
//
// Every chart used to hand-roll its axis: `Math.max(...data)` for the top and a hardcoded
// `[0, 0.5, 1]` gridline list. That strands sparse data in dead space (two bars of 9 and 18
// pin to 50%/100% with nothing above) and labels gridlines with ugly fractions. This module
// centralises the "nice axis" math that `Plot` got right so the rest of the library can drop
// its naive version. Pure functions — no React, no DOM — so they're trivial to unit-test.

/** A "nice" step (1 / 2 / 5 × 10ⁿ) so axis ticks land on round numbers. */
export function niceStep(range: number, target = 5): number {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

/** Tick values across [min, max] on a given step, with -0 and float dust cleaned up. */
export function ticks(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return [];
  const out: number[] = [];
  // Cap the count so a pathological (min, max, step) can't spin forever.
  for (
    let t = Math.ceil(min / step) * step;
    t <= max + step * 1e-6 && out.length < 1000;
    t += step
  ) {
    out.push(Math.abs(t) < step * 1e-6 ? 0 : Math.round(t * 1e6) / 1e6);
  }
  return out;
}

/** A rounded-out [min, max] domain whose bounds fall on nice multiples of the step. */
export function niceDomain(min: number, max: number, target = 5): [number, number] {
  if (min === max) {
    // A single value (or all-equal data): open a symmetric window so it isn't pinned to an edge.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.5 : 1;
    return [min - pad, max + pad];
  }
  const step = niceStep(max - min, target);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

/** Min/max of a list, ignoring non-finite values. Returns null for an empty/all-NaN list. */
export function extent(values: readonly number[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? null : [lo, hi];
}

/** A linear scale mapping a data domain onto a pixel/percent range. */
export interface LinearScale {
  /** Map a domain value to a range value. */
  (value: number): number;
  domain: [number, number];
  range: [number, number];
  /** Nice tick values across the domain. */
  ticks(target?: number): number[];
}

/**
 * Build a linear scale from a data `domain` to an output `range` (e.g. `[0, 100]` for a
 * percentage height, or `[height, 0]` for an inverted SVG y-axis). Replaces the ubiquitous
 * `(v / max) * 100`, which has no lower bound, no nice ticks, and breaks on negative data.
 */
export function scaleLinear(
  domain: [number, number],
  range: [number, number] = [0, 100],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1; // guard a zero-width domain (single value) against /0
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = domain;
  scale.range = range;
  scale.ticks = (target = 5) => ticks(d0, d1, niceStep(d1 - d0, target));
  return scale;
}
