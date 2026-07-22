import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  PointerEvent as RPointerEvent,
  KeyboardEvent as RKeyboardEvent,
  RefObject,
} from 'react';
import { prefersReducedMotion } from '../focus/motion';

/** A point in the bounds element's local pixel space (origin = its top-left), plus the live rect. */
export interface DragPoint {
  x: number;
  y: number;
  rect: DOMRect;
}

export interface DragHandleOptions<T> {
  /** The element whose bounding box defines the coordinate space — usually the chart `<svg>`. */
  boundsRef: RefObject<SVGGraphicsElement | HTMLElement | null>;
  /** Map a pointer position (local to `boundsRef`) to a value. Pure; called on down + each move. */
  toValue: (p: DragPoint) => T;
  /** Receives every new value during a drag or arrow-key nudge. */
  onChange: (value: T) => void;
  /** Optional keyboard nudge: a unit direction (arrow keys) + the live rect → next value, or
   *  `undefined` to ignore. Without it, the handle still focuses but arrows do nothing. */
  onArrow?: (dir: { dx: number; dy: number }, rect: DOMRect) => T | undefined;
}

/** Handlers to spread on the draggable element + live drag state. */
export interface DragHandle {
  dragging: boolean;
  /** True when the OS asks to minimize motion — drop drag transitions if you animate the handle. */
  reduced: boolean;
  handlers: {
    onPointerDown: (e: RPointerEvent) => void;
    onPointerMove: (e: RPointerEvent) => void;
    onPointerUp: (e: RPointerEvent) => void;
    onPointerCancel: (e: RPointerEvent) => void;
    onKeyDown: (e: RKeyboardEvent) => void;
    tabIndex: 0;
    role: 'slider';
    style: { cursor: string; touchAction: 'none' };
  };
}

/**
 * Pointer-capture drag for a handle on an SVG/DOM chart, generalized from `status/Sliderinput`'s
 * inline logic so every interactive viz block shares one correct, leak-free implementation.
 *
 * - Captures the pointer on the handle (`setPointerCapture`) so the drag follows the cursor even
 *   outside the element, and releases it on up/cancel — no window/document listeners, no timers,
 *   no rAF, so a mid-drag unmount leaves nothing behind (passes `leak-guard`).
 * - Measures `boundsRef` on every move (cheap `getBoundingClientRect`), so it stays correct after
 *   layout/resize without subscribing to anything.
 * - Keyboard-operable: focusable `role="slider"`, arrow keys routed through `onArrow`.
 * - Reads props through a ref so the handlers are stable and never capture a stale closure.
 */
export function useDragHandle<T>(options: DragHandleOptions<T>): DragHandle {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const optsRef = useRef(options);
  optsRef.current = options;
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const apply = useCallback((clientX: number, clientY: number) => {
    const { boundsRef, toValue, onChange } = optsRef.current;
    const el = boundsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onChange(toValue({ x: clientX - rect.left, y: clientY - rect.top, rect }));
  }, []);

  const onPointerDown = useCallback(
    (e: RPointerEvent) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a best-effort hint; drag still works without it */
      }
      draggingRef.current = true;
      setDragging(true);
      apply(e.clientX, e.clientY);
    },
    [apply],
  );

  const onPointerMove = useCallback(
    (e: RPointerEvent) => {
      if (!draggingRef.current) return;
      apply(e.clientX, e.clientY);
    },
    [apply],
  );

  const end = useCallback((e: RPointerEvent) => {
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop — capture may already be gone */
    }
  }, []);

  const onKeyDown = useCallback((e: RKeyboardEvent) => {
    const { boundsRef, onArrow, onChange } = optsRef.current;
    if (!onArrow) return;
    const dir =
      e.key === 'ArrowRight'
        ? { dx: 1, dy: 0 }
        : e.key === 'ArrowLeft'
          ? { dx: -1, dy: 0 }
          : e.key === 'ArrowUp'
            ? { dx: 0, dy: 1 }
            : e.key === 'ArrowDown'
              ? { dx: 0, dy: -1 }
              : null;
    if (!dir) return;
    const el = boundsRef.current;
    if (!el) return;
    const next = onArrow(dir, el.getBoundingClientRect());
    if (next !== undefined) {
      e.preventDefault();
      onChange(next);
    }
  }, []);

  return {
    dragging,
    reduced,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onKeyDown,
      tabIndex: 0,
      role: 'slider',
      style: { cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' },
    },
  };
}
