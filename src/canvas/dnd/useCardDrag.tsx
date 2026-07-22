// useCardDrag — the one net-new interaction for "The Blank Space": drag an existing card into a
// card-kind hole (or, on a plain tap, drop it into the active hole — the touch-friendly fallback).
// Built on Pointer Events (unifying mouse/touch/pen), modeled on the pointer drag in
// media/BeforeAfter.tsx. The hole is hit-tested with elementFromPoint, so the floating ghost MUST
// stay pointer-transparent. No drag library — the zero-runtime-deps rule holds.
import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Blank, Block } from '../../data/conversation';
import { blockLabel } from '../blockLabel';

/** Pointer travel before a press becomes a drag — below this a tap-on-the-handle stays a tap
 *  (so a tap-to-place, or a scroll started on the handle, isn't hijacked into a drag). */
const ARM_PX = 6;

interface Ghost {
  label: string;
  x: number;
  y: number;
}

export interface CardDrag {
  /** Spread onto a card's drag handle. */
  handleProps: (block: Block) => {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
  };
  /** The floating drag label — render once at the canvas root. */
  ghost: ReactNode;
}

function blankFor(blanks: Blank[] | undefined, key: string): Blank | undefined {
  return blanks?.find((b) => b.key === key);
}
/** A hole accepts a card when it's a card-kind hole and its `accepts` list (if any) allows the type. */
function accepts(blank: Blank | undefined, type: string): boolean {
  if (!blank || blank.kind !== 'card') return false;
  return !blank.accepts || blank.accepts.includes(type);
}

export function useCardDrag(
  blanks: Blank[] | undefined,
  onDrop: (key: string, block: Block) => void,
  onTap?: (block: Block) => void,
): CardDrag {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const drag = useRef<{ block: Block; startX: number; startY: number; armed: boolean } | null>(
    null,
  );
  const targetRef = useRef<Element | null>(null);
  // Refs so handleProps stays stable across the ghost re-renders mid-drag.
  const blanksRef = useRef(blanks);
  blanksRef.current = blanks;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const clearTarget = () => {
    targetRef.current?.classList.remove('is-drop-target');
    targetRef.current = null;
  };

  /** The compatible drop hole under the pointer, or null. */
  const holeAt = (x: number, y: number, type: string): { el: Element; key: string } | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-blank-key]') ?? null;
    const key = el?.getAttribute('data-blank-key') ?? '';
    return el && accepts(blankFor(blanksRef.current, key), type) ? { el, key } : null;
  };

  const handleProps = useCallback(
    (block: Block) => ({
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return; // primary press only
        drag.current = { block, startX: e.clientX, startY: e.clientY, armed: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: ReactPointerEvent) => {
        const d = drag.current;
        if (!d) return;
        if (!d.armed) {
          if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < ARM_PX) return;
          d.armed = true;
        }
        setGhost({ label: blockLabel(d.block), x: e.clientX, y: e.clientY });
        const hit = holeAt(e.clientX, e.clientY, d.block.type);
        if (targetRef.current && targetRef.current !== hit?.el) clearTarget();
        if (hit) {
          const drop = hit.el.querySelector('.blank-drop') ?? hit.el;
          drop.classList.add('is-drop-target');
          targetRef.current = drop;
        }
      },
      onPointerUp: (e: ReactPointerEvent) => {
        const d = drag.current;
        drag.current = null;
        setGhost(null);
        clearTarget();
        if (!d) return;
        if (d.armed) {
          const hit = holeAt(e.clientX, e.clientY, d.block.type);
          if (hit) onDropRef.current(hit.key, d.block);
        } else {
          // A tap (no travel) → place into the active hole if one is awaiting a card.
          onTapRef.current?.(d.block);
        }
      },
    }),
    [],
  );

  const ghostNode = ghost ? (
    <div className="card-drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden>
      {ghost.label}
    </div>
  ) : null;

  return { handleProps, ghost: ghostNode };
}
