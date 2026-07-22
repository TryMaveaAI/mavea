import { useEffect } from 'react';

/**
 * Marks `<html data-resizing>` while the window is actively being resized, then clears
 * it shortly after resizing stops.
 *
 * Why: the resting face docks to the corner via a viewport-relative transform
 * (`translate(-50vw + …, -50vh + …)`, or a re-measured px delta on Live), and the
 * presence positioner transitions that transform over the cinematic duration. On resize
 * the layout re-centres the face instantly while the transform animates to catch up, so
 * the docked orb visibly slides on every resize step. A CSS rule keyed on this flag drops
 * the transition during resize so the orb stays glued; the flag clears once resizing
 * settles, leaving the fly animation (corner ↔ centre) untouched.
 */
export function useResizeQuiet(): void {
  useEffect(() => {
    const root = document.documentElement;
    let settle = 0;
    const onResize = () => {
      root.dataset.resizing = 'true';
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        delete root.dataset.resizing;
      }, 160);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(settle);
      delete root.dataset.resizing;
    };
  }, []);
}
