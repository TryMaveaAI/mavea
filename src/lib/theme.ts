// One home for the app-wide light/dark switch, shared across every surface (the Demo home,
// the gallery, the Live theme toggle, and Live's template machinery). These four used to keep
// their own copies of this logic; the copies had drifted — most read "anything that isn't
// exactly 'light' is dark", but Live's template restore passed the raw stored string straight
// onto the element, so invalid storage could set data-theme to garbage. Unifying here removes
// that hazard and keeps the choice consistent wherever it's read or written.

export type Theme = 'light' | 'dark';

/** The localStorage key the brightness preference persists under, shared across surfaces. */
export const THEME_KEY = 'mavea-theme';

// Light is the documented default — a first-time visitor lands on the paper reading room, which is
// a light surface. index.html stamps `data-theme="light"` on <html> statically so the boot splash
// paints light before any bundle executes; `applyTheme(readTheme())` then corrects a returning dark
// reader at module scope, which is the same one-frame correction light readers used to get.
// Only an exact 'dark' opts into dark; absent, unreadable, or invalid storage stays light.
const DEFAULT_THEME: Theme = 'light';

/** The persisted preference, defaulting to light on empty, invalid, or unreadable storage. */
export function readTheme(): Theme {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME;
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Persist the chosen brightness; a no-op if storage is unavailable (e.g. private mode). */
export function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable — the in-session choice still applies via applyTheme */
  }
}

/** Reflect a theme onto the document so the token overrides take effect (data-theme on <html>).
 *  Defaults to the document the app runs in; takes one explicitly for the Live template paths. */
export function applyTheme(theme: Theme, doc: Document = document): void {
  doc.documentElement.dataset.theme = theme;
}
