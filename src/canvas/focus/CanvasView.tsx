// CanvasView — the "Canvas" view: this ONE answer's cards laid out as labelled tiles in space,
// joined by one flowing "Mavéa thread". It is OPT-IN (never the default): open it with a button and
// leave with one tap, so the normal scrollable conversation — with its voice and spotlight — stays
// primary. Each node renders the real block at full fidelity and SIZES TO ITS CONTENT (nothing is
// clipped); the camera pans/zooms Figma-style, and a plain page scroll passes straight through so the
// board never traps you. Reuses the shared spatial camera verbatim; deterministic row layout.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import type { Block, ConversationSpec } from '../../data/conversation';
import { BlockBoundary } from '../BlockBoundary';
import { FallbackCard } from '../FallbackCard';
import { blockLabel } from '../blockLabel';
import { useFocusTrap } from '../../live/useFocusTrap';
import { prefersReducedMotion } from './motion';
import { useSpatialCanvas } from '../spatial/useSpatialCanvas';
import { focusPoint, screenToWorld, type Bbox } from '../spatial/camera';
import './canvas.css';

const FALLBACK_H = 260; // provisional height used before a node is measured
const GAP = 56;
// max 3: a node renders at its natural card size, so 1.4 barely magnified past 1:1 — on a large
// monitor "fully zoomed in" still meant squinting at 360-640px cards. 3× reads comfortably from
// across a desk while min keeps the whole board reachable in one view.
const CLAMP = { min: 0.2, max: 3 };

/** Node width follows the block's own grid intent (`col`, its 1-12 span in the answer grid).
 *  One fixed width squeezed every wide block — tables broke their headers mid-word and swatch
 *  rows clipped their text — so a block that asked for a wide card gets a wide node here too. */
function nodeWidth(b: Block): number {
  return b.col >= 10 ? 640 : b.col >= 7 ? 500 : 360;
}

interface Placed {
  block: Block;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** A pleasing column count for n cards (a touch wider than tall). */
function pickCols(n: number): number {
  return Math.max(1, Math.min(n, Math.round(Math.sqrt(n * 1.3))));
}

/** Row-based layout using MEASURED heights: fixed columns, snake (boustrophedon) order so
 *  consecutive cards are adjacent and the thread never self-crosses; each row is as tall as its
 *  tallest card, and cards are centred in their row so the thread runs level. */
function layoutBoard(
  nodes: Block[],
  heights: number[],
  cols: number,
): { placed: Placed[]; w: number; h: number } {
  const rows = Math.max(1, Math.ceil(nodes.length / cols));
  const rowH: number[] = [];
  for (let r = 0; r < rows; r++) {
    let mh = FALLBACK_H;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i < nodes.length) mh = Math.max(mh, heights[i] || FALLBACK_H);
    }
    rowH[r] = mh;
  }
  const rowTop: number[] = [];
  let y = 0;
  for (let r = 0; r < rows; r++) {
    rowTop[r] = y;
    y += rowH[r] + GAP;
  }
  // Widths vary per node, so each row lays out left-to-right in VISUAL order (snake order for
  // odd rows) by running sum; rows are then centred against the widest row so the board stays
  // balanced and the thread through the row centres never kinks sideways.
  const rowSeq: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const idx: number[] = [];
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i < nodes.length) idx.push(i);
    }
    if (r % 2 === 1) idx.reverse(); // snake
    rowSeq[r] = idx;
  }
  const rowW = rowSeq.map(
    (idx) =>
      idx.reduce((acc, i) => acc + nodeWidth(nodes[i]), 0) + Math.max(0, idx.length - 1) * GAP,
  );
  const boardW = Math.max(...rowW, 1);
  const pos = new Array<{ x: number; w: number }>(nodes.length);
  rowSeq.forEach((idx, r) => {
    let x = (boardW - rowW[r]) / 2;
    for (const i of idx) {
      const w = nodeWidth(nodes[i]);
      pos[i] = { x, w };
      x += w + GAP;
    }
  });
  const placed = nodes.map((b, i) => {
    const r = Math.floor(i / cols);
    const h = heights[i] || FALLBACK_H;
    const { x, w } = pos[i];
    const top = rowTop[r] + (rowH[r] - h) / 2;
    return { block: b, x, y: top, w, h, cx: x + w / 2, cy: rowTop[r] + rowH[r] / 2 };
  });
  return { placed, w: boardW, h: Math.max(FALLBACK_H, y - GAP) };
}

