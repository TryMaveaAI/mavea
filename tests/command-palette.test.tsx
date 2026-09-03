// command-palette.test.tsx — the ⌘K "everything Mavéa can do" surface.
// Pins that a registry feature actually shows up and is searchable — the bug we just fixed was Prism
// not being discoverable. Unavailable features must stay VISIBLE (greyed, with their reason), since
// discovery is the whole point of the palette.
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette, type PaletteItem } from '../src/live/features/CommandPalette';
import { FEATURES } from '../src/live/features/registry';

afterEach(cleanup);

/** Resolve every non-demo feature to a palette item, exactly as LiveApp does. */
function items(overrides: Record<string, Partial<PaletteItem>> = {}): PaletteItem[] {
  return FEATURES.filter((f) => f.surface !== 'demo').map((f) => ({
    feature: f,
    available: true,
    run: vi.fn(),
    ...overrides[f.id],
  }));
}

const prism = FEATURES.find((f) => f.id === 'pdf-world')!;

describe('CommandPalette', () => {
  it('shows Prism in the list', () => {
    render(<CommandPalette items={items()} surface="live" onClose={vi.fn()} />);
    expect(screen.getByRole('option', { name: /Prism/ })).toBeTruthy();
  });

  it('finds Prism by typing "prism" (matches the label/keywords haystack)', () => {
    render(<CommandPalette items={items()} surface="live" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search features'), { target: { value: 'prism' } });
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(1);
    expect(opts[0].textContent).toContain('Prism');
  });

  it('keeps Prism visible but greyed (with its reason) when unavailable', () => {
    const reason = 'Attach a PDF, Word, or PowerPoint file to split it into a map';
    render(
      <CommandPalette
        items={items({ 'pdf-world': { available: false, reason } })}
        surface="live"
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByRole('option', { name: /Prism/ });
    expect(row.className).toContain('is-unavailable');
    expect(within(row).getByText(reason)).toBeTruthy();
  });

  it('runs a feature and closes on click — even an unavailable one (the action explains)', () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        items={items({ 'pdf-world': { available: false, run } })}
        surface="live"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('option', { name: /Prism/ }));
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses the feature label so a rename surfaces everywhere at once', () => {
    // Sanity: the palette renders feature.label, so renaming the registry entry renames the palette
    // row too (the rename that motivated this whole change).
    expect(prism.label).toBe('Prism');
  });

  it('shows a "See how" chip only on rows that have a mini-demo', () => {
    const watch = vi.fn();
    render(
      <CommandPalette items={items({ 'pdf-world': { watch } })} surface="live" onClose={vi.fn()} />,
    );
    // Prism has a watch → its chip exists; Memory (no watch) has none.
    expect(screen.getByRole('button', { name: /See how Prism works/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /See how What Mavéa remembers works/ })).toBeNull();
  });

  it('the "See how" chip fires watch (the demo), not run (the feature), and closes', () => {
    const run = vi.fn();
    const watch = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        items={items({ 'pdf-world': { run, watch } })}
        surface="live"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /See how Prism works/ }));
    expect(watch).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows the "see it in action" intro only on the demo surface', () => {
    const { rerender } = render(
      <CommandPalette items={items()} surface="demo" onClose={vi.fn()} />,
    );
    expect(screen.getByText(/see it in action/i)).toBeTruthy();
    rerender(<CommandPalette items={items()} surface="live" onClose={vi.fn()} />);
    expect(screen.queryByText(/see it in action/i)).toBeNull();
  });

  it("⌘Enter plays the active row's demo; plain Enter runs it", () => {
    const run = vi.fn();
    const watch = vi.fn();
    render(
      <CommandPalette items={items({ atlas: { run, watch } })} surface="live" onClose={vi.fn()} />,
    );
    // Narrow to the single Atlas row so it's the active one.
    fireEvent.change(screen.getByLabelText('Search features'), { target: { value: 'atlas' } });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(watch).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('runs the row the keyboard is actually on, not the one the pointer last grazed', () => {
    // Enter is handled on a window listener against `active`, which arrow keys and the mouse move
    // but Tab focus did not — so tabbing to a row and pressing Enter fired a different feature.
    const atlas = vi.fn();
    const memory = vi.fn();
    render(
      <CommandPalette
        items={items({ atlas: { run: atlas }, memory: { run: memory } })}
        surface="live"
        onClose={vi.fn()}
      />,
    );
    const memoryRow = screen.getByRole('option', { name: /What Mavéa remembers/ });
    fireEvent.focus(memoryRow);
    expect(memoryRow).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(memory).toHaveBeenCalledOnce();
    expect(atlas).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog it declares modal', () => {
    // aria-modal="true" with nothing inert behind it was a promise the panel did not keep: one
    // Shift+Tab landed on the scrim's own "Close" stop, the next walked out onto the page.
    const { container } = render(
      <>
        <button type="button">behind the palette</button>
        <CommandPalette items={items()} surface="live" onClose={vi.fn()} />
      </>,
    );
    const panel = container.querySelector('.cmdk-panel')!;
    const stops = [...panel.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]')];
    const input = screen.getByLabelText('Search features') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(stops[0]).toBe(input);

    // Fired from the focused control, the way a real Tab arrives — the trap listens on the panel.
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(stops[stops.length - 1]);

    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(stops[0]);
  });

  it('when pinned, Escape does not close and the esc hint is hidden', () => {
    const onClose = vi.fn();
    render(<CommandPalette items={items()} surface="live" onClose={onClose} pinned />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    // The esc hint would be a lie while Escape is swallowed.
    expect(screen.queryByText('esc')).toBeNull();
  });
});
