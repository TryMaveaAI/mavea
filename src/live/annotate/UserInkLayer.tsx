// The user's drawing hand. Captures freehand pointer strokes over the canvas and hands the raw
// points to the ink hook, which resolves the text they were drawn over and pins it. User strokes and
// the in-place highlight render in cool blue — visually distinct from Mavéa's own orange annotations.
//
// Activation without hijacking the page: the overlay SVG is pointer-events:none, so the HOST (the
// positioned canvas stage that also holds the cards) is what receives pointer events. A stroke only
// starts when ink is armed (mouse/touch) or the pointer is a pen — and even then capture is DEFERRED
// until the pointer moves past a small threshold, so a tap or click still reaches the card beneath.
// A press that stays under the threshold is reported as a tap (a precise single-word grab). Interactive
// controls (sliders, the map, tables, the Ask button, anything data-interactive) are carved out
// entirely. All stroke state lives in refs, so pointermove never triggers a re-render mid-draw.
import { useEffect, useRef, type ReactElement, type RefObject } from 'react';
import { polyline, type Pt, type StageRect } from './geometry';
import type { InkStrokeCtx } from './resolve';

const START_THRESHOLD = 4; // px of movement before a press becomes a stroke (so taps click through)
const STUCK_MS = 4000; // a press older than this with no up/cancel is wedged — self-heal on next press
// Genuinely interactive controls only — a plain `<table>` is content (a comparison grid, a data
// table) that must stay markable like any other card. A block with its OWN pointer-driven drag
// (a slider, a before/after divider, a carousel swipe) opts out explicitly via data-interactive
// instead of a blanket tag ban, so new interactive blocks can't be silently walled off by accident.
const CARVE_OUT =
  'input, textarea, select, button, a, summary, [contenteditable], [role="slider"], [role="tab"], [role="switch"], [draggable="true"], .block-ask, .geo-map, [data-interactive]';

interface UserInkLayerProps {
  /** Armed for mouse/touch. A pen (pointerType==='pen') always draws regardless. */
  armed: boolean;
  /** The positioned canvas stage that holds the cards — the element pointer events arrive on. */
  rootRef: RefObject<HTMLElement | null>;
  /** Raw stroke points (stage-local) plus the geometry context the hook needs to resolve them. */
  onStroke: (pts: Pt[], ctx: InkStrokeCtx) => void;
  /** A sub-threshold press while armed — the hook grabs the single word under it (or nudges a miss). */
  onTap?: (pt: Pt, ctx: InkStrokeCtx) => void;
  /** Settled-stroke SVG paths kept visible until the hook clears them (ask / undo / new turn). */
  strokes?: readonly string[];
  /** Highlight rectangles over the grabbed text — the confirm-first proof of each pinned mark. */
  highlights?: readonly StageRect[];
}

