// world-deep-zoom.test.tsx — how far a reader can go, and where the limit honestly belongs.
//
// A part is a thing with parts: cell → cathode → material is an ordinary question, and it used to be
// refused on the grounds that a child "IS the breakdown". That made depth a property of the SCHEMA
// rather than of the answer. It is now a property of the RENDERER instead, which is the only place it
// can be argued for: `graphLayout` places a breakdown against its parent's block, and only a
// top-level node has one — so a grandchild has no block to be placed against.
//
// The split these pin: the world KNOWS arbitrary depth, the stage DRAWS MAX_DRAWN_DEPTH of it, and
// anything deeper is read through a lens that draws a whole tree natively.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DRAWN_DEPTH, worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { worldToContent } from '../src/live/content/fromWorld';
import { hierarchyLens } from '../src/live/content/lens';
import { applyExpansion } from '../src/live/world/validate';
import type { WorldNode, WorldSpec } from '../src/live/world/types';
import { WorldOverlay } from '../src/live/world/WorldOverlay';

afterEach(cleanup);

/** A grounded part, so the lens is allowed to size it. */
const part = (id: string, label: string, value: number, children?: WorldNode[]): WorldNode => ({
  id,
  label,
  role: 'mechanism',
  depth: 1,
  tier: 'T2',
  value,
  unit: '%',
  receipt: { quote: `${label} measured ${value}%.`, host: 'test corpus' },
  ...(children ? { children } : {}),
});

/** cost → {rent, wages} → wages → {salary, tax}: three levels of breakdown. */
function deep(): WorldSpec {
  return {
    title: 'Why did the margin fall?',
    outcomeId: 'margin',
    provenance: {},
    nodes: [
      {
        id: 'cost',
        label: 'Costs rose',
        role: 'root',
        depth: 0,
        tier: 'T0',
        children: [
          part('cost.rent', 'Rent', 40),
          part('cost.wages', 'Wages', 60, [
            part('cost.wages.salary', 'Salary', 45),
            part('cost.wages.tax', 'Payroll tax', 15),
          ]),
        ],
      },
      { id: 'margin', label: 'Margin fell', role: 'outcome', depth: 1, tier: 'T0' },
    ],
    edges: [{ from: 'cost', to: 'margin', sign: 1, tier: 'T0' }],
  };
}

describe('the data knows arbitrary depth', () => {
  it('attaches a breakdown to a CHILD, not only to a top-level cause', () => {
    const flat: WorldSpec = {
      ...deep(),
      nodes: deep().nodes.map((n) =>
        n.id === 'cost'
          ? { ...n, children: [part('cost.rent', 'Rent', 40), part('cost.wages', 'Wages', 60)] }
          : n,
      ),
    };
    const out = applyExpansion(flat, 'cost.wages', [part('cost.wages.salary', 'Salary', 45)]);
    const wages = out.nodes[0].children!.find((c) => c.id === 'cost.wages')!;
    expect(wages.children?.map((c) => c.label)).toEqual(['Salary']);
  });

  it('returns the same object when nothing applied, so a caller can compare by identity', () => {
    const prior = deep();
    // Already broken down — an authored breakdown is never overwritten, at any depth.
    expect(applyExpansion(prior, 'cost.wages', [part('x', 'X', 1)])).toBe(prior);
    expect(applyExpansion(prior, 'nowhere', [part('x', 'X', 1)])).toBe(prior);
  });

  it('carries the full depth into the content graph', () => {
    const graph = worldToContent(deep(), worldToMorph(deep()));
    // Two levels down, and its parent chain intact — the graph caps nothing.
    const salary = graph.entities.find((e) => e.id === 'cost.wages.salary')!;
    expect(salary.parentId).toBe('cost.wages');
    expect(graph.entities.find((e) => e.id === 'cost.wages')!.parentId).toBe('cost');
    expect(graph.entities.map((e) => e.id)).toContain('cost.wages.tax');
  });
});

describe('the stage draws only what it can place', () => {
  it(`stops at ${MAX_DRAWN_DEPTH} level(s) of breakdown`, () => {
    const morph = worldToMorph(deep());
    const ids = morph.nodes.map((n) => n.id);
    expect(ids).toContain('cost.wages'); // depth 1 — placed against its parent's block
    // Depth 2 has no block to be placed against. Drawing it would put a card wherever the
    // arithmetic fell, which is why the limit is here rather than in the schema.
    expect(ids).not.toContain('cost.wages.salary');
    expect(ids).not.toContain('cost.wages.tax');
  });

  it('never renders a node the stage did not adapt', () => {
    const { container } = render(<WorldOverlay spec={deep()} />);
    const drawn = [...container.querySelectorAll<HTMLElement>('.mv-node')].map((n) => n.dataset.id);
    expect(drawn).not.toContain('cost.wages.salary');
  });
});

