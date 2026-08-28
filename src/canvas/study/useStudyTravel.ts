// useStudyTravel.ts — a promotion has to LOOK like a move, not a cut.
//
// An object in the study is either a thumbnail or the foreground, never both, so choosing one
// unmounts an element and mounts a different one and the browser has nothing to tween: the study
// hard-cuts, which is what made a spatial stage read as a slideshow. This is the classic FLIP —
// record where the object WAS just before the state change, then, after React commits the new DOM
// but before the browser paints it, start the new element at the old element's box and animate it
// home.
//
// Two deliberate choices:
//   · Boxes are measured RELATIVE TO THE STAGE, not the viewport. The study scrolls with the answer,
//     so a viewport delta captured in a click handler and consumed after a re-layout carries the
//     scroll distance with it.
//   · The tween runs on the Web Animations API against `transform`, while `.study-actor` transitions
//     `top`/`left` and carries its drag offset on `translate` (study.css). Three different property
//     channels, so the travel can never fight the slot transition or a half-finished drag.
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** How long an object takes to travel between a nearby slot and the foreground. */
const TRAVEL_MS = 420;
/** Under this the move is imperceptible, and animating it is pure cost. */
const MIN_TRAVEL_PX = 2;
/** Decelerating, with a touch of overshoot in the tail — the study settles, it doesn't snap. */
const TRAVEL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** An arriving object fades the last of the way in, so a cross-fade covers any content reflow
 *  between the miniature and the full card. */
const ARRIVE_OPACITY = 0.55;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Plan {
  /** The object arriving in the foreground, and the box it is arriving FROM. */
  incoming?: { id: string; from: Box };
  /** The object leaving the foreground, and the box it is leaving FROM. */
  outgoing?: { id: string; from: Box };
}

export interface StudyTravel {
  /** Attach to the study's own stage element — every box is measured against it. */
  stageRef: RefObject<HTMLElement | null>;
  /**
   * Call in the event handler, BEFORE the state change that swaps the foreground. Reads the DOM as
   * it stands; a no-op when either element is missing, which is the honest answer for an object
   * arriving from the horizon (it has no thumbnail to leave).
   */
  capture: (nextId: string | null, currentId: string | null) => void;
}

function boxWithin(stage: Element, el: Element): Box {
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}

function thumbOf(stage: ParentNode, id: string): Element | null {
  return stage.querySelector(`[data-study-actor="${CSS.escape(id)}"] .study-actor-pick`);
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Travel between study positions for the object entering the foreground and the one leaving it.
 * `activeId` is what drives the effect: it is the only thing whose change means the study re-cast.
 */
export function useStudyTravel(activeId: string | null): StudyTravel {
  const stageRef = useRef<HTMLElement | null>(null);
  const planRef = useRef<Plan | null>(null);
  const runningRef = useRef<Animation[]>([]);

  const capture = useCallback((nextId: string | null, currentId: string | null) => {
    const stage = stageRef.current;
    if (!stage || !nextId || nextId === currentId || prefersReducedMotion()) {
      planRef.current = null;
      return;
    }
    const arriving = thumbOf(stage, nextId);
    const hero = stage.querySelector('.study-hero');
    planRef.current = {
      ...(arriving ? { incoming: { id: nextId, from: boxWithin(stage, arriving) } } : {}),
      ...(hero && currentId ? { outgoing: { id: currentId, from: boxWithin(stage, hero) } } : {}),
    };
  }, []);

  useLayoutEffect(() => {
    const plan = planRef.current;
    planRef.current = null;
    const stage = stageRef.current;
    if (!plan || !stage) return;

    // A second choice mid-flight replaces the first: let the earlier travel go rather than
    // compose two transforms onto one element.
    for (const animation of runningRef.current) animation.cancel();
    runningRef.current = [];

    const travel = (from: Box, el: Element) => {
      // The travel is an enhancement, never a requirement: a host without the Web Animations API
      // (jsdom, an ancient engine) still gets the study, just without the move.
      if (typeof el.animate !== 'function') return;
      const to = boxWithin(stage, el);
      if (!to.w || !to.h || !from.w || !from.h) return;
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      const sx = from.w / to.w;
      const sy = from.h / to.h;
      if (Math.abs(dx) < MIN_TRAVEL_PX && Math.abs(dy) < MIN_TRAVEL_PX) return;
      const animation = el.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            opacity: ARRIVE_OPACITY,
          },
          { transform: 'none', opacity: 1 },
        ],
        { duration: TRAVEL_MS, easing: TRAVEL_EASE, fill: 'none' },
      );
      runningRef.current.push(animation);
      // A cancelled animation rejects; neither outcome is a failure worth surfacing.
      void animation.finished
        .catch(() => {})
        .then(() => {
          runningRef.current = runningRef.current.filter((a) => a !== animation);
        });
    };

    const hero = stage.querySelector('.study-hero');
    if (plan.incoming && hero) travel(plan.incoming.from, hero);
    if (plan.outgoing) {
      const landed = thumbOf(stage, plan.outgoing.id);
      if (landed) travel(plan.outgoing.from, landed);
    }
  }, [activeId]);

  // Nothing may outlive the stage: a running animation holds its element, and the study unmounts
  // on every view switch.
  useEffect(
    () => () => {
      for (const animation of runningRef.current) animation.cancel();
      runningRef.current = [];
    },
    [],
  );

  return { stageRef, capture };
}
