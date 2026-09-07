// deskHabit.ts — "this reader uses the desk", remembered across sessions.
//
// Three things key off it, and none of them is "which view is on screen": the Study's margin notes
// are PREFETCHED at settle time so the desk is already annotated when it opens, the pen is generous
// on every stop, and the margin gutter reserves its width. All three are decided at walk start,
// before the desk could possibly be open, so they need the reader's HABIT rather than the current
// view — and the prefetch is the one that costs money, so a reader who has never opened the desk
// must never arm it.
//
// It used to be `savedViewMode() === 'study'`, back when the desk was a persisted view. It is its
// own flag now, and it LATCHES: the first `setViewMode('board')` overwrites the very value this
// seeds from, so a read-only migration (the shape `useFocusMode` uses for 'room') would recognise
// a long-standing desk reader once and forget them the next time they changed anything.
//
// Same framework-free store idiom as useBloomMode: an in-session cache + localStorage, never
// throwing. No CustomEvent — the flag only ever goes false → true, and every consumer re-reads it
// on the next turn anyway.
import { VIEW_MODE_KEY } from '../../canvas/focus/useFocusMode';

const STORAGE_KEY = 'mavea-desk-first';

// In-session source of truth, so re-reads within a session are cheap and consistent.
let cache: boolean | null = null;

function persist(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, 'yes');
  } catch {
    /* storage full/unavailable — the in-session cache still holds for this session */
  }
}

function read(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    if (localStorage.getItem(STORAGE_KEY) === 'yes') return true;
    // A reader whose standing view was the desk before it stopped being a view. 'room' is the
    // name it had before that again — both are recognised, and latched, on this one read.
    const legacy = localStorage.getItem(VIEW_MODE_KEY);
    if (legacy === 'study' || legacy === 'room') {
      persist();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Whether this reader has opened the desk (cached after first read; latches the legacy value). */
export function deskFirst(): boolean {
  if (cache !== null) return cache;
  cache = read();
  return cache;
}

/** Record that the desk has been opened. Idempotent. */
export function markDeskFirst(): void {
  if (cache === true) return;
  cache = true;
  persist();
}
