// examples.ts — a real, correct props example for each block type, derived from the authored demo
// conversations and explicit fallbacks. `referenceExamples.generated.json` is checked against
// those sources in every verification run, so it cannot drift; keeping only the bounded prop
// references here prevents a first Live turn from fetching the entire gallery/demo narrative.
//
// Why: the per-turn menu tells the model a component's required/optional field NAMES, but for
// the advanced components that isn't enough — the model has to guess the nested shape (e.g.
// that `cats` is `[{label, pct, color}]`) and fills it wrong, so the block renders broken or
// the coercer drops it. A concrete example is what an LLM copies most reliably — far better
// per token than a JSON-Schema/Zod description, and it teaches the token idioms (color vars,
// 0–100 percents) a schema can't. We show it ONLY for the turn's advanced picks (core blocks
// are already taught in the base prompt), so the prompt cost stays minimal.
import REFERENCE_EXAMPLES from './referenceExamples.generated.json';

/** First authored instance of each block type's props, pre-bounded to the dense prompt ceiling. */
const PROPS_BY_TYPE = REFERENCE_EXAMPLES as Readonly<Record<string, unknown>>;

/** The same real fixture used to teach a hero component's shape. The generic runtime coercer uses
 * it as a structural contract too, so a model cannot be shown one nested shape and then have an
 * incompatible object passed through to React. Values are never copied into an answer. */
export function referencePropsFor(type: string): Readonly<Record<string, unknown>> | null {
  const props = PROPS_BY_TYPE[type];
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

/** A JSON example of this block type's props, or null if the demos don't use it. Stable across
 *  turns (the source props are computed once). `dense` gives a fuller, demo-grade example (more
 *  items, longer strings) for a lead hero; the default thin shape keeps ordinary heroes cheap. */
export function exampleFor(type: string, dense = false): string | null {
  const key = `${dense ? 'd' : 'c'}:${type}`;
  const cached = EXAMPLE_CACHE.get(key);
  if (cached !== undefined) return cached;
  // The generated map already preserves demo-first priority, then explicit authored fallbacks.
  const props = referencePropsFor(type);
  let out: string | null = null;
  if (props !== undefined) {
    try {
      out = JSON.stringify(compact(props, dense ? DENSE : COMPACT));
    } catch {
      out = null;
    }
  }
  EXAMPLE_CACHE.set(key, out);
  return out;
}
