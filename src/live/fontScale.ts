// fontScale.ts — the reading text size (Appearance → Text size), stamped on the document root.
// It lives apart from the picker because every surface that OFFERS the choice has to honour it:
// only LiveApp used to stamp the attribute, so on Dashboards and Courses "Larger" lit up,
// persisted, and changed nothing on the page.
import { useEffect } from 'react';
import type { LiveConfigV2 } from './useLiveConfig';

/** Holders of the stamp, ref-counted exactly like the template skin (templates.ts): a surface and
 *  the picker it renders both hold it, and whichever unmounts first must not strip the attribute
 *  from under the other. */
let holders = 0;

/** Stamp the chosen size on `<html data-font-scale>` — the hook the `--fs-reader` overrides in
 *  wow-polish.css key off — for as long as the caller is mounted. */
export function useFontScaleStamp(scale: LiveConfigV2['fontScale']): void {
  useEffect(() => {
    holders += 1;
    let released = false;
    return () => {
      // A development double-invoke would otherwise release twice and drop the count below the
      // number of real holders.
      if (released) return;
      released = true;
      holders = Math.max(0, holders - 1);
      if (holders === 0) delete document.documentElement.dataset.fontScale;
    };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    // 'normal' clears the attribute rather than writing it, so the token falls through to its
    // unscaled default.
    if (scale === 'normal') delete root.dataset.fontScale;
    else root.dataset.fontScale = scale;
  }, [scale]);
}
