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

describe('coerceWhyDag — a link that carries more than one quote', () => {
  const CORPUS_MULTI =
    'The heatwave drove 70% of the depot queue. Two independent reviews reached the same 70% figure. ' +
    'Regulators later argued the heat link was overstated.';

  const dagWith = (edge: Record<string, unknown>) =>
    coerceWhyDag(
      {
        center: 'Why did the queue grow?',
        outcomeId: 'queue',
        nodes: [
          { id: 'heat', label: 'Heatwave', role: 'root', depth: 0, tier: 'T0' },
          { id: 'queue', label: 'Depot queue', role: 'outcome', depth: 1, tier: 'T0' },
        ],
        edges: [{ from: 'heat', to: 'queue', sign: 1, ...edge }],
      },
      CORPUS_MULTI,
    )!;

  const supported = {
    tier: 'T2',
    weight: 0.7,
    quote: 'The heatwave drove 70% of the depot queue.',
    receipts: [{ quote: 'Two independent reviews reached the same 70% figure.' }],
  };

  it('keeps every quote the corpus actually contains, and drops the ones it does not', () => {
    const edge = dagWith({
      ...supported,
      receipts: [
        { quote: 'Two independent reviews reached the same 70% figure.' },
        { quote: 'A sentence nobody wrote.' },
      ],
    }).edges[0];
    expect(edge.receipts?.map((r) => r.quote)).toEqual([
      'The heatwave drove 70% of the depot queue.',
      'Two independent reviews reached the same 70% figure.',
    ]);
  });

  it('counts the same sentence once, however often it is cited', () => {
    const edge = dagWith({
      ...supported,
      receipts: [
        { quote: 'The heatwave drove 70% of the depot queue.' },
        { quote: 'Two independent reviews reached the same 70% figure.' },
      ],
    }).edges[0];
    expect(edge.receipts).toHaveLength(2);
  });

  it('keeps receipt and receipts[0] the same thing, so an old reader still works', () => {
    const edge = dagWith(supported).edges[0];
    expect(edge.receipts?.[0]).toEqual(edge.receipt);
  });

  it('derives the status instead of believing one', () => {
    // The model is not asked what its own link is worth, and if it says anyway it is ignored.
    const edge = dagWith({ ...supported, status: 'supported', counter: undefined }).edges[0];
    expect(edge.status).toBe('supported');
    expect(dagWith({ status: 'supported' }).edges[0].status).toBe('provisional');
  });

  it('says contested when a source disputes a link that other sources back', () => {
    const edge = dagWith({
      ...supported,
      counter: { quote: 'Regulators later argued the heat link was overstated.' },
    }).edges[0];
    expect(edge.status).toBe('contested');
    expect(edge.counter?.quote).toMatch(/overstated/);
  });

  it('will not carry a counter-quote the corpus never said', () => {
    // Evidence AGAINST a claim is held to the same standard as evidence for it — a fabrication in
    // the reader's favour is still a fabrication.
    const edge = dagWith({ ...supported, counter: { quote: 'Nobody wrote this rebuttal.' } })
      .edges[0];
    expect(edge.counter).toBeUndefined();
    expect(edge.status).toBe('supported');
  });

  it('puts an unrecognised relation on the allowlist rather than through to the screen', () => {
    expect(dagWith({ ...supported, relation: 'proves' }).edges[0].relation).toBe('contributes');
    expect(dagWith({ ...supported, relation: 'enables' }).edges[0].relation).toBe('enables');
  });
});