export function UserInkLayer({
  armed,
  rootRef,
  onStroke,
  onTap,
  strokes,
  highlights,
}: UserInkLayerProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const strokeRef = useRef<SVGPathElement>(null);
  const haloRef = useRef<SVGPathElement>(null);
  const pts = useRef<Pt[]>([]);
  const startPt = useRef<Pt | null>(null);
  const pending = useRef(false);
  const capturing = useRef(false);
  const pid = useRef<number | null>(null);
  const downAt = useRef(0);
  const armedRef = useRef(armed);
  armedRef.current = armed;
  // Mirror the callbacks in refs so the capture effect never re-subscribes when they change identity.
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // The crosshair cue lives on the host: the overlay is pointer-events:none, so its own cursor
  // never shows. Reflected as a class so themed CSS owns the look.
  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;
    host.classList.toggle('ink-armed', armed);
    return () => host.classList.remove('ink-armed');
  }, [armed, rootRef]);

  useEffect(() => {
    const host = rootRef.current;
    const svg = svgRef.current;
    if (!host || !svg) return;

    const localPt = (e: PointerEvent): Pt => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const ctx = (): InkStrokeCtx => ({ stage: host, svgRect: svg.getBoundingClientRect() });
    const drawLive = (): void => {
      const d = polyline(pts.current);
      strokeRef.current?.setAttribute('d', d);
      haloRef.current?.setAttribute('d', d);
    };
    const clearLive = (): void => {
      strokeRef.current?.setAttribute('d', '');
      haloRef.current?.setAttribute('d', '');
    };
    const reset = (): void => {
      pts.current = [];
      startPt.current = null;
      pending.current = false;
      capturing.current = false;
      pid.current = null;
    };
    // setPointerCapture / releasePointerCapture throw (InvalidPointerId) if the pointer is no
    // longer active — never let that abort a stroke.
    const safeCapture = (id: number): void => {
      try {
        host.setPointerCapture(id);
      } catch {
        /* pointer already gone — drawing still works without capture */
      }
    };
    const safeRelease = (id: number): void => {
      try {
        if (host.hasPointerCapture?.(id)) host.releasePointerCapture(id);
      } catch {
        /* already released */
      }
    };
    // A lost pointerup/cancel (tab switch, capture stolen by an embed) can leave pending/capturing
    // stuck and reject every future press. Reset on the relevant lifecycle events, and as a
    // belt-and-suspenders, self-heal on the next press if the stuck state is clearly stale.
    const abort = (): void => {
      if (pid.current != null) safeRelease(pid.current);
      host.classList.remove('ink-capturing');
      reset();
      clearLive();
    };
    const onVisibility = (): void => {
      if (document.hidden) abort();
    };

    const onDown = (e: PointerEvent): void => {
      if (pending.current || capturing.current) {
        if (performance.now() - downAt.current > STUCK_MS) abort();
        else return;
      }
      if (!(armedRef.current || e.pointerType === 'pen')) return;
      const target = e.target as Element | null;
      if (target?.closest?.(CARVE_OUT)) return; // never start a stroke on an interactive control
      downAt.current = performance.now();
      pending.current = true;
      pid.current = e.pointerId;
      const p = localPt(e);
      startPt.current = p;
      pts.current = [p];
    };

    const onMove = (e: PointerEvent): void => {
      if (pid.current !== e.pointerId) return;
      if (!pending.current && !capturing.current) return;
      const p = localPt(e);
      if (!capturing.current) {
        const moved = Math.hypot(
          p.x - (startPt.current?.x ?? p.x),
          p.y - (startPt.current?.y ?? p.y),
        );
        if (moved < START_THRESHOLD) return; // still might be a tap — let it through
        capturing.current = true;
        safeCapture(e.pointerId);
        host.classList.add('ink-capturing');
      }
      e.preventDefault();
      pts.current.push(p);
      drawLive();
    };

    const onUp = (e: PointerEvent): void => {
      if (pid.current !== e.pointerId) return;
      const wasCapturing = capturing.current;
      const wasPending = pending.current;
      const captured = pts.current;
      const start = startPt.current;
      safeRelease(e.pointerId);
      host.classList.remove('ink-capturing');
      reset();
      clearLive();
      if (wasCapturing && captured.length >= 2) {
        onStrokeRef.current(captured, ctx());
      } else if (wasPending && !wasCapturing && start) {
        // A deliberate tap while armed: probe the point for a precise single-word grab.
        onTapRef.current?.(start, ctx());
      }
    };

    const onCancel = (e: PointerEvent): void => {
      if (pid.current !== e.pointerId) return;
      abort();
    };

    // Press starts on the host; move/up/cancel track on the window so a stroke can't get stuck if
    // the pointer is released off the stage before capture begins.
    host.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', abort);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      host.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', abort);
      document.removeEventListener('visibilitychange', onVisibility);
      if (pid.current != null) safeRelease(pid.current);
      host.classList.remove('ink-capturing', 'ink-armed');
    };
  }, [rootRef]);

  return (
    <svg ref={svgRef} className="ink-user-overlay" aria-hidden="true">
      {highlights?.map((r, i) =>
        r.w > 0 && r.h > 0 ? (
          <rect
            key={'h' + i}
            className="ink-highlight"
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={3}
            ry={3}
          />
        ) : null,
      )}
      {strokes?.map((d, i) => (
        <path key={i} className="ink-user-stroke ink-user-settled" d={d} />
      ))}
      <path ref={haloRef} className="ink-user-halo" d="" />
      <path ref={strokeRef} className="ink-user-stroke" d="" />
    </svg>
  );
}
