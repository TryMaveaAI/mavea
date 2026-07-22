// facts.ts — the compact selection index, decoded once.
//
// Every turn the selector scores the WHOLE reachable library: hard gate, shape fit, intent fit,
// archetype clustering, weighted draw. None of that reads a blurb or a prop hint. Splitting those
// "facts" from the authoring "details" is what keeps per-turn cost proportional to the answer rather
// than to the library — the facts index is the only structure that is O(library), it is ~35 KB at
// 600 components, and the detail payload (72% of the catalog's bytes) loads lazily, per family, only
// for the components a turn actually offers.
//
// The rows arrive tuple-encoded with interned strings (facts.generated.ts). Decoding is a single
// linear pass at module load: ~600 small object allocations, no parsing of prose.
import {
  ARCHETYPES,
  CAPS,
  COERCERS,
  DOMAINS,
  EMBEDS,
  FACT_ROWS,
  FAMILIES,
  INTENTS,
  SHAPES,
  TIERS,
  type FactRow,
} from './facts.generated';
import type {
  Archetype,
  Cap,
  CoercerKind,
  ComponentMeta,
  DataShape,
  EmbedKind,
  ReliabilityTier,
} from './meta';

/** Everything the selector needs to rank a component — i.e. `ComponentMeta` minus the fields that
 *  only the prompt menu and the generic coercer read. Structurally a subset, so anything that takes
 *  a `ComponentFacts` also accepts a full `ComponentMeta`. */
export interface ComponentFacts {
  type: string;
  family: string;
  archetype: Archetype;
  dataShapes: DataShape[];
  tier: ReliabilityTier;
  wowWeight: number;
  interactive: boolean;
  coercer: CoercerKind;
  colDefault: number;
  colMin?: number;
  /** Prop keys the component needs to render anything useful — its data contract. Lives in the index
   *  (not the lazy details) because the export/figure path reads it synchronously and it costs almost
   *  nothing: ~12 KB across the whole catalog, against ~120 KB for the blurbs. */
  requires: string[];
  embed?: EmbedKind;
  intents?: string[];
  domains?: string[];
  caps?: Cap[];
}

function decode(r: FactRow): ComponentFacts {
  const [
    type,
    fam,
    arch,
    shapes,
    tier,
    wow,
    inter,
    coercer,
    colD,
    colM,
    embed,
    ints,
    doms,
    caps,
    requires,
  ] = r;
  const facts: ComponentFacts = {
    type,
    family: FAMILIES[fam],
    archetype: ARCHETYPES[arch] as Archetype,
    dataShapes: shapes.map((s) => SHAPES[s] as DataShape),
    tier: TIERS[tier] as ReliabilityTier,
    wowWeight: wow,
    interactive: inter === 1,
    coercer: COERCERS[coercer] as CoercerKind,
    colDefault: colD,
    requires,
  };
  // Absent optionals are encoded as 0 / [] so the tuple stays fixed-width; restore them as absent so
  // a facts row is indistinguishable from the meta it was generated from.
  if (colM) facts.colMin = colM;
  if (embed) facts.embed = EMBEDS[embed - 1] as EmbedKind;
  if (ints.length) facts.intents = ints.map((i) => INTENTS[i]);
  if (doms.length) facts.domains = doms.map((d) => DOMAINS[d]);
  if (caps.length) facts.caps = caps.map((c) => CAPS[c] as Cap);
  return facts;
}

/** Every component's selection facts, in canonical catalog order (the seeded draw depends on it). */
export const CATALOG_FACTS: readonly ComponentFacts[] = FACT_ROWS.map(decode);

const BY_TYPE: ReadonlyMap<string, ComponentFacts> = new Map(CATALOG_FACTS.map((f) => [f.type, f]));

/** Canonical position of each component — the key its detail shard is derived from. */
const INDEX_OF: ReadonlyMap<string, number> = new Map(CATALOG_FACTS.map((f, i) => [f.type, i]));

/** The component's canonical index, or -1. Its detail shard is `index / SHARD_SIZE`. */
export function factIndex(type: string): number {
  return INDEX_OF.get(type) ?? -1;
}

/** The selection facts for a block type, or undefined if it isn't in the catalog. Always available —
 *  unlike `catalogMeta`, this never depends on a family module having been loaded. */
export function catalogFacts(type: string): ComponentFacts | undefined {
  return BY_TYPE.get(type);
}

/** The family a component is authored in — the unit the detail loader fetches. */
export function familyOf(type: string): string | undefined {
  return BY_TYPE.get(type)?.family;
}

/** The detail fields that live in the lazily-loaded family modules rather than in this index. */
export type ComponentDetail = Pick<
  ComponentMeta,
  | 'blurb'
  | 'optional'
  | 'itemShapes'
  | 'stringItems'
  | 'propHints'
  | 'contentBudget'
  | 'defaultProps'
>;
