import { useEffect, useRef } from 'react';

/**
 * Fire `callback` once, `delay` ms after it is armed, and cancel it automatically on
 * unmount or whenever `delay` changes. Pass `null` to keep it disarmed.
 *
 * The callback is read through a ref, so a changing closure never restarts the timer —
 * only `delay` does. Use this instead of a bare `setTimeout` in a component: there is no
 * path where the timer outlives the component, so it can't fire on an unmounted tree.
 */
export function useTimeout(callback: () => void, delay: number | null): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (delay === null) return;
    const id = window.setTimeout(() => saved.current(), delay);
    return () => window.clearTimeout(id);
  }, [delay]);
}
