// starfield.ts — the atlas backdrop. A deterministic field of faint stars in viewport-percent
// coordinates, seeded from the record count so it never reshuffles between renders (a still sky,
// not a live data view). Pure: no DOM, no Math.random — a small LCG keeps it stable and SSR-safe.

export interface Star {
  /** Position as a viewport percentage (0–100). */
  x: number;
  y: number;
  /** Radius in px. */
  r: number;
  /** Twinkle period + offset (s) — kept in a calm range so the sky shimmers, never flickers. */
  dur: number;
  delay: number;
}

/** A tiny deterministic PRNG (mulberry32) so the field is identical for a given seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Build the starfield. `count` only seeds the RNG and lightly scales density, so a busier atlas
 *  reads as a slightly richer sky; the field is capped so it never costs more than a few dozen nodes. */
export function starfield(count: number): Star[] {
  const n = Math.min(64, 34 + Math.floor(count / 4));
  const next = rng((count + 7) * 2654435761);
  const out: Star[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      x: +(next() * 100).toFixed(2),
      y: +(next() * 100).toFixed(2),
      r: +(next() * 1.6 + 0.7).toFixed(2),
      dur: +(next() * 2.6 + 2.4).toFixed(2),
      delay: +(next() * 3).toFixed(2),
    });
  }
  return out;
}
