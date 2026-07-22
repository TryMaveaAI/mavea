// types.ts — the MindShapeSpec data contract.
// No x/y coordinates: layout is computed at render time from the emergent clusters
// (themes named from the person's own words); atom.kind only tints a node — it never
// fixes position. center + unsaid may be populated live by the model seed (settleMindShape during
// 'listening'), not only at settle.
export type MindAtomKind =
  | 'person'
  | 'option'
  | 'want'
  | 'fear'
  | 'constraint'
  | 'tradeoff'
  | 'contradiction'
  | 'open_loop'
  | 'action'
  | 'value'
  | 'question';

export type MindAtomStatus = 'forming' | 'stable' | 'maybe';
export type MindAtomConfidence = 'said' | 'inferred';

export interface MindAtom {
  id: string;
  kind: MindAtomKind;
  /** Short display label. ≤40 chars — clamped by validateMindShape. */
  label: string;
  /** Verbatim span from the transcript. REQUIRED — validateMindShape drops atoms without one. */
  quote: string;
  status: MindAtomStatus;
  confidence: MindAtomConfidence;
  /** Salience 1–3 (1 = mentioned once; 3 = central). */
  weight?: number;
}

export type MindLinkKind = 'supports' | 'tensions' | 'depends_on' | 'same_thread' | 'blocks';

export interface MindLink {
  from: string;
  to: string;
  kind: MindLinkKind;
  /** Short label for tension lines, e.g. "pulls against". ≤30 chars. */
  label?: string;
  /** True for a client-inferred "possible tension?" hint — rendered faint and unlabeled until the
   *  model's settle/patch confirms and names it. Never set on a model-authored link (coerceLink
   *  drops it), so a guessed conflict can never masquerade as one Mavéa actually found. */
  provisional?: boolean;
}

export interface MindUnsaid {
  /** The one thing they circled but never said. ≤40 chars. */
  label: string;
  /** Why you think so. ≤120 chars. */
  why: string;
  /** Always 'maybe' — never claim certainty about the unsaid. */
  confidence: 'maybe';
}

/** An emergent theme — a cluster of atoms about the same thing the person actually raised.
 *  The label is named from their own words ("the move to Seattle", "Maya", "the consulting
 *  offer"), never a fixed category. Clusters, not kinds, organize the map's layout. */
export interface MindCluster {
  id: string;
  /** Theme name in the person's own words. Content-derived, never generic. ≤32 chars. */
  label: string;
  /** Ids of the atoms that belong to this theme. */
  atomIds: string[];
  /** Salience 1–3 — drives the cluster's prominence/order at render. */
  weight?: number;
}

/** Detected intent of a thinking session — drives adaptive labels and action copy. */
export type MindIntent = 'decision' | 'planning' | 'exploration' | 'processing' | 'general';

/** A transient signal chip shown near the face while listening — Mavéa noticing a pattern.
 *  Silent (never spoken), auto-dismissed after 5 seconds, max one at a time. */
export interface MindSignal {
  id: string;
  content: string;
  kind: 'pattern' | 'tension' | 'unsaid' | 'depth';
  expiresAt: number;
}

/** Complete extracted mindshape. Layout is computed from the emergent clusters at render time. */
export interface MindShapeSpec {
  /** The inferred hidden question driving everything. Settle-only. ≤90 chars. */
  center: string;
  /** Optional short title. */
  title?: string;
  atoms: MindAtom[];
  links: MindLink[];
  /** Emergent themes named from the person's words — the organizing unit for layout. */
  clusters?: MindCluster[];
  /** The one unsaid/hidden thing. Surfaced by the model seed (live) or the settle call. */
  unsaid?: MindUnsaid;
}

/** A delta from an incremental patch call during listening — only what's new since the last
 *  update, merged client-side into the live spec. It is never a wholesale replace (settle is the
 *  one authority that can prune); the map only grows while listening. Emitting just the delta
 *  costs a fraction of re-sending the whole shape on every patch. */
export interface MindShapePatch {
  /** New atoms — or an in-place update when the id already exists. Each carries a verbatim quote. */
  add: MindAtom[];
  /** New links between atoms. */
  addLinks: MindLink[];
}
