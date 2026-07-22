import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import { AppMenuBar } from '../src/nav/AppMenuBar';
import { buildAppMenus } from '../src/nav/appMenus';

// The Dashboards surface used to be a dead-end: from it you could only get back to Live, never to
// the other parts of the app. AppMenuBar carries Live's own Create/Practice/Share/Explore menus +
// ⌘K search onto it. These lock that the same menu bar is present, that a menu never links to the
// surface it's already on, that a standalone-surface item navigates, and that Search opens.

const originalHash = window.location.hash;
afterEach(() => {
  window.location.hash = originalHash;
});

describe('AppMenuBar', () => {
  it('renders the same five menus Live leads with', () => {
    const { getByRole } = render(<AppMenuBar />);
    for (const label of ['Create', 'Practice', 'Share', 'Explore']) {
      expect(getByRole('button', { name: new RegExp(`^${label}$`, 'i') })).toBeTruthy();
    }
    expect(getByRole('button', { name: /search all features/i })).toBeTruthy();
  });

  it('navigates to a standalone surface when its Explore item is chosen', () => {
    const { getByRole } = render(<AppMenuBar />);
    fireEvent.click(getByRole('button', { name: /^explore$/i }));
    fireEvent.click(getByRole('menuitem', { name: /Deep Zoom/i }));
    expect(window.location.hash).toBe('#/deepzoom');
  });

  it('omits the surface it is already on (no self-link)', () => {
    const { getByRole, queryByRole } = render(<AppMenuBar omitHash="#/dashboards" />);
    fireEvent.click(getByRole('button', { name: /^explore$/i }));
    // Explore's "Dashboards" row is dropped when we're already on #/dashboards.
    expect(queryByRole('menuitem', { name: /^Dashboards/i })).toBeNull();
  });

  it('opens the ⌘K feature search on demand (portaled to the document body)', () => {
    render(<AppMenuBar />);
    fireEvent.click(within(document.body).getByRole('button', { name: /search all features/i }));
    // The palette is lazy; its accessible loading acknowledgement appears immediately, and — being
    // portaled out of the (backdrop-filtered) bar — it lives on document.body.
    expect(within(document.body).getByRole('status').textContent).toMatch(
      /opening feature search/i,
    );
  });
});

describe('buildAppMenus', () => {
  it('mirrors Live’s categories and drops the omitted self-link', () => {
    const menus = buildAppMenus({
      openPalette: () => {},
      enterLive: () => {},
      omitHash: '#/dashboards',
    });
    // Conversation-only categories are still present (they hand off to Live), so the bar reads
    // identically to Live.
    expect(menus.create.length).toBeGreaterThan(0);
    expect(menus.share.length).toBe(3);
    // The self-link is hidden, not merely de-emphasised.
    const dashboards = menus.explore.find((i) => i.label === 'Dashboards');
    expect(dashboards?.show).toBe(false);
    // A standalone item stays visible.
    expect(menus.explore.find((i) => i.label === 'Prism')?.show).toBe(true);
  });
});
