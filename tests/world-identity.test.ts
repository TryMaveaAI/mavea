// world-identity.test.ts — how a follow-up turn lands ON the standing world instead of replacing
// it. Identity resolves by exact id, then unique normalized label; the no-downgrade rule keeps an
// ungrounded incoming claim from erasing a receipted fact; whatever can't be resolved is dropped,
// never guessed; and mappedFraction is the callers' "is this even the same world?" gate. Plus the
// seed: WORLD_SEED honors every structural gate and round-trips the cascade engine via asWhyDag.
import { describe, expect, it } from 'vitest';
import { cascade } from '../src/live/why/engine';
import { asWhyDag } from '../src/live/world/asWhyDag';
import { WORLD_SEED } from '../src/live/world/seed';
import { mapOntoWorld, mappedFraction } from '../src/live/world/validate';
import type { WorldSpec } from '../src/live/world/types';

const EXISTING: WorldSpec = {
  title: 'Why did churn spike in March?',
  outcomeId: 'churn',
  provenance: {},
  nodes: [
    {
      id: 'price',
      label: 'Price increase',
      role: 'root',
      depth: 0,
      tier: 'T1',
      value: 18,
      unit: '%',
      receipt: { quote: 'Price rose 18%' },
    },
    { id: 'onboard', label: 'Onboarding broke', role: 'root', depth: 0, tier: 'T0' },
    {
      id: 'churn',
      label: 'Churn spike',
      role: 'outcome',
      depth: 1,
      tier: 'T1',
      value: 6.2,
      unit: 'pp',
      receipt: { quote: 'Churn hit 6.2pp' },
    },
  ],
  edges: [
    {
      from: 'price',
      to: 'churn',
      sign: 1,
      tier: 'T1',
      weight: 0.45,
      receipt: { quote: 'Price rose 18%' },
      status: 'supported',
    },
  ],
};

const incoming = (partial: Partial<WorldSpec>): WorldSpec => ({
  title: 'Tell me more about the churn spike',
  outcomeId: 'churn',
  provenance: {},
  nodes: [],
  edges: [],
  ...partial,
});

