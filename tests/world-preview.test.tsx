// world-preview.test.tsx — the slim marker a living answer leaves in the canvas, and the module
// registry that arms it. Three promises are load-bearing: the world's primary entrance is the view
// switcher, so this stays a STRIP (no thumbnail of the web) rather than a second big surface;
// OUTSIDE the live surface (gallery, export, replay) it must render inert rather than offering a
// button that does nothing; and it must never print a figure from the world it marks — a number
// with no receipt beside it is exactly what the trust layer exists to prevent.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldPreview } from '../src/canvas/blocks/diagrams/WorldPreview';
import { registerWorldOpener } from '../src/live/world/openWorld';
import { WORLD_SEED } from '../src/live/world/seed';

const EXPLORE = /open the living answer/i;

afterEach(cleanup);

const mount = () =>
  render(<WorldPreview title={WORLD_SEED.title} world={WORLD_SEED} blockId="live-4" />);

describe('WorldPreview', () => {
  it('renders the question with no open button when nothing can open it', () => {
    const { container } = mount();
    expect(screen.getByText(WORLD_SEED.title)).toBeTruthy();
    expect(screen.queryByRole('button', { name: EXPLORE })).toBeNull();
    // A strip, not a second surface: the web is drawn in the world VIEW, and the card that only
    // carries it into a replay/export never re-lays it out.
    expect(container.querySelector('.wp-thumb')).toBeNull();
    expect(container.querySelectorAll('.wp-node')).toHaveLength(0);
  });

  it('arms once a surface registers, hands it the block id, and disarms on unregister', () => {
    const open = vi.fn();
    const unregister = registerWorldOpener(open);
    mount();
    fireEvent.click(screen.getByRole('button', { name: EXPLORE }));
    expect(open).toHaveBeenCalledWith('live-4');
    // The card follows the registry live — no remount, no context, just its own subscription.
    act(() => unregister());
    expect(screen.queryByRole('button', { name: EXPLORE })).toBeNull();
  });

  it('prints no figure from the world — structure and evidence counts only', () => {
    const { container } = mount();
    // The user's own question is echoed verbatim, so any digits inside it are theirs, not ours.
    const text = (container.textContent ?? '').replace(WORLD_SEED.title, '');
    const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
    expect(numbers).toEqual([
      String(WORLD_SEED.nodes.length),
      String(WORLD_SEED.edges.length),
      numbers[2],
    ]);
    expect(Number(numbers[2])).toBeGreaterThan(0); // the receipt count, the only other figure
    expect(text).not.toContain('undefined');
    // The illustrative seed wears the trust layer's own badge rather than a bespoke word.
    expect(screen.getByText('ILLUSTRATIVE')).toBeTruthy();
  });
});

describe('WorldPreview before the world is built', () => {
  const offer = () =>
    render(
      <WorldPreview
        title={WORLD_SEED.title}
        outcome="The crisis, in four moves"
        blockId="live-4"
      />,
    );

  it('shows the question and says plainly what opening it costs', () => {
    const { container } = offer();
    expect(screen.getByText(WORLD_SEED.title)).toBeTruthy();
    expect(container.textContent).toMatch(/built when you open it/i);
    // What the turn already knew is real and shown.
    expect(container.textContent).toContain('The crisis, in four moves');
  });

  it('still offers the open button — opening is what builds it', () => {
    const open = vi.fn();
    const unregister = registerWorldOpener(open);
    offer();
    fireEvent.click(screen.getByRole('button', { name: EXPLORE }));
    expect(open).toHaveBeenCalledWith('live-4');
    act(() => unregister());
  });
});
