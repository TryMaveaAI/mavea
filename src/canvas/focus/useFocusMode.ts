// useFocusMode.ts — the canvas view, and the reader's one standing choice.
//
// 'board' is where the canvas rests: the whole answer at once, nothing staged, nothing to pick.
// It is the ONLY value that persists. Everything else is a takeover of ONE answer — the Study's
// lamplit desk, Focus's single card, the spatial board, the causal world — entered by a control
// and left by one, never carried into the next session. Reading closer is a gesture on the board
// (a card comes forward with Mavéa's notes beside it), not a mode you set, so the reader is never
// asked to name how they want to read before they have read anything.
//
// Mirrors the memory/useLiveConfig store idiom exactly: an in-session cache + localStorage +
// a CustomEvent so any mounted view re-reads on change. It NEVER throws — storage failure or
// a bad value degrades to the default. The store half is framework-free; the hook subscribes.
import { useCallback, useEffect, useState } from 'react';

/** The storage key, exported so the desk-habit flag can read the value this one used to hold. */
export const VIEW_MODE_KEY = 'mavea-view-mode';
/** Broadcast on every write so live views re-read (same key, so it's self-describing). */
export const VIEW_MODE_EVENT = VIEW_MODE_KEY;

export type ViewMode = 'board' | 'study' | 'focus' | 'canvas' | 'world';

const DEFAULT: ViewMode = 'board';

/**
 * Every view that belongs to ONE answer rather than to the reader's standing choice. None is ever
 * written to storage — and none is read back from it, so a value left by an older build (or a
 * hand-edited key) can only ever restore into the resting board.
 *
 * Study and Focus joined this set when the view toggle became a single door: both are things you
 * ask for and leave, and Present drives Focus as choreography (LiveApp restores the standing view
 * on exit). While Focus persisted, a reader who closed the tab mid-presentation kept it as their
 * standing view forever.
 */
const TRANSIENT: ReadonlySet<string> = new Set<ViewMode>(['study', 'focus', 'canvas', 'world']);

function isViewMode(v: unknown): v is ViewMode {
  return v === 'board' || v === 'study' || v === 'focus' || v === 'canvas' || v === 'world';
}

/**
 * What a preference written by an older build means now. All four resolve to the board: 'room' and
 * 'study' named the desk, 'focus' the single card, 'everything' the resting grid this renamed.
 * Migrated on read only; none is ever written back.
 *
 * A reader who chose the desk is not forgotten — `study/deskHabit` reads the SAME key to recognise
 * them, and latches, because the first write here replaces the value it reads.
 */
function migrate(raw: string | null): string | null {
  if (raw === 'room' || raw === 'study' || raw === 'focus' || raw === 'everything') return 'board';
  return raw;
}

// In-session source of truth, so re-reads within a session are cheap and consistent.
let cache: ViewMode | null = null;

function fromStorage(): ViewMode {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT;
    const v = migrate(localStorage.getItem(VIEW_MODE_KEY));
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
    // the saved choice), so it can't stick across answers or a reload.
    if (persist && typeof localStorage !== 'undefined' && !TRANSIENT.has(mode)) {
      localStorage.setItem(VIEW_MODE_KEY, mode);
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
 * walkthrough and the curated demos), which drive the view as choreography. They restore the
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