describe('mapOntoWorld', () => {
  it('merges an exact-id match: series, children, and detail attach; identity stays pinned', () => {
    const merged = mapOntoWorld(
      EXISTING,
      incoming({
        nodes: [
          {
            id: 'price',
            label: 'The price change',
            role: 'mechanism',
            depth: 2,
            tier: 'T0',
            detail: 'Announced Feb 28, effective on renewal.',
            series: { tier: 'T3', points: [{ t: 'Feb', value: 100 }] },
            children: [
              {
                id: 'price.annual',
                label: 'Annual plans',
                role: 'mechanism',
                depth: 0,
                tier: 'T0',
              },
            ],
          },
        ],
      }),
    );
    expect(merged.title).toBe(EXISTING.title); // the blockSignature key never moves
    expect(merged.nodes).toHaveLength(3);
    const price = merged.nodes.find((n) => n.id === 'price')!;
    expect(price.label).toBe('Price increase'); // standing identity, not the incoming rewording
    expect(price.detail).toContain('Feb 28');
    expect(price.series?.points).toHaveLength(1);
    expect(price.children?.map((c) => c.id)).toEqual(['price.annual']);
  });

  it('never downgrades: an ungrounded incoming claim cannot erase a grounded fact', () => {
    const merged = mapOntoWorld(
      EXISTING,
      incoming({
        nodes: [{ id: 'price', label: 'Price increase', role: 'root', depth: 0, tier: 'T0' }],
      }),
    );
    const price = merged.nodes.find((n) => n.id === 'price')!;
    expect(price.tier).toBe('T1');
    expect(price.value).toBe(18);
    expect(price.receipt?.quote).toBe('Price rose 18%');
  });

  it('adopts a grounded incoming core: fresher receipted data replaces the old figure', () => {
    const merged = mapOntoWorld(
      EXISTING,
      incoming({
        nodes: [
          {
            id: 'price',
            label: 'Price increase',
            role: 'root',
            depth: 0,
            tier: 'T2',
            value: 22,
            unit: '%',
            receipt: { quote: 'The rise was later restated to 22%' },
          },
        ],
      }),
    );
    const price = merged.nodes.find((n) => n.id === 'price')!;
    expect(price.tier).toBe('T2');
    expect(price.value).toBe(22);
  });

  it('rescues by unique normalized label and rewrites the edges that referenced it', () => {
    const merged = mapOntoWorld(
      EXISTING,
      incoming({
        nodes: [
          {
            id: 'onboarding-email',
            label: 'Onboarding — broke?!',
            role: 'root',
            depth: 0,
            tier: 'T0',
            detail: 'Day-1 email stopped sending.',
          },
        ],
        edges: [{ from: 'onboarding-email', to: 'churn', sign: 1, tier: 'T0' }],
      }),
    );
    expect(merged.nodes).toHaveLength(3); // adopted, not appended
    expect(merged.nodes.find((n) => n.id === 'onboard')!.detail).toContain('Day-1');
    expect(merged.edges.some((e) => e.from === 'onboard' && e.to === 'churn')).toBe(true);
    expect(merged.edges.some((e) => e.from === 'onboarding-email')).toBe(false);
  });

  it('two incoming claiming one node: first wins, the loser and its references drop', () => {
    const merged = mapOntoWorld(
      EXISTING,
      incoming({
        nodes: [
          {
            id: 'price',
            label: 'Price increase',
            role: 'root',
            depth: 0,
            tier: 'T0',
            detail: 'first',
          },
          {
            id: 'raise',
            label: 'price... increase',
            role: 'root',
            depth: 0,
            tier: 'T0',
            detail: 'second',
          },
        ],
        edges: [{ from: 'raise', to: 'churn', sign: 1, tier: 'T0' }],
      }),
    );
    expect(merged.nodes).toHaveLength(3);
    expect(merged.nodes.find((n) => n.id === 'price')!.detail).toBe('first');
    expect(merged.edges).toHaveLength(1); // the loser's edge dropped, never guessed
  });

  it('keeps a genuinely new node, suffixing its id when it collides with an existing child id', () => {
    const withChild: WorldSpec = {
      ...EXISTING,
      nodes: EXISTING.nodes.map((n) =>
        n.id === 'price'
          ? {
              ...n,
              children: [
                {
                  id: 'price.annual',
                  label: 'Annual plans',
                  role: 'mechanism',
                  depth: 0,
                  tier: 'T0',
                },
              ],
            }
          : n,
      ),
    };
    const merged = mapOntoWorld(
      withChild,
      incoming({
        nodes: [
          { id: 'comp', label: 'Competitor free tier', role: 'root', depth: 0, tier: 'T0' },
          {
            id: 'price.annual',
            label: 'A different thing entirely',
            role: 'root',
            depth: 0,
            tier: 'T0',
          },
        ],
        edges: [{ from: 'comp', to: 'churn', sign: 1, tier: 'T0' }],
      }),
    );
    expect(merged.nodes.some((n) => n.id === 'comp')).toBe(true);
    expect(merged.nodes.some((n) => n.id === 'price.annual-2')).toBe(true);
    expect(merged.edges.some((e) => e.from === 'comp' && e.to === 'churn')).toBe(true);
  });

  it('an incoming edge whose endpoint never resolved is dropped', () => {
    const merged = mapOntoWorld(
      EXISTING,
      incoming({
        edges: [{ from: 'nowhere', to: 'churn', sign: 1, tier: 'T0' }],
      }),
    );
    expect(merged.edges).toEqual(EXISTING.edges);
  });

  it('unions receipts on a duplicated edge without downgrading the standing claim', () => {
    const merged = mapOntoWorld(
      EXISTING,
      incoming({
        nodes: [{ id: 'price', label: 'Price increase', role: 'root', depth: 0, tier: 'T0' }],
        edges: [
          {
            from: 'price',
            to: 'churn',
            sign: 1,
            tier: 'T0',
            provisional: true,
            receipt: { quote: 'Renewal cohorts churned at double the rate' },
            status: 'provisional',
          },
        ],
      }),
    );
    const e = merged.edges.find((x) => x.from === 'price' && x.to === 'churn')!;
    expect(e.tier).toBe('T1'); // the standing grounded claim survives
    expect(e.weight).toBe(0.45);
    expect(e.receipts!.map((r) => r.quote)).toEqual([
      'Price rose 18%',
      'Renewal cohorts churned at double the rate',
    ]);
    expect(e.receipts![0]).toBe(e.receipt);
    expect(e.status).toBe('supported');
  });
});

