// lookup.ts — fast access to a component's metadata by type.
//
// The catalog is split in two: compact selection FACTS (always resident, ~35 KB) and authoring
// DETAILS (blurb, requires, prop hints — 72% of the bytes, loaded per family on demand). Most
// callers only need facts, and should call `catalogFacts` directly. `catalogMeta` reassembles the
// full record for the two places that genuinely need details: the prompt menu and the generic
// coercer. It returns undefined until the type's family has been loaded — failing closed, because a
// meta with an empty `requires` list would let the coercer emit a malformed block in silence.
import type { ComponentMeta } from './meta';
import { catalogFacts } from './facts';
import { detailFor } from './details';

/** The full metadata for a block type — facts merged with its lazily-loaded details.
 *
 *  Returns undefined when the type is unknown OR when its family's details are not resident yet.
 *  Callers on a generation path must `await ensureDetails(types)` first (generateLive does); tests
 *  get everything preloaded by `tests/setup.ts`. */
export function catalogMeta(type: string): ComponentMeta | undefined {
  const facts = catalogFacts(type);
  if (!facts) return undefined;
  const detail = detailFor(type);
  if (!detail) return undefined;
  return { ...facts, ...detail };
}
