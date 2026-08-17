// The stress toggle on the surface: "only what is sourced", and the finding beside it.
//
// The world has always drawn an unsourced link fainter than a sourced one, which tells a reader that
// SOME arrow is weaker and nothing about what that means for the answer. These pin the two things
// that turn the distinction into something actionable — the causes that fall away when only sourced
// links are believed, and the one unsourced link the whole explanation rests on.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { allWorldScenario } from '../src/live/world/scenarios/index';
import { WORLD_SEED } from '../src/live/world/seed';
import { WorldOverlay } from '../src/live/world/WorldOverlay';

afterEach(cleanup);

/** A sourced world with unsourced links in it — the only shape the toggle has anything to say about. */
const LAKE = allWorldScenario('orphan-lake')!.spec;
const TOGGLE = 'Only what is sourced';

describe('the stress toggle', () => {
  it('recedes every cause the sourced links cannot reach, and leaves the outcome', () => {
    const { container } = render(<WorldOverlay spec={LAKE} />);
    expect(container.querySelectorAll('.mv-node[data-faded]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: TOGGLE }));

    const faded = [...container.querySelectorAll<HTMLElement>('.mv-node[data-faded]')];
    expect(faded.length).toBeGreaterThan(0);
    // The thing being explained does not stop existing because the explanation thinned out.
    expect(faded.map((n) => n.dataset.id)).not.toContain(LAKE.outcomeId);
    // Nothing LEAVES: fading is a render channel, so the composition is untouched and the gap the
    // toggle exists to show cannot close itself. (Where each node sits is pinned separately below.)
    expect(container.querySelectorAll('.mv-node')).toHaveLength(LAKE.nodes.length);
  });

  it('is a toggle — a second press puts the whole explanation back', () => {
    const { container } = render(<WorldOverlay spec={LAKE} />);
    const button = screen.getByRole('button', { name: TOGGLE });
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('.mv-node[data-faded]')).toHaveLength(0);
  });

  it('moves no node — the map holds still while the reader reads what fell away', () => {
    const { container } = render(<WorldOverlay spec={LAKE} />);
    const where = (): string[] =>
      [...container.querySelectorAll<HTMLElement>('.mv-node')].map(
        (n) => `${n.style.getPropertyValue('--nx')},${n.style.getPropertyValue('--ny')}`,
      );
    const before = where();
    fireEvent.click(screen.getByRole('button', { name: TOGGLE }));
    expect(where()).toEqual(before);
  });

  it('is absent on an ILLUSTRATIVE world, which sources nothing to begin with', () => {
    // "Only what is sourced" on a textbook world empties it, and the banner already says the whole
    // thing is a shape — the same rule the view chips follow: a control whose content would be a
    // wall of excuses is not offered.
    render(<WorldOverlay spec={WORLD_SEED} />);
    expect(screen.queryByRole('button', { name: TOGGLE })).toBeNull();
  });

  it('names the unsourced link the answer leans on, in prose and without a magnitude', () => {
    const { container } = render(<WorldOverlay spec={LAKE} />);
    const finding = container.querySelector('.wo-weakest');
    expect(finding).not.toBeNull();
    expect(finding!.textContent).toContain('lose every route to the outcome without it');
    // A count of CAUSES is structure; a share or a percentage would be a figure nothing measured.
    expect(finding!.textContent).not.toMatch(/%/);
  });
});
