// world-validate.test.ts — the world coercion gate. Same honesty spine as why-validate (a claimed
// real figure needs a verbatim quote carrying its own digits) extended to the world's additions:
// every series point earns its own receipt or is stripped, children are force-namespaced one level
// deep, edge receipts are independently verified, and an edge's status is DERIVED from its
// verified shape — the model's own status claim is never read. Documented fail-closed choice: a
// T3 claim in a world that did NOT opt into illustrative figures is DEMOTED to T0 with the number
// stripped (why-validate's rule), never kept and never a reason to reject the whole world.
import { describe, expect, it } from 'vitest';
import { coerceWorldSpec } from '../src/live/world/validate';

const CORPUS =
  'Home prices fell 30% from the 2006 peak. In 2003 originations were 3,800 billion. ' +
  'In 2004 originations were 2,900 billion. Writedowns reached 490 billion in 2008. ' +
  'Prime loans made up 1,900 billion. Losses drove panic across the interbank market. ' +
  'Regulators later argued the link was overstated. ' +
  'Subprime accounted for 45% of the writedowns. ' +
  'Lehman filed for bankruptcy in 2008-09.';

const RAW = {
  title: 'Why did the 2008 financial crisis happen?',
  outcomeId: 'crisis',
  provenance: {},
  nodes: [
    {
      id: 'prices',
      label: 'Home prices',
      role: 'root',
      depth: 0,
      tier: 'T2',
      value: 30,
      unit: '%',
      quote: 'Home prices fell 30% from the 2006 peak',
      series: {
        tier: 'T2',
        unit: '$bn',
        points: [
          { t: '2003', value: 3800, quote: 'In 2003 originations were 3,800 billion' },
          { t: '2004', value: 2900, quote: 'In 2004 originations were 2,900 billion' },
          // fabricated: the quote appears nowhere in the corpus
          { t: '2005', value: 3100, quote: 'In 2005 originations were 3,100 billion' },
          // digit-spliced: a real quote whose numbers are not this value
          { t: '2006', value: 38002900, quote: 'In 2003 originations were 3,800 billion' },
        ],
      },
    },
    {
      id: 'volume',
      label: 'Mortgage volume',
      role: 'mechanism',
      depth: 1,
      tier: 'T0',
      children: [
        {
          id: 'Prime Loans!',
          label: 'Prime',
          tier: 'T2',
          value: 1900,
          unit: '$bn',
          quote: 'Prime loans made up 1,900 billion',
          children: [{ id: 'deep', label: 'A grandchild' }],
        },
        { id: 'alt-a', label: 'Alt-A' },
        { id: 'subprime', label: 'Subprime' },
        { id: 'arm', label: 'ARM' },
        { id: 'jumbo', label: 'Over the child cap' },
      ],
    },
    { id: 'losses', label: 'Bank losses', role: 'mechanism', depth: 2, tier: 'T0' },
    {
      id: 'guess',
      label: 'Textbook magnitude',
      role: 'mechanism',
      depth: 1,
      tier: 'T3',
      value: 7,
    },
    { id: 'crisis', label: 'Credit crisis', role: 'outcome', depth: 3, tier: 'T0' },
  ],
  edges: [
    {
      from: 'losses',
      to: 'crisis',
      weight: 0.6,
      sign: 1,
      tier: 'T2',
      relation: 'causes',
      quote: 'Losses drove panic across the interbank market',
      receipts: [
        { quote: 'Losses drove panic across the interbank market' },
        { quote: 'a receipt the corpus never said' },
        { quote: 'Writedowns reached 490 billion in 2008' },
      ],
    },
    {
      // A share the corpus states outright — the one way a weight survives.
      from: 'volume',
      to: 'losses',
      weight: 0.45,
      sign: 1,
      tier: 'T2',
      relation: 'contributes',
      quote: 'Subprime accounted for 45% of the writedowns',
    },
    {
      from: 'prices',
      to: 'losses',
      weight: 0.5,
      sign: -1,
      tier: 'T2',
      quote: 'Home prices fell 30% from the 2006 peak',
      counter: { quote: 'Regulators later argued the link was overstated' },
    },
    {
      // the model asserts a status on an edge nothing grounds — the claim must not survive
      from: 'volume',
      to: 'crisis',
      weight: 0.4,
      sign: 1,
      tier: 'T2',
      status: 'supported',
      quote: 'a link the corpus never supports',
    },
    { from: 'prices', to: 'ghost', sign: 1, tier: 'T0' },
    { from: 'crisis', to: 'crisis', sign: 1, tier: 'T0' },
  ],
};

