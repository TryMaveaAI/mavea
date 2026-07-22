// One home for the app-wide light/dark switch, shared across every surface (the Demo home,
// the gallery, the Live theme toggle, and Live's template machinery). These four used to keep
// their own copies of this logic; the copies had drifted — most read "anything that isn't
// exactly 'light' is dark", but Live's template restore passed the raw stored string straight
// onto the element, so invalid storage could set data-theme to garbage. Unifying here removes
// that hazard and keeps the choice consistent wherever it's read or written.

export type Theme = 'light' | 'dark';

/** The localStorage key the brightness preference persists under, shared across surfaces. */
export const THEME_KEY = 'mavea-theme';

// Dark is the documented default: it matches the App (home / first paint) so the very first
// frame is unchanged, and it's what every CSS surface assumes before a preference exists.
// Only an exact 'light' opts into light; absent, unreadable, or invalid storage stays dark.
const DEFAULT_THEME: Theme = 'dark';

/** The persisted preference, defaulting to dark on empty, invalid, or unreadable storage. */
export function readTheme(): Theme {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME;
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : DEFAULT_THEME;
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