describe('mappedFraction', () => {
  it('is the fraction of incoming nodes that landed on the existing world', () => {
    const frac = mappedFraction(
      EXISTING,
      incoming({
        nodes: [
          { id: 'price', label: 'x', role: 'root', depth: 0, tier: 'T0' }, // exact id
          { id: 'ob', label: 'Onboarding broke', role: 'root', depth: 0, tier: 'T0' }, // label
          { id: 'comp', label: 'Competitor free tier', role: 'root', depth: 0, tier: 'T0' },
          { id: 'macro', label: 'Macro slowdown', role: 'root', depth: 0, tier: 'T0' },
        ],
      }),
    );
    expect(frac).toBe(0.5);
  });

  it('fails closed on an empty incoming world', () => {
    expect(mappedFraction(EXISTING, incoming({}))).toBe(0);
  });
});

describe('WORLD_SEED', () => {
  it('honors every structural gate it would face at the coercion door', () => {
    const ids = WORLD_SEED.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WORLD_SEED.nodes.length).toBeLessThanOrEqual(16);
    expect(WORLD_SEED.provenance.illustrative).toBe(true);
    const idSet = new Set(ids);
    for (const e of WORLD_SEED.edges) {
      expect(idSet.has(e.from)).toBe(true);
      expect(idSet.has(e.to)).toBe(true);
      expect(e.from).not.toBe(e.to);
      if (e.receipts) {
        expect(e.receipts.length).toBeLessThanOrEqual(3);
        expect(e.receipts[0]).toBe(e.receipt);
      }
    }
    for (const n of WORLD_SEED.nodes) {
      for (const c of n.children ?? []) {
        expect(c.id.startsWith(`${n.id}.`)).toBe(true);
        expect(c.children).toBeUndefined();
      }
      expect(n.children?.length ?? 0).toBeLessThanOrEqual(4);
    }
    const multiReceipt = WORLD_SEED.edges.filter((e) => (e.receipts?.length ?? 0) > 1);
    expect(multiReceipt.length).toBe(2);
  });

  it('projects to a WhyDag with world-only fields stripped and children flattened out', () => {
    const dag = asWhyDag(WORLD_SEED);
    expect(dag.center).toBe(WORLD_SEED.title);
    expect(dag.outcomeId).toBe(WORLD_SEED.outcomeId);
    expect(dag.nodes).toHaveLength(WORLD_SEED.nodes.length); // top-level only, no children lifted
    for (const n of dag.nodes) {
      expect(n).not.toHaveProperty('series');
      expect(n).not.toHaveProperty('children');
      expect(n).not.toHaveProperty('detail');
    }
    for (const e of dag.edges) {
      expect(e).not.toHaveProperty('relation');
      expect(e).not.toHaveProperty('receipts');
      expect(e).not.toHaveProperty('status');
      expect(e).not.toHaveProperty('counter');
    }
    const pivot = dag.edges.find((e) => e.from === 'defaults' && e.to === 'asset-values')!;
    const worldPivot = WORLD_SEED.edges.find(
      (e) => e.from === 'defaults' && e.to === 'asset-values',
    )!;
    expect(pivot.receipt).toBe(worldPivot.receipts![0]); // receipts[0] → receipt
  });

  it('round-trips the cascade engine and refuses the exact ladder, because it is illustrative', () => {
    // The seed is weighted and T2 THROUGHOUT, so on tiers alone the engine would call it fully
    // grounded and hand back a delta in percentage points — computed from textbook figures nobody
    // measured. `provenance.illustrative` is the world saying so, and it outranks the tiers: the
    // projection carries the flag and isFullyGrounded fails closed on it.
    expect(WORLD_SEED.provenance.illustrative).toBe(true);
    const result = cascade(asWhyDag(WORLD_SEED), []);
    expect(result.byNode.size).toBe(WORLD_SEED.nodes.length);
    expect(result.relativeByNode.size).toBe(WORLD_SEED.nodes.length);
    expect(result.fullyGrounded).toBe(false);
    expect(result.outcomeDelta).toBeNull();
    expect(result.explainedPct).toBeNull();
    expect(result.relativeOutcome).toBeGreaterThanOrEqual(0);
    expect(result.relativeOutcome).toBeLessThanOrEqual(1);
    // The structure-only pass is what keeps it alive: a prune still visibly moves the conclusion,
    // in relative strength rather than in invented percentage points.
    const pruned = cascade(asWhyDag(WORLD_SEED), [{ nodeId: 'cheap-mortgages', pct: 0 }]);
    expect(pruned.outcomeDelta).toBeNull();
    expect(pruned.relativeOutcome).not.toBe(result.relativeOutcome);
  });
});
