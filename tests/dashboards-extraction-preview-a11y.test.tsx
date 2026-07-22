// ExtractionPreview already traps focus correctly (see its useFocusTrap call) but never had a
// regression test pinning that behavior — this is that test, modeled directly on
// pin-to-dashboard-a11y.test.tsx. No session and no library entries means the "no conversation yet"
// branch renders, but the labelled dialog + its close button (the trap's fallback focus target)
// mount unconditionally, so the same four checks still apply.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ExtractionPreview } from '../src/live/dashboards/ExtractionPreview';

vi.mock('../src/live/session/store', () => ({
  loadSession: () => null,
}));
vi.mock('../src/live/library/store', () => ({
  getLibrary: () => [],
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ExtractionPreview accessibility', () => {
  it('exposes a labelled modal dialog', () => {
    const { getByRole } = render(<ExtractionPreview onClose={() => {}} />);
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('What Mavéa found in your conversation');
  });

  it('moves focus into the modal on open', () => {
    const { getByRole } = render(<ExtractionPreview onClose={() => {}} />);
    const dialog = getByRole('dialog');
    expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    const { getByRole } = render(<ExtractionPreview onClose={onClose} />);
    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the trigger when it unmounts', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<ExtractionPreview onClose={() => {}} />);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
