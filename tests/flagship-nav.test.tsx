import { render, fireEvent, screen, within, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { FlagshipHost } from '../src/flagship/FlagshipHost';
import { isTourSeen, resetTourSeen } from '../src/tour/tourSeen';

// The topbar's standalone nav links (Take the tour / Demo / Explore) don't fit a phone-width
// bar, so CSS hides them there — but the Explore trigger stays, and folds those destinations
// into its own dropdown (alongside the existing Deep Zoom / Dashboards / Prism / Ripple
// standalone features) so nothing the desktop nav reaches goes missing on a narrow screen.
// This locks that every destination is always reachable from one menu, that the folded-in
// shortcuts behave exactly like their standalone counterparts — and that the gallery (a QA
// surface, reachable only by its direct #/gallery URL) never leaks back into the nav.

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
  // Every tour entry point now retires the first-run invite, so each test starts as a
  // first-time visitor rather than inheriting the previous one's "seen" flag.
  resetTourSeen();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // The demo surface auto-starts the walkthrough for a "fresh" visitor and can stash tour
  // mode / rewrite the hash as a side effect of mounting — reset both so it can't bleed
  // into a later test in this file.
  sessionStorage.clear();
  resetTourSeen();
  window.location.hash = '';
});

describe('flagship topbar — Explore dropdown', () => {
  it('lists every nav destination, including the mobile-only shortcuts', () => {
    render(<FlagshipHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    const menu = screen.getByRole('menu', { name: /explore features/i });
    // folded in for the phone breakpoint — nowhere else to reach these once the standalone
    // links are hidden there
    expect(within(menu).getByText('Take the tour')).toBeInTheDocument();
    expect(within(menu).getByText('Demo')).toBeInTheDocument();
    // the original standalone-feature list, unchanged
    expect(within(menu).getByText('Deep Zoom')).toBeInTheDocument();
    expect(within(menu).getByText('Dashboards')).toBeInTheDocument();
    expect(within(menu).getByText('Prism')).toBeInTheDocument();
    expect(within(menu).getByText('Ripple')).toBeInTheDocument();
    // the gallery is a QA surface: direct URL only, never in the visitor-facing nav
    expect(within(menu).queryByText('Gallery')).toBeNull();
  });

  it('the folded-in Take-the-tour shortcut starts the walkthrough handoff', () => {
    render(<FlagshipHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    const menu = screen.getByRole('menu', { name: /explore features/i });
    fireEvent.click(within(menu).getByText('Take the tour'));
    // startTour() stashes the tour flag then hands off to Live.
    expect(window.location.hash).toBe('#/live');
    expect(sessionStorage.getItem('mavea-tour-mode')).toBe('1');
  });

  it('opens onto the first row and drives the list with the arrow keys', () => {
    render(<FlagshipHost />);
    const trigger = screen.getByRole('button', { name: 'Explore' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: /explore features/i });
    const rows = within(menu).getAllByRole('menuitem');
    const press = (key: string): void => {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key });
    };
    // role="menu" promises arrow navigation, so opening lands on the first row — Tab is not
    // the way through a menu, and leaving focus on the trigger left AT users with nowhere to go.
    expect(document.activeElement).toBe(rows[0]);

    press('ArrowDown');
    expect(document.activeElement).toBe(rows[1]);
    press('End');
    expect(document.activeElement).toBe(rows[rows.length - 1]);
    // …and the ends wrap, so a held arrow key never dead-ends.
    press('ArrowDown');
    expect(document.activeElement).toBe(rows[0]);
    press('ArrowUp');
    expect(document.activeElement).toBe(rows[rows.length - 1]);
    press('Home');
    expect(document.activeElement).toBe(rows[0]);

    // Closing hands focus back to the trigger — the rows unmount with the menu.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('never lands focus on a row the breakpoint has hidden', () => {
    // The compact duplicates (Take the tour / Demo) are display:none above the phone
    // breakpoint. jsdom parses no stylesheets, so stand the media query's effect up by hand.
    const sheet = document.createElement('style');
    sheet.textContent = '.fl-explore-item--compact { display: none }';
    document.head.append(sheet);
    try {
      render(<FlagshipHost />);
      fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
      const menu = screen.getByRole('menu', { name: /explore features/i });
      const visible = within(menu)
        .getAllByRole('menuitem')
        .filter((row) => !row.classList.contains('fl-explore-item--compact'));
      expect(document.activeElement).toBe(visible[0]);
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(visible[visible.length - 1]);
    } finally {
      sheet.remove();
    }
  });
});

describe('flagship — the first-run tour invite retires wherever the tour starts', () => {
  it('retires when the walkthrough is taken from the topbar, not just from the invite', () => {
    render(<FlagshipHost />);
    // A first-time visitor sees the invite in the hero.
    expect(screen.getByText('Watch the Study')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(window.location.hash).toBe('#/live');
    // Coming back to the landing after touring must not re-offer the tour.
    expect(isTourSeen()).toBe(true);
    expect(screen.queryByText('Take the full tour')).toBeNull();
    expect(screen.getByText(/Watch the Study/i)).toBeInTheDocument();
  });

  it('retires when the Explore shortcut starts the walkthrough', () => {
    render(<FlagshipHost />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    const menu = screen.getByRole('menu', { name: /explore features/i });
    fireEvent.click(within(menu).getByText('Take the tour'));
    expect(isTourSeen()).toBe(true);
    expect(screen.queryByText('Take the full tour')).toBeNull();
  });

  it('still retires from the invite’s own two answers', () => {
    const { unmount } = render(<FlagshipHost />);
    fireEvent.click(screen.getByText('Take the full tour'));
    expect(isTourSeen()).toBe(true);
    unmount();

    resetTourSeen();
    render(<FlagshipHost />);
    fireEvent.click(screen.getByText(/I'll explore on my own/i));
    expect(isTourSeen()).toBe(true);
    expect(screen.queryByText('Take the full tour')).toBeNull();
  });
});

describe('flagship hero — presence ghost', () => {
  it('holds the face slot with a decorative ghost until the lazy Presence mounts in its place', async () => {
    const { container } = render(<FlagshipHost />);
    // Before the Presence chunk resolves, the Suspense fallback keeps the positioner occupied —
    // the hero never shows an empty slot, and the ghost is purely visual (hidden from AT).
    const ghost = container.querySelector('.presence-positioner > .presence-ghost');
    expect(ghost).toBeInTheDocument();
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.presence')).toBeNull();
    // Once the chunk lands, the face replaces the ghost inside the SAME positioner, so the
    // scroll-dock transform applies to both and the swap can't shift or pop.
    await waitFor(() =>
      expect(container.querySelector('.presence-positioner > .presence')).toBeInTheDocument(),
    );
    expect(container.querySelector('.presence-ghost')).toBeNull();
  });
});
