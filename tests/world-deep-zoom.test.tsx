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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_DRAWN_DEPTH, worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { worldToContent } from '../src/live/content/fromWorld';
import { hierarchyLens } from '../src/live/content/lens';
import { depthOf } from '../src/live/content/types';
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
    expect(depthOf(graph, 'cost.wages.salary')).toBe(2);
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
    expect(await screen.findByText('What is this made of?'.toUpperCase())).toBeTruthy();
  });

  it('offers nothing for a cause with no parts', () => {
    const graph = worldToContent(deep(), worldToMorph(deep()));
    expect(hierarchyLens.compile(graph, 'margin')).toBeNull();
  });
});
