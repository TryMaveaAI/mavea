// MorphStage — the morph's view layer, and nothing else. It renders a world of nodes ONCE and lets
// the layout decide where each one sits and which of its three faces is showing, so the causal web,
// the timeline and the chart are the same DOM elements in different places rather than three
// component trees swapping in and out.
//
// Two rules keep it honest. Every node in `world.nodes` is rendered UNCONDITIONALLY, keyed by id —
// the moment a representation starts dropping elements the morph becomes a cross-fade. And nothing
// here imports from src/live: provenance, tiers and receipts reach the faces through `renderFace`,
// which the host supplies, so this module stays a general spatial renderer.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  TransitionEvent as ReactTransitionEvent,
} from 'react';
import type { Bbox } from '../camera';
import type {
  ChromeSpec,
  MorphEdgeDatum,
  MorphLayout,
  MorphNodeDatum,
  NodeFace,
  WorldData,
} from './types';
import { SHELF_LABEL_INSET } from './layouts/shelf';
import type { MorphStageApi } from './useMorphStage';
import './morph.css';

/** Edges draw on after the nodes have travelled most of the way to their new places. */
const EDGE_DRAW_DELAY = 440;
/** Movement past this, in screen px, counts as a pan and swallows the click that ends it. */
const DRAG_SLOP = 2;
/** A pinch has to change the finger distance by this much before it takes one discrete step. */
const PINCH_STEP = 1.25;
/** Wheel gestures have no "lift", so a quiet spell ends one. */
const WHEEL_IDLE_MS = 320;

export interface MorphStageProps {
  stage: MorphStageApi;
  world: WorldData;
  /** Extra content for one face of one node — the host's hook for provenance-aware chrome. */
  renderFace?: (node: MorphNodeDatum, face: NodeFace) => ReactNode;
  onNodeClick?: (node: MorphNodeDatum) => void;
  onEdgeClick?: (edgeId: string) => void;
  /** The node the host considers open, if any — it wears the selected state. */
  selectedId?: string;
  /** The link a narration is currently speaking about. It is drawn lit while its sentence is being
   *  said, so the arrow the reader is looking at is the one being described. */
  litEdgeId?: string;
}

/** Below this relative move, a what-if has not really touched a cause — the same noise floor
 *  trust/phrase uses for "would barely change", so the picture and the words agree on what counts. */
const SHIFT_NOISE = 0.005;

/** Which way a what-if moved a cause, or undefined when it did not move it at all. */
function shiftDirection(shift: number | undefined): 'weaker' | 'stronger' | undefined {
  if (shift === undefined || !Number.isFinite(shift)) return undefined;
  if (shift < 1 - SHIFT_NOISE) return 'weaker';
  if (shift > 1 + SHIFT_NOISE) return 'stronger';
  return undefined;
}

/** Arrowheads. A reinforcing link ends in a head, a dampening one in a crossbar (the inhibition
 *  idiom), so the sign reads before the colour does — and the marker box is in user units, which
 *  keeps a head the same size whatever stroke weight the layout gave the path. */
/** Every head this surface draws, as data. Each is rendered TWICE — once solid, once `-soft` — and
 *  the pair is why an unbacked link can keep its head without pretending to be an established one.
 *
 *  A marker cannot inherit from the path that references it (SVG properties inherit into `<marker>`
 *  from its own ancestors, never from the referencing element), so a second id is the only way to
 *  give the same shape a lighter ink. That is the reason for the duplication — please do not
 *  "simplify" it back to one set. */
const HEADS = [
  {
    id: 'mv-arrow',
    cls: 'mv-marker-up',
    refX: 9,
    size: 13,
    shape: <path d="M0.5 1 L9.5 5 L0.5 9 Z" />,
  },
  {
    id: 'mv-arrow-damp',
    cls: 'mv-marker-down',
    refX: 8,
    size: 17,
    shape: <path d="M8 0.6 L8 9.4" />,
  },
  // The relation vocabulary. Sign owns the COLOUR of a link, so what a link CLAIMS is drawn at its
  // tip instead: a full cause arrives closed, a contribution arrives open, an enabling condition
  // arrives as a ring. A correlation gets a dot at BOTH ends and no head at all — drawing "moves
  // with" as an arrow would assert a direction nobody measured.
  {
    id: 'mv-arrow-open',
    cls: 'mv-marker-open',
    refX: 9,
    size: 13,
    shape: <path d="M1 1.4 L9 5 L1 8.6 Z" />,
  },
  {
    id: 'mv-arrow-ring',
    cls: 'mv-marker-ring',
    refX: 7.4,
    size: 13,
    shape: <circle cx="5" cy="5" r="3" />,
  },
  { id: 'mv-dot', cls: 'mv-marker-dot', refX: 5, size: 9, shape: <circle cx="5" cy="5" r="2.6" /> },
] as const;

