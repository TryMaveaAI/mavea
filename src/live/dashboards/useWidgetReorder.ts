// useWidgetReorder — drag-to-reorder dashboard widgets with Pointer Events (works with mouse, touch,
// and pen — unlike HTML5 DnD, which the mockup noted has no touch support), plus keyboard reorder for
// accessibility. Zero new deps. During a drag the list reshuffles locally under the pointer; the new
// order is persisted once on release. All window listeners are torn down on release AND on unmount
// (no stuck-drag, no leaks).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

/** The widget id under a screen point (walks up from the topmost element to its tile). */
function tileIdAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const tile = (el as HTMLElement).closest('[data-dash-widget]');
    if (tile) return tile.getAttribute('data-dash-widget');
  }
  return null;
}

export interface ReorderApi {
  /** The id currently being dragged, or null. */
  draggingId: string | null;
  /** The order to render: the working order during a drag, else the source order. */
  order: string[];
  /** Spread onto each tile's drag handle. */
  handleProps: (id: string) => {
    onPointerDown: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    tabIndex: 0;
    role: 'button';
    'aria-label': string;
  };
}

export function useWidgetReorder(
  sourceIds: string[],
  onCommit: (ids: string[]) => void,
): ReorderApi {
  const [working, setWorking] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Latest values for the window-listener closures (avoids stale captures) + the live cleanup.
  const ref = useRef<{
    working: string[] | null;
    draggingId: string | null;
    onCommit: (ids: string[]) => void;
    sourceIds: string[];
    cleanup: (() => void) | null;
  }>({ working: null, draggingId: null, onCommit, sourceIds, cleanup: null });
  ref.current.onCommit = onCommit;
  ref.current.sourceIds = sourceIds;

  // Tear down any in-flight drag if the component unmounts.
  useEffect(() => () => ref.current.cleanup?.(), []);

  const onPointerDown = useCallback(
    (id: string) => (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      const init = [...ref.current.sourceIds];
      ref.current.working = init;
      ref.current.draggingId = id;
      setWorking(init);
      setDraggingId(id);

      const move = (ev: globalThis.PointerEvent): void => {
        const overId = tileIdAt(ev.clientX, ev.clientY);
        const drag = ref.current.draggingId;
        const cur = ref.current.working;
        if (!overId || !drag || !cur || overId === drag) return;
        const from = cur.indexOf(drag);
        const to = cur.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return;
        const next = [...cur];
        next.splice(to, 0, next.splice(from, 1)[0]);
        ref.current.working = next;
        setWorking(next);
      };
      const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        ref.current.cleanup = null;
        const committed = ref.current.working;
        ref.current.working = null;
        ref.current.draggingId = null;
        setWorking(null);
        setDraggingId(null);
        if (committed) ref.current.onCommit(committed);
      };
      ref.current.cleanup = up;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [],
  );

  const onKeyDown = useCallback(
    (id: string) => (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const ids = ref.current.sourceIds;
      const from = ids.indexOf(id);
      const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const next = [...ids];
      next.splice(to, 0, next.splice(from, 1)[0]);
      ref.current.onCommit(next);
    },
    [],
  );

  return {
    draggingId,
    order: working ?? sourceIds,
    handleProps: (id: string) => ({
      onPointerDown: onPointerDown(id),
      onKeyDown: onKeyDown(id),
      tabIndex: 0,
      role: 'button',
      'aria-label': 'Drag to reorder, or use arrow keys',
    }),
  };
}
