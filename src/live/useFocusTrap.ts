import { useEffect, useRef, type RefObject } from 'react';

// Elements that can hold keyboard focus inside an overlay.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface Options {
  /** Called on Escape inside the trap. Omit when the host already handles Escape itself. */
  onEscape?: () => void;
  /** When false the trap is inert (overlay mounted but closed). Defaults to true. */
  active?: boolean;
  /** Element to focus on open instead of the first focusable one — for overlays whose primary
   *  surface isn't first in DOM order (e.g. a modal whose keyboard-driven preview sits in the right
   *  pane, after the left-hand controls). Falls back to the first focusable if it's absent/null. */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * Trap keyboard focus inside `ref` while the overlay is open: focus the first focusable element on
 * open, cycle Tab / Shift+Tab within the container, and restore focus to whatever was focused
 * before it opened. Without this a modal lets keyboard and screen-reader users Tab straight out
 * into the page behind it — they lose their place and can't reliably get back. The container
 * should hold focusable controls or carry tabIndex={-1} so it can take focus as a fallback.
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  opts: Options = {},
): void {
  const { onEscape, active = true, initialFocus } = opts;
  // A ref so the effect below never depends on onEscape's identity — most callers pass an inline
  // closure (`{ onEscape: onClose }`), which is a fresh function every render of the host. Without
  // this indirection the effect would tear down and re-run on every unrelated re-render of that
  // host, re-focusing the FIRST element and yanking keyboard focus away from wherever the user had
  // tabbed to inside the trap.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // Skip elements explicitly hidden from layout/AT (the selector already drops disabled
        // and tabindex=-1). `hidden`/aria-hidden cover the common cases without needing layout.
        (el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true',
      );

    // Move focus into the overlay so the first Tab stays inside it. A caller can name the element
    // to land on (initialFocus) when the meaningful surface isn't first in DOM order; if it isn't
    // present yet (e.g. an async-composed preview), fall back to the first focusable control.
    (initialFocus?.current ?? focusable()[0] ?? node).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && onEscapeRef.current) {
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      // Hand focus back to the trigger so the keyboard user lands where they left off.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [ref, active, initialFocus]);
}
