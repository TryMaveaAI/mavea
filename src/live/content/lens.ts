// content/lens.ts — choosing something from the 608 to draw a piece of meaning with.
//
// The living world renders through four bespoke layouts, which is right for a causal web and says
// nothing about the rest of the library. The catalog already carries, per component, the data shapes
// it accepts and the prop keys it needs (`canvas/blocks/catalog/facts`). A lens is the join: read a
// ContentGraph subgraph, name its shape, ask the catalog which components accept that shape, and
// compile props for the winner.
//
// The load-bearing decision is how much the lens claims to be able to fill.
//
// Compiling arbitrary props for 608 components is not a thing anyone can do correctly — `requires`
// names a component's prop KEYS, not their inner types, so "it needs `rows`" is not a contract. What
// IS a contract is a set of keys whose inner shape several components genuinely share, and the
// catalog can be asked which components speak one. So a lens owns a small number of PROP CONTRACTS
// it can fill honestly, and the catalog decides which components those reach. Adding a hierarchy
// component to the catalog makes it available here with no change on this side; adding a contract is
// the deliberate act.
//
// Two rules carried over from the world's representations, because they are the same rules:
//   · A figure is resolved through the TRUST REGISTRY, never read off a graph field. A child whose
//     value does not resolve is not placeable — an unbacked number is no number here either.
//   · A lens REFUSES rather than drawing something thin. A view that can place one child is not a
//     view of anything, and a chip offering it is a promise there is something to see.
import { CATALOG_FACTS, type ComponentFacts } from '../../canvas/blocks/catalog/facts';
import type { DataShape } from '../../canvas/blocks/catalog/meta';
import type { Block } from '../../data/conversation';
import { numberOf } from '../trust';
import { childrenOf, factsOf, type ContentGraph } from './types';

/** What a lens found, and how much of the subject it could actually place. */
export interface LensFitness {
  shape: DataShape;
  /** Entities the plan would place. Below a lens's own floor it does not offer at all. */
  places: number;
}

export interface ViewPlan {
  /** A block the existing canvas renders — no new renderer, no new registry entry. */
  block: Block;
  /** The question this view answers, in the reader's terms. What a chip promises. */
  answers: string;
  /** The component the catalog chose, for the dev log and for a test to assert on. */
  type: string;
}

/** The shape a lens fills. One implements it today; the interface is what tells a second one what it
 *  owes — a fitness that can say no, and a compile that returns a block the canvas already renders.
 *  There is deliberately no registry of them yet: a list with one entry and no reader is a guess
 *  about the second, and the world already cut three views for being rearrangements of a fourth. */
export interface VisualLens {
  id: string;
  /** What this lens is FOR. A lens that answers no question no other lens answers is the matrix
   *  view all over again — built, correct, and cut for being a rearrangement of something else. */
  questionAnswered: string;
  fitness(graph: ContentGraph, subjectId: string): LensFitness | null;
  compile(graph: ContentGraph, subjectId: string): ViewPlan | null;
}

/** The `{ title, root: { label, value, children? } }` contract. */
export const ROOT_CONTRACT: readonly string[] = ['root', 'title'];

/**
 * Components VERIFIED to read the node this contract compiles, and the ones that take a `root` and
 * mean something else by it.
 *
 * This is the honest limit of asking the catalog. `requires` names a component's prop KEYS, and six
 * components require `root` + `title` — but a key is not a contract: `RecursionNode` is
 * `{ call, result }`, a call signature and its return, and `PhyloNode` is `{ name, length, support }`,
 * a taxon and a branch length. Neither takes a magnitude, so a compiled `{ label, value }` renders a
 * blank tree in both. TreemapNode and SunburstNode are structurally identical, which is what makes
 * those a contract rather than a coincidence.
 *
 * Enumerated rather than assumed, and enumerated in BOTH directions: a catalog component that speaks
 * the contract and is missing here, or takes `root` and is not excluded here, fails
 * tests/content-lens.test.tsx. So a new hierarchy component is a test failure naming exactly what to
 * decide — never a card that mounts and draws nothing.
 */
const SPEAKS_ROOT: ReadonlySet<string> = new Set(['sunburst', 'treemap', 'citationchain']);

export const ROOT_MEANS_SOMETHING_ELSE: Readonly<Record<string, string>> = {
  phylotree: 'PhyloNode is {name, length, support} — a taxon and a branch length, not a magnitude',
  recursiontree: 'RecursionNode is {call, result} — a call signature, not a labelled quantity',
  parsetree: 'a grammar production, not a labelled quantity',
};

/** Two causes and a whole: below that a "breakdown" is a label with a number beside it. */
const MIN_PARTS = 2;