describe('coerceWorldSpec grounding', () => {
  const world = coerceWorldSpec(RAW, CORPUS)!;

  it('keeps the grounded node value + receipt (the why gate, unchanged)', () => {
    const prices = world.nodes.find((n) => n.id === 'prices')!;
    expect(prices.tier).toBe('T2');
    expect(prices.value).toBe(30);
    expect(prices.receipt?.quote).toContain('30%');
  });

  it('strips a fabricated or digit-spliced series point; grounded points keep their receipts', () => {
    const series = world.nodes.find((n) => n.id === 'prices')!.series!;
    expect(series.points.map((p) => p.t)).toEqual(['2003', '2004']);
    expect(series.points.every((p) => p.receipt?.quote.includes(p.t))).toBe(true);
    expect(series.tier).toBe('T2');
  });

  it('drops an edge into an unknown id and a self-edge', () => {
    expect(world.edges.some((e) => e.to === 'ghost')).toBe(false);
    expect(world.edges.some((e) => e.from === e.to)).toBe(false);
  });

  it('force-namespaces children, caps them, and drops a grandchild', () => {
    const children = world.nodes.find((n) => n.id === 'volume')!.children!;
    expect(children).toHaveLength(4); // the fifth is over the cap
    expect(children.map((c) => c.id)).toEqual([
      'volume.prime-loans',
      'volume.alt-a',
      'volume.subprime',
      'volume.arm',
    ]);
    expect(children[0].children).toBeUndefined();
    expect(children[0].value).toBe(1900); // a child runs the same grounding gate
  });

  it('keeps a weight the quote actually states, in the form a source writes one', () => {
    const e = world.edges.find((x) => x.from === 'volume' && x.to === 'losses')!;
    expect(e.status).toBe('supported');
    expect(e.tier).toBe('T2');
    expect(e.weight).toBe(0.45); // "45% of the writedowns" — the share said out loud
  });

  it('strips a weight no receipt states, however real the sentence beside it is', () => {
    // The whole point of the rule. "Losses drove panic across the interbank market" is verbatim in
    // the corpus and says nothing whatever about 60% — but the graph drew the link thicker for that
    // number and the contribution ribbons sized themselves by it.
    const e = world.edges.find((x) => x.from === 'losses' && x.to === 'crisis')!;
    expect(e.weight).toBeUndefined();
    expect(e.status).toBe('provisional');
    expect(e.relation).toBe('causes');
  });

  it('gates edge receipts independently and pins receipts[0] === receipt', () => {
    const e = world.edges.find((x) => x.from === 'losses' && x.to === 'crisis')!;
    expect(e.receipts!.map((r) => r.quote)).toEqual([
      'Losses drove panic across the interbank market',
      'Writedowns reached 490 billion in 2008',
    ]);
    expect(e.receipts![0]).toBe(e.receipt);
  });

  it('derives contested: grounded receipt AND grounded counter', () => {
    const e = world.edges.find((x) => x.from === 'prices' && x.to === 'losses')!;
    expect(e.status).toBe('contested');
    expect(e.counter?.quote).toContain('overstated');
  });

  it('ignores a model-claimed status: an ungrounded edge is provisional, demoted, weightless', () => {
    const e = world.edges.find((x) => x.from === 'volume' && x.to === 'crisis')!;
    expect(e.status).toBe('provisional');
    expect(e.tier).toBe('T0');
    expect(e.weight).toBeUndefined();
    expect(e.provisional).toBe(true);
  });

  it('demotes a T3 value to T0 when the world never opted into illustrative figures', () => {
    const guess = world.nodes.find((n) => n.id === 'guess')!;
    expect(guess.tier).toBe('T0');
    expect(guess.value).toBeUndefined();
  });
});

