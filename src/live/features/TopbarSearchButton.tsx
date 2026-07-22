// TopbarSearchButton — the persistent, always-visible handle on the ⌘K feature palette. Before
// this, the palette hid behind the Explore dropdown's last item with no on-screen hint, and on
// phones (where the topbar menus collapse away entirely) it was unreachable by touch at all. A
// plain text button in the topbar row reads as the fifth menu — search IS discovery, so it groups
// with Create/Practice/Share/Explore — and survives both mobile collapses untouched.
import { type ReactElement } from 'react';
import { SearchIcon } from '../../icons/coreIcons';
import { PALETTE_SHORTCUT } from './paletteShortcut';
import { preloadIntentProps } from '../../lib/preloadableLazy';

export function TopbarSearchButton({
  onOpen,
  preload,
}: {
  onOpen: () => void;
  preload?: () => Promise<void>;
}): ReactElement {
  return (
    <button
      type="button"
      className="topbar-text-btn topbar-search-btn"
      onClick={onOpen}
      aria-label="Search all features"
      title={`Search all features (${PALETTE_SHORTCUT})`}
      {...(preload ? preloadIntentProps(preload) : {})}
    >
      <SearchIcon className="topbar-search-ic" aria-hidden="true" />
      <span className="topbar-search-label">Search</span>
      <kbd className="cmdk-kbd topbar-search-kbd">{PALETTE_SHORTCUT}</kbd>
    </button>
  );
}
