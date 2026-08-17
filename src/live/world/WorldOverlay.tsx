// WorldOverlay — the explorable living answer. One WorldSpec, rendered as a morphing spatial world
// (causal graph ⇄ timeline ⇄ chart, the SAME nodes moving) wrapped in the trust layer, so every
// figure on it can prove itself and every arrow says what it does not claim.
//
// Three rules hold this surface together:
//
//   1. No orphan pixels. Not one number is interpolated into this file's JSX. Every figure goes
//      through <ProvValue>, which resolves it in the registry built below — a number with nothing
//      behind it simply does not render, instead of appearing as an unbacked fact.
//   2. The counterfactual is local and honest. Levers re-run why/engine's cascade synchronously
//      (zero model calls) and the result is fed to WhatIfFrame as plain numbers; an illustrative
//      world closes off the exact ladder entirely, so it can only ever answer in words.
//   3. A projection never wears a receipt, and a what-if is shown IN PLACE. Pulling a lever
//      re-weights the one world the reader is already looking at — prominence on the cards, weight
//      on the links, and the move stated in prose (trust/phrase, which cannot emit a digit). It
//      never prints a projected magnitude, because nothing measured one.
//
//      This replaced a second "HYPOTHETICAL" lane, and the failure is worth remembering: the fork
//      scaled each node's magnitude, and then — correctly — stripped its value and tier, since a
//      projection may not wear the measured world's receipts. What was left was the same nodes, in
//      the same layout-determined places, with the numbers taken off: a grey photocopy under a
//      banner promising a difference. The layouts already knew this shape of bug (timeline was
//      never forkable for the same reason); it was true of the other views too.
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { drawableEdges, worldToMorph } from '../../canvas/spatial/morph/adapters';
import { MorphStage } from '../../canvas/spatial/morph/MorphStage';
import { representationHolds, useMorphStage } from '../../canvas/spatial/morph/useMorphStage';
import type {
  MorphNodeDatum,
  NodeFace,
  Representation,
  WorldData,
} from '../../canvas/spatial/morph/types';
import { EdgeEvidencePanel } from '../trust/EdgeEvidencePanel';
import { FULL_PCT, LeverRail, type Lever } from '../trust/LeverRail';
import { ProvValue } from '../trust/ProvValue';
import { TrustProvider, type TrustHandle } from '../trust/TrustProvider';
import { WhatIfFrame, type WhatIfReadout } from '../trust/WhatIfFrame';
import { asEdgeRelation, shiftChip } from '../trust';
import type { UsedInRef } from '../trust';
import { cascade } from '../why/engine';
import type { CascadeResult, Intervention } from '../why/types';
import { asWhyDag } from './asWhyDag';
import { worldToContent } from '../content/fromWorld';
import { childrenOf } from '../content/types';
import { extendedRender, familiesFor, loadFamilies } from '../../canvas/blocks/loader';
import type { ViewPlan } from '../content/lens';
import { readableLabel } from './labels';
import { applyExpansion, deriveEdgeStatus } from './validate';
import type { SpokenLine } from '../../voice/tts';
import type { WorldNode, WorldSpec } from './types';
import { useWorldWalk } from './useWorldWalk';
import { nodeValueId, pointValueId } from './valueIds';
import { TRANSPORT_BAND, TRANSPORT_IDLE, WorldTransport } from './WorldTransport';
import { worldStory, type WorldBeat } from './worldStory';
import './world.css';

const REP_CHIPS: ReadonlyArray<{ rep: Representation; label: string }> = [
  { rep: 'graph', label: 'Graph' },
  { rep: 'flow', label: 'Contribution' },
  { rep: 'timeline', label: 'Over time' },
  { rep: 'chart', label: 'As a chart' },
];

/** What each view's GEOMETRY means, in one line. A morphing surface asks the reader to re-read the
 *  same objects several ways, and only the causal web is self-evident: on the timeline, position is
 *  a claim (when) while height is only packing, and a reader with no way to know that reasonably
 *  assumes both mean something. Stated once, under the chips that switched the view. */
const REP_LEGEND: Record<Representation, string> = {
  graph:
    'Left to right is what led to what. Colour is the direction of the push; thickness is how much of the outcome the link explains.',
  timeline:
    'Left to right is WHEN, read against the axis below; a bar is how long a cause lasted. Height only keeps entries from overlapping — it means nothing.',
  chart:
    'Each mark is a cause plotted against its own measured history. Causes with nothing measured are held aside rather than drawn at zero.',
  flow: 'Ribbon thickness is how much of the outcome that link was MEASURED to explain. A cause whose links carry no measured share is held aside rather than drawn thin, which would read as a finding nobody made.',
};

/** Why an illustrative world's observed column is a dash: not a gap in the evidence — there is no
 *  evidence to have a gap in. The frame's own wording would blame the grounding instead. */
const ILLUSTRATIVE_BASE_NOTE = 'an illustrative world measures nothing, so there is no baseline';

