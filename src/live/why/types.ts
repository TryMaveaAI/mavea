// why/types.ts — the causal-web contract. A "why" question explodes into a DAG of roots → mechanisms
// → an outcome, where every edge can carry a weighted, receipted contribution. Tiers and receipts come
// straight from the shared honesty spine, so a number here obeys the same rule as everywhere else: a
// real figure needs a T1/T2 receipt, everything else is qualitative (T0) and shown faint.
import type { Tier, Receipt } from '../ground/types';
import type { EdgeRelation, EdgeStatus } from '../trust/relations';

export type CausalRole = 'root' | 'mechanism' | 'outcome';

export interface WhyNode {
  id: string;
  label: string;
  role: CausalRole;
  /** Causal depth: 0 = root, increasing toward the outcome. Drives left→right layout. */
  depth: number;
  tier: Tier;
  /** A grounded magnitude for this node (the outcome's measured move, a root's own figure). Present
   *  only for T1/T2 nodes; a T0 node has none. */
  value?: number;
  unit?: string;
  receipt?: Receipt;
}

export interface WhyEdge {
  id?: string;
  from: string;
  to: string;
  /** Short causal verb for the edge label ("raised", "delayed"). */
  verb?: string;
  /** Contribution share ∈ [0,1] of `to`'s move attributable to `from`. REAL only when the edge is
   *  T1/T2; absent on a T0 edge (qualitative — relative thickness only, no number). */
  weight?: number;
  /** +1 reinforcing, -1 dampening. */
  sign: 1 | -1;
  tier: Tier;
  receipt?: Receipt;
  /** A model-asserted link with no receipt: rendered faint/dashed, never wears a receipt badge. */
  provisional?: boolean;
  /** What the link CLAIMS, from trust/relations' closed vocabulary. Absent = an untyped link, which
   *  the evidence panel reads as the weakest honest claim rather than a full cause. */
  relation?: EdgeRelation;
  /** Independently verified quotes, capped at three. `receipts[0]` is always `receipt`, so every
   *  existing reader of a single receipt keeps working unchanged. */
  receipts?: Receipt[];
  /** DERIVED support level (trust/receipts' deriveEdgeStatus) — never model-authored. */
  status?: EdgeStatus;
  /** A verified quote AGAINST the claim. Alongside support, it makes the link 'contested', which a
   *  reader must see: evidence on both sides is the one state a single receipt cannot express. */
  counter?: Receipt;
}

export interface WhyDag {
  /** The question, verbatim. */
  center: string;
  /** The id of the outcome node the causes explain. */
  outcomeId: string;
  nodes: WhyNode[];
  edges: WhyEdge[];
  provenance: {
    /** The whole web is an illustrative/textbook explanation (T3), not the user's measured data. */
    illustrative?: boolean;
    notes?: string[];
  };
}

/** A counterfactual: set a node's activation (0 = prune the cause, 1 = full, anything between = lever)
 *  or scale one edge. */
export interface Intervention {
  nodeId?: string;
  edgeId?: string;
  /** 0..1. */
  pct: number;
}

export interface CascadeResult {
  /** Current contribution fraction per node (null where it can't be computed from grounded weights). */
  byNode: Map<string, number | null>;
  /** Change in the outcome's real magnitude vs. baseline, in the outcome's own units. Null unless the
   *  whole causal path to the outcome is grounded (T1/T2 + weighted) — never a made-up delta. */
  outcomeDelta: number | null;
  /** Fraction of the outcome currently explained by active causes (0..1). Null unless fully grounded. */
  explainedPct: number | null;
  /** True only when the outcome has a grounded value and every edge is weighted and T1/T2. Gates every
   *  precise number in the UI. */
  fullyGrounded: boolean;
  /** Structure-only RELATIVE strength per node (0..1), always computed — even with no grounded
   *  figures — using uniform weights. This is never a measured contribution (the UI labels it
   *  "relative, not measured"); it exists so levers and prunes still visibly move the conclusion in
   *  the ungrounded default state. */
  relativeByNode: Map<string, number>;
  /** The outcome node's relative strength (0..1), or null if there is no outcome node. */
  relativeOutcome: number | null;
}
