// useMorphStage — the morph stage's state and lifecycle: which representation is showing, which
// nodes are expanded, the camera that flies between fits, and the one exiting chrome layer a
// representation swap leaves behind.
//
// Animation stays in CSS (the useSpatialCanvas rule): this hook only ever publishes a NEW camera
// and a NEW layout, and the world layer transitions itself. The one thing it must own is the
// chrome hand-off — axes, gridlines and shelf bands belong to a single representation, so the old
// set has to linger while it fades. That layer is retired by a `transitionend` from the view WITH
// a timer fallback, because an interrupted transition does not reliably fire one, and every retire
// is gated on a monotonic token so a stale timer from an abandoned morph can never clear the layer
// a newer morph just installed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canvasPinch } from '../../../live/altitude';
import { register } from '../../focus/stepDriver';
import { isAtFitFloor, type Bbox } from '../camera';
import { useSpatialCanvas, type SpatialCanvas } from '../useSpatialCanvas';
import { FIT_FLOOR } from './layouts/lanes';
import { MAX_DRAWN_DEPTH } from './adapters';
import { layoutChart } from './layouts/chartLayout';
import { layoutFlow } from './layouts/flowLayout';
import { layoutGraph } from './layouts/graphLayout';
import { layoutSpheres } from './layouts/spheresLayout';
import { layoutTimeline } from './layouts/timelineLayout';
import type { LayoutFn, MorphLayout, Representation, WorldData } from './types';

/** The camera's range. The floor is DERIVED (lanes.FIT_FLOOR): it is the scale below which the
 *  counter-scale can no longer hold the surface's smallest persistent type above the legibility
 *  floor, so shrinking further would only produce an unreadable picture of a larger world. Past it
 *  the world stops fitting and starts panning. */
const CLAMP = { min: FIT_FLOOR, max: 2.2 };
/** Breathing room kept between the world and the viewport edge on every fit. */
const MARGIN = 56;
/** The chrome cross-fade rides the world's own `--m-cinematic` transition; the fallback timer has
 *  to outlast it or it would retire a layer mid-fade. */
const EXIT_FALLBACK_MS = 1100 + 200;
/** A morph is normally retired by the world's own transform transition ending. Some never fire
 *  one — a transition the browser drops, a reader who reduces motion, a move whose transform is
 *  visually identical — and an un-retired morph holds a promoted compositor layer plus the long
 *  transition on every node in the world for as long as the surface is open. Same derivation as
 *  the chrome's fallback: outlast the cinematic, then take the flag down regardless. */
const FLIGHT_FALLBACK_MS = 1100 + 200;
/** Below this camera scale a card's secondary text is too small to read, so it is hidden. */
const LOD_NEAR = 0.7;
/** Air kept around an unfolded family, so the breakdown reads as sitting IN the world rather than
 *  pressed against the glass. */
const FAMILY_PAD = 120;
/** Air kept around a single node the camera has flown to. Two failure modes bracket this number: a
 *  lone card fitted tight reads as a slide rather than a place, and a box so generous it fits at the
 *  whole world's scale reads as no camera move at all — which is what a narration walking six causes
 *  in a row would look like. This sits between them: the card, its immediate neighbours, and a
 *  visible arrival. */
const FOCUS_PAD = 120;

// Which readings a world is offered, and in what order, live in `offers.ts` — pure, so the turn path
// and the headless audit can ask the same question without importing a hook. Re-exported here
// because this module was their address first.
import { REPRESENTATIONS, fillOf, firstRead, readingsOf, representationHolds } from './offers';
import { REP_TEXT } from './vocabulary';

export { REPRESENTATIONS, fillOf, firstRead, readingsOf, representationHolds };

const LAYOUTS: Record<Representation, LayoutFn> = {
  graph: layoutGraph,
  timeline: layoutTimeline,
  chart: layoutChart,
  flow: layoutFlow,
  spheres: layoutSpheres,
};

