// useFullscreen.ts — a reliable viewport-filling mode for one surface.
//
// The native Fullscreen API is not dependable inside embedded browsers and can reject a valid
// click without changing anything. Room needs the same interaction everywhere, so it becomes a
// fixed viewport layer instead. This also avoids a browser permission-like transition and keeps
// the app's own Escape behavior deterministic.
import { useCallback, useEffect, useState } from 'react';

export interface Fullscreen {
  /** Whether the surface currently owns the app viewport. */
  active: boolean;
  /** Enter if out, leave if in. */
  toggle: () => void;
}

export function useFullscreen(): Fullscreen {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const leave = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // Escape belongs to the topmost surface first. Without stopping it here, Live's presentation
      // and demo handlers also receive the same key and close the experience underneath the Room.
      event.preventDefault();
      event.stopImmediatePropagation();
      setActive(false);
    };
    window.addEventListener('keydown', leave, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', leave, true);
    };
  }, [active]);

  const toggle = useCallback(() => setActive((current) => !current), []);

  return { active, toggle };
}
