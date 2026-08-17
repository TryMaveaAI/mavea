// world/stress.ts — how much of this explanation actually stands up, and where it is thinnest.
//
// The surface already knows which links are evidenced: a T1/T2 edge with a verified receipt is
// `supported`, one with a grounded objection is `contested`, and an edge nothing backs is
// `provisional` (trust/relations). Until this existed, that knowledge was only ever a line weight —
// a reader could see that some arrow was fainter than another and had no way to ask the question the
// distinction exists to answer: if I only believe what is sourced, does this explanation still
// reach its outcome?
//
// Two readings, both pure, both O(V+E) per edge on a web capped at 16 nodes and 48 links, so the
// whole thing is free and costs no model call. This is BYOK: a reader may pull this as often as they
// like.
import type { WorldSpec } from './types';

/** A link the reader is being asked to take on trust. `contested` counts: a grounded objection is
 *  a reason to doubt the link, not a reason to treat it as established. */
const isProvisional = (status: string | undefined): boolean => status !== 'supported';

/** Every node that can still reach `outcomeId` using only the links in `keep`. Walked BACKWARD from
 *  the outcome, which is the direction the question is asked in — "what still explains this?" */
function reaches(spec: WorldSpec, keep: (index: number) => boolean): Set<string> {
  const into = new Map<string, string[]>();
  spec.edges.forEach((e, i) => {
    if (!keep(i) || e.from === e.to) return;
    const list = into.get(e.to);
    if (list) list.push(e.from);
    else into.set(e.to, [e.from]);
  });
  const seen = new Set<string>([spec.outcomeId]);
  const stack = [spec.outcomeId];
  while (stack.length > 0) {
    for (const from of into.get(stack.pop()!) ?? []) {
      if (seen.has(from)) continue;
      seen.add(from);
      stack.push(from);
    }
  }
  return seen;
}

export interface GroundedOnly {
  /** Node ids that still reach the outcome through supported links alone. Always holds the outcome:
   *  the thing being explained does not stop existing because the explanation thinned out. */
  standing: ReadonlySet<string>;
  /** Node ids that reach the outcome in the full world but not in the grounded one — the causes
   *  whose only route runs through something nobody has sourced. */
  cutOff: readonly string[];
}

/** What survives if the reader believes only what is sourced. */
export function groundedOnly(spec: WorldSpec): GroundedOnly {
  const standing = reaches(spec, (i) => !isProvisional(spec.edges[i].status));
  const cutOff = [...reaches(spec, () => true)].filter((id) => !standing.has(id));
  return { standing, cutOff };
}

export interface WeakestLink {
  /** Index into `spec.edges`. An index rather than an id because an edge id is optional. */
  index: number;
  /** How many causes lose every route to the outcome when this link is cut. Always ≥ 1. */
  isolates: number;
}

/**
 * The provisional link the explanation leans on hardest: the one whose removal disconnects the most
 * causes from the outcome. Null when nothing is provisional, or when no single unsourced link is
 * load-bearing at all (a web where every cause has a sourced route is not resting on any of them).
 *
 * This is a genuinely different question from "which link is least evidenced". A dozen provisional
 * links matter differently: one may be decoration on a cause the outcome reaches three other ways,
 * while another is the only thing joining half the web to the thing being explained. Naming the
 * second is what turns a legend into a finding.
 *
 * Ties break on the lowest index, so the same world always names the same link.
 */
export function weakestLink(spec: WorldSpec): WeakestLink | null {
  const full = reaches(spec, () => true);
  let best: WeakestLink | null = null;
  for (let cut = 0; cut < spec.edges.length; cut += 1) {
    if (!isProvisional(spec.edges[cut].status)) continue;
    const without = reaches(spec, (i) => i !== cut);
    const isolates = [...full].filter((id) => !without.has(id)).length;
    if (isolates > 0 && (!best || isolates > best.isolates)) best = { index: cut, isolates };
  }
  return best;
}