/**
 * The camera's frame, and the one thing every camera call here has to get right.
 *
 * `camera.ts` maps a world point wx to `cam.x + wx * scale`. MorphStage does NOT render the world
 * that way: it sizes the world layer to the layout's bbox and places everything inside it with the
 * bbox ORIGIN subtracted (`--nx`, the chrome labels' `left`, the SVG viewBox all agree on it). So
 * the layer's own top-left is the bbox's top-left, and a camera fitted to the bbox in world
 * coordinates lands the content `bbox.x * scale` off centre — which on a timeline, whose bbox
 * starts left of zero the moment a tick label reaches past the axis, pushed the world sideways
 * until it spilled out of the stage. These two convert into the frame the DOM actually uses.
 */
const frameOf = (bbox: Bbox): Bbox => ({ x: 0, y: 0, w: bbox.w, h: bbox.h });
const local = (bbox: Bbox, x: number, y: number): [number, number] => [x - bbox.x, y - bbox.y];

/** The box holding a just-unfolded cause and its parts, in the frame the DOM uses, with room
 *  around it so the family does not sit hard against the stage edge. Null when the cause is not on
 *  this representation at all. */
function familyBox(
  layout: MorphLayout,
  parentId: string,
  childrenOf: ReadonlyMap<string, readonly string[]>,
): Bbox | null {
  const parent = layout.positions.get(parentId);
  if (!parent) return null;
  let minX = parent.x;
  let minY = parent.y;
  let maxX = parent.x + parent.w;
  let maxY = parent.y + parent.h;
  for (const childId of childrenOf.get(parentId) ?? []) {
    const child = layout.positions.get(childId);
    if (!child || child.folded) continue;
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.w);
    maxY = Math.max(maxY, child.y + child.h);
  }
  const [x, y] = local(layout.bbox, minX - FAMILY_PAD, minY - FAMILY_PAD);
  return { x, y, w: maxX - minX + FAMILY_PAD * 2, h: maxY - minY + FAMILY_PAD * 2 };
}

/** What a pinch actually did — the view uses it to fire one discrete outcome per gesture. */
export type PinchOutcome = 'zoom' | 'expand' | 'collapse' | 'ascend';

export interface MorphStageApi {
  rep: Representation;
  setRep: (rep: Representation) => void;
  layout: MorphLayout;
  /** The representation being faded out, if any — at most one, ever. */
  exiting: { layout: MorphLayout; token: number } | null;
  /** Retire the exiting layer; no-ops unless `token` is still the live morph. */
  settleExit: (token: number) => void;
  expandedIds: ReadonlySet<string>;
  toggleExpand: (id: string) => void;
  /** Every cause that HAS a breakdown, at any depth. Published so a host never derives a second
   *  copy: the set this hook lays the world out from is the one a chip has to read, or the two
   *  disagree about whether a cause has been broken down at all. */
  expandable: ReadonlySet<string>;
  /** Will unfolding `id` put its parts ON THE MAP? Asked of the CURRENT layout — of what it can
   *  nest and of where it actually put the node — never of the node's own shape. The same cause
   *  unfolds on the causal web and cannot on the contribution view, and a datum knows none of that.
   *  An id the layout has never heard of answers false, which the predicate this replaces did not:
   *  `nodes.find(...)?.parentId === undefined` is `undefined === undefined` on a miss, so it said
   *  YES for every node the adapter had dropped. */
  unfoldsOnStage: (id: string) => boolean;
  cam: SpatialCanvas;
  /** True while the world is on its way somewhere — a layout the view has not reported settled, or
   *  a camera flight. The view gates its transitions and its compositor layer on it. */
  morphing: boolean;
  /** The world has arrived (or the reader has grabbed it). Ends the flight in both halves. */
  settle: () => void;
  lod: 'near' | 'far';
  /** A pinch step: `factor` > 1 dives in, < 1 pulls out. `nodeId` is whatever sits under the
   *  gesture — a pinch INTO an unexpanded node unfolds it instead of zooming. */
  pinch: (factor: number, clientX: number, clientY: number, nodeId?: string) => PinchOutcome;
  /** Fly the camera to frame one node, with air around it; `null` re-fits the whole world. It lives
   *  on the API rather than in the caller because the bbox-origin conversion (`local`/`frameOf`) is
   *  a trap that has already cost this surface one fix — a narration driver that did its own
   *  arithmetic would be the second place to get it wrong. An unknown or folded id falls back to
   *  the world fit, so a walk can never fly the reader to nowhere. */
  focusNode: (id: string | null) => void;
}

