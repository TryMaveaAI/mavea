// content/types.ts — the semantic layer under every surface: what an answer is ABOUT, apart from how
// it is drawn.
//
// The living world grew its own truth universe. A WorldSpec holds entities, the relations between
// them and the figures attached to them, all fully evidenced — and it was the only thing in Mavéa
// that did, so "no orphan pixels" held on one surface and nowhere else. An ordinary answer's chart
// prints a number the same model authored with nothing standing behind it.
//
// This is that structure, extracted and made producer-agnostic. A world produces one (content/
// fromWorld); an ordinary turn's blocks produce one (content/fromAnswer). What consumes a graph does
// not know or care which: the trust registry indexes its facts, and a lens (content/lens) chooses
// something to draw from its shape. The world becomes ONE producer rather than the truth.
//
// Deliberately small. Three node kinds and a registry, because that is what both producers actually
// have and what a renderer actually needs — a richer ontology nobody fills in is a schema, not a
// capability.
import type { TrustRegistry } from '../trust';

/** What kind of thing an entity is, where a producer can say. Absent is honest and common: a chart's
 *  x-axis categories are entities with no role at all.
 *
 *  The first three ARE why/types' CausalRole, spelled the same on purpose — a causal producer's role
 *  passes straight through rather than being translated into a synonym, and a translation is where
 *  two vocabularies start meaning slightly different things. */
export type EntityRole = 'root' | 'mechanism' | 'outcome' | 'category' | 'measure' | 'period';

export interface Entity {
  id: string;
  label: string;
  role?: EntityRole;
  /** A sentence of standing context, where the producer had one. */
  detail?: string;
  /** The sphere it belongs to — the surface's categorical channel. */
  domain?: string;
  /** The entity this one is PART OF. Depth is unbounded here on purpose: a breakdown of a breakdown
   *  is an ordinary shape, and the limit on how deep a reader can go belongs to the renderer's
   *  level of detail, never to the data. */
  parentId?: string;
}

/** One thing bearing on another. `weight` is a measured share, absent when nothing measured one —
 *  never zero, which would be a finding. */
export interface Relation {
  id: string;
  from: string;
  to: string;
  kind?: string;
  sign?: 1 | -1;
  weight?: number;
}

/**
 * One figure, addressed by the id the trust registry knows it under.
 *
 * A fact holds no NUMBER. That is the whole point of routing figures through the registry: a value
 * with nothing behind it does not resolve, so it cannot be printed — and a fact that carried its own
 * copy of the number would be a second, unbacked route to the screen.
 */
export interface Fact {
  /** The registry key. `ProvValue id={...}` resolves exactly this. */
  valueId: string;
  entityId: string;
  /** The time label, when this fact is one observation in a history. */
  at?: string;
}

export interface ContentGraph {
  title: string;
  entities: readonly Entity[];
  relations: readonly Relation[];
  facts: readonly Fact[];
  /** Every figure the graph can prove, and where each is used. */
  trust: TrustRegistry;
  /** The thing being explained, when the answer explains something. */
  outcomeId?: string;
  /** True when the whole graph is a textbook shape rather than a measurement of anything. Carried at
   *  the graph level because it outranks any individual figure's tier. */
  illustrative?: boolean;
}

/** The entities directly PART OF `parentId` — one level down, in graph order. */
export function childrenOf(graph: ContentGraph, parentId: string): readonly Entity[] {
  return graph.entities.filter((e) => e.parentId === parentId);
}

/** Every fact about one entity, in graph order — a single figure, or a history when they carry `at`. */
export function factsOf(graph: ContentGraph, entityId: string): readonly Fact[] {
  return graph.facts.filter((f) => f.entityId === entityId);
}

/** Depth below the top level: 0 for an entity nobody contains. Walks up, so a cycle in `parentId`
 *  (which a producer should never emit, and a coercer should never pass) terminates rather than
 *  hanging the renderer. */
export function depthOf(graph: ContentGraph, entityId: string): number {
  const byId = new Map(graph.entities.map((e) => [e.id, e]));
  const seen = new Set<string>([entityId]);
  let depth = 0;
  let at = byId.get(entityId)?.parentId;
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    depth += 1;
    at = byId.get(at)?.parentId;
  }
  return depth;
}
