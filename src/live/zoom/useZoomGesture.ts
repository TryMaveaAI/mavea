// The semantic-zoom gesture: a trackpad pinch (browsers deliver it as ctrl+wheel) on the
// conversation. Pinching OUT past a small threshold fires once and resets, so one continuous
// pinch is one level change, not a storm. Pinch-in is reported the same way; the surface
// decides what each direction means at its current level. Listener is passive:false because
// we must preventDefault to keep the browser's own page-zoom out of the way.
import { useEffect, useRef } from 'react';

/** Accumulated ctrl+wheel delta that counts as one deliberate pinch step. */
const STEP = 90;

export function useZoomGesture(
  target: React.RefObject<HTMLElement | null>,
  onZoom: (dir: 'out' | 'in') => void,
): void {
  const acc = useRef(0);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return; // plain scroll stays a scroll
      e.preventDefault();
      acc.current += e.deltaY;
      if (acc.current >= STEP) {
        acc.current = 0;
        onZoom('out');
      } else if (acc.current <= -STEP) {
        acc.current = 0;
        onZoom('in');
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [target, onZoom]);
}