describe('breaking down a part of a part', () => {
  it('hands the host the world being SHOWN, so a child the reader just made can be found', async () => {
    // The reported bug. A host resolves the id against the answer's stored world; every breakdown the
    // reader has bought lives in the overlay's state instead, so the newly-made child was not in the
    // tree being searched, the lookup returned null, and pressing BREAK DOWN on it did nothing at all.
    const seen: string[] = [];
    const onExpandNode = vi.fn(async (nodeId: string, showing: WorldSpec) => {
      // Resolved the way a host resolves it — against what it was handed.
      const find = (nodes: readonly WorldNode[]): WorldNode | undefined => {
        for (const n of nodes) {
          if (n.id === nodeId) return n;
          const hit = n.children && find(n.children);
          if (hit) return hit;
        }
        return undefined;
      };
      seen.push(find(showing.nodes) ? 'found' : 'MISSING');
      return applyExpansion(showing, nodeId, [part(`${nodeId}.bought`, 'A bought part', 10)]);
    });

    const spec: WorldSpec = {
      ...deep(),
      nodes: deep().nodes.map((n) => (n.id === 'cost' ? { ...n, children: undefined } : n)),
    };
    const { container } = render(<WorldOverlay spec={spec} onExpandNode={onExpandNode} />);

    const press = (id: string): void => {
      const chip = container.querySelector<HTMLElement>(`.mv-node[data-id="${id}"] .wo-expand`);
      expect(chip, `no break-down chip on ${id}`).not.toBeNull();
      fireEvent.click(chip!);
    };

    press('cost');
    await act(async () => {
      await Promise.resolve();
    });
    // Now break down the child that press just created.
    press('cost.bought');
    await act(async () => {
      await Promise.resolve();
    });

    expect(seen).toEqual(['found', 'found']);
    expect(onExpandNode).toHaveBeenCalledTimes(2);
  });
});

describe('a cause whose parts nothing measured', () => {
  /** The same shape, with every part qualitative — which is what most causal answers are. */
  const qualitative = (): WorldSpec => ({
    title: 'Why did the queue build up?',
    outcomeId: 'queue',
    provenance: {},
    nodes: [
      {
        id: 'model',
        label: 'The old store model',
        role: 'root',
        depth: 0,
        tier: 'T0',
        children: [
          { id: 'model.late-fees', label: 'late fees', role: 'mechanism', depth: 1, tier: 'T0' },
          { id: 'model.stores', label: 'physical stores', role: 'mechanism', depth: 1, tier: 'T0' },
        ],
      },
      { id: 'queue', label: 'Shoppers waited', role: 'outcome', depth: 1, tier: 'T0' },
    ],
    edges: [{ from: 'model', to: 'queue', sign: 1, tier: 'T0' }],
  });

  it('NAMES them when the lens cannot size them', async () => {
    // A hierarchy component needs magnitudes, and inventing them is the finding nobody made. Without
    // the list, a reader who broke a part down got a press that changed nothing they could see.
    const { container } = render(<WorldOverlay spec={qualitative()} />);
    fireEvent.click(container.querySelector<HTMLElement>('.mv-node[data-id="model"]')!);
    expect(await screen.findByText('WHAT THIS IS MADE OF')).toBeTruthy();
    expect([...container.querySelectorAll('.wo-part-list li')].map((l) => l.textContent)).toEqual([
      'late fees',
      'physical stores',
    ]);
    // And it does NOT pretend to a chart.
    expect(container.querySelector('.wo-parts svg')).toBeNull();
  });

  it('says nothing for a cause with no parts at all', () => {
    const { container } = render(<WorldOverlay spec={qualitative()} />);
    fireEvent.click(container.querySelector<HTMLElement>('.mv-node[data-id="queue"]')!);
    expect(container.querySelector('.wo-parts')).toBeNull();
  });
});

describe('the lens is how the deeper structure is read', () => {
  it('draws every level, including the one the stage refused', () => {
    const graph = worldToContent(deep(), worldToMorph(deep()));
    const plan = hierarchyLens.compile(graph, 'cost')!;
    const root = plan.block.props as {
      root: { children: { label: string; children?: { label: string }[] }[] };
    };
    const wages = root.root.children.find((c) => c.label === 'Wages')!;
    // The part the stage would not place, present and labelled.
    expect(wages.children?.map((c) => c.label)).toEqual(['Salary', 'Payroll tax']);
  });

  it('shows it in the rail when the reader selects the cause', async () => {
    const { container } = render(<WorldOverlay spec={deep()} />);
    fireEvent.click(container.querySelector<HTMLElement>('.mv-node[data-id="cost"]')!);
    expect(await screen.findByText('WHAT THIS IS MADE OF')).toBeTruthy();
  });

  it('offers nothing for a cause with no parts', () => {
    const graph = worldToContent(deep(), worldToMorph(deep()));
    expect(hierarchyLens.compile(graph, 'margin')).toBeNull();
  });
});
