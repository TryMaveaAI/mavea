// why-seed.test.ts — the three seed webs really are the three rungs of the honesty ladder.
//
// #/whylab is where the Why Machine's readout is judged, and the readout is a different thing on
// each rung: an exact pp delta, a "—", or a relative-strength bar. A seed that quietly stops being
// what its rung claims turns the lab into a demo of one state pretending to be three — which is
// how the grounded rung came to be demonstrated by an ILLUSTRATIVE web that could only ever print
// "—". So the claims are pinned here rather than trusted.
//
// The grounded seed is held to the strongest version of the claim available: it is not asserted to
// be grounded, it is RUN BACK THROUGH the product's own gate (why/validate's verbatim grounder)
// against the sample text bundled with it, and it must survive whole — and collapse to a
// figureless T0 web when that text is taken away.
import { describe, expect, it } from 'vitest';
import { valueInQuote } from '../src/live/ground/number';
import { cascade, isFullyGrounded } from '../src/live/why/engine';
import {
  WHY_SEED,
  WHY_SEED_GROUNDED,
  WHY_SEED_GROUNDED_CORPUS,
  WHY_SEED_STRUCTURAL,
} from '../src/live/why/seed';
import { coerceWhyDag, makeWhyGrounder } from '../src/live/why/validate';

/** Every receipt on the web, with something to name it by in a failure. */
const receipts = (dag: typeof WHY_SEED_GROUNDED): Array<{ where: string; quote: string }> => [
  ...dag.nodes
    .filter((n) => n.receipt)
    .map((n) => ({ where: `node ${n.id}`, quote: n.receipt!.quote })),
  ...dag.edges
    .filter((e) => e.receipt)
    .map((e) => ({ where: `edge ${e.from}→${e.to}`, quote: e.receipt!.quote })),
];

describe('WHY_SEED_GROUNDED — the rung where the numbers are real', () => {
  it('quotes the sample corpus verbatim, and every figure appears in the sentence citing it', () => {
    const grounds = makeWhyGrounder(WHY_SEED_GROUNDED_CORPUS);
    for (const { where, quote } of receipts(WHY_SEED_GROUNDED)) {
      expect(grounds(quote), `${where} is not verbatim in the sample corpus`).toBe(true);
    }
    for (const node of WHY_SEED_GROUNDED.nodes) {
      if (node.value === undefined) continue;
      expect(
        valueInQuote(node.value, node.receipt!.quote),
        `node ${node.id}: ${node.value} is not in its own receipt`,
      ).toBe(true);
    }
    // An edge's weight is a share, and the sentence behind it states that share as a percentage.
    // why/validate does not check this (a weight has no digits of its own to find), so the seed
    // has to hold itself to it — a receipt saying 70% under a weight of 0.3 is a fabricated split.
    for (const edge of WHY_SEED_GROUNDED.edges) {
      expect(
        valueInQuote(Math.round(edge.weight! * 100), edge.receipt!.quote),
        `edge ${edge.from}→${edge.to}: ${edge.weight} is not the share its receipt states`,
      ).toBe(true);
    }
  });

  it('survives the product’s own grounding gate whole', () => {
    const coerced = coerceWhyDag(WHY_SEED_GROUNDED, WHY_SEED_GROUNDED_CORPUS)!;
    // Nothing authored is LOST. The gate may add what it DERIVES — a link's receipt list and its
    // support status are computed from what it proved, never authored — so this is a subset check
    // rather than an equality one; the two arms below pin the derived halves in their own right.
    expect(coerced).toMatchObject(WHY_SEED_GROUNDED);
    expect(coerced.nodes).toHaveLength(WHY_SEED_GROUNDED.nodes.length);
    expect(coerced.edges).toHaveLength(WHY_SEED_GROUNDED.edges.length);
    for (const edge of coerced.edges) {
      expect(edge.receipts?.[0]).toEqual(edge.receipt);
      expect(edge.status).toBe('supported');
    }
    expect(isFullyGrounded(coerced)).toBe(true);
  });

  it('collapses to a figureless T0 web when the corpus is taken away', () => {
    // The proof that the grounding is doing the work: nothing here is real because it was typed
    // in a source file — it is real because the sample text says so.
    const coerced = coerceWhyDag(WHY_SEED_GROUNDED, '')!;
    expect(coerced.nodes.every((n) => n.tier === 'T0' && n.value === undefined)).toBe(true);
    expect(coerced.edges.every((e) => e.tier === 'T0' && e.weight === undefined)).toBe(true);
    expect(isFullyGrounded(coerced)).toBe(false);
  });

  it('moves the conclusion by an exact, checkable amount', () => {
    const base = cascade(WHY_SEED_GROUNDED);
    expect(base.fullyGrounded).toBe(true);
    expect(base.outcomeDelta).toBe(0);
    // 0.52 (queueing) + 0.24 × 0.8 (the misroutes the release explains) + 0.12 (drivers, direct).
    expect(base.explainedPct).toBeCloseTo(0.832, 10);

    const withoutHeat = cascade(WHY_SEED_GROUNDED, [{ nodeId: 'heat', pct: 0 }]);
    // The heatwave carries 70% of the queue, and the queue carries 52% of the jump: 7.4 → 4.7pp.
    expect(withoutHeat.outcomeDelta).toBeCloseTo(-2.6936, 10);
    expect(7.4 + withoutHeat.outcomeDelta!).toBeCloseTo(4.7064, 10);
    expect(withoutHeat.explainedPct).toBeCloseTo(0.468, 10);
  });
});

describe('The other two rungs stay honestly numberless', () => {
  it('never prints a figure for the illustrative web, whatever tiers it wears', () => {
    // WHY_SEED is T2 and fully weighted throughout, and still may not answer: `illustrative` is
    // the web saying it measured nothing, and that outranks the tiers.
    expect(WHY_SEED.provenance.illustrative).toBe(true);
    expect(WHY_SEED.edges.every((e) => typeof e.weight === 'number')).toBe(true);
    const result = cascade(WHY_SEED, [{ nodeId: 'price', pct: 0 }]);
    expect(result.fullyGrounded).toBe(false);
    expect(result.outcomeDelta).toBeNull();
    expect(result.explainedPct).toBeNull();
  });

  it('still moves the structure-only web in relative strength', () => {
    expect(WHY_SEED_STRUCTURAL.nodes.every((n) => n.tier === 'T0')).toBe(true);
    const base = cascade(WHY_SEED_STRUCTURAL);
    const pruned = cascade(WHY_SEED_STRUCTURAL, [{ nodeId: 'scale', pct: 0 }]);
    expect(base.outcomeDelta).toBeNull();
    expect(base.relativeOutcome).not.toBeNull();
    expect(pruned.relativeOutcome!).toBeLessThan(base.relativeOutcome!);
  });
});
