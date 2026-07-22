// homeTarget.ts — where "back" goes from a standalone surface (Gallery, Prism, Synthesis, Deep
// Zoom, Ripple, Courses, Flashcards, Dashboards).
//
// These surfaces are reached from two different places, and each used to guess differently: some
// sent you to the landing page, some to Live, so leaving Flashcards and leaving Prism did opposite
// things. Back should return you where you came from, and the honest signal for that is whether a
// Live session exists on this device — if you have one, that's your home; if you don't, you arrived
// from the front door.
import { SESSION_STORAGE_KEY } from '../live/session/store';

export interface HomeTarget {
  href: string;
  /** Names the destination, so the control never says "back" without saying back to WHAT. */
  label: string;
}

/** Resolve the home a standalone surface should offer. Safe to call during render. */
export function homeTarget(): HomeTarget {
  let hasSession = false;
  try {
    hasSession = !!localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    /* storage can be walled off (private mode, embedded); fall back to the front door */
  }
  return hasSession ? { href: '#/live', label: 'Live' } : { href: '#/', label: 'Mavéa' };
}
