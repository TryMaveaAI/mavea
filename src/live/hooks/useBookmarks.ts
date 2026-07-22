// useBookmarks — the persisted set of frame.at timestamps the user starred in the session rail.
// Self-contained, local-only state: the rail reads the set and toggles entries, nothing else
// touches it. Persists to localStorage on every toggle (best-effort; private-mode failures are
// non-fatal — the stars just don't survive the session).
import { useCallback, useState } from 'react';

const BOOKMARKS_STORAGE_KEY = 'mavea-live-bookmarks';

export interface UseBookmarks {
  /** The starred frame keys (frame.at timestamps as strings). */
  bookmarks: ReadonlySet<string>;
  /** Star/unstar a frame key, persisting the new set. */
  toggleBookmark: (key: string) => void;
}

export function useBookmarks(): UseBookmarks {
  const [bookmarks, setBookmarks] = useState<ReadonlySet<string>>(() => {
    try {
      const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist a bookmark for a frame key (frame.at timestamp as string).
  const toggleBookmark = useCallback((key: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  return { bookmarks, toggleBookmark };
}
