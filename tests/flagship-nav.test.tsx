import { render, fireEvent, screen, within, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { FlagshipHost } from '../src/flagship/FlagshipHost';

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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // The demo surface auto-starts the walkthrough for a "fresh" visitor and can stash tour
  // mode / rewrite the hash as a side effect of mounting — reset both so it can't bleed
  // into a later test in this file.
  sessionStorage.clear();
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