/** One continuous C1-smooth path through the row centres (Catmull-Rom → cubic bezier). */
function threadPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** A short, reliable title for a node — the card's own title when it has one, else a type label. */
function nodeTitle(b: Block): string {
  const t = (b.props as { title?: unknown } | undefined)?.title;
  return typeof t === 'string' && t.trim() ? t.trim() : blockLabel(b);
}

interface Props {
  data: ConversationSpec;
  blocks: Block[];
  spot: string | null;
  renderBlock: (b: Block, depth?: number) => ReactNode;
  onAskBlock?: (b: Block) => void;
  selectedBlockIds?: ReadonlySet<string>;
  /** Leave the board and return to the normal answer view. */
  onExit?: () => void;
}

/** The Canvas as a full-screen takeover: the board gets the whole viewport (a modal you enter for
 *  the spatial view and close to land back in the conversation exactly where you left it), with a
 *  slim header carrying the answer's title and one obvious way back. Portalled to <body> so no
 *  ancestor transform or overflow can clip the stage. */
export function CanvasTakeover(props: Props) {
  const { data, onExit, selectedBlockIds } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  // Ask PINS a card in place (the node flips to "Selected") without leaving the board — asking
  // about several things back-to-back used to force you out and back in for every single one.
  // The pin is real work happening on a surface the takeover covers, though, so it needs its own
  // visible confirmation: the exit button doubles as that confirmation once something is pinned.
  const selectedCount = selectedBlockIds?.size ?? 0;

  // Keyboard focus stays inside the takeover (it claims aria-modal, so Tabbing out into the page
  // behind it would strand a keyboard or screen-reader user), Escape closes from anywhere in it —
  // not just while the board itself holds focus — and the trigger gets focus back on close.
  // The viewport is resolved in a layout effect so it's already set when the trap's own effect
  // runs and hands it the initial focus: arrows/Home work on the board immediately.
  const viewportRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    viewportRef.current = rootRef.current?.querySelector<HTMLElement>('.cv-viewport') ?? null;
  }, []);
  useFocusTrap(rootRef, { onEscape: onExit, initialFocus: viewportRef });

  // The page behind must not scroll while the board owns the screen.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      ref={rootRef}
      className="cv-takeover"
      role="dialog"
      aria-modal="true"
      aria-label={`${data.title} — canvas`}
    >
      <header className="cv-takeover-head">
        <div className="cv-takeover-id">
          <span className="cv-takeover-glyph" aria-hidden="true">
            ◇
          </span>
          <div className="cv-takeover-titles">
            <span className="cv-takeover-eyebrow">Canvas</span>
            <span className="cv-takeover-title">{data.title}</span>
          </div>
        </div>
        <div className="cv-takeover-actions">
          {selectedCount > 0 && (
            <span className="cv-takeover-selection" aria-live="polite">
              {selectedCount} selected
            </span>
          )}
          {onExit && (
            <button type="button" className="cv-takeover-close" onClick={onExit}>
              {selectedCount > 0 ? (
                <>Ask about {selectedCount} →</>
              ) : (
                <>
                  <span aria-hidden="true">←</span> Back to answer
                </>
              )}
              <kbd aria-hidden="true">esc</kbd>
            </button>
          )}
        </div>
      </header>
      <CanvasView {...props} />
    </div>,
    document.body,
  );
}

