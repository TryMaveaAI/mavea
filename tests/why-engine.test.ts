// why-engine.test.ts — the counterfactual math, against hand-computed numbers. Locks the two things
// that make Why Machine honest: pruning a cause drops the outcome by EXACTLY its weighted contribution
// only on a fully-grounded web, and the instant any edge is ungrounded/weightless every precise number
// becomes null (→ "—"), never a fabricated delta. Cycles are refused.
import { describe, it, expect } from 'vitest';
import { cascade, topoOrder, isFullyGrounded } from '../src/live/why/engine';
import type { WhyDag } from '../src/live/why/types';

// Roots → outcome, weights sum to 1.0, everything T1-grounded, outcome value 6.2pp.
const grounded = (): WhyDag => ({
  center: 'Why did churn spike in March?',
  outcomeId: 'O',
  provenance: {},
  nodes: [
    { id: 'A', label: 'Price +18%', role: 'root', depth: 0, tier: 'T1' },
    { id: 'B', label: 'Onboarding broke', role: 'root', depth: 0, tier: 'T1' },
    { id: 'C', label: 'Competitor free tier', role: 'root', depth: 0, tier: 'T1' },
    {
      id: 'O',
      label: 'Churn +6.2pp',
      role: 'outcome',
      depth: 1,
      tier: 'T1',
      value: 6.2,
      unit: 'pp',
    },
  ],
  edges: [
    { from: 'A', to: 'O', weight: 0.45, sign: 1, tier: 'T1' },
    { from: 'B', to: 'O', weight: 0.31, sign: 1, tier: 'T1' },
    { from: 'C', to: 'O', weight: 0.24, sign: 1, tier: 'T1' },
  ],
});

describe('topoOrder', () => {
  it('orders a DAG root-before-outcome', () => {
    const order = topoOrder(grounded())!;
    expect(order).toHaveLength(4);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('O'));
  });
  it('returns null on a cycle', () => {
    const cyc: WhyDag = {
      center: 'x',
      outcomeId: 'O',
      provenance: {},
      nodes: [
        { id: 'A', label: 'a', role: 'root', depth: 0, tier: 'T1' },
        { id: 'B', label: 'b', role: 'mechanism', depth: 1, tier: 'T1' },
        { id: 'O', label: 'o', role: 'outcome', depth: 2, tier: 'T1', value: 1 },
      ],
      edges: [
        { from: 'A', to: 'B', weight: 1, sign: 1, tier: 'T1' },
        { from: 'B', to: 'A', weight: 1, sign: 1, tier: 'T1' },
      ],
    };
    expect(topoOrder(cyc)).toBeNull();
  });
});

describe('cascade — grounded web', () => {
  it('baseline: fully explained, zero delta', () => {
    const r = cascade(grounded());
    expect(r.fullyGrounded).toBe(true);
    expect(r.explainedPct).toBeCloseTo(1.0, 5);
    expect(r.outcomeDelta).toBeCloseTo(0, 5);
    expect(r.byNode.get('A')).toBe(1); // root fully active at baseline
  });
  it('pruning a cause drops the outcome by exactly its weighted contribution', () => {
    const r = cascade(grounded(), [{ nodeId: 'A', pct: 0 }]);
    expect(r.outcomeDelta).toBeCloseTo(-0.45 * 6.2, 5); // -2.79pp
    expect(r.explainedPct).toBeCloseTo(0.55, 5);
  });
  it('levering a cause to half moves the outcome proportionally', () => {
    const r = cascade(grounded(), [{ nodeId: 'A', pct: 0.5 }]);
    expect(r.outcomeDelta).toBeCloseTo(-0.5 * 0.45 * 6.2, 5); // -1.395pp
  });
  it('propagates through a mechanism (path product)', () => {
    const dag: WhyDag = {
      center: 'x',
      outcomeId: 'O',
      provenance: {},
      nodes: [
        { id: 'A', label: 'a', role: 'root', depth: 0, tier: 'T1' },
        { id: 'M', label: 'm', role: 'mechanism', depth: 1, tier: 'T1' },
        { id: 'O', label: 'o', role: 'outcome', depth: 2, tier: 'T1', value: 6.2 },
      ],
      edges: [
        { from: 'A', to: 'M', weight: 0.9, sign: 1, tier: 'T1' },
        { from: 'M', to: 'O', weight: 0.5, sign: 1, tier: 'T1' },
      ],
    };
    expect(cascade(dag).explainedPct).toBeCloseTo(0.45, 5); // 0.9 * 0.5
    expect(cascade(dag, [{ nodeId: 'A', pct: 0 }]).outcomeDelta).toBeCloseTo(-0.45 * 6.2, 5);
  });
});

