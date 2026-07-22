import { describe, expect, it } from 'vitest';
import { evalExpr, identifiersIn } from '../src/live/prism/levers/expr';
import { evaluate, boundSatisfied } from '../src/live/prism/levers/dag';
import { buildLeverModel, type RawLeverNode } from '../src/live/prism/levers/build';
import type { LeverNode } from '../src/live/prism/levers/types';

// The Live Levers verdict path is pure code — this is what makes dragging trustworthy. These pin the
// safe evaluator, the dependency executor, and the grounding + self-consistency gate.

describe('evalExpr', () => {
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(evalExpr('2 + 3 * 4', {})).toBe(14);
    expect(evalExpr('(2 + 3) * 4', {})).toBe(20);
    expect(evalExpr('price * units', { price: 80, units: 100000 })).toBe(8_000_000);
    expect(evalExpr('(revenue - cost) / revenue * 100', { revenue: 100, cost: 60 })).toBe(40);
    expect(evalExpr('-x + 5', { x: 3 })).toBe(2);
  });

  it('returns NaN on division by zero, an unbound id, or malformed syntax', () => {
    expect(evalExpr('1 / 0', {})).toBeNaN();
    expect(evalExpr('a + b', { a: 1 })).toBeNaN();
    expect(evalExpr('2 +', {})).toBeNaN();
    expect(evalExpr('', {})).toBeNaN();
  });

  it('never executes anything but arithmetic (no JS evaluation)', () => {
    // identifiers are just unbound variables → NaN, never executed
    expect(evalExpr('alert(1)', {})).toBeNaN();
  });

  it('lists referenced identifiers', () => {
    expect(identifiersIn('price * units + tax')).toEqual(['price', 'units', 'tax']);
  });
});

function node(over: Partial<LeverNode>): LeverNode {
  return {
    id: 'n',
    label: 'n',
    printed: 0,
    unit: 'number',
    deps: [],
    quote: 'q',
    page: 1,
    doc: 0,
    ...over,
  };
}

describe('evaluate', () => {
  const nodes: LeverNode[] = [
    node({ id: 'price', printed: 80 }),
    node({ id: 'units', printed: 100000 }),
    node({ id: 'revenue', printed: 8_000_000, formula: 'price * units', deps: ['price', 'units'] }),
  ];

  it('computes derived values from inputs', () => {
    expect(evaluate(nodes, new Map()).values.get('revenue')).toBe(8_000_000);
  });

  it('recomputes when an input is overridden', () => {
    expect(evaluate(nodes, new Map([['price', 40]])).values.get('revenue')).toBe(4_000_000);
  });

  it('leaves a cycle or bad formula unresolved, never a wrong number', () => {
    const cyc: LeverNode[] = [
      node({ id: 'a', formula: 'b + 1', deps: ['b'] }),
      node({ id: 'b', formula: 'a + 1', deps: ['a'] }),
    ];
    const r = evaluate(cyc, new Map());
    expect(r.unresolved.has('a')).toBe(true);
    expect(r.unresolved.has('b')).toBe(true);
  });
});

describe('boundSatisfied', () => {
  it('checks each comparator', () => {
    expect(boundSatisfied({ op: 'gte', value: 0 }, -5)).toBe(false);
    expect(boundSatisfied({ op: 'gte', value: 0 }, 5)).toBe(true);
    expect(boundSatisfied({ op: 'lt', value: 10 }, 8)).toBe(true);
  });
});

describe('buildLeverModel', () => {
  const corpus = [['Revenue is $100 and cost is $60.', 'Profit is $40.']];
  const raw: RawLeverNode[] = [
    {
      id: 'revenue',
      label: 'Revenue',
      value: 100,
      unit: 'currency',
      quote: 'Revenue is $100 and cost is $60.',
      page: 1,
    },
    {
      id: 'cost',
      label: 'Cost',
      value: 60,
      unit: 'currency',
      quote: 'Revenue is $100 and cost is $60.',
      page: 1,
    },
    {
      id: 'profit',
      label: 'Profit',
      value: 40,
      unit: 'currency',
      formula: 'revenue - cost',
      quote: 'Profit is $40.',
      page: 2,
      bound: { op: 'gte', value: 0 },
    },
  ];

  it('builds a grounded model where the derivation reproduces the printed value', () => {
    const model = buildLeverModel(raw, corpus);
    expect(model).not.toBeNull();
    expect(model!.inputs.sort()).toEqual(['cost', 'revenue']);
    expect(model!.nodes.find((n) => n.id === 'profit')?.formula).toBe('revenue - cost');
    // dragging cost above revenue flips the profit bound red
    const r = evaluate(model!.nodes, new Map([['cost', 120]]));
    expect(boundSatisfied({ op: 'gte', value: 0 }, r.values.get('profit')!)).toBe(false);
  });

  it('drops a derivation that does NOT reproduce the document’s printed value (self-consistency)', () => {
    // The document itself prints profit as $50, but revenue − cost = $40 → the formula doesn't follow,
    // so profit is dropped (no consistent derivation remains → nothing safe to drive).
    const badCorpus = [['Revenue is $100 and cost is $60.', 'Profit is $50.']];
    const bad = raw.map((n) =>
      n.id === 'profit' ? { ...n, value: 50, quote: 'Profit is $50.' } : n,
    );
    expect(buildLeverModel(bad, badCorpus)).toBeNull();
  });

  it('drops a node whose value is not grounded in its quote', () => {
    const ungrounded: RawLeverNode[] = [
      { id: 'x', value: 999, unit: 'currency', quote: 'Revenue is $100 and cost is $60.', page: 1 },
      ...raw,
    ];
    const model = buildLeverModel(ungrounded, corpus);
    expect(model?.nodes.some((n) => n.id === 'x')).toBeFalsy();
  });

  it('grounds each node to the document its quote actually lives in (multi-doc)', () => {
    // doc 0 has no figures; the whole model lives in doc 1. Every node must ground to doc 1, on the
    // right page WITHIN that document — not always doc 0.
    const multi = [
      ['Introduction with no figures.'],
      ['Revenue is $500 and cost is $200.', 'Profit is $300.'],
    ];
    const multiRaw: RawLeverNode[] = [
      {
        id: 'revenue',
        value: 500,
        unit: 'currency',
        quote: 'Revenue is $500 and cost is $200.',
        doc: 1,
        page: 1,
      },
      {
        id: 'cost',
        value: 200,
        unit: 'currency',
        quote: 'Revenue is $500 and cost is $200.',
        doc: 1,
        page: 1,
      },
      {
        id: 'profit',
        value: 300,
        unit: 'currency',
        formula: 'revenue - cost',
        quote: 'Profit is $300.',
        doc: 1,
        page: 2,
      },
    ];
    const model = buildLeverModel(multiRaw, multi);
    expect(model).not.toBeNull();
    expect(model!.nodes.every((n) => n.doc === 1)).toBe(true);
    expect(model!.nodes.find((n) => n.id === 'profit')?.page).toBe(2);
  });

  it('drops a node that claims the wrong document (quote not verbatim there)', () => {
    // The quote only exists in doc 1, but the node claims doc 0 → grounding against doc 0 fails → drop.
    const multi = [['Introduction with no figures.'], ['Revenue is $500 here.']];
    const wrongDoc: RawLeverNode[] = [
      {
        id: 'revenue',
        value: 500,
        unit: 'currency',
        quote: 'Revenue is $500 here.',
        doc: 0,
        page: 1,
      },
    ];
    expect(buildLeverModel(wrongDoc, multi)).toBeNull();
  });
});
