import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from '../src/live/useFocusTrap';

function Trapped({ onEscape }: { onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onEscape ? { onEscape } : {});
  return (
    <div ref={ref} tabIndex={-1} data-testid="trap">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  );
}

// A trap whose meaningful surface (the "preview") sits AFTER the controls in DOM order, named via
// initialFocus — mirrors ShareModal focusing its reel preview instead of the first left-hand button.
// The stand-in is a plain focusable control; the point under test is only that initialFocus lands on
// a NON-first focusable, which is independent of the real reel's role="application" tag.
function TrappedWithInitialFocus({ present = true }: { present?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLButtonElement>(null);
  useFocusTrap(ref, { initialFocus: preview });
  return (
    <div ref={ref} tabIndex={-1} data-testid="trap">
      <button>first</button>
      <button>last</button>
      {present && (
        <button ref={preview} data-testid="preview">
          preview
        </button>
      )}
    </div>
  );
}

// Mirrors the real call sites (`useFocusTrap(ref, { onEscape: onClose })`), which pass a fresh
// inline closure every render rather than a memoized one.
function TrappedUnstableEscape({ tick }: { tick: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { onEscape: () => {} });
  return (
    <div ref={ref} tabIndex={-1} data-testid="trap">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
      <span data-testid="tick">{tick}</span>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses the first focusable on mount', () => {
    const { getByText } = render(<Trapped />);
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('wraps Tab from the last element back to the first', () => {
    const { getByText } = render(<Trapped />);
    const last = getByText('last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    const { getByText } = render(<Trapped />);
    const first = getByText('first');
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByText('last'));
  });

  it('calls onEscape when provided', () => {
    let escaped = false;
    const { getByTestId } = render(<Trapped onEscape={() => (escaped = true)} />);
    fireEvent.keyDown(getByTestId('trap'), { key: 'Escape' });
    expect(escaped).toBe(true);
  });

  it('does not steal focus back to the first element when the host re-renders with a fresh onEscape closure', () => {
    const { getByText, rerender } = render(<TrappedUnstableEscape tick={0} />);
    const last = getByText('last');
    last.focus();
    expect(document.activeElement).toBe(last);
    // A re-render with a brand-new inline onEscape (as every real caller passes) must not
    // re-run the trap's setup and yank focus back to the first element.
    rerender(<TrappedUnstableEscape tick={1} />);
    expect(document.activeElement).toBe(last);
  });

  it('focuses initialFocus on open instead of the first focusable', () => {
    const { getByTestId } = render(<TrappedWithInitialFocus />);
    expect(document.activeElement).toBe(getByTestId('preview'));
  });

  it('falls back to the first focusable when initialFocus is absent', () => {
    const { getByText } = render(<TrappedWithInitialFocus present={false} />);
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('restores focus to the prior element on unmount', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);
    const { unmount } = render(<Trapped />);
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
