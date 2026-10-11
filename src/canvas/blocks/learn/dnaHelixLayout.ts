// The double helix as one function of height: strand 1 at x = CX + A·cos θ(y), strand 2 at its
// mirror, θ advancing one full turn every 10.5 base pairs (B-DNA). The strands, the rungs and the
// base letters are all read off that same function, so a rung ends exactly on its two strands
// and a crossover is wherever the two meet — not wherever a coarse polyline happened to bend.

import { estimateTextWidth } from '../../lib/fitText';

export const HELIX_W = 240;
const CX = HELIX_W / 2;
const AMPLITUDE = 52;
export const V_STEP = 24;
export const PAD_T = 20;
const PAD_B = 24;
const BP_PER_TURN = 10.5;
/** Strand samples per base pair: enough that the curve reads smooth at any size. */
const SAMPLES = 8;
/** .dh-base-label's size, in viewBox units. */
export const BASE_FS = 9;
/** Clear space between a base letter and the edge of the strand's stroke. */
const BASE_GAP = 3;
const STRAND_HALF_W = 1.5;

export interface HelixPoint {
  x: number;
  y: number;
}

export interface StrandRun {
  strand: 1 | 2;
  points: HelixPoint[];
}

export interface HelixRung {
  idx: number;
  y: number;
  /** Strand 1's end of the rung, then strand 2's. */
  x1: number;
  x2: number;
  /** Where the two letters go and how each is anchored. */
  base1: { x: number; anchor: 'start' | 'end' };
  base2: { x: number; anchor: 'start' | 'end' };
}

export interface HelixGeometry {
  height: number;
  /** Each strand split into runs, by whether that stretch faces the reader. */
  back: StrandRun[];
  front: StrandRun[];
  rungs: HelixRung[];
}

const theta = (y: number) => ((y - PAD_T) / V_STEP) * ((2 * Math.PI) / BP_PER_TURN);

export function helixGeometry(n: number): HelixGeometry {
  const height = PAD_T + n * V_STEP + PAD_B;
  const back: StrandRun[] = [];
  const front: StrandRun[] = [];

  // Strand 1 faces the reader where sin θ > 0 and strand 2 where it is negative, so at every
  // crossover one strand is fully in front and is drawn over the other. A run changes depth at
  // the helix's outer edge, where nothing crosses it, and shares its end point with the next so
  // the strand stays one continuous line.
  for (const strand of [1, 2] as const) {
    const sign = strand === 1 ? 1 : -1;
    let run: HelixPoint[] = [];
    let facing: boolean | null = null;
    const steps = n * SAMPLES;
    for (let s = 0; s <= steps; s++) {
      const y = PAD_T + (s / SAMPLES) * V_STEP;
      const t = theta(y);
      const p = { x: CX + sign * AMPLITUDE * Math.cos(t), y };
      const isFront = sign * Math.sin(t) >= 0;
      if (facing !== null && isFront !== facing) {
        run.push(p);
        (facing ? front : back).push({ strand, points: run });
        run = [];
      }
      facing = isFront;
      run.push(p);
    }
    if (run.length > 1 && facing !== null) (facing ? front : back).push({ strand, points: run });
  }

  const letterW = estimateTextWidth('G', BASE_FS, true);
  const rungs: HelixRung[] = [];
  for (let i = 0; i < n; i++) {
    const y = PAD_T + (i + 0.5) * V_STEP;
    const t = theta(y);
    const c = Math.cos(t);
    // A strand runs on a slant, so over a letter's half-height it reaches sideways by
    // slope × half-height; the letter clears that reach, not just the strand's x at its middle.
    const slope = AMPLITUDE * Math.abs(Math.sin(t)) * ((2 * Math.PI) / (BP_PER_TURN * V_STEP));
    const inset = STRAND_HALF_W + BASE_GAP + (slope * BASE_FS) / 2;
    // Below this span the rung is too short to hold both letters between the strands (a pair
    // seen edge-on near a crossover), so they move outside and flank the pair instead.
    const insideMin = 2 * (inset + letterW) + 4;
    const x1 = CX + AMPLITUDE * c;
    const x2 = CX - AMPLITUDE * c;
    const oneOnLeft = x1 <= x2;
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    const inside = hi - lo >= insideMin;
    const left = inside
      ? { x: lo + inset, anchor: 'start' as const }
      : { x: lo - inset, anchor: 'end' as const };
    const right = inside
      ? { x: hi - inset, anchor: 'end' as const }
      : { x: hi + inset, anchor: 'start' as const };
    rungs.push({
      idx: i,
      y,
      x1,
      x2,
      base1: oneOnLeft ? left : right,
      base2: oneOnLeft ? right : left,
    });
  }
  return { height, back, front, rungs };
}

/** SVG path data for one run of a strand. */
export function runPath(run: readonly HelixPoint[]): string {
  return run.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
