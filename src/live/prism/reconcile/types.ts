// reconcile/types.ts — "the numbers that don't add up." A NumberAtom is one figure pulled VERBATIM
// from a grounded claim's quote (so it already passed the document gate). A Reconciliation is a
// contradiction between two of the document's OWN figures, computed in pure code — never by a model
// (the model only ever proposes which figures the document relates; see run.ts / check.ts). The verdict
// is calculator-verifiable: a reader can redo the arithmetic on their phone.

/** What kind of quantity a figure is, so only comparable figures are ever checked against each other. */
export type NumUnit = '%' | 'currency' | 'x' | 'count';

/** One figure, extracted verbatim from a claim's quote (which already passed the grounding gate). */
export interface NumberAtom {
  /** Stable id: `${claimId}#${i}`. */
  id: string;
  claimId: string;
  page: number;
  /** The matched text exactly as written, e.g. "$13M", "40%", "3×". */
  raw: string;
  /** Normalized magnitude, e.g. 13000000, 40, 3. */
  value: number;
  unit: NumUnit;
  /** Best-effort label from the words around the figure (a hint; the model also sees the full quote). */
  label: string;
  /** The claim's full quote, for context in the pairing prompt. */
  quote: string;
}

/** A contradiction between the document's own figures, computed in pure code.
 *  - `equality`: the document states the SAME quantity as two different values (prose-vs-table drift).
 *  - `growth`: a stated "% change" doesn't match the change between the two values it's computed from. */
export interface Reconciliation {
  id: string;
  kind: 'equality' | 'growth';
  /** The quantity in question, e.g. "revenue growth". */
  label: string;
  /** What the document stated, e.g. "40%". */
  stated: string;
  /** What the arithmetic actually gives, e.g. "30%". */
  computed: string;
  /** The full receipt, e.g. "p.4: 40%  ✕  p.4: $10M→$13M = 30%". */
  detail: string;
  /** Every claim involved (for glowing the cards). */
  claimIds: string[];
  /** The two claim ids to connect with a thread (equal when both figures share one claim). */
  a: string;
  b: string;
}