describe('coerceWorldSpec opt-ins and fail-closed floors', () => {
  it('keeps a T3 value and a T3 series only under provenance.illustrative', () => {
    const raw = {
      title: 'Illustrative world',
      provenance: { illustrative: true },
      nodes: [
        {
          id: 'a',
          label: 'A textbook curve',
          tier: 'T3',
          value: 7,
          series: {
            tier: 'T3',
            points: [
              { t: '2003', value: 1 },
              { t: '2004', value: 2 },
            ],
          },
        },
        { id: 'b', label: 'B', tier: 'T0' },
      ],
      edges: [],
    };
    const world = coerceWorldSpec(raw, '')!;
    const a = world.nodes.find((n) => n.id === 'a')!;
    expect(a.tier).toBe('T3');
    expect(a.value).toBe(7);
    expect(a.series?.points).toHaveLength(2);
    // without the opt-in, the same payload keeps neither the value nor the series
    const closed = coerceWorldSpec({ ...raw, provenance: {} }, '')!;
    const aClosed = closed.nodes.find((n) => n.id === 'a')!;
    expect(aClosed.tier).toBe('T0');
    expect(aClosed.value).toBeUndefined();
    expect(aClosed.series).toBeUndefined();
  });

  it('with NO corpus nothing grounds: all T0, no weights, no series survives a real-tier claim', () => {
    const world = coerceWorldSpec(RAW, '')!;
    expect(world.nodes.every((n) => n.tier === 'T0' && n.value === undefined)).toBe(true);
    expect(world.edges.every((e) => e.tier === 'T0' && e.weight === undefined)).toBe(true);
    expect(world.edges.every((e) => e.status === 'provisional')).toBe(true);
    expect(world.nodes.some((n) => n.series)).toBe(false);
  });

  it('a T0-tier series never exists — a series is numbers, T0 is the no-number tier', () => {
    const world = coerceWorldSpec(
      {
        title: 'T0 series',
        nodes: [
          { id: 'a', label: 'A', series: { tier: 'T0', points: [{ t: 'x', value: 1 }] } },
          { id: 'b', label: 'B' },
        ],
        edges: [],
      },
      CORPUS,
    )!;
    expect(world.nodes.find((n) => n.id === 'a')!.series).toBeUndefined();
  });

  it('first id wins on duplicates and top-level nodes cap at 16', () => {
    const nodes = Array.from({ length: 24 }, (_, i) => ({
      id: i === 1 ? 'n0' : `n${i}`,
      label: `Node ${i}`,
    }));
    const world = coerceWorldSpec({ title: 'Big', nodes, edges: [] }, '')!;
    expect(world.nodes).toHaveLength(16);
    expect(world.nodes.filter((n) => n.id === 'n0').map((n) => n.label)).toEqual(['Node 0']);
  });

  it('falls back to the outcome-role node when outcomeId is missing or unknown', () => {
    const world = coerceWorldSpec(
      {
        title: 'No outcome id',
        nodes: [
          { id: 'a', label: 'A', role: 'root' },
          { id: 'o', label: 'O', role: 'outcome', depth: 2 },
        ],
        edges: [],
      },
      '',
    )!;
    expect(world.outcomeId).toBe('o');
  });

  it('returns null on unsalvageable input (no title, <2 nodes, non-JSON)', () => {
    expect(coerceWorldSpec('not json', CORPUS)).toBeNull();
    expect(coerceWorldSpec({ nodes: [{ id: 'a', label: 'A' }] }, CORPUS)).toBeNull();
    expect(coerceWorldSpec({ title: 'x', nodes: [{ id: 'a', label: 'A' }] }, CORPUS)).toBeNull();
  });
});

describe('coerceWorldSpec domain — a closed vocabulary the surface colours by', () => {
  const world = (domainA: unknown, domainChild?: unknown) =>
    coerceWorldSpec(
      {
        title: 'Domains',
        nodes: [
          {
            id: 'a',
            label: 'A',
            role: 'root',
            domain: domainA,
            children: [{ id: 'kid', label: 'Kid', domain: domainChild }],
          },
          { id: 'o', label: 'O', role: 'outcome' },
        ],
        edges: [],
      },
      '',
    )!;

  it('keeps a domain that is on the allowlist', () => {
    expect(world('economy').nodes.find((n) => n.id === 'a')!.domain).toBe('economy');
  });

  it('keeps a domain on a child too, since children paint on the same stage', () => {
    const kid = world('economy', 'policy').nodes.find((n) => n.id === 'a')!.children![0];
    expect(kid.domain).toBe('policy');
  });

  it.each(['finance', 'ECONOMY', '', 42, null, {}])(
    'drops the unrecognised domain %j rather than guessing one',
    (bad) => {
      // A wrong category asserts something nobody claimed; an absent one only declines to say.
      expect(world(bad).nodes.find((n) => n.id === 'a')!.domain).toBeUndefined();
    },
  );
});