function EdgeMarkers(): ReactNode {
  return (
    <defs>
      {HEADS.flatMap((h) =>
        [false, true].map((soft) => (
          <marker
            key={soft ? `${h.id}-soft` : h.id}
            id={soft ? `${h.id}-soft` : h.id}
            className={`mv-marker ${h.cls}${soft ? ' mv-marker-soft' : ''}`}
            viewBox="0 0 10 10"
            refX={h.refX}
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={h.size}
            markerHeight={h.size}
            orient="auto"
          >
            {h.shape}
          </marker>
        )),
      )}
    </defs>
  );
}

/**
 * Draw on every `[data-draw]` path in one layer that has not been drawn yet.
 *
 * `usePathDraw` gives each path its own component, hook, effect and cleanup closure — E of each on
 * a world with E edges — and, because every `getTotalLength()` follows the previous path's inline
 * style write, E forced style-and-layout flushes to measure them. Reading all the lengths before
 * writing anything costs the browser one flush for the whole layer. A path that already carries
 * the class is skipped, so a morph re-shapes edges without re-drawing them, exactly as a per-path
 * hook (whose effect never re-ran on a `d` change) did.
 */
function useDrawIn(root: RefObject<SVGSVGElement | null>, revision: unknown): void {
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    // Inert under reduced motion — `.m-draw-path`'s animation lives inside `no-preference`, and
    // its base rule already leaves the path solid — so skip the measuring pass outright.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const fresh = svg.querySelectorAll<SVGPathElement>(
      '[data-draw]:not(.m-draw-path):not([data-drawn])',
    );
    // Real SVG geometry always implements this; an unusual host degrades to "no animation".
    const lengths = Array.from(fresh, (path) =>
      typeof path.getTotalLength === 'function' ? path.getTotalLength() : null,
    );
    fresh.forEach((path, i) => {
      const length = lengths[i];
      if (length === null) return;
      path.style.setProperty('--path-len', `${length}px`);
      path.style.setProperty('--delay', `${EDGE_DRAW_DELAY}ms`);
      path.classList.add('m-draw-path');
    });
    // The entrance leaves behind a dash pattern the length of the path — invisible, but the
    // browser re-rasterizes a dashed stroke at every zoom step for as long as it is there. Take it
    // off once the line has finished arriving; `data-drawn` is what then keeps a later morph from
    // re-running the entrance (the class used to be both the animation and the "already drawn"
    // marker, so it could not simply be removed).
    const done = (e: AnimationEvent): void => {
      if (e.animationName !== 'mavea-draw') return;
      const path = e.target as SVGPathElement;
      path.classList.remove('m-draw-path');
      path.style.removeProperty('--path-len');
      path.style.removeProperty('--delay');
      path.dataset.drawn = '';
    };
    svg.addEventListener('animationend', done);
    return () => svg.removeEventListener('animationend', done);
  }, [root, revision]);
}

