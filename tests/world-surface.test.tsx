// The world surface is where the three slices meet: a morphing spatial stage, the trust layer that
// makes every figure prove itself, and a local counterfactual. These pin the promises a reader can
// actually check — the view chips morph ONE world rather than swapping three, an arrow always says
// what it does not claim, a figure opens its receipt, a lever can only answer in words when the
// world is illustrative, a breakdown unfolds, and nothing anywhere renders as "undefined".
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldLab } from '../src/live/world/WorldLab';
import { WorldOverlay } from '../src/live/world/WorldOverlay';
import { WORLD_SEED } from '../src/live/world/seed';

/** The seed's one node with a breakdown, and a measured series to plot. */
const PARENT = 'mortgage-volume';

const mount = () => render(<WorldOverlay spec={WORLD_SEED} />);

/** A view chip. They are TABS — exactly one can be on — not a row of independent switches. */
const chip = (label: string): HTMLButtonElement =>
  screen.getByRole('tab', { name: label }) as HTMLButtonElement;

const nodeAt = (container: HTMLElement, id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`.mv-node[data-id="${id}"]`)!;

const nx = (container: HTMLElement, id: string): string =>
  nodeAt(container, id).style.getPropertyValue('--nx');

/** Pull the first lever off full strength — the only way to open the hypothetical column. */
function pullLever(): void {
  const slider = screen.getAllByRole('slider')[0];
  fireEvent.change(slider, { target: { value: '30' } });
}

afterEach(cleanup);

describe('WorldOverlay views', () => {
  it('morphs the same nodes through every representation', () => {
    const { container } = mount();
    const before = nodeAt(container, PARENT);
    expect(before.dataset.face).toBe('card');
    const startX = nx(container, PARENT);

    act(() => chip('As a chart').click());
    expect(nodeAt(container, PARENT)).toBe(before); // identity — it moved, it was not replaced
    expect(before.dataset.face).toBe('mark');
    expect(nx(container, PARENT)).not.toBe(startX);

    act(() => chip('Over time').click());
    expect(nodeAt(container, PARENT)).toBe(before);
    expect(before.dataset.face).toBe('entry');

    act(() => chip('Graph').click());
    expect(nodeAt(container, PARENT)).toBe(before);
    expect(before.dataset.face).toBe('card');
    // Every node of the world is present in every representation — a morph never drops one.
    expect(container.querySelectorAll('.mv-node')).toHaveLength(
      WORLD_SEED.nodes.length + WORLD_SEED.nodes.reduce((n, x) => n + (x.children?.length ?? 0), 0),
    );
  });
});

describe('WorldOverlay evidence', () => {
  it('opens a link’s receipts, ending with what it does not claim', () => {
    const { container } = mount();
    expect(container.querySelector('.tr-edge')).toBeNull();

    fireEvent.click(container.querySelector('.mv-edges g')!);

    const panel = container.querySelector('.tr-edge')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.tr-quote')?.textContent).toContain('“');
    expect(panel.querySelector('.tr-not-as')?.textContent).toMatch(/^Not represented as: .+\.$/);
  });

  it('marks the link the receipt belongs to', () => {
    // Opening one takes the surface back from the walk, and taking it back used to clear the lit
    // edge — so the ONE gesture that opens a link's receipt was also the one that unmarked it,
    // leaving the rail describing one of fifteen identical ribbons.
    const { container } = mount();
    const groups = [...container.querySelectorAll<SVGGElement>('.mv-edge-g')];
    expect(groups.every((g) => g.getAttribute('data-lit') === null)).toBe(true);

    fireEvent.click(groups[1]);
    expect(groups.filter((g) => g.getAttribute('data-lit') !== null)).toEqual([groups[1]]);
  });

  it('counts the causes without counting the outcome they explain', () => {
    // The panel said twelve while the walk's own opening line, four rows below it on the same
    // screen, said eleven.
    const { container } = mount();
    const facts = [...container.querySelectorAll('.wo-facts div')].map((d) => d.textContent);
    expect(facts[0]).toBe(`Causes${WORLD_SEED.nodes.length - 1}`);
  });

  it('opens the card behind a figure, badged for an illustrative world', () => {
    const { container } = mount();
    // The figure itself, not the card it sits on: the stage makes a node clickable too, so its
    // accessible name swallows the figure's.
    const figure = container.querySelector<HTMLButtonElement>('.mv-face-card button.tr-num')!;
    // Named for what the card actually holds. On this world that is a caveat, not a receipt —
    // announcing "source available" over a card with no SOURCE section is a promise it can't keep.
    expect(figure.textContent).toMatch(/illustrative — no source/);
    fireEvent.click(figure);

    const card = screen.getByRole('dialog');
    expect(card.querySelector('.tr-badge')?.textContent).toBe('ILLUSTRATIVE');
    expect(card.querySelector('.tr-caveat')?.textContent).toContain('not a measured fact');
    // The registry knows where the figure is used — the arrows count, not just the card.
    expect(card.querySelector('.tr-used')?.textContent).toBeTruthy();
  });
});

