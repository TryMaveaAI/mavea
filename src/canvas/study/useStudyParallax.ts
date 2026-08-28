// useStudyParallax.ts — the desk leans a few degrees toward the pointer.
//
// Pure custom-property writes on pointer events: no React state, no persistent rAF loop — one
// frame is scheduled per movement and a pending frame is never doubled. The tilt is small enough
// (±3.2°/2.2°, the mockup's own numbers) that nothing on the desk changes meaning; it exists so
// the scene reads as a place rather than a poster. Inert for reduced motion, on touch (hover:
// none — a finger dragging the pointer would wobble the desk while tapping), and while hidden.
import { useEffect, type RefObject } from 'react';

const TILT_X = 3.2;
const TILT_Y = -2.2;

export function useStudyParallax(stageRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (typeof matchMedia === 'function') {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (matchMedia('(hover: none)').matches) return;
    }

    let frame = 0;
    let px = 0;
    let py = 0;
    let reset = false;

    const paint = (): void => {
      frame = 0;
      if (reset) {
        reset = false;
        stage.style.setProperty('--study-ry', '0deg');
        stage.style.setProperty('--study-rx', '0deg');
        return;
      }
      // The one layout read lives inside the frame, after the event storm has settled.
      const box = stage.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const mx = (px - box.left) / box.width - 0.5;
      const my = (py - box.top) / box.height - 0.5;
      stage.style.setProperty('--study-ry', `${(mx * TILT_X).toFixed(2)}deg`);
      stage.style.setProperty('--study-rx', `${(my * TILT_Y).toFixed(2)}deg`);
    };

    const move = (event: PointerEvent): void => {
      if (document.visibilityState === 'hidden') return;
      px = event.clientX;
      py = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const leave = (): void => {
      reset = true;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerleave', leave);
    return () => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerleave', leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [stageRef]);
}
