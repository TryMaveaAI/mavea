// why/engine.ts — the pure counterfactual engine. Zero deps, zero model calls: every lever drag /
// prune re-runs this synchronously. The honesty rule is baked in, not bolted on: a precise outcome
// delta or "% explained" is produced ONLY when the entire causal path to the outcome is grounded
// (T1/T2 with real weights). The instant any contributing edge is ungrounded or weightless, the
// numeric result is null — the UI shows "—", never a plausible-but-invented figure.
import { isReal } from '../ground/types';
import type { CascadeResult, Intervention, WhyDag } from './types';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Kahn topological order, or null if the graph has a cycle (a causal web must be acyclic — a cycle is
 *  refused rather than resolved to an arbitrary fixed point). Edges to/from unknown nodes are ignored. */
export function topoOrder(d: WhyDag): string[] | null {
  const ids = new Set(d.nodes.map((n) => n.id));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of d.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of d.edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    adj.get(e.from)!.push(e.to);
  }
  const queue = d.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    for (const v of adj.get(u) ?? []) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  return order.length === d.nodes.length ? order : null;
}

/** Every edge is weighted + T1/T2, and the outcome has a grounded (T1/T2) value. Only then may the
 *  engine report precise pp deltas / "% explained". */
export function isFullyGrounded(d: WhyDag): boolean {
  const outcome = d.nodes.find((n) => n.id === d.outcomeId);
  if (
    !outcome ||
    typeof outcome.value !== 'number' ||
    !Number.isFinite(outcome.value) ||
    !isReal(outcome.tier)
  ) {
    return false;
  }
  // every() is vacuously true on an empty array — an edgeless web (every proposed edge dropped by
  // validation, or none proposed at all) must never read as "fully grounded": there is no causal
  // path to the outcome to have grounded in the first place.
  return (
    d.edges.length > 0 &&
    d.edges.every(
      (e) => typeof e.weight === 'number' && Number.isFinite(e.weight) && isReal(e.tier),
    )
  );
}

/**
 * Run the causal web forward with a set of interventions. Roots start fully active (1) unless an
 * intervention sets their activation; every other node's contribution propagates as
 * `delta(n) = Σ over incoming edges of sign · weight · delta(from)`. A missing weight or an
 * un-computed upstream value makes a node's contribution null (it can't be faked).
 */
export function cascade(d: WhyDag, interventions: Intervention[] = []): CascadeResult {
  const order = topoOrder(d);
  const allNull: CascadeResult = {
    byNode: new Map(d.nodes.map((n) => [n.id, null])),
    outcomeDelta: null,
    explainedPct: null,
    fullyGrounded: false,
    relativeByNode: new Map(d.nodes.map((n) => [n.id, 0])),
    relativeOutcome: null,
  };
  if (!order) return allNull;

  const act = new Map<string, number>();
  for (const iv of interventions) if (iv.nodeId) act.set(iv.nodeId, clamp01(iv.pct));

  const incoming = new Map<string, WhyDag['edges']>();
  for (const e of d.edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e);
  }

  const compute = (activations: Map<string, number>): Map<string, number | null> => {
    const delta = new Map<string, number | null>();
    for (const id of order) {
      const inc = incoming.get(id) ?? [];
      if (inc.length === 0) {
        delta.set(id, activations.get(id) ?? 1); // a root's activation (default fully active)
        continue;
      }
      let sum = 0;
      let ok = true;
      for (const e of inc) {
        const from = delta.get(e.from);
        if (from == null || typeof e.weight !== 'number') {
          ok = false;
          break;
        }
        sum += e.sign * e.weight * from;
      }
      delta.set(id, ok ? sum : null);
    }
    return delta;
  };

  const current = compute(act);
  const byNode = new Map<string, number | null>(
    d.nodes.map((n) => [n.id, current.get(n.id) ?? null]),
  );

  // Structure-only RELATIVE pass — uniform weights, so it runs whether or not anything is grounded.
  // A root starts at its activation (1 by default; a lever sets it; a prune is 0); a downstream node
  // is the clamped MEAN of its sign-adjusted upstream strengths (mean, not sum, so a node with many
  // supporters can't exceed 1, and an inhibitor at full strength pulls it toward 0). This is what
  // makes the "CONCLUSION, LIVE" panel and per-node shares visibly respond to a lever or a prune in
  // the ungrounded default — it is deliberately NOT a measured contribution.
  const relative = new Map<string, number>();
  for (const id of order) {
    const inc = incoming.get(id) ?? [];
    if (inc.length === 0) {
      relative.set(id, clamp01(act.get(id) ?? 1));
      continue;
    }
    let sum = 0;
    for (const e of inc) sum += e.sign * (relative.get(e.from) ?? 0);
    relative.set(id, clamp01(sum / inc.length));
  }
  const relativeByNode = new Map<string, number>(
    d.nodes.map((n) => [n.id, relative.get(n.id) ?? 0]),
  );
  const relativeOutcome = relative.has(d.outcomeId) ? relative.get(d.outcomeId)! : null;

  if (!isFullyGrounded(d)) {
    return {
      byNode,
      outcomeDelta: null,
      explainedPct: null,
      fullyGrounded: false,
      relativeByNode,
      relativeOutcome,
    };
  }

  const baseline = compute(new Map());
  const value = d.nodes.find((n) => n.id === d.outcomeId)!.value!;
  const cur = current.get(d.outcomeId);
  const base = baseline.get(d.outcomeId);
  const outcomeDelta = cur != null && base != null ? (cur - base) * value : null;
  const explainedPct = cur != null ? cur : null;
  return {
    byNode,
    outcomeDelta,
    explainedPct,
    fullyGrounded: true,
    relativeByNode,
    relativeOutcome,
  };
}
