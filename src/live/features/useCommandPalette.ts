// The ⌘K command-palette open-state, its global hotkey, and the helpers the topbar/menu use to
// open or close it. Both surfaces share this: on the Demo the palette doubles as a teaser that
// funnels into Live, but the open mechanics are identical — ⌘K (or ⌃K) toggles it from anywhere.
// It lives beside the palette + registry (the feature-discovery seam owns its open state) so Live
// and Demo can't drift into two hand-rolled copies of the same hotkey guard.
import { useCallback, useEffect, useState } from 'react';

export interface CommandPaletteApi {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

export function useCommandPalette(): CommandPaletteApi {
  const [open, setOpen] = useState(false);

  // ⌘K opens the palette — the front door to discovery, from anywhere on either surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  return { open, openPalette, closePalette };
}