describe('cascade — ungrounded is null, never fabricated', () => {
  it('a weightless edge makes the outcome uncomputable (—), fullyGrounded false', () => {
    const dag = grounded();
    delete dag.edges[1].weight; // B → O has no real weight
    const r = cascade(dag);
    expect(r.fullyGrounded).toBe(false);
    expect(r.outcomeDelta).toBeNull();
    expect(r.explainedPct).toBeNull();
    expect(r.byNode.get('O')).toBeNull(); // can't fake the outcome contribution
  });
  it('a T0 edge is not grounded even if it carries a number', () => {
    const dag = grounded();
    dag.edges[0].tier = 'T0'; // model-asserted, not receipted
    expect(isFullyGrounded(dag)).toBe(false);
    expect(cascade(dag).outcomeDelta).toBeNull();
  });
  it('an outcome with no grounded value is not fully grounded', () => {
    const dag = grounded();
    delete dag.nodes[3].value;
    expect(cascade(dag).fullyGrounded).toBe(false);
  });
  it('a cycle yields an all-null result', () => {
    const dag = grounded();
    dag.edges.push({ from: 'O', to: 'A', weight: 0.5, sign: 1, tier: 'T1' });
    const r = cascade(dag);
    expect(r.fullyGrounded).toBe(false);
    expect(r.outcomeDelta).toBeNull();
  });
  it('an illustrative web is never fully grounded, whatever tiers it wears', () => {
    // A textbook explanation written in T1/T2 receipts is still a textbook: the receipts cite the
    // textbook. `provenance.illustrative` is the web saying it measured nothing, and it outranks
    // every tier on it — otherwise the seed webs (why/seed, world/seed) hand a reader an exact
    // delta computed from figures nobody ever observed.
    const dag = grounded();
    dag.provenance = { illustrative: true };
    expect(isFullyGrounded(dag)).toBe(false);
    const r = cascade(dag, [{ nodeId: 'A', pct: 0 }]);
    expect(r.fullyGrounded).toBe(false);
    expect(r.outcomeDelta).toBeNull();
    expect(r.explainedPct).toBeNull();
    // The structure-only pass still resolves, so the levers keep moving the conclusion in words.
    expect(r.relativeOutcome).not.toBeNull();
  });
});

// The structure-only relative pass: the ungrounded default must still MOVE when a cause is levered
// or pruned — that inertness (every readout stuck at "—") is what made the Why Machine read as "not
// working". Relative strength is never grounded, so it lives alongside the null precise numbers.
describe('cascade — relative strength responds even when ungrounded', () => {
  // A → M, B → M, M → O — all T0 (model-asserted, no receipts, no weights): fullyGrounded is false,
  // every precise number is null, but the relative pass still resolves.
  const ungrounded = (): WhyDag => ({
    center: 'Why does the design reach its conclusion?',
    outcomeId: 'O',
    provenance: {},
    nodes: [
      { id: 'A', label: 'a', role: 'root', depth: 0, tier: 'T0' },
      { id: 'B', label: 'b', role: 'root', depth: 0, tier: 'T0' },
      { id: 'M', label: 'm', role: 'mechanism', depth: 1, tier: 'T0' },
      { id: 'O', label: 'o', role: 'outcome', depth: 2, tier: 'T0' },
    ],
    edges: [
      { from: 'A', to: 'M', sign: 1, tier: 'T0' },
      { from: 'B', to: 'M', sign: 1, tier: 'T0' },
      { from: 'M', to: 'O', sign: 1, tier: 'T0' },
    ],
  });

  it('is not grounded, so every precise number stays null', () => {
    const r = cascade(ungrounded());
    expect(r.fullyGrounded).toBe(false);
    expect(r.outcomeDelta).toBeNull();
    expect(r.explainedPct).toBeNull();
    expect(r.byNode.get('O')).toBeNull();
  });

  it('at baseline all causes active → the conclusion sits at full relative strength', () => {
    const r = cascade(ungrounded());
    expect(r.relativeOutcome).toBeCloseTo(1, 5);
    expect(r.relativeByNode.get('A')).toBeCloseTo(1, 5);
  });

  it('pruning a cause drops the conclusion’s relative strength', () => {
    const r = cascade(ungrounded(), [{ nodeId: 'A', pct: 0 }]);
    // M = mean(A=0, B=1) = 0.5 → O = mean(0.5) = 0.5.
    expect(r.relativeByNode.get('M')).toBeCloseTo(0.5, 5);
    expect(r.relativeOutcome).toBeCloseTo(0.5, 5);
  });

  it('a half-strength lever lands the conclusion between full and pruned', () => {
    const full = cascade(ungrounded()).relativeOutcome!;
    const half = cascade(ungrounded(), [{ nodeId: 'A', pct: 0.5 }]).relativeOutcome!;
    const pruned = cascade(ungrounded(), [{ nodeId: 'A', pct: 0 }]).relativeOutcome!;
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(pruned);
  });

  it('an inhibiting cause at full strength pulls the conclusion toward zero', () => {
    const dag = ungrounded();
    dag.edges[0].sign = -1; // A now inhibits M
    const r = cascade(dag);
    // M = clamp(mean(-1, +1)) = clamp(0) = 0 → O = 0.
    expect(r.relativeOutcome).toBeCloseTo(0, 5);
  });

  it('a cycle still yields a defined (zeroed) relative map, not a crash', () => {
    const dag = ungrounded();
    dag.edges.push({ from: 'O', to: 'A', sign: 1, tier: 'T0' });
    const r = cascade(dag);
    expect(r.relativeOutcome).toBeNull();
    expect(r.relativeByNode.get('A')).toBe(0);
  });
});
