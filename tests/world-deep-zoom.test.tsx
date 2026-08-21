// world-deep-zoom.test.tsx — how far a reader can go, and where the limit honestly belongs.
//
// A part is a thing with parts: cell → cathode → material is an ordinary question, and it used to be
// refused on the grounds that a child "IS the breakdown". That made depth a property of the SCHEMA
// rather than of the answer. It is a property of the RENDERER instead, which is the only place it can
// be argued for — and the argument is about the CAMERA, not about geometry. `graphLayout` has been
// depth-generic for a while; what is bounded is what a reader can be shown in one frame at the fit
// floor on the smallest supported window.
//
// The split these pin: the world KNOWS arbitrary depth, the stage DRAWS MAX_DRAWN_DEPTH of it, and
// anything deeper is read through a lens that draws a whole tree natively — which answers a question
// no stage view can anyway, being measured proportion rather than structure.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DRAWN_DEPTH, worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { worldToContent } from '../src/live/content/fromWorld';
import { hierarchyLens } from '../src/live/content/lens';
import {
  forgetExpansions,
  recallExpansions,
  rememberExpansions,
} from '../src/live/world/openWorld';
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

describe('the stage draws what a camera can frame', () => {
  it(`adapts ${MAX_DRAWN_DEPTH} level(s) of breakdown`, () => {
    const morph = worldToMorph(deep());
    const ids = morph.nodes.map((n) => n.id);
    expect(ids).toContain('cost.wages'); // depth 1
    // Depth 2 reaches the stage now: breaking down a part has to move the map, or the reader paid a
    // model call for a press that changed nothing they could see.
    expect(ids).toContain('cost.wages.salary');
    expect(ids).toContain('cost.wages.tax');
  });

  it('renders every adapted node, folding the ones this view will not open', () => {
    const { container } = render(<WorldOverlay spec={deep()} view="graph" />);
    const node = (id: string) => container.querySelector<HTMLElement>(`.mv-node[data-id="${id}"]`);
    // Present in the DOM — a node is never dropped, so the morph back keeps every one of them…
    expect(node('cost.wages.salary')).not.toBeNull();
    // …and folded onto its parent until the reader opens it, which is what keeps it out of the
    // accessibility tree and off the tab order while it paints nothing.
    expect(node('cost.wages.salary')!.dataset.folded).toBe('');
    expect(node('cost.wages.salary')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps no focusable control inside a folded card', () => {
    // `opacity: 0` does not remove a button from the tab order, and the card around it is
    // aria-hidden — a focusable control inside a hidden subtree is an axe violation a reader meets
    // as a tab stop that goes nowhere. Nesting multiplies these by the whole subtree.
    const { container } = render(
      <WorldOverlay spec={deep()} view="graph" onExpandNode={vi.fn()} />,
    );
    const trapped = container.querySelectorAll(
      '[aria-hidden="true"] button, [aria-hidden="true"] [tabindex]:not([tabindex="-1"])',
    );
    expect([...trapped].map((n) => n.textContent)).toEqual([]);
  });
});

describe('breaking down a part of a part', () => {
  const nx = (container: HTMLElement, id: string) =>
    container
      .querySelector<HTMLElement>(`.mv-node[data-id="${id}"]`)
      ?.style.getPropertyValue('--nx');

  it('unfolds the part ON THE STAGE, exactly as it unfolds a cause', () => {
    // The reader's complaint, in one assertion. Pressing break-down on a PART used to spend the same
    // paid model call and change nothing on the map — the parts went to a depth the stage refused,
    // and the surface silently redirected the reader to the rail instead.
    const { container } = render(<WorldOverlay spec={deep()} view="graph" />);
    const press = (id: string) =>
      fireEvent.click(container.querySelector(`.mv-node[data-id="${id}"] .wo-expand`)!);

    press('cost');
    expect(nx(container, 'cost.wages')).not.toBe(nx(container, 'cost'));

    // …and now the part itself, which is the level that never worked.
    press('cost.wages');
    for (const id of ['cost.wages.salary', 'cost.wages.tax']) {
      const node = container.querySelector<HTMLElement>(`.mv-node[data-id="${id}"]`)!;
      expect(node.dataset.folded, id).toBeUndefined();
      expect(nx(container, id), id).not.toBe(nx(container, 'cost.wages'));
    }
  });

  it('reads CLOSE once a part has been broken down, and closes it', () => {
    const { container } = render(<WorldOverlay spec={deep()} view="graph" />);
    const chip = (id: string) =>
      container.querySelector<HTMLButtonElement>(`.mv-node[data-id="${id}"] .wo-expand`);

    fireEvent.click(chip('cost')!);
    // The part carries parts of its own, so its chip is a real toggle rather than a dead end. It
    // used to read "break down" for ever, and every press after the first did nothing at all.
    expect(chip('cost.wages')!.textContent).toBe('break down');
    fireEvent.click(chip('cost.wages')!);
    expect(chip('cost.wages')!.textContent).toBe('close');
    expect(chip('cost.wages')!.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(chip('cost.wages')!);
    expect(chip('cost.wages')!.textContent).toBe('break down');
    expect(
      container.querySelector('.mv-node[data-id="cost.wages.salary"]')!.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('states a part COUNT, not a dead toggle, past the depth the camera can frame', () => {
    // A part of a part of a part. Its parts exist in the spec and are read in the rail, but no
    // camera can frame that family — so the card states the FACT rather than offering a toggle that
    // would move nothing. That dead toggle is the bug this whole change exists to remove; putting a
    // second one at the next level down would just relocate it.
    const fourLevels = applyExpansion(deep(), 'cost.wages.salary', [
      { id: 'cost.wages.salary.base', label: 'Base pay', role: 'mechanism', depth: 0, tier: 'T0' },
      { id: 'cost.wages.salary.bonus', label: 'Bonus', role: 'mechanism', depth: 0, tier: 'T0' },
    ]);
    const { container } = render(<WorldOverlay spec={fourLevels} view="graph" />);
    const press = (id: string) =>
      fireEvent.click(container.querySelector(`.mv-node[data-id="${id}"] .wo-expand`)!);
    press('cost');
    press('cost.wages');

    const card = container.querySelector(`.mv-node[data-id="cost.wages.salary"]`)!;
    expect(card.querySelector('.wo-expand')).toBeNull();
    expect(card.querySelector('.wo-parts-count')?.textContent).toBe('2 parts');
  });

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

describe('a breakdown the reader paid for', () => {
  it('is seeded back into the surface when they re-open it', () => {
    // Each breakdown costs a model call, and they live in the overlay's own state — so closing the
    // surface used to throw them away and re-opening charged again for a cause already opened. The
    // memory is session-scoped and keyed on the world's title, which is its stable identity.
    const world = deep();
    rememberExpansions(
      world.title,
      new Map([
        [
          'cost.rent',
          [
            {
              id: 'cost.rent.bought',
              label: 'Bought part',
              role: 'mechanism',
              depth: 0,
              tier: 'T0',
            },
          ],
        ],
      ]),
    );

    const { container } = render(<WorldOverlay spec={world} view="graph" />);
    fireEvent.click(container.querySelector('.mv-node[data-id="cost"] .wo-expand')!);
    expect(container.querySelector('.mv-node[data-id="cost.rent.bought"]')).not.toBeNull();
  });

  it('is forgotten only when the session drops it', () => {
    const world = deep();
    rememberExpansions(
      world.title,
      new Map([
        [
          'cost.rent',
          [
            {
              id: 'cost.rent.bought',
              label: 'Bought part',
              role: 'mechanism',
              depth: 0,
              tier: 'T0',
            },
          ],
        ],
      ]),
    );
    expect(recallExpansions(world.title).size).toBe(1);
    forgetExpansions();
    expect(recallExpansions(world.title).size).toBe(0);
  });
});