function ChromeLayer({
  chrome,
  bbox,
  exiting,
  onSettle,
}: {
  chrome: ChromeSpec;
  bbox: Bbox;
  exiting?: boolean;
  onSettle?: () => void;
}): ReactNode {
  const svgRef = useRef<SVGSVGElement | null>(null);
  useDrawIn(svgRef, chrome.paths);
  return (
    <div
      className="mv-chrome"
      data-exiting={exiting ? '' : undefined}
      onTransitionEnd={onSettle}
      aria-hidden={exiting ? true : undefined}
    >
      <svg
        ref={svgRef}
        className="mv-chrome-svg"
        width={bbox.w}
        height={bbox.h}
        viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
        aria-hidden="true"
      >
        {chrome.bands.map((band) => (
          <rect
            key={band.id}
            className={`mv-band ${band.className}`}
            x={band.x}
            y={band.y}
            width={band.w}
            height={band.h}
            rx={12}
          />
        ))}
        {chrome.paths.map((path) => (
          <path
            key={path.id}
            className={path.className}
            d={path.d}
            fill="none"
            data-draw={path.draw ? '' : undefined}
          />
        ))}
      </svg>
      {/* Chrome text is HTML, not <text>: a percentage transform inside a viewBox resolves against
          the viewBox, and these labels need the world's counter-scale to stay readable. */}
      <div className="mv-chrome-labels">
        {chrome.bands.map((band) =>
          band.label === undefined ? null : (
            <div
              key={`${band.id}:label`}
              className="mv-shelf-label"
              style={{
                left: band.x - bbox.x + SHELF_LABEL_INSET,
                top: band.y - bbox.y + SHELF_LABEL_INSET,
              }}
            >
              {band.label}
            </div>
          ),
        )}
        {chrome.labels.map((label) => (
          <div
            key={label.id}
            className={`mv-chrome-label ${label.className}`}
            data-anchor={label.anchor ?? 'start'}
            style={{ left: label.x - bbox.x, top: label.y - bbox.y }}
          >
            {label.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function nodeIdAt(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>('.mv-node')?.dataset.id;
}

interface WorldContentProps {
  nodes: readonly MorphNodeDatum[];
  edges: readonly MorphEdgeDatum[];
  layout: MorphLayout;
  exiting: { layout: MorphLayout; token: number } | null;
  settleExit: (token: number) => void;
  activate: (node: MorphNodeDatum) => void;
  /** Coarse enough to be a camera THRESHOLD rather than a camera reading: it flips at one scale,
   *  so a zoom re-renders this subtree twice in a session rather than on every frame. */
  lod: 'near' | 'far';
  renderFace?: (node: MorphNodeDatum, face: NodeFace) => ReactNode;
  onNodeClick?: (node: MorphNodeDatum) => void;
  onEdgeClick?: (edgeId: string) => void;
  selectedId?: string;
  litEdgeId?: string;
}

/**
 * Everything inside the world layer — held behind a memo boundary on purpose.
 *
 * The camera is React state, so a drag writes it as fast as the pointer reports and re-renders
 * every component that reads it, which is the whole host overlay with the node list inside it.
 * Nothing here depends on the camera: the transform, the counter-scale and the level of detail all
 * ride the world layer's own style and attributes, one element up. So a pan reconciles two style
 * writes rather than N nodes, their three faces each and every receipt the host renders into them.
 * The price is that every prop below must be stable across a camera move — none of them may be
 * derived from `cam`.
 */
/** How far apart two placed nodes have to be vertically to count as different rows. Generous on
 *  purpose: within a reading band the entries are not pixel-aligned, and a row that splits on a few
 *  units of drift would send arrow-key focus zig-zagging. */
const ROW_BUCKET = 60;

/**
 * The order a reader moves through this world.
 *
 * Derived from the GEOMETRY rather than from the node list, because the node list is spec order and
 * every view rearranges it — on the timeline that is causal order while the picture is chronological,
 * so a keyboard reader was traversing the view in an order the view denies. Rows first, then left to
 * right within a row, which is the order each of these compositions is read in; held-aside nodes come
 * last, after everything the view could actually place.
 *
 * Folded nodes are not in it at all: they paint nothing and are hidden from assistive tech.
 */
function readingOrder(layout: MorphLayout): string[] {
  return [...layout.positions.entries()]
    .filter(([, p]) => p.folded !== true)
    .sort(([aId, a], [bId, b]) => {
      const shelf = Number(a.shelved === true) - Number(b.shelved === true);
      if (shelf !== 0) return shelf;
      const row = Math.round(a.y / ROW_BUCKET) - Math.round(b.y / ROW_BUCKET);
      if (row !== 0) return row;
      return a.x - b.x || aId.localeCompare(bId);
    })
    .map(([id]) => id);
}

const WorldContent = memo(function WorldContent({
  nodes,
  edges,
  layout,
  exiting,
  settleExit,
  activate,
  lod,
  renderFace,
  onNodeClick,
  onEdgeClick,
  selectedId,
  litEdgeId,
}: WorldContentProps): ReactNode {
  const edgesRef = useRef<SVGSVGElement | null>(null);
  useDrawIn(edgesRef, layout.edgePaths);

  // ── The keyboard path ─────────────────────────────────────────────────────────────────────────
  // ONE tab stop for the whole stage, and the arrows walk it. Every node used to be `tabIndex={0}`,
  // so a world was twenty-odd tab stops in spec order — an order the view contradicts the moment it
  // is not the causal web. A roving index is the standard treatment for a composite widget, and it
  // is also what lets Home/End mean something.
  const order = useMemo(() => readingOrder(layout), [layout]);
  const [focused, setFocused] = useState<string | null>(null);
  // The node the single tab stop lands on: wherever the reader last was, if it is still placed.
  const roving = focused !== null && order.includes(focused) ? focused : (order[0] ?? null);
  const moveFocus = useCallback(
    (delta: number | 'first' | 'last') => {
      if (order.length === 0) return;
      const from = roving === null ? 0 : order.indexOf(roving);
      const to =
        delta === 'first'
          ? 0
          : delta === 'last'
            ? order.length - 1
            : Math.min(order.length - 1, Math.max(0, from + delta));
      const id = order[to];
      setFocused(id);
      const el = document.querySelector<HTMLElement>(`.mv-node[data-id="${CSS.escape(id)}"]`);
      el?.focus();
    },
    [order, roving],
  );
  // What each link DOES, in the author's own word, for the hover title. Not drawn into the
  // composition: at full counter-scale a card is 280 world units and the gutter between columns is
  // 20, so a drawn label would sit across two cards exactly when the camera is pulled back.
  const edgeLabel = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of edges) if (e.label !== undefined) byId.set(e.id, e.label);
    return byId;
  }, [edges]);
  const { bbox } = layout;
  // A link is only as strong as the cause feeding it, so a what-if that weakens a cause has to
  // thin every arrow leaving it — otherwise the cards recede while the web between them keeps
  // claiming the old strength. Keyed by edge id off the SOURCE node's shift.
  const edgeShift = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n.shift]));
    const out = new Map<string, number>();
    for (const e of edges) {
      const shift = byId.get(e.from);
      if (shift !== undefined && Number.isFinite(shift)) out.set(e.id, shift);
    }
    return out;
  }, [nodes, edges]);

  return (
    <>
      {exiting && (
        <ChromeLayer
          key={exiting.token}
          chrome={exiting.layout.chrome}
          bbox={exiting.layout.bbox}
          exiting
          onSettle={() => settleExit(exiting.token)}
        />
      )}
      <ChromeLayer key={layout.rep} chrome={layout.chrome} bbox={bbox} />

      <svg
        ref={edgesRef}
        className="mv-edges"
        width={bbox.w}
        height={bbox.h}
        viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
        aria-hidden="true"
      >
        <EdgeMarkers />
        {layout.edgePaths.map((edge) => (
          <g
            key={edge.id}
            className="mv-edge-g"
            data-lit={litEdgeId === edge.id ? '' : undefined}
            data-shift={shiftDirection(edgeShift.get(edge.id))}
            style={
              edgeShift.has(edge.id)
                ? ({ '--mv-shift': edgeShift.get(edge.id) } as CSSProperties)
                : undefined
            }
            onClick={onEdgeClick ? () => onEdgeClick(edge.id) : undefined}
          >
            {edgeLabel.has(edge.id) && <title>{edgeLabel.get(edge.id)}</title>}
            {/* A 2px line is a 2px target. The hit path is the same curve, drawn fat and
                invisible, so an arrow can be hovered and opened without pixel-hunting. */}
            {onEdgeClick && <path className="mv-edge-hit" d={edge.d} fill="none" />}
            {/* Weight travels as a custom property, not as a stroke-width attribute: a
                presentation attribute loses to every CSS rule, and the sheet owns the hover
                weight. */}
            <path
              className={edge.className}
              d={edge.d}
              fill="none"
              data-draw=""
              style={
                edge.width === undefined
                  ? undefined
                  : ({ '--mv-edge-w': edge.width } as CSSProperties)
              }
            />
          </g>
        ))}
      </svg>

      {nodes.map((node, i) => {
        const placed = layout.positions.get(node.id);
        if (!placed) return null;
        const style = {
          '--nx': `${placed.x + placed.w / 2 - bbox.x}px`,
          '--ny': `${placed.y + placed.h / 2 - bbox.y}px`,
          // The entrance stagger, by CAUSAL DEPTH rather than by array index: the world then assembles
          // causes first and the outcome last, in a handful of waves, instead of enumerating the node
          // list. A part has no depth of its own and falls back to its position, arriving after the
          // wave its cause is in.
          '--mv-i': node.depth ?? i,
          ...(node.shift === undefined ? {} : { '--mv-shift': node.shift }),
        } as CSSProperties;
        // A folded breakdown is parked on its parent's card and paints nothing. It keeps its
        // place in the layout, but it must not be clickable or tabbable — an invisible node that
        // answers for the card underneath it is worse than one that is not there at all.
        const live = onNodeClick !== undefined && !placed.folded;
        // A folded card paints nothing and is aria-hidden — so it must carry no CONTROL either.
        // `opacity: 0` does not remove a button from the tab order, and the host's chrome is real
        // buttons (a figure that opens its receipt, a break-down chip), so every folded card was a
        // tab stop into a hidden subtree. Drawing depth-2 breakdowns multiplies those by the whole
        // subtree, which is why this is fixed here rather than left to each host.
        const chrome = placed.folded ? undefined : renderFace;
        // All three faces render at once — that is what lets a node MOVE between representations
        // instead of being swapped out — and the two that are not showing are hidden with `opacity`,
        // which removes nothing from the accessibility tree. Every card's label was therefore
        // announced twice, and on the timeline three times. Only the face the layout chose is real
        // to assistive tech.
        // What the host prints ahead of the compact label — a timeline entry's date, today. It
        // leads the label's own text flow, so it needs a real space after it: `margin` separates
        // the paint, not the words, and without one every screen reader and every text scrape read
        // "2021Ground fire escapes".
        const lead = renderFace?.(node, 'entry');
        return (
          <div
            key={node.id}
            className="mv-node"
            data-id={node.id}
            // What the node IS, published for the sheet to read: its part in the story, how well
            // it is evidenced, the sphere it belongs to, and whether it carries a history. Without
            // these every card in every world paints identically, and a reader has to open each
            // one to learn anything the data already knew.
            data-role={node.role}
            data-tier={node.tier}
            data-domain={node.domain}
            data-series={node.series?.length ? '' : undefined}
            data-face={placed.face}
            data-shelved={placed.shelved ? '' : undefined}
            data-folded={placed.folded ? '' : undefined}
            // Which WAY a what-if moved this cause. The direction is an attribute and the amount a
            // custom property, so the sheet can colour by one and scale by the other — and a node
            // the levers never reached carries neither, which is what "unchanged" has to look like.
            data-shift={shiftDirection(node.shift)}
            data-selected={selectedId === node.id ? '' : undefined}
            data-lod={lod}
            style={style}
            aria-hidden={placed.folded ? true : undefined}
            role={live ? 'button' : undefined}
            tabIndex={live ? (node.id === roving ? 0 : -1) : undefined}
            onFocus={live ? () => setFocused(node.id) : undefined}
            onClick={live ? () => activate(node) : undefined}
            onKeyDown={
              live
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onNodeClick?.(node);
                      return;
                    }
                    // The arrows walk the composition in the order it READS — rows, then left to
                    // right — so a keyboard reader moves through the picture rather than through the
                    // node list, which on every view but the causal web is a different order.
                    const step: Record<string, number | 'first' | 'last'> = {
                      ArrowRight: 1,
                      ArrowDown: 1,
                      ArrowLeft: -1,
                      ArrowUp: -1,
                      Home: 'first',
                      End: 'last',
                    };
                    const delta = step[e.key];
                    if (delta === undefined) return;
                    e.preventDefault();
                    moveFocus(delta);
                  }
                : undefined
            }
          >
            <div className="mv-face mv-face-card" aria-hidden={placed.face !== 'card' || undefined}>
              <span className="mv-label">{node.label}</span>
              {/* One footer line for everything a card says ABOUT its label — the figure, the
                  host's provenance chrome, and last, hard right, what backs it. */}
              <span className="mv-card-foot">
                {node.domain !== undefined && (
                  <span className="mv-domain" title={node.domain} aria-label={node.domain} />
                )}
                {node.value !== undefined && (
                  <span className="mv-value">
                    {node.value.toLocaleString()}
                    {node.unit ?? ''}
                  </span>
                )}
                {chrome?.(node, 'card')}
                {node.tier !== undefined && <span className="mv-tier">{node.tier}</span>}
              </span>
            </div>
            {/* The compact face is one wrapping text flow, and what the host adds LEADS it rather
                than sitting under it. A 160×44 entry holds two lines; a date on a line of its own
                took one of them, so every dated entry showed half its name. Inline, the date is an
                eyebrow the label wraps around — it costs a few characters of the first line rather
                than the whole second one, and the row pitch never has to grow. */}
            <div
              className="mv-face mv-face-entry"
              aria-hidden={placed.face !== 'entry' || undefined}
            >
              <span className="mv-label">
                {lead}
                {lead ? ' ' : null}
                {node.label}
              </span>
            </div>
            <div className="mv-face mv-face-mark" aria-hidden={placed.face !== 'mark' || undefined}>
              {chrome?.(node, 'mark')}
            </div>
          </div>
        );
      })}
    </>
  );
});

