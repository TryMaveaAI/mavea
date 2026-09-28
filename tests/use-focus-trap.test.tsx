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

  it('keeps the Escape it handled, so the surface underneath does not also close', () => {
    // Every surface that opens one of these listens for Escape on `window` to dismiss itself. One
    // press closing both the receipt a reader opened AND the world it stands on is a dismissal
    // they never asked for.
    let escaped = 0;
    let reachedWindow = 0;
    const spy = () => (reachedWindow += 1);
    window.addEventListener('keydown', spy);
    try {
      const { getByTestId } = render(<Trapped onEscape={() => (escaped += 1)} />);
      fireEvent.keyDown(getByTestId('trap'), { key: 'Escape', bubbles: true });
      expect(escaped).toBe(1);
      expect(reachedWindow).toBe(0);

      // Anything the trap does NOT claim still reaches the host.
      fireEvent.keyDown(getByTestId('trap'), { key: 'k', bubbles: true });
      expect(reachedWindow).toBe(1);
    } finally {
      window.removeEventListener('keydown', spy);
    }
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

  it('wraps past a control that CSS has taken out of layout', () => {
    // A narrow overlay can set its last control aside with display:none. Tab never lands there,
    // so a cycle closing on it would let Tab walk out of the overlay instead of wrapping.
    const { getByText } = render(<Trapped />);
    Object.defineProperty(getByText('last'), 'checkVisibility', { value: () => false });
    const middle = getByText('middle');
    middle.focus();
    fireEvent.keyDown(middle, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('hands focus to where returnTo points when it lets go, and to the opener when that is null', () => {
    const opener = document.createElement('button');
    const current = document.createElement('button');
    document.body.append(opener, current);
    function Viewer({ to }: { to: HTMLElement | null }) {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, { returnTo: () => to });
      return (
        <div ref={ref}>
          <button>inside</button>
        </div>
      );
    }
    opener.focus();
    render(<Viewer to={current} />).unmount();
    expect(document.activeElement).toBe(current);
    opener.focus();
    render(<Viewer to={null} />).unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
    current.remove();
  });
});