const sameContract = (requires: readonly string[], contract: readonly string[]): boolean =>
  requires.length === contract.length && contract.every((key) => requires.includes(key));

/**
 * Every component that accepts `shape` AND speaks `contract`, best first.
 *
 * The DOMAIN filter is what makes this a choice rather than a lottery. Six components speak the
 * hierarchy contract, and three of them declare a domain: `parsetree` is education, `phylotree`
 * science, `recursiontree` code. A parse tree drawn over a revenue breakdown is structurally valid
 * and semantically nonsense, so a component that names its domains is a candidate only inside one of
 * them — and inside one it OUTRANKS the general components, because a phylogenetic tree really is
 * the better drawing of a clade. The catalog already carried this; nobody was asking it.
 *
 * `tier` is deliberately not in the ranking. It grades how safely a component can be handed
 * MODEL-shaped props, and here Mavéa compiles the props itself from figures the registry already
 * resolved — the risk it measures does not exist on this path.
 */
export function componentsFor(
  shape: DataShape,
  contract: readonly string[],
  domain?: string,
): readonly ComponentFacts[] {
  const speaks = CATALOG_FACTS.filter(
    (f) => f.dataShapes.includes(shape) && sameContract(f.requires, contract),
  );
  const inDomain = (f: ComponentFacts): boolean =>
    domain !== undefined && (f.domains ?? []).includes(domain);
  return speaks
    .filter((f) => (f.domains ?? []).length === 0 || inDomain(f))
    .sort(
      (a, b) =>
        Number(inDomain(b)) - Number(inDomain(a)) ||
        b.wowWeight - a.wowWeight ||
        (a.type < b.type ? -1 : 1),
    );
}

/** A node in the shared hierarchy contract. */
interface RootNode {
  label: string;
  value: number;
  children?: RootNode[];
}

/**
 * The parts of `entityId`, resolved through the registry, to whatever depth the graph carries.
 *
 * A part with no resolvable figure is DROPPED, not zeroed: drawn at zero it would read as a measured
 * nothing, which is the finding nobody made. A container whose own figure is absent takes the sum of
 * its parts — the magnitude of a breakdown lives in its children, and sizing it off its own empty
 * field is the bug the canvas rubric calls out by name.
 */
function partsOf(graph: ContentGraph, entityId: string, seen: Set<string>): RootNode[] {
  const out: RootNode[] = [];
  for (const child of childrenOf(graph, entityId)) {
    if (seen.has(child.id)) continue; // a cycle in parentId cannot hang the compile
    seen.add(child.id);
    const parts = partsOf(graph, child.id, seen);
    const own = factsOf(graph, child.id)
      .filter((f) => f.at === undefined)
      .map((f) => graph.trust.values.get(f.valueId))
      .map((v) => (v === undefined ? null : numberOf(v)))
      .find((n): n is number => n !== null);
    const value = own ?? parts.reduce((sum, p) => sum + p.value, 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({ label: child.label, value, ...(parts.length > 0 ? { children: parts } : {}) });
  }
  return out;
}

/**
 * BREAK APART — what is this made of?
 *
 * The question the causal views cannot answer: they say what led to what, and a cause's own
 * composition is a different axis entirely. It is also the affordance a reader reaches for first on
 * a node that has parts, and until now the world answered it with its own geometry rather than with
 * the component the library already has for exactly this.
 */
export const hierarchyLens: VisualLens = {
  id: 'hierarchy',
  questionAnswered: 'What is this made of?',

  fitness(graph, subjectId) {
    const parts = partsOf(graph, subjectId, new Set([subjectId]));
    return parts.length >= MIN_PARTS ? { shape: 'hierarchy', places: parts.length } : null;
  },

  compile(graph, subjectId) {
    const parts = partsOf(graph, subjectId, new Set([subjectId]));
    if (parts.length < MIN_PARTS) return null;
    const subject = graph.entities.find((e) => e.id === subjectId);
    // The catalog ranks; the verified set decides what is even a candidate. Domain ordering survives
    // inside it, so a domain-specific component that DOES speak the contract still wins in its own
    // domain — the capability is intact, the unverified ones are simply not offered.
    const chosen = componentsFor('hierarchy', ROOT_CONTRACT, subject?.domain).find((f) =>
      SPEAKS_ROOT.has(f.type),
    );
    if (!chosen) return null;
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    return {
      type: chosen.type,
      answers: hierarchyLens.questionAnswered,
      block: {
        id: `lens:${subjectId}`,
        type: chosen.type,
        props: {
          title: subject?.label ?? graph.title,
          root: { label: subject?.label ?? graph.title, value: total, children: parts },
        },
      } as unknown as Block,
    };
  },
};
