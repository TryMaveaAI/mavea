// useStudyScale.ts — fit the authored desk to whatever box the stage actually has.
//
// One ResizeObserver, no React state: the scale is written straight onto the stage element as a
// custom property, so a resize re-composites the desk without re-rendering a single component.
// The mockup polled the box on an interval; an observer is the same measurement without the idle
// cost, and it disconnects with the stage.
import { useEffect, type RefObject } from 'react';
import { DESK_H, FIT_H, FIT_W, SCALE_MAX, SHALLOW_CROP, STUDY_FIT_FLOOR } from './slots';

/**
 * Keeps `--study-scale` on the stage equal to the desk's fitted scale, clamped to
 * [STUDY_FIT_FLOOR, SCALE_MAX]. When the floor forces a vertical crop deeper than the desk's
 * decorative band can absorb, the stage is flagged `data-shallow` and study.css collapses the
 * floor-grid band rather than cropping into the cards.
 */
export function useStudyScale(stageRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const desk = stage.querySelector<HTMLElement>('.study-desk');
    if (!desk) return;

    const apply = (w: number, h: number): void => {
      if (!w || !h) return;
      const fitted = Math.min(w / FIT_W, h / FIT_H);
      const scale = Math.min(SCALE_MAX, Math.max(STUDY_FIT_FLOOR, fitted));
      stage.style.setProperty('--study-scale', scale.toFixed(4));
      // How much of the authored desk the floored scale pushes out of the box, in design px.
      const cropped = DESK_H - h / scale;
      stage.toggleAttribute('data-shallow', cropped > SHALLOW_CROP);
    };

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });
    observer.observe(desk);
    const initial = desk.getBoundingClientRect();
    apply(initial.width, initial.height);

    return () => observer.disconnect();
  }, [stageRef]);
}
