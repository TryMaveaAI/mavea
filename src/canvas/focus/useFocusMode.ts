// useFocusMode.ts — the canvas view mode, remembered across sessions.
//
// 'everything' is the full adaptive grid (the long-standing default — zero surprise for
// existing flows). 'focus' holds one card on a center stage and rails the rest, pacing the
// answer like a friend across the table. The choice is a single shared preference (one key,
// both surfaces) so flipping it in the Demo carries into Live and back.
//
// Mirrors the memory/useLiveConfig store idiom exactly: an in-session cache + localStorage +
// a CustomEvent so any mounted view re-reads on change. It NEVER throws — storage failure or
// a bad value degrades to the default. The store half is framework-free; the hook subscribes.
import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'focus' | 'everything' | 'canvas';

const STORAGE_KEY = 'mavea-view-mode';
/** Broadcast on every write so live views re-read (same key, so it's self-describing). */
export const VIEW_MODE_EVENT = STORAGE_KEY;
const DEFAULT: ViewMode = 'everything';

function isViewMode(v: unknown): v is ViewMode {
  return v === 'focus' || v === 'everything' || v === 'canvas';
}

// In-session source of truth, so re-reads within a session are cheap and consistent.
let cache: ViewMode | null = null;

function fromStorage(): ViewMode {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT;
    const raw = localStorage.getItem(STORAGE_KEY);
    return isViewMode(raw) ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** The current view mode (cached after first read). */
export function getViewMode(): ViewMode {
  if (cache) return cache;
  cache = fromStorage();
  return cache;
}

/** Persist + broadcast a new view mode. No-op on an unknown value. */
export function setViewMode(mode: ViewMode): void {
  if (!isViewMode(mode)) return;
  cache = mode;
  try {
    // 'canvas' is a transient per-answer view, not a saved preference — never persist it (and don't
    // clobber the saved focus/everything choice), so it can't stick across answers or a reload.
    if (typeof localStorage !== 'undefined' && mode !== 'canvas') {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {
    /* storage full/unavailable — still broadcast for in-session readers */
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** The view mode + a setter, live-updating as it changes anywhere (the store broadcasts). */
export function useViewMode(): readonly [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => getViewMode());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (): void => setMode(getViewMode());
    window.addEventListener(VIEW_MODE_EVENT, onChange);
    return () => window.removeEventListener(VIEW_MODE_EVENT, onChange);
  }, []);
  return [mode, useCallback(setViewMode, [])];
}
