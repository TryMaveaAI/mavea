// useStudyScale.ts — fit the authored desk to whatever box the stage actually has.
//
// One ResizeObserver, no React state: the scale is written straight onto the stage element as a
// custom property, so a resize re-composites the desk without re-rendering a single component.
// The mockup polled the box on an interval; an observer is the same measurement without the idle
// cost, and it disconnects with the stage.
import { useLayoutEffect, type RefObject } from 'react';
import {
  COMPACT_W,
  DESK_H,
  FIT_H,
  FIT_W,
  SCALE_MAX,
  SCALE_MAX_FULL,
  SHALLOW_CROP,
  STAGE_H_MAX,
  STUDY_FIT_FLOOR,
  TAKEAWAY_BOTTOM,
} from './slots';

/**
 * Keeps `--study-scale` on the stage equal to the desk's fitted scale, clamped to
 * [STUDY_FIT_FLOOR, SCALE_MAX]. When the floor forces a vertical crop deeper than the desk's
 * decorative band can absorb, the stage is flagged `data-shallow` and study.css collapses the
 * floor-grid band rather than cropping into the cards.
 *
 * `revision` re-fits on a re-cast: the takeaway below the object is MEASURED, and a new sentence
 * can take a line more without moving one box the observer watches — leaving the front card's
 * reserve short by that line.
 */
export function useStudyScale(
  stageRef: RefObject<HTMLElement | null>,
  revision: string | number,
): void {
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const scrollViewport = stage.closest<HTMLElement>('.canvas-scroll');
    const widthHost = stage.parentElement;

    const apply = (): void => {
      const stageBox = stage.getBoundingClientRect();
      // Full screen lifts the stage OUT of the reading column — it is `position: fixed; inset: 0`,
      // with the column and height caps off — but it is still a DOM descendant of the scroller, so
      // measuring the column there fitted the desk to a box it had already left: the scale sat
      // pinned at its legibility floor with a band of empty parchment inside a full 1080px window.
      const full = stage.matches(':fullscreen') || stage.classList.contains('is-fullscreen');
      const viewportBox = full ? undefined : scrollViewport?.getBoundingClientRect();
      // The desk is drawn inside the frame, so the fit is measured against the stage's content
      // box; the border-box is two pixels wider than any room the composition actually has.
      const w =
        stage.clientWidth || stageBox.width || widthHost?.getBoundingClientRect().width || 0;
      const availableH = viewportBox
        ? Math.min(viewportBox.bottom, window.innerHeight) - Math.max(viewportBox.top, 0)
        : Math.min(stageBox.height, window.innerHeight);
      // Both axes are fitted against the box the stage will ACTUALLY have — study.css caps the
      // in-canvas stage at the scroll column and at STAGE_H_MAX — rather than against the column
      // alone, which let the vertical term claim room the frame was never going to give it. Full
      // screen has no such cap (study.css: `height: 100dvh; max-height: none`), and applying one
      // here is what made SCALE_MAX_FULL unreachable.
      const h = Math.max(0, full ? availableH : Math.min(STAGE_H_MAX, availableH));
      if (!w || !h) return;
      // A container query cannot style its OWN container, so the stage's compact box (height,
      // padding) can never come from `@container study` — its children reflowed while the stage
      // itself kept a desk-sized height, leaving a page of empty parchment underneath. The
      // observer already measures this box; publishing the state as an attribute is what lets
      // the stage restyle itself.
      const compact = !full && (w <= COMPACT_W || h < FIT_H * STUDY_FIT_FLOOR);
      stage.toggleAttribute('data-compact', compact);
      if (compact) {
        stage.style.removeProperty('--study-stage-height');
        stage.style.setProperty('--study-scale', '1');
        stage.style.setProperty('--study-hud', '1');
        stage.style.removeProperty('--study-front-max');
        stage.removeAttribute('data-shallow');
        return;
      }
      stage.style.setProperty('--study-stage-height', `${Math.round(h)}px`);
      // Full screen is the one place the desk may grow past its authored size: the reader asked
      // for the whole viewport, and a 1440-wide composition marooned in the middle of a 27-inch
      // display is not what they asked for. The HUD grows with it there (and only there) so the
      // whole surface scales as one piece.
      const fitted = Math.min(w / FIT_W, h / FIT_H);
      const scale = Math.min(full ? SCALE_MAX_FULL : SCALE_MAX, Math.max(STUDY_FIT_FLOOR, fitted));
      const hud = full ? Math.max(1, scale) : 1;
      stage.style.setProperty('--study-scale', scale.toFixed(4));
      stage.style.setProperty('--study-hud', hud.toFixed(4));
      // Reserve the takeaway's own band before solving the front card's projected height. It is
      // MEASURED, not assumed: handwriting wraps to two or three lines depending on the sentence,
      // and in full screen the HUD scales the whole band with the desk — an assumed height put
      // the card's lower edge straight through it. A card may scroll; it may never cover the
      // sentence the reader is meant to carry away.
      const takeaway = stage.querySelector<HTMLElement>('.study-takeaway');
      const bottomReserve = takeaway ? (takeaway.offsetHeight + TAKEAWAY_BOTTOM) * hud + 12 : 86;
      const projectedCenter = h / 2 - 38 * scale;
      const availableHalf = h - bottomReserve - 12 - projectedCenter;
      const frontMax = Math.max(240, Math.min(560, (2 * availableHalf) / (1.046 * scale)));
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

    const observer = new ResizeObserver(apply);
    if (widthHost) observer.observe(widthHost);
    if (scrollViewport && scrollViewport !== widthHost) observer.observe(scrollViewport);
    apply();
    window.addEventListener('resize', apply, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [stageRef, revision]);
}
