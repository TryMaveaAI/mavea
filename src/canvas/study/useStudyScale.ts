// useStudyScale.ts — fit the authored desk to whatever box the stage actually has.
//
// One ResizeObserver, no React state: the scale is written straight onto the stage element as a
// custom property, so a resize re-composites the desk without re-rendering a single component.
// The mockup polled the box on an interval; an observer is the same measurement without the idle
// cost, and it disconnects with the stage.
import { useEffect, type RefObject } from 'react';
import { COMPACT_W, DESK_H, FIT_H, FIT_W, SCALE_MAX, SHALLOW_CROP, STUDY_FIT_FLOOR } from './slots';

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
      // A container query cannot style its OWN container, so the stage's compact box (height,
      // padding) can never come from `@container study` — its children reflowed while the stage
      // itself kept a desk-sized height, leaving a page of empty parchment underneath. The
      // observer already measures this box; publishing the state as an attribute is what lets
      // the stage restyle itself.
      stage.toggleAttribute('data-compact', w <= COMPACT_W);
      const fitted = Math.min(w / FIT_W, h / FIT_H);
      const scale = Math.min(SCALE_MAX, Math.max(STUDY_FIT_FLOOR, fitted));
      stage.style.setProperty('--study-scale', scale.toFixed(4));
      // The tallest the front card may stand HERE, in design px: its top projects at desk
      // y≈120·1.046 (translateZ(70) magnification), and the beat bar + takeaway keep the last
      // ~90 stage px. Published as a custom property so CSS caps the card without a guess.
      const frontMax = Math.max(240, Math.min(560, 246 + (h / 2 - 90) / (1.046 * scale)));
      stage.style.setProperty('--study-front-max', `${frontMax.toFixed(0)}px`);
      // How much of the authored desk the floored scale pushes out of the box, in design px.
      // Hysteresis: the flag releases 26px below its trip point, so dragging a window edge
      // across the threshold cannot strobe the arc's shallow lift.
      const cropped = DESK_H - h / scale;
      const wasShallow = stage.hasAttribute('data-shallow');
      stage.toggleAttribute(
        'data-shallow',
        cropped > (wasShallow ? SHALLOW_CROP - 26 : SHALLOW_CROP),
      );
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
