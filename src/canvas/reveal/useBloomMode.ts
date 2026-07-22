// useBloomMode.ts — the "answers bloom" reveal choreography, remembered across sessions.
//
// When on, the canvas elevates the plain card entrance (a fade + 16px rise) into a
// choreographed seed → draw-on → insight bloom per block kind — numbers count up, bars wipe in,
// lines draw themselves, rings sweep closed. When off, cards keep the long-standing `.reveal`
// entrance (zero surprise for flows that want it calm). It's one shared preference — one key,
// both surfaces — so flipping it in the Demo carries into Live and back.
//
// Mirrors the useFocusMode / memory / library store idiom exactly: an in-session cache +
// localStorage + a CustomEvent so any mounted view re-reads on change. It NEVER throws — storage
// failure or a bad value degrades to the default. The store half is framework-free; the hook
// subscribes. The flag only adds a class high on the canvas; all motion lives in CSS, so an old
// machine that can't paint it still gets the finished frame.
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mavea-bloom-mode';
/** Broadcast on every write so live views re-read (same key, so it's self-describing). */
export const BLOOM_MODE_EVENT = STORAGE_KEY;
/** On by default: the bloom IS the experience. A deliberate "calm/off" choice persists. */
const DEFAULT = true;

// In-session source of truth, so re-reads within a session are cheap and consistent.
let cache: boolean | null = null;

function fromStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'on') return true;
    if (raw === 'off') return false;
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Whether the bloom choreography is on (cached after first read). */
export function getBloomMode(): boolean {
  if (cache !== null) return cache;
  cache = fromStorage();
  return cache;
}

/** Persist + broadcast the bloom preference. */
export function setBloomMode(on: boolean): void {
  cache = on;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* storage full/unavailable — still broadcast for in-session readers */
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(BLOOM_MODE_EVENT));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** The bloom flag + a setter, live-updating as it changes anywhere (the store broadcasts). */
export function useBloomMode(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => getBloomMode());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (): void => setOn(getBloomMode());
    window.addEventListener(BLOOM_MODE_EVENT, onChange);
    return () => window.removeEventListener(BLOOM_MODE_EVENT, onChange);
  }, []);
  return [on, useCallback(setBloomMode, [])];
}
