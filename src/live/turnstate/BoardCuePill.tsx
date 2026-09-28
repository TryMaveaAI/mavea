// A follow-up that adds to the board builds its cards at the END of it, and on a board taller
// than the window that is below the fold: the reader looks at an unchanged screen while the new
// cards form out of sight. This pill says so, and takes them there on a click. It shows only while
// the insertion point is below the visible area, and once the reader has seen that point it stays
// gone for the rest of the turn — a cue that returns every time they scroll back up would nag.
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { prefersReducedMotion } from '../../canvas/focus/motion';
import './turnstate.css';

export function BoardCuePill({
  target,
  active,
}: {
  /** Where the new cards land (the working column after the board). */
  target: RefObject<HTMLElement | null>;
  /** The turn is certain to add to the board and is still working. */
  active: boolean;
}): ReactElement | null {
  const stageRef = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);

  useEffect(() => {
    const el = target.current;
    const stage = stageRef.current;
    if (!active || !el || !stage || typeof IntersectionObserver === 'undefined') return;
    // The stage sits just above everything pinned to the bottom of the window (the dock, and on a
    // phone the session band), so its edge is where the readable canvas ends: a point behind
    // those is not on screen, however the viewport counts it.
    const hidden = Math.max(
      0,
      Math.round(window.innerHeight - stage.getBoundingClientRect().bottom),
    );
    let seen = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry || seen) return;
        if (entry.isIntersecting) {
          seen = true;
          setBelow(false);
          io.disconnect();
          return;
        }
        const floor = entry.rootBounds?.bottom ?? window.innerHeight - hidden;
        setBelow(entry.boundingClientRect.top >= floor);
      },
      { rootMargin: `0px 0px -${hidden}px 0px` },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      setBelow(false);
    };
  }, [active, target]);

  if (!active) return null;
  return (
    <div className="board-cue-stage" ref={stageRef}>
      {below && (
        <button
          type="button"
          className="board-cue-pill"
          onClick={() =>
            target.current?.scrollIntoView({
              block: 'center',
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            })
          }
        >
          Adding below <span aria-hidden="true">↓</span>
        </button>
      )}
    </div>
  );
}