export interface MorphStageOptions {
  world: WorldData;
  /** Called when a pinch-out has nothing left to reveal — the altitude ladder's next rung. */
  onAscend?: () => void;
  /** Block id to publish to `focus/stepDriver`, so a narration driver can step the three
   *  representations in time with what is being said. Omit to stay undriveable. */
  driverId?: string;
  /** The representation to open on. Only ever the FIRST one — a follow-up that asks for a view the
   *  world already holds opens there, and the reader's own chips own it from then on. */
  initialRep?: Representation;
  /** Height of any host chrome floating over the FOOT of the stage, in px. Chrome positioned inside
   *  the camera's own viewport is invisible to it, so without this the camera happily fits the
   *  world's bottom row underneath the band — the mindshape action bar's bug exactly. The inset
   *  shrinks the measured viewport, which both keeps the content clear and re-centres it above the
   *  band. Must be a CONSTANT: a measured value that lags re-fits the world on its own. */
  insetBottom?: number;
}

export function useMorphStage(opts: MorphStageOptions): MorphStageApi {
  const { world, onAscend, driverId, insetBottom } = opts;
  const [rep, setRepState] = useState<Representation>(opts.initialRep ?? 'graph');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [exiting, setExiting] = useState<{ layout: MorphLayout; token: number } | null>(null);
  const cam = useSpatialCanvas({
    clamp: CLAMP,
    margin: MARGIN,
    ...(insetBottom === undefined ? {} : { insetBottom }),
  });

  // Seeded from the layout we last rendered, so an appended node or a representation swap settles
  // near where things already were instead of reshuffling the whole web.
  const previous = useRef<ReadonlyMap<string, { x: number; y: number }> | undefined>(undefined);
  // The hint a layout composes against is the box its bbox will actually be fitted into — the
  // viewport LESS the fit margin, so a layout's own "will this be readable?" arithmetic is the
  // camera's, not an approximation of it.
  const { viewport } = cam;
  const fitBox = useMemo(
    () =>
      viewport
        ? { w: Math.max(1, viewport.w - MARGIN * 2), h: Math.max(1, viewport.h - MARGIN * 2) }
        : undefined,
    [viewport],
  );
  const layout = useMemo(
    () =>
      LAYOUTS[rep](world, {
        expandedIds,
        previous: previous.current,
        ...(fitBox ? { viewport: fitBox } : {}),
      }),
    [rep, world, expandedIds, fitBox],
  );
  useEffect(() => {
    const next = new Map<string, { x: number; y: number }>();
    for (const [id, placed] of layout.positions) next.set(id, { x: placed.x, y: placed.y });
    previous.current = next;
  }, [layout]);

  // Read-through refs (the motion.ts idiom) so the gesture callbacks stay stable across camera
  // moves — a wheel listener that re-subscribes on every zoom tick is a listener churn bug.
  const repRef = useRef(rep);
  repRef.current = rep;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const cameraRef = useRef(cam.camera);
  cameraRef.current = cam.camera;
  const expandedRef = useRef(expandedIds);
  expandedRef.current = expandedIds;
  const ascendRef = useRef(onAscend);
  ascendRef.current = onAscend;

  // Whether the world is morphing is derived from the LAYOUT, not from the camera, because the two
  // land in different commits: React writes the nodes' new positions on the render that follows a
  // rep flip, while the camera's own fit is computed from an effect a beat later. A flag raised by
  // the camera would therefore arrive after the positions it was meant to animate — the nodes
  // would jump and only the camera would fly. A layout the view has not yet reported settled IS a
  // morph in progress, and that is known during the same render that moves them.
  // The settled layout is remembered together with WHAT PRODUCED IT, because the two questions
  // "have the nodes moved?" and "is this a move worth animating?" have different answers, and both
  // have to be answered during the render that moves them — an effect is a commit too late, and a
  // single frame of `data-morphing` is enough to arm the cinematic on every node.
  const [settled, setSettled] = useState<{
    layout: MorphLayout;
    rep: Representation;
    expandedIds: ReadonlySet<string>;
  } | null>(null);
  const { endFlight } = cam;
  const settle = useCallback(() => {
    setSettled({
      layout: layoutRef.current,
      rep: repRef.current,
      expandedIds: expandedRef.current,
    });
    endFlight();
  }, [endFlight]);

  const token = useRef(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const setRep = useCallback((next: Representation) => {
    if (next === repRef.current) return;
    const mine = ++token.current;
    // Exactly one exiting layer: this assignment REPLACES any layer still fading, and the timer
    // that would have retired that one is both cleared and token-guarded.
    setExiting({ layout: layoutRef.current, token: mine });
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      if (mine !== token.current) return;
      setExiting(null);
    }, EXIT_FALLBACK_MS);
    repRef.current = next; // so a second flip in the same tick still counts as a change
    setRepState(next);
  }, []);

  const settleExit = useCallback((t: number) => {
    if (t !== token.current) return;
    clearTimeout(exitTimer.current);
    setExiting(null);
  }, []);

  // Expanding flies the camera to the parent that just unfolded; everything else re-fits. The
  // pending id is consumed by the effect below, which runs once the new layout exists.
  const pendingFocus = useRef<string | null>(null);
  const toggleExpand = useCallback((id: string) => {
    const next = new Set(expandedRef.current);
    if (!next.delete(id)) {
      next.add(id);
      // Only where the parts will actually BE a family. On a view that folds a breakdown there is no
      // family box to fly to, and fitting the parent's own card reads as a random zoom — which is
      // what pressing break-down on the contribution view has always done.
      if (unfoldsRef.current(id)) pendingFocus.current = id;
    }
    setExpandedIds(next);
  }, []);

  /** Parent → its children, for framing a family the moment one opens. */
  const childrenOf = useMemo(() => {
    const byParent = new Map<string, string[]>();
    for (const n of world.nodes) {
      if (n.parentId === undefined) continue;
      const kids = byParent.get(n.parentId);
      if (kids) kids.push(n.id);
      else byParent.set(n.parentId, [n.id]);
    }
    return byParent as ReadonlyMap<string, readonly string[]>;
  }, [world]);

  const { fitTo, setCamera, viewportRef } = cam;
  useEffect(() => {
    const focusId = pendingFocus.current;
    pendingFocus.current = null;
    if (focusId !== null) {
      // Frame the cause TOGETHER WITH the parts it just opened. Zooming a fixed step in on the
      // parent's centre was the obvious move and the wrong one: unfolding makes the world wider at
      // the same moment, so a closer camera cropped the very breakdown the reader had asked to
      // see — parts hanging off every edge of the stage. Fitting the family is the whole
      // interaction stated as geometry, and it degrades gracefully: a parent whose children have
      // not been placed yet fits its own card and nothing looks broken.
      const family = familyBox(layout, focusId, childrenOf);
      if (family) {
        fitTo(family);
        return;
      }
    }
    fitTo(frameOf(layout.bbox));
  }, [layout, childrenOf, fitTo, setCamera, viewportRef]);

  const parentOf = useMemo(() => new Map(world.nodes.map((n) => [n.id, n.parentId])), [world]);
  const expandable = useMemo(() => {
    const parents = new Set<string>();
    for (const parent of parentOf.values()) if (parent !== undefined) parents.add(parent);
    return parents;
  }, [parentOf]);

  /** How far a node sits below a top-level ancestor — "deepest expansion" collapses the innermost
   *  one first, so pinching out unwinds semantic zoom in the order it was dived into. Guarded
   *  against a parent cycle in model output, which would otherwise never terminate. */
  const chainLength = useCallback(
    (id: string): number => {
      let steps = 0;
      let cur: string | undefined = id;
      const seen = new Set<string>();
      while (cur !== undefined && !seen.has(cur)) {
        seen.add(cur);
        cur = parentOf.get(cur);
        if (cur !== undefined) steps += 1;
      }
      return steps;
    },
    [parentOf],
  );

  /** Which representations draw a breakdown as a FAMILY. Only the causal web has a plane to draw
   *  "inside" in; the other three place a node by a property it owns — a measured share of the
   *  outcome, a date, a series — which a part does not have on its own, so they fold it instead. */
  const nests = rep === 'graph';
  const unfoldsOnStage = useCallback(
    (id: string): boolean => {
      if (!nests) return false;
      const placed = layout.positions.get(id);
      // A cause inside a closed family cannot show its own parts, and neither can one on the shelf.
      if (placed === undefined || placed.folded === true || placed.shelved === true) return false;
      // Its parts land one level below it, and that is the level that has to be drawable.
      return chainLength(id) + 1 <= MAX_DRAWN_DEPTH;
    },
    [nests, layout, chainLength],
  );
  // Read through a ref so `toggleExpand` keeps its empty dep array — it is held in a ref by a
  // non-passive wheel listener and must not change identity on every layout.
  const unfoldsRef = useRef(unfoldsOnStage);
  unfoldsRef.current = unfoldsOnStage;

  const { zoomAtClient } = cam;
  const pinch = useCallback(
    (factor: number, clientX: number, clientY: number, nodeId?: string): PinchOutcome => {
      if (factor >= 1) {
        if (
          nodeId !== undefined &&
          expandable.has(nodeId) &&
          !expandedRef.current.has(nodeId) &&
          unfoldsRef.current(nodeId)
        ) {
          toggleExpand(nodeId);
          return 'expand';
        }
        zoomAtClient(factor, clientX, clientY);
        return 'zoom';
      }
      const rect = viewportRef.current?.getBoundingClientRect();
      const atFloor =
        !!rect &&
        (rect.width > 0 || rect.height > 0) &&
        isAtFitFloor(
          cameraRef.current,
          frameOf(layoutRef.current.bbox),
          { w: rect.width, h: rect.height },
          MARGIN,
          CLAMP,
        );
      if (canvasPinch('out', atFloor) === 'zoom-camera') {
        zoomAtClient(factor, clientX, clientY);
        return 'zoom';
      }
      // Nothing left for the camera: unwind semantic zoom before leaving the surface entirely.
      const open = [...expandedRef.current];
      if (open.length > 0) {
        let deepest = open[0];
        let deepestChain = chainLength(deepest);
        for (const id of open) {
          const length = chainLength(id);
          if (length > deepestChain) {
            deepest = id;
            deepestChain = length;
          }
        }
        toggleExpand(deepest);
        return 'collapse';
      }
      ascendRef.current?.();
      return 'ascend';
    },
    [expandable, toggleExpand, zoomAtClient, viewportRef, chainLength],
  );

  const focusNode = useCallback(
    (id: string | null) => {
      const current = layoutRef.current;
      const placed = id === null ? undefined : current.positions.get(id);
      // A folded child is parked ON its parent's card and paints nothing — flying to it would frame
      // an empty patch of world. The whole-world fit is the honest fallback.
      if (!placed || placed.folded) {
        fitTo(frameOf(current.bbox));
        return;
      }
      const [x, y] = local(current.bbox, placed.x - FOCUS_PAD, placed.y - FOCUS_PAD);
      fitTo({ x, y, w: placed.w + FOCUS_PAD * 2, h: placed.h + FOCUS_PAD * 2 });
    },
    [fitTo],
  );

  // A narration driver steps the three representations; unclaimed, nothing changes.
  useEffect(() => {
    if (driverId === undefined) return;
    return register(driverId, {
      count: REPRESENTATIONS.length,
      setIndex: (i) =>
        setRep(REPRESENTATIONS[Math.min(REPRESENTATIONS.length - 1, Math.max(0, Math.trunc(i)))]),
      spokenFor: () => undefined,
      captionFor: (i) => {
        const target = REPRESENTATIONS[i];
        return target ? REP_TEXT[target].caption : undefined;
      },
    });
  }, [driverId, setRep]);

  const morphing = settled?.layout !== layout || cam.flying;
  // The safety net under `settle`. The view retires a morph when the world's transform transition
  // ends; this retires one the browser never animated in the first place, so an idle surface can
  // never be left holding a promoted layer and N armed transitions. Re-armed whenever a new morph
  // starts, cleared on unmount.
  useEffect(() => {
    if (!morphing) return;
    const t = setTimeout(settle, FLIGHT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [morphing, layout, settle]);

  return {
    rep,
    setRep,
    layout,
    exiting,
    settleExit,
    expandedIds,
    toggleExpand,
    expandable,
    unfoldsOnStage,
    cam,
    morphing,
    settle,
    lod: cam.camera.scale >= LOD_NEAR ? 'near' : 'far',
    pinch,
    focusNode,
  };
}
