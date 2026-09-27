// useMediaQuery — whether a CSS media query matches, kept current as the window changes.
//
// useSyncExternalStore over one MediaQueryList: a change re-renders only the subscriber, the
// listener is removed with the component, and a runtime without matchMedia (jsdom, a worker
// preview) reads as "no match" rather than throwing.
import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const read = useCallback(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, read, () => false);
}