/** The children of `id`, wherever it sits in the tree. */
function findChildren(nodes: readonly WorldNode[], id: string): readonly WorldNode[] | undefined {
  for (const n of nodes) {
    if (n.id === id) return n.children;
    const deeper = n.children === undefined ? undefined : findChildren(n.children, id);
    if (deeper) return deeper;
  }
  return undefined;
}

/** The stage prints a node's own `value` as plain text; this surface prints every figure through
 *  ProvValue instead, so the datum handed to the renderer carries none. */
function withoutFigure(n: MorphNodeDatum): MorphNodeDatum {
  const { value: _value, ...rest } = n;
  return rest;
}

/**
 * What the reader's what-if did to each cause, as a ratio of relative strength — 1 untouched, below
 * 1 weaker. Read off the cascade's structure-only pass, which is defined whether or not anything in
 * the world is grounded, so a qualitative world answers a lever just as well as a measured one.
 *
 * This REPLACED a second "hypothetical" lane, and the reason is worth keeping. The fork scaled each
 * node's magnitude and then handed the projection to `asProjection`, which correctly stripped its
 * value and its tier — a projection may not wear the measured world's receipts. What reached the
 * screen was therefore the same nodes, in the same layout-determined places, with the numbers taken
 * off: a grey photocopy under a banner promising a difference. The only surviving signal was a
 * scaled series, which shows in the chart view alone — offered on about a third of worlds, and only
 * for the minority of causes that carry a history at all.
 *
 * So the cascade did real work and the render discarded it. Shown in place, the same arithmetic
 * re-weights the ONE world the reader is already looking at, which is both legible on every
 * representation and honest on an ungrounded world, where a magnitude never could have been.
 */
function shiftsFrom(base: CascadeResult, now: CascadeResult): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const [id, before] of base.relativeByNode) {
    const after = now.relativeByNode.get(id) ?? 0;
    if (before > 0) out.set(id, after / before);
  }
  return out;
}

/** The cascade, flattened for WhatIfFrame. An illustrative world has no measured outcome to move,
 *  so the exact ladder is closed off whatever tiers the author wrote: words, never a made-up delta. */
function toReadout(
  r: CascadeResult,
  base: CascadeResult,
  outcomeValue: number | undefined,
  illustrative: boolean,
): WhatIfReadout {
  return {
    exactBase: outcomeValue ?? null,
    exactDelta: r.outcomeDelta,
    explainedPct: r.explainedPct,
    fullyGrounded: r.fullyGrounded && !illustrative,
    relBase: base.relativeOutcome,
    relCur: r.relativeOutcome,
  };
}

type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

interface WorldOverlayProps {
  /** The built world — null while the one call that builds it runs, and after it fails. */
  spec: WorldSpec | null;
  /** The question the card carries. It is all an unbuilt world has to show, and it is real: the
   *  reader typed it. */
  question?: string;
  /** The build came back with nothing. An honest dead end — never a stand-in world. */
  failed?: boolean;
  onRetry?: () => void;
  onClose?: () => void;
  /** Open on this representation, for a follow-up the world could already answer. */
  view?: Representation;
  /** Break one cause into its parts, on demand. Absent = the host cannot buy one (the key-free
   *  lab, a replay, an export), and the affordance is not offered for nodes that have no authored
   *  breakdown — an offer nothing can answer is worse than no offer. */
  /** Buy a breakdown for one cause. Receives the world being SHOWN — the reader's own
   *  expansions are not in the answer's stored copy. */
  onExpandNode?: (nodeId: string, showing: WorldSpec) => Promise<WorldSpec | null>;
  /** Queue one narration line and hand back its lifecycle handle. Absent = this surface has no
   *  voice (the key-free lab, an export), and the walk still runs — captioned, paced by reading
   *  length. It arrives as a PROP rather than by importing `voice/tts` directly, because the host's
   *  wrapper is what arms the mic's echo gate; a world that spoke around it would be heard by an
   *  always-on mic and answered as if the reader had said it. */
  speakLine?: (text: string) => SpokenLine;
}

/**
 * The overlay in both of its states. A world is built when a reader opens it, so the FIRST thing
 * this surface shows is usually not a world at all — it is the wait, or the honest failure. The
 * built surface below owns every hook; this dispatcher owns none, so the two states can never
 * disagree about hook order.
 */
export function WorldOverlay({
  spec,
  question,
  failed,
  onRetry,
  onClose,
  view,
  onExpandNode,
  speakLine,
}: WorldOverlayProps): ReactElement {
  if (spec)
    return (
      <WorldSurface
        spec={spec}
        view={view}
        onClose={onClose}
        onExpandNode={onExpandNode}
        speakLine={speakLine}
      />
    );
  return (
    <WorldShell
      title={question ?? ''}
      failed={failed === true}
      onRetry={onRetry}
      onClose={onClose}
    />
  );
}

/** The wait and the dead end. Calm, honest, and empty of anything the world has not proven: there
 *  is no world yet, so there is nothing here but the reader's own question and what is happening
 *  to it. */