export function CanvasView({ blocks, spot, renderBlock, onAskBlock, selectedBlockIds }: Props) {
  // Only id-bearing blocks are nodes (the spotlightable set, same rule as FocusStage).
  const nodes = useMemo(() => blocks.filter((b) => !!b.id), [blocks]);
  const cols = useMemo(() => pickCols(nodes.length), [nodes.length]);

  // Measure each node's natural height (a map card ≠ a one-liner). Two-pass: render at a fallback
  // height, measure, re-lay-out. useLayoutEffect (before paint, no flash) + a ResizeObserver so late
  // content (maps, images) re-settles the layout.
  const nodeEls = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  const measure = useCallback(() => {
    const hs = nodes.map((_, i) => nodeEls.current[i]?.offsetHeight || FALLBACK_H);
    setHeights((prev) =>
      prev.length === hs.length && prev.every((v, i) => v === hs[i]) ? prev : hs,
    );
  }, [nodes]);
  useLayoutEffect(() => {
    measure();
  }, [measure]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    nodeEls.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [measure, nodes]);

  const {
    placed,
    w: worldW,
    h: worldH,
  } = useMemo(() => layoutBoard(nodes, heights, cols), [nodes, heights, cols]);
  const world = useMemo<Bbox>(
    () => ({ x: -GAP / 2, y: -GAP / 2, w: worldW + GAP, h: worldH + GAP }),
    [worldW, worldH],
  );
  const thread = useMemo(() => threadPath(placed.map((p) => ({ x: p.cx, y: p.cy }))), [placed]);

  const spatial = useSpatialCanvas({ clamp: CLAMP, margin: 40 });
  const { camera, transform, viewportRef, fitTo, zoomAtClient, pan, setCamera } = spatial;
  const reduced = prefersReducedMotion();
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const focusIdx = useRef(0);
  // Has the camera been aimed since the last auto-fit? Late content (a map tile, a lazy image)
  // keeps re-measuring for seconds, and every re-measure changes `world` — without this the board
  // would snap back to the whole-canvas fit under the user's hands mid-pan, or yank the camera off
  // the card the spotlight just flew to. Explicit fits (open, Home, ⊡, spotlight release) still run.
  const navigated = useRef(false);

  // Fit the whole board on open + when the measured layout settles. A double rAF lets the viewport
  // lay out first (a same-tick measure can read 0 height and no-op, clipping the board). A second
  // fit after the takeover's 300ms entrance re-frames against the final viewport — the animation
  // scales the whole layer, so a fit measured mid-entrance reads a shrunken rect.
  useEffect(() => {
    if (navigated.current) return;
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => fitTo(world));
    });
    const settle = setTimeout(() => fitTo(world), 360);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(settle);
    };
  }, [world, fitTo]);

  // Fly the camera to centre a node (spotlight, keyboard nav, taps). Never zooms out below a
  // readable scale.
  const flyToIdx = useCallback(
    (idx: number) => {
      const el = viewportRef.current;
      const p = placed[idx];
      if (!el || !p) return;
      navigated.current = true;
      focusIdx.current = idx;
      const r = el.getBoundingClientRect();
      const s = Math.min(Math.max(cameraRef.current.scale, 0.85), CLAMP.max);
      setCamera(focusPoint(p.cx, p.cy, s, { w: r.width, h: r.height }, CLAMP));
    },
    [placed, viewportRef, setCamera],
  );

  // --- SPOTLIGHT: fly to whichever card Mavéa is narrating, and highlight it. Releasing the
  // spotlight glides back out to the whole board, so a guided walk ends on the full picture. ---
  const hadSpot = useRef(false);
  useEffect(() => {
    if (!spot) {
      if (hadSpot.current) {
        navigated.current = false; // the walk is over — let a late re-measure settle the board again
        fitTo(world);
      }
      hadSpot.current = false;
      return;
    }
    const idx = placed.findIndex((p) => p.block.id === spot);
    if (idx >= 0) {
      hadSpot.current = true;
      flyToIdx(idx);
    }
  }, [spot, placed, flyToIdx, fitTo, world]);

  // --- drag to pan; tap a node to fly to it; a press on a control is left to the button ---
  const [panning, setPanning] = useState(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only the primary button pans. A right/middle press opens the context menu (or auto-scroll)
    // and the browser swallows the matching pointerup, so the pan would stay latched to the cursor
    // long after the menu closed. Touch and pen primary presses report button 0, so they still pan.
    if (e.button !== 0) return;
    // A press that starts on a control is a click, NOT a pan — bail out before capturing the
    // pointer, or the capture eats the control's own click and it "does nothing". That includes
    // every interactive element INSIDE a node: a map's MapLibre controls, a block's tabs or
    // sliders — the cards on the board are the real, working blocks.
    if (
      (e.target as HTMLElement).closest(
        '.cv-node-ask, .cv-controls, a, button, input, select, textarea, [contenteditable="true"]',
      )
    )
      return;
    dragging.current = true;
    navigated.current = true;
    moved.current = false;
    setPanning(true);
    last.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      pan(dx, dy);
    },
    [pan],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const wasDragging = dragging.current;
      dragging.current = false;
      setPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      // A clean tap on a node flies to it — only for a real board press (control presses never
      // started a drag, so wasDragging is false there).
      if (!wasDragging || moved.current) return;
      const el = viewportRef.current;
      if (!el || placed.length === 0) return;
      const r = el.getBoundingClientRect();
      const w = screenToWorld(cameraRef.current, e.clientX - r.left, e.clientY - r.top);
      const hit = placed.findIndex(
        (p) => w.x >= p.x && w.x <= p.x + p.w && w.y >= p.y && w.y <= p.y + p.h,
      );
      if (hit >= 0) flyToIdx(hit);
    },
    [placed, viewportRef, flyToIdx],
  );

  // --- wheel: scroll the mouse (or trackpad) to zoom, anchored on the cursor — the board is a
  // dedicated, full-view mode you enter deliberately and leave with Done/Esc, so trapping the wheel
  // here is expected (Figma/Maps-style) rather than surprising. ---
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      navigated.current = true;
      zoomAtClient(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewportRef, zoomAtClient]);

  const zoomCenter = useCallback(
    (factor: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      navigated.current = true;
      zoomAtClient(factor, r.left + r.width / 2, r.top + r.height / 2);
    },
    [viewportRef, zoomAtClient],
  );

  // --- keyboard node-nav. Escape belongs to the takeover's focus trap, which closes the board from
  // anywhere inside it (including the header) — handling it here as well fired onExit twice. ---
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        flyToIdx(Math.min(placed.length - 1, focusIdx.current + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        flyToIdx(Math.max(0, focusIdx.current - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        fitTo(world);
      }
    },
    [flyToIdx, fitTo, world, placed.length],
  );

  // Level of detail: the per-node "Ask" pill only appears once you've zoomed in a bit.
  const detail = camera.scale >= 0.6;

  return (
    // This is a single-tab-stop custom widget (pan/zoom camera flown by arrow keys, not per-card
    // focus), so "group" is the accurate role — no ARIA widget role actually models a spatial
    // canvas, and a stand-in like "grid" would falsely promise row/cell structure to screen
    // readers. jsx-a11y only recognizes its own "widget" roles as keyboard-capable, hence the
    // narrow overrides below rather than a role that misrepresents this to assistive tech.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={'cv-viewport' + (panning ? ' is-panning' : '')}
      ref={viewportRef}
      role="group"
      aria-label="Answer canvas — this answer's cards as a board you can pan and zoom"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className="cv-controls">
        <button type="button" onClick={() => zoomCenter(1.25)} title="Zoom in" aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          onClick={() => zoomCenter(1 / 1.25)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        {/* ⊡ — content inside a frame; ⤢/⤡ mean full-screen expand/collapse elsewhere. */}
        <button
          type="button"
          onClick={() => fitTo(world)}
          title="Fit the whole canvas"
          aria-label="Fit the whole canvas"
        >
          ⊡
        </button>
      </div>
      <div
        className="cv-world"
        style={{ width: worldW, height: worldH, transform } as CSSProperties}
      >
        <svg
          className="cv-thread-svg"
          width={worldW}
          height={worldH}
          viewBox={`0 0 ${worldW} ${worldH}`}
          aria-hidden="true"
        >
          <path className={'cv-thread' + (reduced ? '' : ' cv-draw')} d={thread} pathLength={1} />
        </svg>
        {placed.map((p, i) => {
          const id = p.block.id as string;
          const selected = selectedBlockIds?.has(id) ?? false;
          const isSpot = spot === id;
          return (
            <div
              key={id}
              ref={(el) => {
                nodeEls.current[i] = el;
              }}
              className={'cv-node' + (selected ? ' is-selected' : '') + (isSpot ? ' is-spot' : '')}
              style={{ left: p.x, top: p.y, width: p.w }}
              data-kind={p.block.type}
            >
              <div className="cv-node-label" title={nodeTitle(p.block)}>
                <span className="cv-node-step">{i + 1}</span>
                <span className="cv-node-title">{nodeTitle(p.block)}</span>
              </div>
              <div className="cv-node-inner">
                <BlockBoundary fallback={<FallbackCard block={p.block} />}>
                  {renderBlock(p.block)}
                </BlockBoundary>
              </div>
              {onAskBlock && detail && (
                <button
                  type="button"
                  className="cv-node-ask"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAskBlock(p.block);
                  }}
                >
                  {selected ? 'Selected' : 'Ask'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