export function MorphStage({
  stage,
  world,
  renderFace,
  onNodeClick,
  onEdgeClick,
  selectedId,
  litEdgeId,
}: MorphStageProps): ReactNode {
  const { cam, layout, exiting, lod, settleExit, morphing, settle } = stage;
  const { viewportRef, zoomAtClient, pan } = cam;

  const [panning, setPanning] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchBase = useRef(0);
  /** One discrete outcome (expand / collapse / ascend) per gesture — a pinch fires continuously. */
  const fired = useRef(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const applyPinch = useCallback(
    (factor: number, clientX: number, clientY: number, nodeId?: string) => {
      if (fired.current) {
        zoomAtClient(factor, clientX, clientY);
        return;
      }
      if (stage.pinch(factor, clientX, clientY, nodeId) !== 'zoom') fired.current = true;
    },
    [stage, zoomAtClient],
  );
  const pinchRef = useRef(applyPinch);
  pinchRef.current = applyPinch;

  // Wheel-zoom needs a non-passive listener to preventDefault the page scroll. A trackpad pinch
  // arrives as ctrl+wheel, which takes the altitude path; a plain wheel just zooms the camera.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // Direct manipulation outranks any morph still in flight: from here the world lands on the
      // frame it was asked for rather than easing toward it, which is also what stops a wheel tick
      // re-running the counter-scale transition on every node in the world.
      settle();
      if (e.ctrlKey) {
        pinchRef.current(Math.exp(-e.deltaY / 100), e.clientX, e.clientY, nodeIdAt(e.target));
        clearTimeout(idle);
        idle = setTimeout(() => {
          fired.current = false;
        }, WHEEL_IDLE_MS);
        return;
      }
      zoomAtClient(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      clearTimeout(idle);
      el.removeEventListener('wheel', onWheel);
    };
  }, [viewportRef, zoomAtClient, settle]);

  const midpoint = (): { x: number; y: number; d: number } => {
    const [a, b] = [...pointers.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  // Capture is taken when a gesture PROVES itself, never on the way in. Capturing at pointerdown
  // redirects the compatibility mouse events to the capturing element as well, so every mouseup —
  // and therefore every click — landed on the viewport instead of the card, the affordance or the
  // arrow the reader had pressed: the whole surface was unclickable with a mouse or a finger, and
  // only the keyboard path still opened anything.
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // A hand on the world ends whatever it was doing on its own — everything from here is direct.
      settle();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size >= 2) {
        // A second finger is a pinch, never a tap — nothing here is waiting on a click, so this one
        // is captured at once and the gesture survives a finger straying off the stage.
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = false;
        setPanning(false);
        pinchBase.current = 0;
        return;
      }
      dragging.current = true;
      moved.current = false;
      setPanning(true);
      last.current = { x: e.clientX, y: e.clientY };
    },
    [settle],
  );

  // A trackpad reports well past 60 pointermoves a second, and every one of them used to be a
  // React commit — each re-rendering the surface's chrome around the memoized world. The deltas
  // accumulate in a ref and are spent once per frame instead, which is as often as the screen can
  // show them. Flushed synchronously when the hand lifts, so the last sliver of a drag is never
  // left behind in the buffer.
  const panBuf = useRef({ dx: 0, dy: 0 });
  const panRaf = useRef(0);
  const flushPan = useCallback(() => {
    if (panRaf.current !== 0) {
      cancelAnimationFrame(panRaf.current);
      panRaf.current = 0;
    }
    const { dx, dy } = panBuf.current;
    if (dx === 0 && dy === 0) return;
    panBuf.current = { dx: 0, dy: 0 };
    pan(dx, dy);
  }, [pan]);
  const queuePan = useCallback(
    (dx: number, dy: number) => {
      panBuf.current.dx += dx;
      panBuf.current.dy += dy;
      if (panRaf.current !== 0) return;
      panRaf.current = requestAnimationFrame(() => {
        panRaf.current = 0;
        const buffered = panBuf.current;
        panBuf.current = { dx: 0, dy: 0 };
        if (buffered.dx !== 0 || buffered.dy !== 0) pan(buffered.dx, buffered.dy);
      });
    },
    [pan],
  );
  useEffect(() => () => cancelAnimationFrame(panRaf.current), []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const pts = pointers.current;
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        const { x, y, d } = midpoint();
        if (pinchBase.current === 0) {
          pinchBase.current = d;
          return;
        }
        const ratio = d / pinchBase.current;
        if (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP) {
          pinchBase.current = d;
          pinchRef.current(ratio, x, y, nodeIdAt(e.target));
        }
        return;
      }
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_SLOP && !moved.current) {
        moved.current = true;
        // Now it is a pan: take the pointer so the drag survives leaving the stage. Nothing is
        // waiting on a click any more — `activate` already refuses one that ends a pan.
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      last.current = { x: e.clientX, y: e.clientY };
      queuePan(dx, dy);
    },
    [queuePan],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      flushPan();
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) {
        pinchBase.current = 0;
        fired.current = false;
      }
      if (pointers.current.size === 0) {
        dragging.current = false;
        setPanning(false);
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [flushPan],
  );

  const activate = useCallback(
    (node: MorphNodeDatum) => {
      if (moved.current) return;
      onNodeClick?.(node);
    },
    [onNodeClick],
  );

  // The morph ends when the choreography does. The world layer and the nodes transition the same
  // property over the same span and a node's event bubbles up here, so whichever arrives first
  // means the move is over; a face's opacity or the chrome cross-fade is not a flight and must not
  // retire one. A move that changes nothing starts no transition and so leaves the flag set — the
  // next gesture or morph clears it, and until then the cost is one promoted layer, not N
  // transitions.
  const onFlightEnd = useCallback(
    (e: ReactTransitionEvent<HTMLDivElement>) => {
      if (e.propertyName === 'transform') settle();
    },
    [settle],
  );

  const { bbox } = layout;
  const worldStyle = {
    transform: cam.transform,
    width: bbox.w,
    height: bbox.h,
    '--mv-cam-scale': cam.camera.scale,
  } as CSSProperties;

  return (
    <div
      className="mv-viewport"
      ref={viewportRef}
      data-panning={panning ? 'true' : undefined}
      style={{ '--mv-cam-scale': cam.camera.scale } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="mv-world"
        style={worldStyle}
        data-morphing={morphing ? '' : undefined}
        onTransitionEnd={onFlightEnd}
      >
        <WorldContent
          nodes={world.nodes}
          edges={world.edges}
          layout={layout}
          exiting={exiting}
          settleExit={settleExit}
          activate={activate}
          lod={lod}
          renderFace={renderFace}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          selectedId={selectedId}
          litEdgeId={litEdgeId}
        />
      </div>
    </div>
  );
}
