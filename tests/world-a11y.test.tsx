// What a reader who never touches a pointer gets. The stage is a composite widget — a world of
// nodes laid out in a picture — and it was being handed over as twenty-odd tab stops in spec order,
// which on every view but the causal web is an order the picture denies.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/live/world/seed';
import { WorldOverlay } from '../src/live/world/WorldOverlay';

afterEach(cleanup);

describe('the stage is one tab stop, walked with the arrows', () => {
  const nodes = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.mv-node[role="button"]')];

  it('offers exactly one tab stop however many causes there are', () => {
    const { container } = render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    const live = nodes(container);
    expect(live.length).toBeGreaterThan(5);
    expect(live.filter((n) => n.tabIndex === 0)).toHaveLength(1);
    // Everything else is reachable, but not by Tab.
    expect(live.filter((n) => n.tabIndex === -1).length).toBe(live.length - 1);
  });

  it('moves the stop with the arrow keys, and to the ends with Home and End', () => {
    const { container } = render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    const first = nodes(container).find((n) => n.tabIndex === 0)!;
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const afterRight = nodes(container).find((n) => n.tabIndex === 0)!;
    expect(afterRight.dataset.id).not.toBe(first.dataset.id);

    fireEvent.keyDown(afterRight, { key: 'Home' });
    expect(nodes(container).find((n) => n.tabIndex === 0)!.dataset.id).toBe(first.dataset.id);

    fireEvent.keyDown(first, { key: 'End' });
    const last = nodes(container).find((n) => n.tabIndex === 0)!;
    expect(last.dataset.id).not.toBe(first.dataset.id);
  });

  it('keeps a folded breakdown out of the walk entirely', () => {
    const { container } = render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    for (const folded of container.querySelectorAll<HTMLElement>('.mv-node[data-folded]')) {
      expect(folded.getAttribute('aria-hidden'), folded.dataset.id).toBe('true');
      expect(folded.getAttribute('role'), folded.dataset.id).toBeNull();
      expect(folded.getAttribute('tabindex'), folded.dataset.id).toBeNull();
    }
  });

  it('opens the cause under the cursor on Space, and only that', async () => {
    // A cause card is a `div` carrying role="button", so the overlay's window-level Space handler
    // — guarded by a selector of bare tag names — never recognised it: one press both selected the
    // cause and started the narrated walk on top of it, which then took the rail.
    const { container } = render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    // The walk's script is composed off the mount, so wait for the transport to exist — without a
    // walk to hijack there is nothing for this test to catch.
    await waitFor(() => expect(container.querySelector('.wo-transport')).toBeTruthy());

    const card = nodes(container).find((n) => n.tabIndex === 0)!;
    fireEvent.keyDown(card, { key: ' ', bubbles: true });

    expect(container.querySelector('.wo-transport[data-playing]')).toBeNull();
    expect(container.querySelector('.wo-detail-title')?.textContent).toBe(
      card.querySelector('.mv-label')?.textContent,
    );
  });

  it('says a cause name exactly once, though every face is rendered', () => {
    // All three faces render at once — that is what lets a node MOVE between views rather than be
    // swapped out — and they are hidden with `opacity`, which removes nothing from the a11y tree.
    const { container } = render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    const node = container.querySelector<HTMLElement>('.mv-node[role="button"]')!;
    const visible = [...node.querySelectorAll('.mv-face')].filter(
      (f) => f.getAttribute('aria-hidden') === null,
    );
    expect(visible).toHaveLength(1);
  });
});

describe('changing the view says so', () => {
  it('is a tablist over the stage, not four independent switches', () => {
    render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    // One stop for the row, arrows to move — the same model as the stage below it.
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(
      tabs.find((t) => t.getAttribute('aria-selected') === 'true')!.id,
    );
  });

  it('announces the new view, naming it before explaining its geometry', () => {
    const { container } = render(<WorldOverlay spec={WORLD_SEED} view="graph" />);
    const legend = container.querySelector('.wo-legend')!;
    // Pressing a chip used to rearrange the whole stage in silence.
    expect(legend.getAttribute('aria-live')).toBe('polite');
    expect(legend.querySelector('.wo-legend-view')?.textContent).toBe('What caused what.');
  });
});
