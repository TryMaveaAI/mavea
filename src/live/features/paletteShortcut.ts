// The platform-honest label for the ⌘K feature-palette shortcut. Kept in its own module (not in
// TopbarSearchButton) so that component file exports only a component — react-refresh/fast-refresh
// needs component-only modules to hot-reload cleanly.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

/** "⌘K" on Apple platforms, "Ctrl K" everywhere else — shared by the topbar Search button and the
 *  Explore menu's blurb so they never show a shortcut the platform doesn't have. */
export const PALETTE_SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K';
