// why-validate.test.ts — grounding is the honesty gate. A claimed T1/T2 number survives only if its
// quote is verbatim in the corpus; otherwise it's demoted to T0 (no number, provisional). With no
// corpus, the whole web is qualitative — the model can't assert a figure on its say-so.
import { describe, it, expect } from 'vitest';
import { coerceWhyDag, makeWhyGrounder } from '../src/live/why/validate';

const CORPUS =
  'Price rose 18% on Feb 28. March churn hit 6.2pp overall. The onboarding email broke.';

const RAW = {
  center: 'Why did churn spike in March?',
  outcomeId: 'O',
  provenance: {},
  nodes: [
    {
      id: 'A',
      label: 'Price +18%',
      role: 'root',
      depth: 0,
      tier: 'T1',
      quote: 'Price rose 18% on Feb 28',
    },
    {
      id: 'B',
      label: 'Onboarding email broke',
      role: 'root',
      depth: 0,
      tier: 'T1',
      quote: 'The onboarding email broke',
    },
    {
      id: 'X',
      label: 'Solar flares',
      role: 'root',
      depth: 0,
      tier: 'T1',
      value: 99,
      quote: 'aliens caused it',
    },
    {
      id: 'O',
      label: 'Churn +6.2pp',
      role: 'outcome',
      depth: 1,
      tier: 'T1',
      value: 6.2,
      unit: 'pp',
      quote: 'March churn hit 6.2pp',
    },
  ],
  edges: [
    { from: 'A', to: 'O', weight: 0.45, sign: 1, tier: 'T1', quote: 'Price rose 18% on Feb 28' },
    {
      from: 'B',
      to: 'O',
      weight: 0.31,
      sign: 1,
      tier: 'T1',
      quote: 'unverifiable claim not in corpus',
    },
  ],
};

describe('makeWhyGrounder', () => {
  it('is fail-closed with no corpus', () => {
    expect(makeWhyGrounder('')('anything')).toBe(false);
    expect(makeWhyGrounder('the sky is blue')('the sky is blue')).toBe(true);
  });
});

describe('coerceWhyDag grounding', () => {
  it('keeps a grounded outcome value + receipt', () => {
    const dag = coerceWhyDag(RAW, CORPUS)!;
    const o = dag.nodes.find((n) => n.id === 'O')!;
    expect(o.tier).toBe('T1');
    expect(o.value).toBe(6.2);
    expect(o.receipt?.quote).toContain('6.2pp');
  });
  it('keeps a grounded root without a number (real event, receipt, no value)', () => {
    const a = coerceWhyDag(RAW, CORPUS)!.nodes.find((n) => n.id === 'A')!;
    expect(a.tier).toBe('T1');
    expect(a.value).toBeUndefined();
    expect(a.receipt?.quote).toBe('Price rose 18% on Feb 28');
  });
  it('demotes an ungrounded value to T0 and strips the number (X: "aliens")', () => {
    const x = coerceWhyDag(RAW, CORPUS)!.nodes.find((n) => n.id === 'X')!;
    expect(x.tier).toBe('T0');
    expect(x.value).toBeUndefined();
  });
  it('keeps a grounded edge weight, demotes an ungrounded edge to provisional T0', () => {
    const dag = coerceWhyDag(RAW, CORPUS)!;
    const ao = dag.edges.find((e) => e.from === 'A')!;
    expect(ao.tier).toBe('T1');
    expect(ao.weight).toBe(0.45);
    const bo = dag.edges.find((e) => e.from === 'B')!;
    expect(bo.tier).toBe('T0');
    expect(bo.weight).toBeUndefined();
    expect(bo.provisional).toBe(true);
  });
  it('with NO corpus the whole web is T0 (nothing grounds)', () => {
    const dag = coerceWhyDag(RAW, '')!;
    expect(dag.nodes.every((n) => n.tier === 'T0')).toBe(true);
    expect(dag.edges.every((e) => e.tier === 'T0' && e.weight === undefined)).toBe(true);
  });
  it('parses a fenced JSON string and defaults a missing outcomeId to the deepest node', () => {
    const dag = coerceWhyDag(
      '```json\n' + JSON.stringify({ ...RAW, outcomeId: undefined }) + '\n```',
      CORPUS,
    )!;
    expect(dag.outcomeId).toBe('O');
  });
  it('returns null on unsalvageable input', () => {
    expect(coerceWhyDag('not json', CORPUS)).toBeNull();
    expect(coerceWhyDag({ center: 'x', nodes: [] }, CORPUS)).toBeNull();
  });
});
