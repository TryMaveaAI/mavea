import { useEffect, useRef } from 'react';

/**
 * Run `callback` every `delay` ms, cancelling automatically on unmount or when `delay`
 * changes. Pass `null` to pause. The callback is read through a ref, so a changing closure
 * doesn't reset the interval — only `delay` does. Use this instead of a bare `setInterval`
 * in a component: the interval can never outlive the component.
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (delay === null) return;
    const id = window.setInterval(() => saved.current(), delay);
    return () => window.clearInterval(id);
  }, [delay]);
}
