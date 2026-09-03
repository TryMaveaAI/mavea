// useFocusMode.ts — the canvas view mode, remembered across sessions.
//
// 'everything' (the full adaptive grid) is the default — the answer, entire, with nothing
// staged. 'study' is the desk: one object at a time with Mavéa's notes beside it. 'focus' pages one card at a time. 'canvas'
// spreads THIS answer's cards on a board, and 'world' opens the causal web behind it. The choice is
// a single shared preference (one key, both surfaces) so flipping it in the Demo carries into Live.
//
// Mirrors the memory/useLiveConfig store idiom exactly: an in-session cache + localStorage +
// a CustomEvent so any mounted view re-reads on change. It NEVER throws — storage failure or
// a bad value degrades to the default. The store half is framework-free; the hook subscribes.
import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'study' | 'focus' | 'everything' | 'canvas' | 'world';

const STORAGE_KEY = 'mavea-view-mode';
/** Broadcast on every write so live views re-read (same key, so it's self-describing). */
export const VIEW_MODE_EVENT = STORAGE_KEY;
// The first duty of an answer surface is to deliver the answer, so a reader who has expressed
// no preference gets the whole of it at once. The Study is the better SECOND move — it shows one
// object at a time behind an entrance, and its notes are most useful once you have taken the
// answer in — and it is one click away in the view toggle, the palette and the walkthrough.
// A choice, once made, is kept: setViewMode persists it and every later session reads it back.
const DEFAULT: ViewMode = 'everything';

/**
 * The views that belong to ONE answer rather than to the reader's standing preference: the spatial
 * board, and the world behind the answer. Neither is ever written to storage — and neither is read
 * back from it, so a value left by an older build (or a hand-edited key) can only ever restore into
 * a view the reader actually has something to see in.
 */
const TRANSIENT: ReadonlySet<string> = new Set<ViewMode>(['canvas', 'world']);

function isViewMode(v: unknown): v is ViewMode {
  return v === 'study' || v === 'focus' || v === 'everything' || v === 'canvas' || v === 'world';
}

// In-session source of truth, so re-reads within a session are cheap and consistent.
let cache: ViewMode | null = null;

function fromStorage(): ViewMode {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT;
    const raw = localStorage.getItem(STORAGE_KEY);
    // A preference saved before the Study rename says 'room' — read it as the same choice.
    // Migrated on read only; 'room' is never written back.
    const v = raw === 'room' ? 'study' : raw;
    return isViewMode(v) && !TRANSIENT.has(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** The reader's own standing choice — what a transient view falls back to when it ends. Read from
 *  storage rather than the cache, since the cache holds whatever takeover is on screen right now. */
export function savedViewMode(): ViewMode {
  return fromStorage();
}

/** The current view mode (cached after first read). */
export function getViewMode(): ViewMode {
  if (cache) return cache;
  cache = fromStorage();
  return cache;
}

function applyViewMode(mode: ViewMode, persist: boolean): void {
  if (!isViewMode(mode)) return;
  cache = mode;
  try {
    // A transient per-answer view is not a saved preference — never persist it (and don't clobber
    // the saved study/focus/everything choice), so it can't stick across answers or a reload.
    if (persist && typeof localStorage !== 'undefined' && !TRANSIENT.has(mode)) {
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

/** Persist + broadcast a new view mode. No-op on an unknown value. */
export function setViewMode(mode: ViewMode): void {
  applyViewMode(mode, true);
}

/**
 * Show a view WITHOUT touching the reader's saved choice — for the scripted surfaces (the
 * walkthrough and the curated demos), which drive the toggle as choreography. They restore the
 * standing view when they end, but a visitor who simply closes the tab mid-run never reaches that
 * cleanup, and the last view a script happened to be showing must not become their preference.
 */
export function showViewMode(mode: ViewMode): void {
  applyViewMode(mode, false);
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
