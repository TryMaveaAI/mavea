// levers/types.ts — Live Levers: the executable model implied under a narrative document. A LeverNode
// is one figure — either an INPUT (an assumption you can drag) or a DERIVED value computed from others
// by a formula. Every node is grounded by a verbatim quote, and a derived node only survives if its
// formula reproduces the document's OWN printed value at its own printed inputs (the self-consistency
// gate) — so dragging can never produce a number the document's arithmetic wouldn't. Recompute is pure
// code (dag.ts + expr.ts); the model is consulted ONCE, only to propose the structure.

export type LeverUnit = '%' | 'currency' | 'x' | 'count' | 'number';

/** A stated constraint the document leans on ("must clear 1.5×", "profitable" = profit ≥ 0). When the
 *  node's live value violates it, the conclusion flips red. */
export interface LeverBound {
  op: 'gt' | 'gte' | 'lt' | 'lte';
  value: number;
  label?: string;
}

/** One figure in the model. No `formula` ⇒ an input (draggable). With a `formula` ⇒ derived. */
export interface LeverNode {
  /** Stable id, also the variable name used in formulas. */
  id: string;
  label: string;
  /** The document's own stated value (the base, and what Reset returns to). */
  printed: number;
  unit: LeverUnit;
  /** An arithmetic expression over dep ids (e.g. "price * units"); absent for an input. */
  formula?: string;
  /** The ids this node's formula references. */
  deps: string[];
  /** Verbatim grounding for the value/relationship. */
  quote: string;
  page: number;
  /** Which document the quote is in (index into the corpus). */
  doc: number;
  /** A stated constraint that turns the node red when violated. */
  bound?: LeverBound;
  /** Slider range for an input (derived from the printed value). */
  min?: number;
  max?: number;
}

/** The gated, self-consistent model ready to drive. */
export interface LeverModel {
  nodes: LeverNode[];
  /** Ids of the draggable inputs (no formula, feeding at least one consistent derived node). */
  inputs: string[];
}
