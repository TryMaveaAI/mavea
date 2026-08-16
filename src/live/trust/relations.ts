// relations.ts — the edge vocabulary for a living answer's causal claims. Allowlist-as-data (the
// asClaimKind pattern): a model-authored relation outside the palette reads as the weakest honest
// claim, never as a stronger one and never as a crash. NOT_REPRESENTED_AS states, per relation,
// what the edge does NOT assert — the UI shows it so a drawn arrow can't over-claim.

export const EDGE_RELATIONS = [
  'contributes',
  'causes',
  'dampens',
  'enables',
  'correlates',
] as const;

export type EdgeRelation = (typeof EDGE_RELATIONS)[number];

/** Coerce a model-authored relation onto the palette. Anything unrecognized becomes 'contributes'
 *  — the weakest positive claim — so an invented neighbour ("influences") can't over-assert. */
export function asEdgeRelation(value: unknown): EdgeRelation {
  const relation = String(value ?? '').toLowerCase();
  return (EDGE_RELATIONS as readonly string[]).includes(relation)
    ? (relation as EdgeRelation)
    : 'contributes';
}

/** How well an edge's claim is backed: receipted, disputed by evidence, or model-asserted only. */
export type EdgeStatus = 'supported' | 'contested' | 'provisional';

/** What each relation must NEVER be read as — rendered alongside the edge so the picture stays
 *  exactly as strong as the evidence. */
export const NOT_REPRESENTED_AS: Record<EdgeRelation, string> = {
  contributes: 'a sole or direct cause',
  causes: 'the only cause, or a measured effect size',
  dampens: 'a full offset',
  enables: 'a cause by itself',
  correlates: 'causation',
};