describe('WorldOverlay what-if', () => {
  it('re-weights the world in place and keeps its readout wordless of digits', () => {
    const { container } = mount();
    expect(container.querySelector('.tr-wi-hypo')).toBeNull();
    expect(container.querySelector('.mv-node[data-shift]')).toBeNull();

    pullLever();

    const hypo = container.querySelector('.tr-wi-hypo')!;
    expect(hypo).not.toBeNull();
    expect(hypo.querySelector('.tr-wi-chip-hypo')?.textContent).toBe('HYPOTHETICAL (MODELED)');
    // The seed is illustrative, so no exact delta may exist: the whole frame reads in words.
    expect(container.querySelector('.tr-wi')?.textContent ?? '').not.toMatch(/\d/);
    expect(hypo.querySelector('.tr-wi-phrase')?.textContent).toMatch(/would /);

    // The move lands on the world itself — no second lane, and the same nodes as before.
    const shifted = container.querySelectorAll('.mv-node[data-shift]');
    expect(shifted.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.mv-node[data-hypothetical]')).toHaveLength(0);
    // A shifted card keeps its tier badge, because it IS the measured node — the surface never
    // prints a projected magnitude beside it, so there is no unbacked figure for the badge to
    // wrongly vouch for. What the card gains is a phrase, and the phrase carries no digits.
    for (const node of shifted) {
      expect(node.querySelector('.wo-shift')?.textContent ?? '').not.toMatch(/\d/);
    }
    expect(container.querySelector('.mv-node .mv-tier')).not.toBeNull();

    // Two Resets by design — the header's and the lever rail's; either clears the counterfactual.
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]);
    expect(container.querySelector('.tr-wi-hypo')).toBeNull();
    expect(container.querySelector('.mv-node[data-shift]')).toBeNull();
  });

  // The receipt index is a function of the WORLD, and a lever changes no world — it projects one.
  // Rebuilding it on a lever would be pure waste on a drag (a walk of every node, series point,
  // child and edge per pointer move), and the reader would SEE the waste: a new registry closes
  // the open provenance card, so the receipt they were reading would vanish under their thumb.
  it('leaves the open receipt standing while a lever moves — no registry rebuild', () => {
    const { container } = mount();
    fireEvent.click(container.querySelector<HTMLButtonElement>('.mv-face-card button.tr-num')!);
    const card = screen.getByRole('dialog');

    pullLever();

    expect(screen.getByRole('dialog')).toBe(card); // identity — not even re-mounted
  });
});

describe('WorldOverlay semantic zoom', () => {
  // Explicitly on the causal web: it is the view that DRAWS a breakdown as a family, and the seed
  // world is dated enough that it now opens on its timeline, where a breakdown stays folded.
  it('unfolds a breakdown off the node that carries it', () => {
    const { container } = render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    const children = WORLD_SEED.nodes.find((n) => n.id === PARENT)!.children!;
    expect(children.length).toBeGreaterThan(1);
    for (const child of children) expect(nx(container, child.id)).toBe(nx(container, PARENT));

    fireEvent.click(container.querySelector(`.mv-node[data-id="${PARENT}"] .wo-expand`)!);

    for (const child of children) expect(nx(container, child.id)).not.toBe(nx(container, PARENT));
  });
});

