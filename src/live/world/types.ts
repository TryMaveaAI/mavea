// world/types.ts — the living-world contract: a WorldSpec is the causal web a conversation keeps
// alive across turns. Structurally it is a superset of why/types' WhyDag — every node and edge
// carries the why field set unchanged, so asWhyDag() hands the cascade engine a faithful
// projection — enriched with what a persistent world accretes: per-node time series, a one-level
// breakdown into children, and edges that can hold several receipts, a typed relation, and a
// DERIVED support status. `title` is the user's original question, pinned verbatim: it is the
// blockSignature key that keeps the world's block identity stable across augment/refine merges.
import type { Receipt, Tier } from '../ground/types';
import type { WhyEdge, WhyNode } from '../why/types';
import type { EdgeRelation, EdgeStatus } from '../trust/relations';

const YEAR = /^\d{4}$/;
const YEAR_MONTH = /^(\d{4})[-/](\d{1,2})$/;

/**
 * Read a world time label — a series point's `t`, or a node's own `date` — as epoch ms, or null when
 * it is not a time at all. The label is the source's own wording ("2008", "2008-03", "Mar 2024"), so
 * bare years and year-months are parsed explicitly (`Date.parse` reads "2008-03" as UTC but a bare
 * "2008" only by engine luck) and anything else falls through to `Date.parse`.
 *
 * It lives with the contract rather than with either of its callers because both the honesty gate
 * (world/validate) and the layout adapter (spatial/morph) have to agree, exactly, on what counts as
 * a date — a gate that admits a label the timeline cannot place would shelve it silently.
 */
export function parseWorldTime(t: string): number | null {
  const s = t.trim();
  if (YEAR.test(s)) return Date.UTC(Number(s), 0, 1);
  const ym = YEAR_MONTH.exec(s);
  if (ym) {
    const month = Number(ym[2]);
    if (month >= 1 && month <= 12) return Date.UTC(Number(ym[1]), month - 1, 1);
    return null;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** When a node happened: an instant (`t`) or, with `until`, a period. Both are time labels in the
 *  same vocabulary a series point uses. A date is not a measurement — it carries no receipt and no
 *  tier — but it must parse, or the gate drops it. */
export interface WorldDate {
  t: string;
  /** The end of the period, when the node covers one. Later than `t`, or it is dropped. */
  until?: string;
}

/** One dated observation. A point on a real (T1/T2) series carries its own receipt. */
export interface WorldSeriesPoint {
  /** The point's time label, verbatim from the source ("2008", "Mar 2024"). */
  t: string;
  value: number;
  receipt?: Receipt;
}

/** A node's history over time. One tier covers all points: real (T1/T2) points are individually
 *  receipted; a T3 series exists only inside an illustrative world; T0 cannot carry a series at
 *  all — a series IS numbers, and T0 is the no-number tier. */
export interface WorldSeries {
  points: WorldSeriesPoint[];
  unit?: string;
  tier: Tier;
  /** Series-level source (the document/table the points were read from). */
  receipt?: Receipt;
}

/** The spheres a cause can live in. A closed vocabulary, because the surface colours by it: an
 *  open-ended field would hand the model a palette generator, and two worlds asking the same
 *  question would come back in different colours. */
export const WORLD_DOMAINS = [
  'economy',
  'policy',
  'technology',
  'science',
  'environment',
  'society',
  'health',
  'conflict',
] as const;

export type WorldDomain = (typeof WORLD_DOMAINS)[number];

/** Coerce a model-authored domain onto the allowlist. Anything unrecognised becomes ABSENT, never
 *  a default: an unlabelled node reads as unlabelled, while a wrongly-labelled one asserts a
 *  category nobody claimed. (Unlike a relation, which has a weakest honest arm to fall back to,
 *  a domain has no "least claim" member.) */
export function asWorldDomain(v: unknown): WorldDomain | undefined {
  return typeof v === 'string' && (WORLD_DOMAINS as readonly string[]).includes(v)
    ? (v as WorldDomain)
    : undefined;
}

/** A world node: the why node plus what a living answer accretes onto it. */
export interface WorldNode extends WhyNode {
  /** The sphere this cause belongs to — the surface's categorical channel. Optional by design:
   *  plenty of causes sit in no single sphere, and the honest render for those is no mark. */
  domain?: WorldDomain;
  /** When this happened. A node's own date is the ONLY way a wholly qualitative cause reaches the
   *  timeline — a series span dates the observations, not the cause. */
  date?: WorldDate;
  series?: WorldSeries;
  /** One-level breakdown (≤4), ids namespaced `${parent}.${slug}`. Never nested deeper — a
   *  grandchild is dropped at the gate — and the cascade engine never sees children at all. */
  children?: WorldNode[];
  /** A sentence of standing context for the node's expanded card. */
  detail?: string;
}

/** A world edge: the why edge plus multi-receipt evidence and a typed relation. What an edge does
 *  NOT assert is never stored — the render layer takes it from trust/relations'
 *  NOT_REPRESENTED_AS template, so model-authored epistemics can't sneak into the record. */
export interface WorldEdge extends WhyEdge {
  /** The claim vocabulary (trust/relations). Absent = an untyped why-style edge. */
  relation?: EdgeRelation;
  /** Independently verified receipts, capped at 3; `receipts[0]` is always `receipt`. */
  receipts?: Receipt[];
  /** DERIVED support level (validate.ts's deriveEdgeStatus) — never model-authored. */
  status?: EdgeStatus;
  /** A verified receipt AGAINST the claim; alongside support receipts it makes the edge
   *  'contested'. */
  counter?: Receipt;
}

export interface WorldSpec {
  /** The original question, verbatim and PINNED — the world's blockSignature key. */
  title: string;
  /** The id of the outcome node the world explains. */
  outcomeId: string;
  nodes: WorldNode[];
  edges: WorldEdge[];
  provenance: {
    /** The whole world is an illustrative/textbook explanation (T3), not the user's data. */
    illustrative?: boolean;
    notes?: string[];
  };
}
