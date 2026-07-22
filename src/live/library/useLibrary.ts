// useLibrary — React hook over the library store, re-reading whenever it changes (the store
// broadcasts a CustomEvent on every write). Kept separate from store.ts so the store stays
// framework-free.
import { useEffect, useState } from 'react';
import { getLibrary, LIBRARY_EVENT, type LibraryEntry } from './store';

/** The saved canvases, live-updating as they're added/removed. */
export function useLibrary(): LibraryEntry[] {
  const [entries, setEntries] = useState<LibraryEntry[]>(() => getLibrary());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (): void => setEntries(getLibrary());
    window.addEventListener(LIBRARY_EVENT, onChange);
    return () => window.removeEventListener(LIBRARY_EVENT, onChange);
  }, []);
  return entries;
}
