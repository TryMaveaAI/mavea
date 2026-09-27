// The semantic-zoom gesture: a pinch on the conversation. A trackpad pinch arrives as
// ctrl+wheel; a touchscreen pinch arrives as two moving touches, and both feed ONE
// accumulator. Pinching past a small threshold fires once and resets, so one continuous
// pinch is one level change, not a storm. Fingers closing reads as 'out' (the way ctrl+wheel's
// positive delta does); spreading reads as 'in'. The surface decides what each direction means
// at its current level. Both listeners are passive:false because we must preventDefault to keep
// the browser's own page-zoom out of the way; a single finger is never touched, so it scrolls.
import { useEffect, useRef } from 'react';

/** Accumulated delta that counts as one deliberate pinch step: ctrl+wheel units, or CSS px
 *  the two fingers' span has shrunk (positive) or grown (negative) by. */
const STEP = 90;

function span(touches: TouchList): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function useZoomGesture(
  target: React.RefObject<HTMLElement | null>,
  onZoom: (dir: 'out' | 'in') => void,
): void {
  const acc = useRef(0);
  // Held outside the effect: a caller passing an inline callback re-binds on every render, and a
  // pinch must survive that re-bind mid-gesture.
  const lastSpan = useRef<number | null>(null);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const step = (delta: number): void => {
      acc.current += delta;
      if (acc.current >= STEP) {
        acc.current = 0;
        onZoom('out');
      } else if (acc.current <= -STEP) {
        acc.current = 0;
        onZoom('in');
      }
    };
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return; // plain scroll stays a scroll
      e.preventDefault();
      step(e.deltaY);
    };
    const onTouchMove = (e: TouchEvent): void => {
      if (e.touches.length !== 2 || lastSpan.current === null) return;
      e.preventDefault();
      const next = span(e.touches);
      step(lastSpan.current - next);
      lastSpan.current = next;
    };
    // A pinch is exactly two fingers: any finger landing or lifting re-seeds it (a third finger
    // ends it, lifting back to two starts a fresh one), and a leftover partial step never
    // carries across, so a half-made pinch cannot complete on the next one.
    const reseed = (e: TouchEvent): void => {
      acc.current = 0;
      lastSpan.current = e.touches.length === 2 ? span(e.touches) : null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', reseed, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', reseed);
    el.addEventListener('touchcancel', reseed);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', reseed);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', reseed);
      el.removeEventListener('touchcancel', reseed);
    };
  }, [target, onZoom]);
}