describe('WorldOverlay breaking down a cause that has no authored parts', () => {
  /** A node the seed ships with no children of its own. */
  const PLAIN = 'cheap-mortgages';

  const withParts = (nodeId: string) => ({
    ...WORLD_SEED,
    nodes: WORLD_SEED.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            children: [
              {
                id: `${nodeId}.one`,
                label: 'First part',
                role: 'mechanism' as const,
                depth: 1,
                tier: 'T0' as const,
              },
              {
                id: `${nodeId}.two`,
                label: 'Second part',
                role: 'mechanism' as const,
                depth: 1,
                tier: 'T0' as const,
              },
            ],
          }
        : n,
    ),
  });

  const chip = (container: HTMLElement, id: string) =>
    container.querySelector<HTMLButtonElement>(`.mv-node[data-id="${id}"] .wo-expand`);

  it('offers nothing where nobody can buy one — the key-free lab stays key-free', () => {
    const { container } = mount();
    expect(chip(container, PLAIN)).toBeNull();
  });

  it('offers it once a host can, and shows the wait on the chip itself', async () => {
    let settle: (world: typeof WORLD_SEED | null) => void = () => {};
    const onExpandNode = vi.fn(
      () => new Promise<typeof WORLD_SEED | null>((resolve) => (settle = resolve)),
    );
    // On the causal web explicitly: it is the view that DRAWS a breakdown, and the chip is only
    // offered where pressing it moves the map. Elsewhere the card states a part COUNT instead.
    const { container } = render(
      <WorldOverlay spec={WORLD_SEED} view="graph" onExpandNode={onExpandNode} />,
    );
    const button = chip(container, PLAIN)!;
    expect(button.textContent).toBe('break down');

    fireEvent.click(button);
    // The world being SHOWN rides along, not just the id. The reader's own breakdowns live in this
    // component's state, so a host resolving the id against the answer's stored copy cannot find a
    // child the reader just made — which is how breaking down a part of a part failed silently.
    expect(onExpandNode).toHaveBeenCalledWith(PLAIN, WORLD_SEED);
    expect(chip(container, PLAIN)!.getAttribute('aria-busy')).toBe('true');

    await act(async () => settle(withParts(PLAIN)));
    // The parts arrived, and the node opened onto them in the same beat.
    expect(container.querySelector(`.mv-node[data-id="${PLAIN}.one"]`)).not.toBeNull();
    expect(chip(container, PLAIN)!.textContent).toBe('close');
  });

  it('puts the offer back, and says nothing, when the cause has no parts to name', async () => {
    let settle: (world: typeof WORLD_SEED | null) => void = () => {};
    const onExpandNode = vi.fn(
      () => new Promise<typeof WORLD_SEED | null>((resolve) => (settle = resolve)),
    );
    // On the causal web: the chip is offered where pressing it would move the map, and this seed
    // world is rich enough that it now opens on a different reading of its own accord.
    const { container } = render(
      <WorldOverlay spec={WORLD_SEED} view="graph" onExpandNode={onExpandNode} />,
    );
    fireEvent.click(chip(container, PLAIN)!);
    await act(async () => settle(null));

    expect(chip(container, PLAIN)!.textContent).toBe('break down');
    expect(chip(container, PLAIN)!.getAttribute('aria-busy')).toBeNull();
    // No alarm raised: an atomic cause is an answer, not a failure to interrupt someone with.
    expect(container.textContent).not.toMatch(/failed|error|sorry/i);
  });

  it('spends nothing until the reader actually presses', () => {
    const onExpandNode = vi.fn(async () => null);
    render(<WorldOverlay spec={WORLD_SEED} onExpandNode={onExpandNode} />);
    expect(onExpandNode).not.toHaveBeenCalled();
  });
});

describe('WorldOverlay before there is a world', () => {
  it('waits honestly, showing the reader’s own question and what the build costs', () => {
    const { container } = render(<WorldOverlay spec={null} question={WORLD_SEED.title} />);
    expect(screen.getByText(WORLD_SEED.title)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/building your living answer/i);
    // Nothing of a world is on screen — no stage, no levers, no evidence rail.
    expect(container.querySelector('.mv-node')).toBeNull();
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });

  it('states the failure and offers a retry, never a stand-in world', () => {
    const onRetry = vi.fn();
    const { container } = render(
      <WorldOverlay spec={null} question={WORLD_SEED.title} failed onRetry={onRetry} />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/didn’t come back/i);
    expect(container.querySelector('.mv-node')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens on the view a free follow-up asked for', () => {
    render(<WorldOverlay spec={WORLD_SEED} view="timeline" />);
    expect(screen.getByRole('tab', { name: 'Over time' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

describe('WorldLab', () => {
  it('renders the seed world without printing a placeholder anywhere', () => {
    const { container } = render(<WorldLab />);
    expect(container.querySelector('.wo-banner-illustrative')).not.toBeNull();

    // Every representation, plus an active lever and a selection — the states a reader can reach.
    fireEvent.click(container.querySelector('.mv-edges g')!);
    pullLever();
    for (const label of ['Over time', 'As a chart', 'Graph']) act(() => chip(label).click());

    expect(document.body.textContent).not.toMatch(/undefined|NaN|\[object Object\]/);
  });
});
