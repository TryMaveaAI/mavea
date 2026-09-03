// tourEntry.ts — the one-shot handoff that tells LiveApp to boot in "tour mode" (replay the
// baked corpus as if it were a live session) instead of the normal wizard/session. It mirrors
// seedQuery.ts: the landing stashes the flag, then navigates to #/live; LiveApp consumes it once
// on mount. A `?tour=1` in the hash is also honored so the tour is directly deep-linkable (and
// easy to dev-test) without going through the landing. Defensive: any storage failure just means
// no tour, never a throw.
import { markTourSeen } from './tourSeen';

const KEY = 'mavea-tour-mode';
const CHAPTER_KEY = 'mavea-tour-chapter';
const SOLO_KEY = 'mavea-tour-solo';

/** Ask the next #/live mount to play the walkthrough. Call right before navigating to #/live.
 *  Retiring the landing's first-run invite belongs HERE, not at each caller: the rule is that every
 *  route into the walkthrough retires it, and the showcase's ten deep-links each stashed tour mode
 *  on their own and left the visitor to be invited on the tour they had just watched. */
export function stashTourMode(): void {
  markTourSeen();
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable — the tour just won't auto-start; harmless */
  }
}

/** Ask the walkthrough to open on one chapter (a landing vignette's "see it live" deep-link).
 *  Call together with stashTourMode. */
export function stashTourChapter(id: string): void {
  try {
    sessionStorage.setItem(CHAPTER_KEY, id);
  } catch {
    /* storage unavailable — the tour just starts from the top */
  }
}

/** Pure check: does the current hash or session storage ask for tour mode? Never mutates
 *  anything, so it's safe to call from a component's render body — React can invoke a function
 *  component's render more than once for a single eventual commit (e.g. an interruptible
 *  concurrent render that gets abandoned and retried synchronously), and a "read" that doubles as
 *  a one-shot consume would let a discarded attempt burn the flag before the render that actually
 *  sticks ever sees it. Pair with `clearTourModeFlag` (called once, from an effect after mount)
 *  to consume it. */
export function peekTourMode(): boolean {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (/[?&]tour=1(?:&|$)/.test(hash)) return true;
    return !!sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/** Consume the one-shot tour-mode flag. Call exactly once, from an effect after the mount that
 *  read it (via peekTourMode) has actually committed — never from render itself. A no-op if
 *  nothing was stashed (e.g. a `?tour=1` deep-link, which isn't backed by storage). */
export function clearTourModeFlag(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Pure check for a requested start chapter: a `&ch=` on a `?tour=1` deep-link, or a stashed
 *  chapter id. Never mutates — see peekTourMode for why. Pair with clearTourChapterFlag. */
export function peekTourChapter(): string | null {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const m = /[?&]ch=([a-z-]+)(?:&|$)/.exec(hash);
    if (m) return m[1];
    return sessionStorage.getItem(CHAPTER_KEY);
  } catch {
    return null;
  }
}

/** Consume the one-shot start-chapter flag. See clearTourModeFlag. */
export function clearTourChapterFlag(): void {
  try {
    sessionStorage.removeItem(CHAPTER_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Ask the walkthrough to play its start chapter SOLO — a single self-contained mini-demo that
 *  returns to the end card when it finishes, rather than continuing into the rest of the tour.
 *  An EXTRA chapter is always solo; this flag is what makes a CORE chapter play solo too. */
export function stashTourSolo(): void {
  try {
    sessionStorage.setItem(SOLO_KEY, '1');
  } catch {
    /* storage unavailable — the chapter just plays inline instead of solo; harmless */
  }
}

/** Pure check: does the current hash or session storage ask for solo playback? Safe in render —
 *  see peekTourMode. Pair with clearTourSoloFlag. */
export function peekTourSolo(): boolean {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (/[?&]solo=1(?:&|$)/.test(hash)) return true;
    return !!sessionStorage.getItem(SOLO_KEY);
  } catch {
    return false;
  }
}

/** Consume the one-shot solo flag. See clearTourModeFlag. */
export function clearTourSoloFlag(): void {
  try {
    sessionStorage.removeItem(SOLO_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Launch one chapter as a solo mini-demo from anywhere in the app (the ⌘K palette's "Watch", a
 *  docs link, a marketing surface). Stashes tour + chapter + solo, then reloads into #/live in tour
 *  mode. A reload is deliberate: a chapter drives the REAL turn state, so playing it in a live
 *  session would splice fixture frames in and the per-turn persist would save them — reload keeps
 *  the user's real session clean (it resumes via loadSession when they leave the demo). */
export function launchSoloChapter(id: string): void {
  stashTourMode();
  stashTourChapter(id);
  stashTourSolo();
  try {
    window.location.hash = '#/live';
    window.location.reload();
  } catch {
    /* no window (SSR/test) — the stashed flags still take effect on the next real mount */
  }
}

/** Convenience one-shot read-and-consume for callers outside a render body (tests, non-React
 *  code). Components must use peekTourMode + clearTourModeFlag instead — see their docs. */
export function takeTourMode(): boolean {
  const active = peekTourMode();
  if (active) clearTourModeFlag();
  return active;
}

/** Keep the URL in step with the chapter on screen (replace, never push, so it never adds a
 *  back-button stop). The landing's "Watch it work" hands off through the one-shot sessionStorage
 *  stash above, not a `?tour=1` URL — so without this, a reload mid-tour finds that flag already
 *  consumed and silently drops the visitor onto the setup wizard with no way back in. Once this
 *  has run, every later reload re-enters through the SAME `?tour=1&ch=` check `takeTourMode` /
 *  `takeTourChapter` already do for a direct deep-link, resuming on the chapter it left off on. */
export function syncTourUrl(chapterId: string, solo = false): void {
  try {
    const path = window.location.hash.split('?')[0] || '#/live';
    // The `&solo=1` half keeps a mid-demo reload playing that one chapter solo (back to the end
    // card when done) instead of resuming the full tour from it.
    const soloQ = solo ? '&solo=1' : '';
    window.history.replaceState(null, '', `${path}?tour=1&ch=${chapterId}${soloQ}`);
  } catch {
    /* history API unavailable — the tour still plays, it just won't survive a reload */
  }
}

// ── "See it live" handoff for Ripple ─────────────────────────────────────────
// Ripple was cut from the walkthrough to keep it fast, so its flagship vignette can't deep-link a
// tour chapter (doing so silently dropped visitors on chapter 1). Instead its "See it live" opens
// Ripple's OWN live overlay on the next #/live mount — an honest preview that actually shows Ripple,
// seeded with its demo ship. Same one-shot sessionStorage handoff as tour mode.
const RIPPLE_KEY = 'mavea-open-ripple';

/** Ask the next #/live mount to open Ripple's live overlay (its SEED_SHIP demo). Call right before
 *  navigating to #/live. */
export function stashOpenRipple(): void {
  try {
    sessionStorage.setItem(RIPPLE_KEY, '1');
  } catch {
    /* storage unavailable — Ripple just won't auto-open; harmless */
  }
}

/** Pure check (safe in render — see peekTourMode). Pair with clearOpenRipple to consume. */
export function peekOpenRipple(): boolean {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (/[?&]ripple=1(?:&|$)/.test(hash)) return true;
    return !!sessionStorage.getItem(RIPPLE_KEY);
  } catch {
    return false;
  }
}

/** Consume the one-shot Ripple-open flag. Call once, from an effect after mount. */
export function clearOpenRipple(): void {
  try {
    sessionStorage.removeItem(RIPPLE_KEY);
  } catch {
    /* storage unavailable */
  }
}