function WorldShell({
  title,
  failed,
  onRetry,
  onClose,
}: {
  title: string;
  failed: boolean;
  onRetry?: () => void;
  onClose?: () => void;
}): ReactElement {
  return (
    <section className="wo-scrim" aria-label={`Living answer: ${title}`}>
      <div className="wo-panel">
        <header className="wo-head">
          <div className="wo-title">
            <span className="wo-kicker">THE LIVING ANSWER</span>
            <h2>{title}</h2>
          </div>
          {onClose && (
            <div className="wo-head-actions">
              <button
                type="button"
                className="wo-btn wo-btn-close"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          )}
        </header>
        <div className="wo-shell" role="status" aria-live="polite">
          {failed ? (
            <>
              <p className="wo-shell-line">This world didn’t come back.</p>
              <p className="wo-shell-note">
                Nothing was built, and Mavéa won’t stand in a causal web it can’t source. The answer
                behind this card is untouched.
              </p>
              {onRetry && (
                <button type="button" className="wo-btn" onClick={onRetry}>
                  Try again
                </button>
              )}
            </>
          ) : (
            <>
              <span className="wo-shell-pulse" aria-hidden="true" />
              <p className="wo-shell-line">Building this world…</p>
              <p className="wo-shell-note">
                One model call, grounded in what this answer already found. Once it is built it is
                kept — re-opening it, and replaying this turn, costs nothing.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function WorldSurface({
  spec: given,
  view,
  onClose,
  onExpandNode,
  speakLine,
}: {
  spec: WorldSpec;
  view?: Representation;
  onClose?: () => void;
  /** Buy a breakdown for one cause. Receives the world being SHOWN — the reader's own
   *  expansions are not in the answer's stored copy. */
  onExpandNode?: (nodeId: string, showing: WorldSpec) => Promise<WorldSpec | null>;
  speakLine?: (text: string) => SpokenLine;
}): ReactElement {
  // Breakdowns bought during this viewing, kept HERE rather than written back onto the answer: the
  // world on the card is the record of what was asked and answered, and looking closer at one of
  // its causes does not change that. Derived rather than forked, so a follow-up that evolves the
  // standing world replaces `given` and the expansions still apply to whatever survived.
  const [expansions, setExpansions] = useState<ReadonlyMap<string, readonly WorldNode[]>>(
    () => new Map(),
  );
  const [pendingExpand, setPendingExpand] = useState<string | null>(null);
  const spec = useMemo(() => {
    if (expansions.size === 0) return given;
    let out = given;
    for (const [nodeId, children] of expansions) out = applyExpansion(out, nodeId, children);
    return out;
  }, [given, expansions]);

  const illustrative = spec.provenance.illustrative === true;
  const morphWorld = useMemo(() => worldToMorph(spec), [spec]);
  // The world's own semantic layer, and the only place its figures come from. The world is ONE
  // producer of a ContentGraph rather than the only surface that can prove a number — see
  // content/fromWorld, which is where the registry walk moved to.
  const content = useMemo(() => worldToContent(spec, morphWorld), [spec, morphWorld]);
  const registry = content.trust;
  const dag = useMemo(() => asWhyDag(spec), [spec]);

  const [levers, setLevers] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [selection, setSelection] = useState<Selection>(null);
  // Whether the transport is showing its caption row. Held HERE, above the stage, because the stage
  // reserves the band's height and the walk that drives it is created below the stage — one flag
  // both read, so the reserve and the paint can never disagree.
  const [walkOpen, setWalkOpen] = useState(false);

  const active = useMemo(() => [...levers.values()].some((p) => p !== FULL_PCT), [levers]);
  const interventions = useMemo<Intervention[]>(
    () => [...levers].map(([nodeId, pct]) => ({ nodeId, pct: pct / FULL_PCT })),
    [levers],
  );
  const baseline = useMemo(() => cascade(dag, []), [dag]);
  const current = useMemo(() => cascade(dag, interventions), [dag, interventions]);

  const shifts = useMemo(
    () => (active ? shiftsFrom(baseline, current) : null),
    [active, baseline, current],
  );
  // A lever is a native range input, so one drag fires a change event per pointer move. The cascade
  // behind the rail's own figures is O(V+E) over a web the gate keeps under 16 nodes, so those stay
  // live; the STAGE has to rebuild its node list for each new set of shifts, which is more than a
  // frame has room for at pointer rate. Deferring what the stage reads puts that behind React's own
  // coalescing: the drag renders at input speed, the stage takes the newest shifts when there is
  // room for them, and a list the next event supersedes is dropped instead of painted.
  // (The registry, the DAG and the measured world are memoised off `spec` — a drag touches none.)
  //
  // Cheaper than what it replaced, and by construction: shifts never reach a layout, so a lever no
  // longer lays the world out from scratch or re-fits the camera. The map holds still and only its
  // weights move.
  const stagedShifts = useDeferredValue(shifts);
  // A representation that could only shelve every node is not a view of this world — and BOTH the
  // time-based ones can be in that state: an undated web has no timeline, and a web whose causes
  // carry no measured history has no chart. Asked of the representation rather than special-cased
  // for the timeline, because the second case is the commoner one: most causal answers are
  // qualitative, and every one of them was offering a chart of nothing.
  const offered = useCallback(
    (candidate: Representation): boolean => representationHolds(candidate, morphWorld),
    [morphWorld],
  );
  const opening = view && offered(view) ? view : undefined;
  const stage = useMorphStage({
    world: morphWorld,
    // The transport floats over the foot of the stage, INSIDE the camera's own viewport, so the
    // camera has to be told to stay out of it or it fits the world's bottom row underneath the bar.
    // Only the caption's height is conditional: at rest the bar is its own controls and reserving
    // the full band cost every view a third of the stage.
    insetBottom: walkOpen ? TRANSPORT_BAND : TRANSPORT_IDLE,
    ...(opening ? { initialRep: opening } : {}),
  });
  const { rep, setRep, expandedIds, toggleExpand } = stage;
  // A follow-up that named a view lands here too, so the world morphs while the reader is watching
  // it rather than only on the next open. Keyed on the view CHANGING — their own chips still win.
  useEffect(() => {
    if (opening) setRep(opening);
  }, [opening, setRep]);

  // What the explanation looks like if the reader believes only what is sourced, and which unsourced
  // link it leans on hardest. Both are local walks over a web capped at 16 nodes (world/stress), so
  // the toggle costs nothing however often it is pulled — which is the point, because this is BYOK.
  // What the stage renders: the measured world with its figures withheld (ProvValue prints them),
  // each node carrying what the reader's what-if did to it. A breakdown moves with the cause it
  // breaks down — its own strength is its parent's.
  const stageWorld = useMemo<WorldData>(() => {
    const nodes = morphWorld.nodes.map((n) => {
      const bare = withoutFigure(n);
      const shift = stagedShifts?.get(n.parentId ?? n.id);
      // A label that paints nothing is a card with no name. Sanitised here, at the world's own edge,
      // rather than in the spatial renderer — "an unnamed cause" is this surface's wording.
      const label = readableLabel(n.label);
      return { ...bare, label, ...(shift === undefined ? {} : { shift }) };
    });
    return { ...morphWorld, nodes };
  }, [morphWorld, stagedShifts]);

  const nodeById = useMemo(() => {
    const byId = new Map<string, WorldNode>();
    const walk = (n: WorldNode): void => {
      byId.set(n.id, n);
      for (const child of n.children ?? []) walk(child);
    };
    for (const n of spec.nodes) walk(n);
    return byId;
  }, [spec]);
  const edgeById = useMemo(() => {
    const drawn = drawableEdges(spec.edges);
    return new Map(morphWorld.edges.map((e, i) => [e.id, drawn[i]]));
  }, [morphWorld, spec]);
  const expandable = useMemo(
    () =>
      new Set(
        morphWorld.nodes.map((n) => n.parentId).filter((id): id is string => id !== undefined),
      ),
    [morphWorld],
  );

  const trust = useRef<TrustHandle>(null);
  // The card is anchored to a rectangle measured before the camera moved, so a pan or a zoom would
  // leave it pointing at empty space. The provider owns dismissal; the surface owns the gesture.
  const dismissCard = useCallback(() => trust.current?.dismiss(), []);

  const onNavigate = useCallback((ref: UsedInRef) => {
    if (ref.surface === 'node' || ref.surface === 'edge') {
      setSelection({ kind: ref.surface, id: ref.id });
    }
  }, []);
  // ── The walk ──────────────────────────────────────────────────────────────────────────────────
  // The world, told. Composed from what the world already carries — no model call, so a reader on
  // their own key can replay it as often as they like. It ends on the timeline when this world has
  // one, which is the surface's question to answer, not the story's.
  const [litEdgeId, setLitEdgeId] = useState<string | undefined>(undefined);
  const closeOn: Representation | undefined = offered('timeline') ? 'timeline' : undefined;
  // Derived AFTER the first paint, not during it. The script is opt-in chrome — nothing on screen
  // needs it until the reader presses play — while the mount it would sit inside is the surface's
  // single heaviest moment: the registry, both cascades, the layout and every card's provenance all
  // land in that one task. Composing seventeen spoken lines (each one a pass of the annotation and
  // sentence-trim regexes) in the middle of it buys a slower first frame for a control the reader
  // may never touch. An effect runs it once the world is up.
  const [beats, setBeats] = useState<readonly WorldBeat[]>([]);
  useEffect(() => {
    // Scheduled for IDLE time, not merely for after the paint. Opening the world is this surface's
    // one heavy moment — registry, both cascades, the layout and every card's provenance land in the
    // same burst — and on a slow machine that burst is already the longest task of the session.
    // Composing the script inside it, or in the commit right behind it, adds to exactly the number
    // that matters. Nothing on screen needs the script until the reader reaches for the transport.
    const idle = globalThis.requestIdleCallback;
    const build = (): void =>
      setBeats(worldStory(spec, morphWorld, registry, closeOn ? { closeOn } : {}));
    if (typeof idle === 'function') {
      const handle = idle(build, { timeout: 2_000 });
      return () => globalThis.cancelIdleCallback?.(handle);
    }
    // Safari has no requestIdleCallback; a macrotask still clears the mount burst.
    const timer = setTimeout(build, 1);
    return () => clearTimeout(timer);
  }, [spec, morphWorld, registry, closeOn]);

  const { focusNode } = stage;
  const applyBeat = useCallback(
    (beat: (typeof beats)[number]) => {
      if (beat.rep) setRep(beat.rep);
      setSelection({ kind: 'node', id: beat.nodeId });
      setLitEdgeId(beat.edgeId);
      // A wide beat asks for the world fit directly rather than leaning on the morph to produce
      // one: `setRep` no-ops when the view is already showing, and an establishing shot that
      // silently kept the previous close-up would be the commonest case, not the rare one. When the
      // morph IS real the layout effect re-fits to the new bbox a beat later — same intent, and the
      // camera dedupes a move that lands where it already is.
      if (beat.wide) focusNode(null);
      else if (!beat.rep) focusNode(beat.nodeId);
    },
    [focusNode, setRep],
  );
  const walk = useMemo(
    () => ({ beats, apply: applyBeat, ...(speakLine ? { speakLine } : {}) }),
    [beats, applyBeat, speakLine],
  );
  const { index: beatIndex, playing, caption, toggle, seek, reset: leaveWalk } = useWorldWalk(walk);
  // The caption row is up for the whole walk — from the first press until the reader stops it or it
  // runs out — rather than per beat, so the stage re-fits once at each end instead of on every line.
  useEffect(() => {
    setWalkOpen(playing || beatIndex >= 0);
  }, [playing, beatIndex]);
  // The reader's own hand always wins. Any direct manipulation ends the walk where it stands rather
  // than fighting it for the camera — and the lit link goes with it, since nothing is being said
  // about it any more.
  const takeOver = useCallback(() => {
    leaveWalk();
    setLitEdgeId(undefined);
  }, [leaveWalk]);

  // Escape leaves, and Space plays or pauses — the two keys every other overlay in this app already
  // answers to, and the two a reader tries first on something that looks like a player. Space is
  // ignored while a control has focus so it cannot hijack a button's own activation. Read-through
  // refs so the one listener never re-subscribes as the walk advances.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const takeOverRef = useRef(takeOver);
  takeOverRef.current = takeOver;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        takeOverRef.current();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== ' ' && e.key !== 'Spacebar') return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('button, input, select, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onNodeClick = useCallback(
    (node: MorphNodeDatum) => {
      takeOver();
      setSelection({ kind: 'node', id: node.id });
    },
    [takeOver],
  );
  const onEdgeClick = useCallback(
    (edgeId: string) => {
      takeOver();
      setSelection({ kind: 'edge', id: edgeId });
    },
    [takeOver],
  );

  const setLever = useCallback(
    (id: string, pct: number) => {
      takeOver();
      setLevers((prev) => new Map(prev).set(id, pct));
    },
    [takeOver],
  );
  const reset = useCallback(() => {
    takeOver();
    setLevers(new Map());
  }, [takeOver]);

  // Can this cause's parts be drawn on the STAGE? Only down to MAX_DRAWN_DEPTH — graphLayout places
  // a breakdown against its parent's block, and only a top-level cause has one. Asked in one place so
  // the chip and the press can never disagree about where a breakdown will show up.
  const onStage = useCallback(
    (nodeId: string) => morphWorld.nodes.find((n) => n.id === nodeId)?.parentId === undefined,
    [morphWorld],
  );

  // Buy a breakdown for a cause that has none. One press, one call, and an honest no-op when the
  // cause turns out to have no parts worth naming — the chip comes back and nothing is said, because
  // "this cause is atomic" is an answer, not an error to interrupt someone with.
  const buyExpansion = useCallback(
    (nodeId: string) => {
      if (!onExpandNode || pendingExpand !== null) return;
      setPendingExpand(nodeId);
      // The world being LOOKED AT, not the one the answer was recorded with. Every breakdown the
      // reader has already bought lives in this component's own state, so the block's stored world
      // does not contain the newly-made child they just pressed — the host looked it up there, found
      // nothing, and returned null. Breaking down a part of a part failed silently for that reason.
      void onExpandNode(nodeId, spec).then(
        (world) => {
          setPendingExpand(null);
          // Searched at ANY depth: a breakdown attaches wherever its cause sits, so a grandchild's
          // parts come back nested and a top-level scan would miss them.
          const children = world === null ? undefined : findChildren(world.nodes, nodeId);
          if (!children?.length) return;
          setExpansions((prev) => new Map(prev).set(nodeId, children));
          // A press has to show its result. Parts of a TOP-LEVEL cause unfold on the stage; parts of
          // a part go to a depth the stage cannot place, so the reader is taken to where they ARE
          // drawn — selecting the cause puts them in the rail, through the lens. Before this, buying
          // a breakdown on a part flipped the chip and changed nothing anyone could see.
          if (onStage(nodeId)) toggleExpand(nodeId);
          else setSelection({ kind: 'node', id: nodeId });
        },
        () => setPendingExpand(null),
      );
    },
    [onExpandNode, onStage, pendingExpand, spec, toggleExpand],
  );

  const renderFace = useCallback(
    (node: MorphNodeDatum, face: NodeFace): ReactNode => {
      // On the TIMELINE an entry is placed BY its date, and until it said so the reader had to
      // measure each card against the axis by eye to learn the one thing the view exists to show.
      // The label the author wrote is used verbatim — re-formatting an instant is how a year turns
      // into a wrong month.
      //
      // Gated on the representation, not on the face. The entry is the compact face and the orbit
      // and the matrix now use it too, where a date says nothing about where the node sits — it was
      // a stray line of 7px type on every row of the grid, and the reader had no way to know it was
      // answering a question this view had not asked.
      if (face === 'entry' && rep === 'timeline') {
        const source = nodeById.get(node.id);
        // Its own date if it has one, else the span its series covers — which is what the layout
        // placed it by, so an entry can never sit on the axis without saying where. Both are the
        // author's own labels, used verbatim: re-formatting an instant is how a year becomes a
        // wrong month.
        const own = source?.date;
        const points = source?.series?.points;
        // A SPAN already draws its own bar across the years it covers — that bar is the view's way
        // of saying when, and printing the same range again inside a 160px entry only takes the
        // room the label needs. An INSTANT has no bar, so without this it is the one kind of entry
        // whose position a reader has to measure against the axis by eye.
        const spans = own?.until !== undefined || (points?.length ?? 0) > 1;
        const at = own?.t ?? points?.[0]?.t;
        // `data-said` when a source actually put the node here. The timeline states a date as a
        // POSITION, so an unbacked one is a claim wearing no receipt — it still places the node
        // (the model's sense of when things happened is usually right), but it must not read like
        // a measured one sitting beside it.
        return spans || !at ? null : (
          <span className="wo-when" data-said={node.dateGrounded ? '' : undefined}>
            {at}
          </span>
        );
      }
      // Only the card has room for the rest, and the hypothetical lane has nothing to prove: it is
      // a projection, so its nodes carry structure and never a receipt.
      if (face !== 'card') return null;
      const open = expandedIds.has(node.id);
      const authored = expandable.has(node.id);
      // Can this cause's parts be drawn ON THE STAGE? Only down to MAX_DRAWN_DEPTH: graphLayout
      // places a breakdown against its parent's block, and only a top-level cause has one.
      const partsOnStage = node.parentId === undefined;
      // A cause with no breakdown yet can still be opened, WHEREVER it sits — a part is a thing with
      // parts, and cell → cathode → material is an ordinary question. Only where a host can pay for
      // one: offering it in the key-free lab would be an affordance that answers with nothing.
      const buyable = !authored && onExpandNode !== undefined;
      // FOLD UP is offered only where something is actually folded away on the stage. Without this a
      // part that had been broken down wore a fold-up chip that toggled a state nothing draws: the
      // parts had gone to a depth the stage does not place, so the press did nothing a reader could
      // see. Its parts are read in the rail instead, which is where buying one now takes them.
      const foldable = authored && partsOnStage;
      const waiting = pendingExpand === node.id;
      return (
        <>
          <ProvValue id={nodeValueId(node.id)} className="wo-num" />
          {/* What the reader's what-if did to this cause, IN WORDS. `relativeDeltaPhrase` cannot
              emit a digit by construction, which is the whole reason it is used here: the shift is
              computed from the world's own structure with nothing measuring it, so a percentage
              would be a figure this surface has no receipt for. */}
          {node.shift !== undefined && shiftChip(node.shift) !== null && (
            <span className="wo-shift" data-dir={node.shift < 1 ? 'down' : 'up'}>
              {shiftChip(node.shift)}
            </span>
          )}
          {(foldable || buyable) && (
            <button
              type="button"
              className="wo-expand"
              aria-expanded={open}
              aria-busy={waiting || undefined}
              disabled={waiting || (buyable && pendingExpand !== null)}
              aria-label={`${foldable && open ? 'Fold up' : 'Break down'} ${node.label}`}
              onClick={(e) => {
                e.stopPropagation(); // the card itself selects; the affordance only zooms
                if (foldable) toggleExpand(node.id);
                else buyExpansion(node.id);
              }}
            >
              {waiting ? 'breaking down…' : foldable && open ? 'fold up' : 'break down'}
            </button>
          )}
        </>
      );
    },
    [
      expandable,
      expandedIds,
      toggleExpand,
      onExpandNode,
      pendingExpand,
      buyExpansion,
      nodeById,
      rep,
    ],
  );

  // Flattened here rather than in the markup: the No Orphan Pixels gate reads this file's JSX, and
  // a figure that reaches the screen does so through ProvValue or through the what-if frame's own
  // honesty ladder — never as a number this component interpolated.
  const outcome = nodeById.get(spec.outcomeId);
  // The rail's inputs are memoized because this component re-renders on every camera frame — the
  // camera is its own state — while the rail beside the stage has nothing to do with panning.
  // Rebuilding these arrays each frame would defeat the rail's memo before it could help.
  const observed = useMemo(
    () => toReadout(baseline, baseline, outcome?.value, illustrative),
    [baseline, outcome?.value, illustrative],
  );
  const projected = useMemo(
    () => toReadout(current, baseline, outcome?.value, illustrative),
    [current, baseline, outcome?.value, illustrative],
  );

  // Structure, not claims: how big the web is and how much of it stands on a source. Counted over
  // the TOP level, which is what the reader is looking at — a breakdown is one cause's parts.
  const worldFacts = useMemo(
    () => ({
      causes: spec.nodes.length,
      links: spec.edges.length,
      sourced: spec.nodes.filter((n) => n.receipt !== undefined).length,
    }),
    [spec],
  );

  const selectedNode = selection?.kind === 'node' ? nodeById.get(selection.id) : undefined;
  // What the selected cause is MADE OF, drawn by the catalog's own choice. Compiled from the content
  // graph, so every part is sized by a figure the registry resolved — a part with none is left out
  // rather than drawn at zero, and a subject with fewer than two sizeable parts offers nothing.
  // The selected cause's parts by NAME — what the rail falls back to when the lens cannot size them.
  const namedParts = useMemo(
    () => (selectedNode === undefined ? [] : childrenOf(content, selectedNode.id)),
    [content, selectedNode],
  );

  // The lens plan and the component that draws it, both fetched on SELECTION.
  //
  // Neither may sit in the world's static import graph. content/lens reads the catalog's 608-row
  // facts index, and decoding it is ~200ms that landed in whichever task first touched the module —
  // measured as the FIRST morph costing 252ms against ~50ms for every morph after it. A reader who
  // never selects a cause should never pay for the catalog at all, and one who does pays it off the
  // critical path, while they are reading the cause they just clicked.
  const [parts, setParts] = useState<{
    plan: ViewPlan;
    render: (props: unknown, common: { delay?: number }) => ReactNode;
  } | null>(null);
  useEffect(() => {
    if (selectedNode === undefined) {
      setParts(null);
      return;
    }
    let live = true;
    void (async () => {
      const { hierarchyLens } = await import('../content/lens');
      if (!live) return;
      const plan = hierarchyLens.compile(content, selectedNode.id);
      if (plan === null) {
        setParts(null);
        return;
      }
      await loadFamilies(familiesFor([plan.block]));
      const render = extendedRender(plan.block.type);
      if (live && render) setParts({ plan, render });
    })();
    return () => {
      live = false;
    };
  }, [content, selectedNode]);

  const selectedEdge = selection?.kind === 'edge' ? edgeById.get(selection.id) : undefined;
  const leverRail: Lever[] = useMemo(
    () =>
      spec.nodes
        .filter((n) => n.role === 'root')
        .map((n) => ({
          id: n.id,
          label: readableLabel(n.label),
          pct: levers.get(n.id) ?? FULL_PCT,
        })),
    [spec.nodes, levers],
  );

  return (
    <TrustProvider registry={registry} onNavigate={onNavigate} ref={trust}>
      {/* Not a dialog: the provenance card is, and it renders as this section's SIBLING — declaring
          the surface aria-modal would hide the one thing a reader opened from assistive tech. */}
      <section className="wo-scrim" aria-label={`Living answer: ${spec.title}`}>
        <div className="wo-panel">
          <header className="wo-head">
            <div className="wo-title">
              <span className="wo-kicker">THE LIVING ANSWER</span>
              <h2>{spec.title}</h2>
            </div>
            <div className="wo-head-actions">
              <div className="wo-views" role="group" aria-label="View">
                {/* A representation this world cannot fill is not offered at all. Showing "Over
                    time" greyed on a world with nothing dated advertises a view whose entire
                    content would be the held-aside shelf — the chip's presence should promise
                    something to see. */}
                {REP_CHIPS.filter((chip) => offered(chip.rep)).map((chip) => (
                  <button
                    key={chip.rep}
                    type="button"
                    className="wo-chip"
                    aria-pressed={rep === chip.rep}
                    onClick={() => {
                      takeOver();
                      setRep(chip.rep);
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <button type="button" className="wo-btn" onClick={reset} disabled={!active}>
                Reset
              </button>
              {onClose && (
                <button
                  type="button"
                  className="wo-btn wo-btn-close"
                  onClick={onClose}
                  aria-label="Close"
                >
                  ✕
                </button>
              )}
            </div>
          </header>

          {illustrative && (
            <div className="wo-banner wo-banner-illustrative">
              Illustrative model — shows the shape, not your numbers.
            </div>
          )}

          <p className="wo-legend">{REP_LEGEND[rep]}</p>

          <div className="wo-body">
            <div
              className="wo-stage"
              onWheelCapture={dismissCard}
              onPointerDownCapture={dismissCard}
            >
              <MorphStage
                stage={stage}
                world={stageWorld}
                renderFace={renderFace}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                selectedId={selection?.kind === 'node' ? selection.id : undefined}
                litEdgeId={litEdgeId}
              />
              <WorldTransport
                count={beats.length}
                index={beatIndex}
                playing={playing}
                caption={caption}
                expanded={walkOpen}
                onToggle={toggle}
                onSeek={seek}
              />
            </div>

            <aside className="wo-rail">
              <LeverRail levers={leverRail} onSet={setLever} onReset={reset} />
              <WhatIfFrame
                baseline={observed}
                current={projected}
                unit={outcome?.unit}
                active={active}
                observedNote={illustrative ? ILLUSTRATIVE_BASE_NOTE : undefined}
              />

              <div className="wo-detail">
                <span className="wo-rail-kicker">EVIDENCE</span>
                {!selection && (
                  // The rail is a third of the surface and used to spend all of it, until something
                  // was clicked, on one sentence asking to be clicked. What a reader wants before
                  // they have picked anything is the shape of the thing they are looking at: how
                  // many causes it holds, how much of it is actually evidenced, and where it ends.
                  // (Counts, not claims — a magnitude still only reaches the screen via ProvValue.)
                  <div className="wo-standing">
                    <dl className="wo-facts">
                      <div>
                        <dt>Causes</dt>
                        <dd>{worldFacts.causes}</dd>
                      </div>
                      <div>
                        <dt>Links</dt>
                        <dd>{worldFacts.links}</dd>
                      </div>
                      <div>
                        <dt>{illustrative ? 'Illustrative' : 'With a source'}</dt>
                        <dd>{illustrative ? 'every cause' : worldFacts.sourced}</dd>
                      </div>
                    </dl>
                    {outcome && (
                      <p className="wo-standing-outcome">
                        <span className="wo-standing-lead">It ends at</span> {outcome.label}
                        {outcome.detail ? (
                          <span className="wo-standing-note">{outcome.detail}</span>
                        ) : null}
                      </p>
                    )}
                    {/* The finding, not the legend. A dozen unsourced links matter differently:
                        one is decoration on a cause the outcome reaches three other ways, another
                        is the only thing joining half the web to the thing being explained. Naming
                        the second — in PROSE, with a count of causes rather than any magnitude — is
                        what turns "some arrows are fainter" into something a reader can act on. */}
                    <p className="wo-hint">Tap a cause or a link to see what stands behind it.</p>
                  </div>
                )}
                {selectedNode && (
                  <>
                    <h3 className="wo-detail-title">{selectedNode.label}</h3>
                    {selectedNode.detail && <p className="wo-detail-note">{selectedNode.detail}</p>}
                    <p className="wo-detail-figure">
                      <ProvValue id={nodeValueId(selectedNode.id)} />
                    </p>
                    {selectedNode.series && (
                      <ul className="wo-series">
                        {selectedNode.series.points.map((p, i) => (
                          <li key={`${p.t}:${i}`}>
                            <span className="wo-series-t">{p.t}</span>
                            <ProvValue id={pointValueId(selectedNode.id, p.t)} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* WHAT IS THIS MADE OF — a question none of the causal views answers: they say
                        what led to what, and a cause's own composition is a different axis. Drawn by
                        whichever component the catalog picks for a hierarchy of this shape
                        (content/lens), so the world reads the parts through the library rather than
                        through more of its own geometry — and a component that draws a whole tree
                        natively is how depth past MAX_DRAWN_DEPTH becomes readable at all. */}
                    {(parts || namedParts.length > 0) && (
                      <div className="wo-parts">
                        <span className="wo-rail-kicker">WHAT THIS IS MADE OF</span>
                        {/* Drawn by the catalog's own choice where the parts carry magnitudes, and
                            NAMED where they do not. Most causal answers are wholly qualitative, and a
                            hierarchy component needs sizes — so without the list a reader who broke a
                            part down got a press that changed nothing they could see. A list of names
                            is the honest degrade: it is what the answer actually knows. */}
                        {parts ? (
                          parts.render(parts.plan.block.props, { delay: 0 })
                        ) : (
                          <ul className="wo-part-list">
                            {namedParts.map((e) => (
                              <li key={e.id}>{readableLabel(e.label)}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
                {selectedEdge && (
                  <EdgeEvidencePanel
                    relation={asEdgeRelation(selectedEdge.relation)}
                    sign={selectedEdge.sign}
                    status={selectedEdge.status ?? deriveEdgeStatus(selectedEdge)}
                    receipts={
                      selectedEdge.receipts ?? (selectedEdge.receipt ? [selectedEdge.receipt] : [])
                    }
                    counter={selectedEdge.counter}
                    provisional={selectedEdge.provisional}
                  />
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </TrustProvider>
  );
}
