// gallery-palette.test.tsx — `#/gallery` is a real route, and Live carried an action for it that no
// registry row ever reached, so the only way in was to know the URL. The row now exists; these pin
// that ⌘K finds it by name on Live and that the off-Live palettes open the route in place rather
// than handing a visitor to Live, where there is no gallery to show.
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette, type PaletteItem } from '../src/live/features/CommandPalette';
import { FEATURES } from '../src/live/features/registry';
import { FlagshipCommandPalette } from '../src/flagship/FlagshipCommandPalette';
import { AppCommandPalette } from '../src/nav/AppCommandPalette';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function search(term: string): HTMLElement[] {
  fireEvent.change(screen.getByLabelText('Search features'), { target: { value: term } });
  return screen.getAllByRole('option');
}

describe('the component gallery in ⌘K', () => {
  it('is a Live palette row found by searching for it', () => {
    const items: PaletteItem[] = FEATURES.filter((f) => f.surface !== 'demo').map((f) => ({
      feature: f,
      available: true,
      run: vi.fn(),
    }));
    render(<CommandPalette items={items} surface="live" onClose={vi.fn()} />);
    const rows = search('gallery');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Component gallery'),
    ]);
  });

  it.each([
    ['the landing', FlagshipCommandPalette],
    ['a standalone surface', AppCommandPalette],
  ])('opens the gallery route in place from %s', (_where, Palette) => {
    const enterLive = vi.fn();
    render(
      <Palette
        onClose={vi.fn()}
        startTour={vi.fn()}
        watchInLive={() => vi.fn()}
        enterLive={enterLive}
      />,
    );
    const [row] = search('component gallery');
    expect(row.className).not.toContain('is-unavailable');
    fireEvent.click(row);
    expect(window.location.hash).toBe('#/gallery');
    expect(enterLive).not.toHaveBeenCalled();
  });
});
