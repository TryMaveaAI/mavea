import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryOverlay } from '../src/live/library/LibraryOverlay';
import type { LibraryEntry } from '../src/live/library/store';

// The past-conversations overlay: surfaces the saved-canvas library mid-session, dismisses on Esc /
// backdrop / close, and resumes an entry on tap. It reuses <Library>, so this covers the wrapper.

afterEach(cleanup);

const entry: LibraryEntry = {
  id: 'e1',
  question: 'Best festivals in July?',
  title: 'July Festivals',
  savedAt: 1782328386588,
  lead: null,
  spec: {
    id: 'live',
    workspace: 'Live',
    title: 'July Festivals',
    blocks: [],
  } as unknown as LibraryEntry['spec'],
};

function renderOverlay(over: Partial<Parameters<typeof LibraryOverlay>[0]> = {}) {
  return render(
    <LibraryOverlay
      entries={[entry]}
      onResume={vi.fn()}
      onRemove={vi.fn()}
      onClose={vi.fn()}
      {...over}
    />,
  );
}

describe('LibraryOverlay', () => {
  it('renders the dialog with the past-conversations library', () => {
    renderOverlay();
    const dialog = screen.getByRole('dialog', { name: 'Past conversations' });
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toMatch(/Past conversations/);
    expect(dialog.textContent).toMatch(/Best festivals in July\?/);
  });

  it('closes on Escape, the backdrop, and the close button', () => {
    // The overlay portals into document.body, so query the document, not the render container.
    const onClose = vi.fn();
    renderOverlay({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(document.querySelector('.lib-ov-scrim') as Element);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(document.querySelector('.lib-ov-close') as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('a click inside the panel does not close it', () => {
    const onClose = vi.fn();
    renderOverlay({ onClose });
    fireEvent.click(document.querySelector('.lib-ov-panel') as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when there are no past conversations', () => {
    renderOverlay({ entries: [] });
    expect(document.querySelector('.lib-ov-scrim')).toBeNull();
  });
});
