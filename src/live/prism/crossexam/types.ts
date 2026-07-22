// crossexam/types.ts — Cross-Examine: the document interrogated by a hostile-but-fair reviewer. For
// each load-bearing claim the model raises the single sharpest objection, constrained to a fixed
// internal-logic taxonomy and welded to the document's OWN verbatim words (the anchor). Then each
// objection is resolved against the document itself: if the document answers it elsewhere (a verbatim
// rebuttal), it's "addressed"; otherwise it stands "open" — the questions the document never answers.

/** The fixed taxonomy — keeps the reviewer on the document's internal logic, never outside facts. */
export type ObjectionKind =
  | 'unstated-assumption'
  | 'missing-baseline'
  | 'cherry-pick'
  | 'overgeneralization'
  | 'undefined-term'
  | 'circular';

/** Human label per kind, for the objection chip. */
export const OBJECTION_LABEL: Record<ObjectionKind, string> = {
  'unstated-assumption': 'Unstated assumption',
  'missing-baseline': 'Missing baseline',
  'cherry-pick': 'Cherry-picked',
  overgeneralization: 'Overgeneralized',
  'undefined-term': 'Undefined term',
  circular: 'Circular',
};

/** One objection, welded to the document's words and resolved against the document itself. */
export interface Objection {
  id: string;
  /** The claim being cross-examined. */
  claimId: string;
  /** The claim's source document (index into the corpus). */
  doc: number;
  kind: ObjectionKind;
  /** The sharp question (internal-logic only). */
  question: string;
  /** The document's own words the objection targets — verbatim-verified. */
  anchorQuote: string;
  /** 1-indexed page of the anchor. */
  anchorPage: number;
  /** 'open' = the document never answers it; 'addressed' = the document answers it elsewhere. */
  status: 'open' | 'addressed';
  /** When addressed: the verbatim sentence from the document that answers it. */
  rebuttalQuote?: string;
  rebuttalPage?: number;
  rebuttalDoc?: number;
}
