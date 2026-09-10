// utopia-scale.mjs — prints the fluid type ramp declared in src/styles/tokens-base.css.
//
// The ramp follows Utopia's method (utopia.fyi): a step names its size at the smallest viewport
// and at the largest, and the preferred term is the straight line through those two points, so
// the browser interpolates between them and clamp() holds the ends:
//
//   slope     = (max − min) / (VIEWPORT_MAX − VIEWPORT_MIN)
//   intercept = min − slope × VIEWPORT_MIN
//   value     = clamp(min, intercept + slope × 100vi, max)
//
// Change an endpoint here, run `node scripts/utopia-scale.mjs`, and paste the block over the one in
// tokens-base.css — the numbers there are never edited by hand. Every bound is multiplied by
// --fs-scale (the reader's text-size knob × the viewport's upward scale) at the call site.
//
// The floor of the bottom step is 10px on purpose: the reader's "smaller" knob is 0.9, and
// 10 × 0.9 = 9.0 is exactly the rendered legibility floor audit:ui enforces.

const VIEWPORT_MIN = 320;
const VIEWPORT_MAX = 1920;

/** [token, size at VIEWPORT_MIN, size at VIEWPORT_MAX] — the endpoints the block library was tuned on. */
const STEPS = [
  ['2xs', 10, 10.5],
  ['xs', 10.5, 11.5],
  ['sm', 11.5, 13],
  ['md', 12.5, 14.5],
  ['lg', 14, 17],
  ['xl', 17, 22],
  ['2xl', 22, 34],
  ['stat', 28, 56],
  ['hero', 34, 72],
];

const round = (n) => Math.round(n * 10000) / 10000;

for (const [name, min, max] of STEPS) {
  const slope = (max - min) / (VIEWPORT_MAX - VIEWPORT_MIN);
  const intercept = round(min - slope * VIEWPORT_MIN);
  const vi = round(slope * 100);
  console.log(`  --fs-${name}: clamp(
    calc(${min}px * var(--fs-scale)),
    calc((${intercept}px + ${vi}vi) * var(--fs-scale)),
    calc(${max}px * var(--fs-scale))
  );`);
}
