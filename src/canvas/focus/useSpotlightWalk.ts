import { useEffect, useMemo } from 'react';
import { prefersReducedMotion } from './motion';

// When the tour spotlights a multi-step block (a stepper, a wizard, a built-up diagram), walk it
// through its steps on a timer so the card demonstrates itself — then loop back to the first step
// at the end. It drives the caller's OWN index setter, so the user keeps full manual control
// whenever the block isn't spotlighted; the walk only takes over while the spotlight is on it.
// Inert under reduced motion and for single-step blocks, and every timer is torn down on release.
export function useSpotlightWalk(
  spotlight: boolean,
  count: number,
  setIndex: (i: number) => void,
  stepMs = 1700,
): void {
  const reduce = useMemo(prefersReducedMotion, []);
  useEffect(() => {
    if (!spotlight || reduce || count < 2) return;
    setIndex(0); // restart from the top each time the spotlight lands here
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % count;
      setIndex(i);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [spotlight, reduce, count, stepMs, setIndex]);
}
