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
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { drawableEdges, worldToMorph } from '../../canvas/spatial/morph/adapters';
import { MorphStage } from '../../canvas/spatial/morph/MorphStage';
import {
  firstRead,
  readingsOf,
  representationHolds,
  useMorphStage,
} from '../../canvas/spatial/morph/useMorphStage';
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
import { parseWorldTime } from './types';
import type { WorldNode, WorldSpec } from './types';
import { useWorldWalk } from './useWorldWalk';
import { nodeValueId, pointValueId } from './valueIds';
import { TRANSPORT_BAND, TRANSPORT_IDLE, WorldTransport } from './WorldTransport';
import { worldStory, type WorldBeat } from './worldStory';
import { atmosphereOf } from './atmosphere';
import { recallExpansions, rememberExpansions } from './openWorld';
import { sentenceCase } from '../../lib/sentenceCase';
import './world.css';
import { REP_TEXT } from '../../canvas/spatial/morph/vocabulary';

/** Why an illustrative world's observed column is a dash: not a gap in the evidence — there is no
 *  evidence to have a gap in. The frame's own wording would blame the grounding instead. */
/** A ceiling on the chip row, not a filter on it.
 *
 *  It is the number of representations that exist, deliberately: a view this world genuinely holds
 *  is a view worth reaching, and quietly dropping the least-filled one would hide a working picture
 *  behind nothing at all. Ranking decides the ORDER; this only stops the row growing without anyone
 *  noticing. `.wo-head-actions` wraps, so a sixth representation puts the header on a second row and
 *  takes that height off the stage — at which point this needs re-deciding rather than raising. */
const CHIP_CAP = 5;

/** The stage's id, so the view tabs can name the panel they control. */
const STAGE_ID = 'wo-stage';

/** Anything that answers Space itself, so the overlay's play/pause never fires on top of it. The
 *  ROLE arms matter as much as the tags: a cause card is a `div` carrying `role="button"`, so a
 *  selector of bare tag names let one press both open the cause and start the narrated walk. */
const INTERACTIVE =
  'button, input, select, textarea, [contenteditable="true"], [role="button"], [role="tab"], [role="slider"], [role="checkbox"], [role="switch"]';

const ILLUSTRATIVE_BASE_NOTE =
  'an illustrative living answer measures nothing, so there is no baseline';

/** A cause's own history as one path, in a fixed 100×20 box.
 *
 *  Not a chart and not trying to be: no axis, no ticks, no numbers, no scale a reader could read a
 *  value off. It replaces an abstract three-bar "this one has a history" glyph with the actual
 *  shape of that history, which is strictly more for the same pixels — and it is the one mark on a
 *  card that differs per NODE rather than per world.
 *
 *  Computed here, outside the JSX, which is what the no-orphan-pixels gate asks for: a figure may
 *  never be interpolated into the markup, and this emits geometry rather than a number.
 *
 *  A flat series draws a flat line rather than dividing by a zero range. */
function tracePath(points: ReadonlyArray<{ t: number; v: number }>): string | null {
  if (points.length < 2) return null;
  const lo = points.reduce((m, p) => Math.min(m, p.v), Infinity);
  const hi = points.reduce((m, p) => Math.max(m, p.v), -Infinity);
  const span = hi - lo;
  const last = points.length - 1;
  return points
    .map((p, i) => {
      const x = (i / last) * 100;
      const y = span === 0 ? 10 : 18 - ((p.v - lo) / span) * 16;
      return `${i === 0 ? 'M' : 'L'} ${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}

/** How many parts a cause has, wherever it sits in the tree. A count is a fact about the cause; it
 *  is what the card says where this view cannot draw the parts themselves. */
function childCount(nodes: readonly WorldNode[], id: string): number {
  return findChildren(nodes, id)?.length ?? 0;
}

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
  /** Start the narrated walk as soon as there is one to play. For the walkthrough, whose chapter is
   *  called "Walk the why" and whose coach line says it takes the reader cause by cause — a chapter
   *  that only OPENS the surface makes that line describe something the reader has to do themselves,
   *  which on a hands-off replay is a promise nothing keeps. */
  autoWalk?: boolean;
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
  autoWalk,
  speakLine,
}: WorldOverlayProps): ReactElement {
  if (spec)
    return (
      <WorldSurface
        spec={spec}
        view={view}
        onClose={onClose}
        onExpandNode={onExpandNode}
        autoWalk={autoWalk}
        speakLine={speakLine}
      />
    );
  return (
    <WorldShell
      title={question ? sentenceCase(question) : ''}
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
                aria-label="Back to the answer"
              >
                ← Back to the answer
              </button>
            </div>
          )}
        </header>
        <div className="wo-shell" role="status" aria-live="polite">
          {failed ? (
            <>
              <p className="wo-shell-line">This living answer didn’t come back.</p>
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
              {/* The horizon, not a spinner and not ghost CARDS: three ghosts would be a claim about
                  how many causes are coming, which the build is free to contradict. A strip promises
                  only what every world keeps — that this reads left to right — and it is the same
                  ground the built stage stands on. */}
              <div className="wo-shell-ground" aria-hidden="true" />
              <span className="wo-shell-pulse" aria-hidden="true" />
              <p className="wo-shell-line">Building your living answer…</p>
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
  autoWalk,
  speakLine,
}: {
  spec: WorldSpec;
  view?: Representation;
  onClose?: () => void;
  /** Buy a breakdown for one cause. Receives the world being SHOWN — the reader's own
   *  expansions are not in the answer's stored copy. */
  onExpandNode?: (nodeId: string, showing: WorldSpec) => Promise<WorldSpec | null>;
  /** Start the narrated walk as soon as there is one to play — see the outer prop. */
  autoWalk?: boolean;
  speakLine?: (text: string) => SpokenLine;
}): ReactElement {
  // Breakdowns bought during this viewing, kept HERE rather than written back onto the answer: the
  // world on the card is the record of what was asked and answered, and looking closer at one of
  // its causes does not change that. Derived rather than forked, so a follow-up that evolves the
  // standing world replaces `given` and the expansions still apply to whatever survived.
  // Seeded from what this reader has already bought for this world — see `recallExpansions`. Closing
  // the surface used to discard every purchased breakdown, so re-opening charged for it again.
  const [expansions, setExpansions] = useState<ReadonlyMap<string, readonly WorldNode[]>>(() =>
    recallExpansions(given.title),
  );
  useEffect(() => {
    rememberExpansions(given.title, expansions);
  }, [given.title, expansions]);
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
  // Every reading this world holds, best-filled first — the chip row's order, computed once.
  const readings = useMemo(() => readingsOf(morphWorld), [morphWorld]);
  // Every cause at the same evidence level? Then the tier chip is a badge repeated on every card
  // saying one thing, and the banner above the stage says it once instead.
  const uniformTier = useMemo(() => {
    const first = spec.nodes[0]?.tier;
    return first !== undefined && spec.nodes.every((n) => n.tier === first) ? '' : undefined;
  }, [spec]);

  // What this world is MADE OF, as light in the room — its two commonest spheres.
  const air = useMemo(() => atmosphereOf(morphWorld), [morphWorld]);
  const opening = view && offered(view) ? view : undefined;
  const stage = useMorphStage({
    world: morphWorld,
    // The transport floats over the foot of the stage, INSIDE the camera's own viewport, so the
    // camera has to be told to stay out of it or it fits the world's bottom row underneath the bar.
    // Only the caption's height is conditional: at rest the bar is its own controls and reserving
    // the full band cost every view a third of the stage.
    insetBottom: walkOpen ? TRANSPORT_BAND : TRANSPORT_IDLE,
    // A named follow-up wins; otherwise the world says how it is best met. `firstRead` reaches the
    // stage ONLY here, as the initial rep — never through the effect below. It is derived from the
    // world, so it changes when the reader buys a breakdown, and assigning it after mount would
    // snap them off the view they were reading.
    initialRep: opening ?? firstRead(morphWorld),
  });
  const { rep, setRep, expandedIds, toggleExpand, unfoldsOnStage } = stage;
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
  /** Every node's TOP-LEVEL ancestor — the id a what-if actually re-weights.
   *
   *  The cascade runs on the top-level web (`asWhyDag` flattens breakdowns out), so a part's strength
   *  is its cause's, and a part of a part's is still its cause's. One step up was enough only while
   *  the stage drew a single level: at depth two a node's `parentId` is an id the cascade has never
   *  heard of, so a lever visibly re-weighted a cause and its parts and left the grandchildren
   *  untouched. Guarded against a parent cycle in model output. */
  const topAncestorOf = useMemo(() => {
    const parentOf = new Map(morphWorld.nodes.map((n) => [n.id, n.parentId]));
    const top = new Map<string, string>();
    for (const n of morphWorld.nodes) {
      let cur = n.id;
      const seen = new Set<string>([cur]);
      let up = parentOf.get(cur);
      while (up !== undefined && !seen.has(up)) {
        seen.add(up);
        cur = up;
        up = parentOf.get(cur);
      }
      top.set(n.id, cur);
    }
    return top;
  }, [morphWorld]);

  const stageWorld = useMemo<WorldData>(() => {
    const nodes = morphWorld.nodes.map((n) => {
      const bare = withoutFigure(n);
      const shift = stagedShifts?.get(topAncestorOf.get(n.id) ?? n.id);
      // A label that paints nothing is a card with no name. Sanitised here, at the world's own edge,
      // rather than in the spatial renderer — "an unnamed cause" is this surface's wording.
      const label = readableLabel(n.label);
      return { ...bare, label, ...(shift === undefined ? {} : { shift }) };
    });
    return { ...morphWorld, nodes };
  }, [morphWorld, stagedShifts, topAncestorOf]);

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
  // their own key can replay it as often as they like. It ends by re-reading the same causes another
  // way, and WHICH way is the world's answer rather than this file's: the best-filled reading that
  // is neither the causal web nor the view already showing. Hard-coding the timeline made every walk
  // in the corpus end identically — the same-every-time complaint, inside the one feature built to
  // make a world feel told.
  const [litEdgeId, setLitEdgeId] = useState<string | undefined>(undefined);
  // Keyed on the WORLD, not on the view showing: the script is rebuilt whenever this changes, and
  // that rebuild is the heaviest thing on the surface — it must not run on every chip press.
  const closeOn: Representation | undefined = readings.find((r) => r !== 'graph');
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

  // The walkthrough asks for the walk to start itself. Once only, and only once there are beats to
  // play — the story is composed from the spec, so on a world the reader opened it exists a tick
  // after the spec lands. A reader who presses anything takes it back: `toggle` is the same control
  // the transport uses, so their next press pauses rather than fighting a second player.
  const walkStarted = useRef(false);
  useEffect(() => {
    // Not on a reader who asked for less motion. Under `reduce` the world has no transition, so
    // each beat's camera flight lands as a hard cut — and a surface that starts cutting on its own,
    // unasked, is the thing that preference exists to prevent. The transport still offers play, and
    // a reader who presses it has consented.
    const still =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !autoWalk || walkStarted.current || beats.length === 0) return;
    walkStarted.current = true;
    toggle();
  }, [autoWalk, beats.length, toggle]);
  // The reader's own hand always wins. Any direct manipulation ends the walk where it stands rather
  // than fighting it for the camera — and the lit link goes with it, since nothing is being said
  // about it any more.
  // Has the reader done anything at all yet? While nothing has been touched the walk leads, because
  // it is the best first move on this surface and was its quietest control. Any interaction settles
  // it for good — an invitation that keeps re-appearing is nagging, not helping.
  const [untouched, setUntouched] = useState(true);
  const settleInvite = useCallback(() => setUntouched(false), []);

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
      if (el?.closest(INTERACTIVE)) return;
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
      // Back on, after takeOver cleared the walk's own lit link: `data-lit` is the only marker an
      // edge has, and a receipt in the rail beside fifteen identical ribbons says nothing about
      // which one it belongs to.
      setLitEdgeId(edgeId);
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
          if (unfoldsOnStage(nodeId)) toggleExpand(nodeId);
          else setSelection({ kind: 'node', id: nodeId });
        },
        () => setPendingExpand(null),
      );
    },
    [onExpandNode, unfoldsOnStage, pendingExpand, spec, toggleExpand],
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
      // Asked of the SPEC, not of what is drawn. Whether a cause has parts is a fact about the
      // world; the stage's own set only knows the nodes it adapted, so a cause whose parts sit past
      // the drawable depth looked partless — and was offered a break-down it had already bought.
      const parts = childCount(spec.nodes, node.id);
      const authored = parts > 0;
      // WHEN it happened, on the card too — not only on the timeline. It is the highest-variance
      // thing a qualitative cause carries after its name, and every world the builder can date has
      // one. Verbatim, in the author's own wording: re-formatting an instant is how a year becomes
      // a wrong month. It reuses `.wo-when` including its honesty split, so a reader who learns the
      // register on one view can trust it on the other — upright where a source put the node there,
      // italic and quieter where only the model's own sense of it did.
      //
      // A period prints as its range; an instant as itself. At 11.5px it clears the foot's 24px hit
      // floor, so the measured CARD_H_MAX of 86 is untouched — anything taller here, or a second
      // foot line, needs re-measuring in a browser rather than re-deriving on paper.
      const trace = tracePath(node.series ?? []);
      // Only where the label is actually a TIME. `parseWorldTime` is the one definition of that the
      // gate and the layouts share, and the card has to share it too: a label it cannot read is a
      // label the timeline refuses to place, and printed here — in the slot a figure occupies — a
      // raw "-100000" reads as a broken number rather than as a year.
      const source = nodeById.get(node.id);
      // …but only where the card is not already carrying a FIGURE. The foot is one row inside a
      // 200-unit card and it already holds a sphere dot, whatever the host adds, and the tier chip;
      // a figure AND a date together overflowed it, pushing the tier badge clean outside the card.
      // The figure wins where there is one — it is the more load-bearing of the two — and a cause
      // with no number says when it happened instead. One fact, one slot, always inside the card.
      const when = source?.value === undefined ? source?.date : undefined;
      const whenText =
        when === undefined || parseWorldTime(when.t) === null
          ? null
          : when.until !== undefined && parseWorldTime(when.until) !== null
            ? `${when.t}–${when.until}`
            : when.t;
      // Will the press MOVE THE MAP? The one question, asked once, of the layout — never of the
      // node's own shape. This used to be asked three different ways in three places, which is how
      // a broken-down part came to wear a chip that toggled a state nothing drew.
      const foldable = authored && unfoldsOnStage(node.id);
      // A cause with no breakdown yet can be opened WHEREVER it sits — a part is a thing with parts,
      // and cell → cathode → material is an ordinary question. Only where a host can pay for one:
      // offering it in the key-free lab would be an affordance that answers with nothing. And never
      // twice: a cause that already HAS parts is not buyable again, wherever those parts are drawn.
      // Without that, a part whose breakdown this view could not show wore "break down" for ever and
      // every press after the first was a dead end — the host refuses to re-expand a cause that has
      // children, and the caller bailed on the null without so much as selecting it.
      const buyable = !authored && onExpandNode !== undefined;
      const waiting = pendingExpand === node.id;
      // The parts exist and this view cannot draw them. Say so as a COUNT — a fact about the cause,
      // which is information — rather than as a second control in the same register as "break down".
      // Pressing the card already opens them in the rail.
      const partCount = authored && !foldable ? parts : 0;
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
          {trace !== null && (
            <svg
              className="wo-trace"
              viewBox="0 0 100 20"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={trace} fill="none" />
            </svg>
          )}
          {whenText !== null && (
            <span className="wo-when" data-said={node.dateGrounded ? '' : undefined}>
              {whenText}
            </span>
          )}
          {partCount > 0 && (
            <span className="wo-parts-count">{`${partCount} part${partCount === 1 ? '' : 's'}`}</span>
          )}
          {(foldable || buyable) && (
            <button
              type="button"
              className="wo-expand"
              /* A disclosure only where something actually discloses. `aria-expanded={false}` on a
                 control that can never become expanded is a lie to a screen reader. */
              aria-expanded={foldable ? open : undefined}
              aria-busy={waiting || undefined}
              disabled={waiting || (buyable && pendingExpand !== null)}
              aria-label={`${foldable && open ? 'Close' : 'Break down'} ${node.label}`}
              onClick={(e) => {
                e.stopPropagation(); // the card itself selects; the affordance only zooms
                if (foldable) toggleExpand(node.id);
                else buyExpansion(node.id);
              }}
            >
              {/* "close", not "fold up": folding is the system's word for it, and the reader was
                  never told the parts were folded — they were simply not there. */}
              {waiting ? 'breaking down…' : foldable && open ? 'close' : 'break down'}
            </button>
          )}
        </>
      );
    },
    [
      unfoldsOnStage,
      spec,
      nodeById,
      expandedIds,
      toggleExpand,
      onExpandNode,
      pendingExpand,
      buyExpansion,
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
  // the TOP level, which is what the reader is looking at — a breakdown is one cause's parts. The
  // outcome is what the causes explain, not one of them: counting it made this panel say twelve
  // while the walk narrating the same world said eleven, four lines apart on the same screen.
  const worldFacts = useMemo(() => {
    const causes = spec.nodes.filter((n) => n.id !== spec.outcomeId);
    return {
      causes: causes.length,
      links: spec.edges.length,
      sourced: causes.filter((n) => n.receipt !== undefined).length,
    };
  }, [spec]);

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
  // Neither may sit in the world's static import graph. content/lens reads the catalog's 625-row
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
      <section
        className="wo-scrim"
        aria-label={`Living answer: ${sentenceCase(spec.title)}`}
        onPointerDownCapture={settleInvite}
        onKeyDownCapture={settleInvite}
      >
        <div className="wo-panel">
          <header className="wo-head">
            <div className="wo-title">
              <span className="wo-kicker">THE LIVING ANSWER</span>
              <h2>{sentenceCase(spec.title)}</h2>
            </div>
            <div className="wo-head-actions">
              {/* Ranked, not merely filtered. A view that holds most of this world is the one worth
                  offering first, and it is also the one least likely to disappoint — the shelf
                  band's own count, read from the other end. The causal web sorts first without being
                  pinned there, being the only view that places everything.

                  A representation this world cannot fill is not offered at all: showing "Over time"
                  greyed on a world with nothing dated advertises a view whose entire content would
                  be the held-aside shelf. The chip's presence is a promise there is something to
                  see, so it is also refused where the picture would be empty — a timeline whose
                  causes all fall on one afternoon places every node and still says nothing. */}
              {readings.length === 1 ? (
                /* One reading is not a choice. A lone chip carrying a selected state is a control
                   that cannot do anything, which teaches the reader the whole row is decoration —
                   so the surface names the view instead of pretending to offer a switch. */
                <span className="wo-chip wo-chip-sole">{REP_TEXT[readings[0]].chip}</span>
              ) : (
                // A TABLIST, not a row of switches: exactly one of these can be on, and a group of
                // four independent pressed-states said the opposite while also making the row four
                // tab stops. One stop, arrows to change view, and the stage below is its panel.
                <div className="wo-views" role="tablist" aria-label="View">
                  {readings.slice(0, CHIP_CAP).map((candidate, i, shown) => (
                    <button
                      key={candidate}
                      type="button"
                      id={`wo-tab-${candidate}`}
                      className="wo-chip"
                      role="tab"
                      aria-selected={rep === candidate}
                      aria-controls={STAGE_ID}
                      tabIndex={rep === candidate ? 0 : -1}
                      onKeyDown={(e) => {
                        const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                        if (delta === 0) return;
                        e.preventDefault();
                        const next = shown[(i + delta + shown.length) % shown.length];
                        takeOver();
                        setRep(next);
                        document.getElementById(`wo-tab-${next}`)?.focus();
                      }}
                      onClick={() => {
                        takeOver();
                        setRep(candidate);
                      }}
                    >
                      {REP_TEXT[candidate].chip}
                    </button>
                  ))}
                </div>
              )}
              {/* Says what it resets. Sitting unqualified at the end of the view tabs it read as
                  the VIEW's reset, and a reader who had just changed the view found it greyed. */}
              <button
                type="button"
                className="wo-btn"
                onClick={reset}
                disabled={!active}
                aria-label="Reset the what-if levers"
                title="Reset the what-if levers"
              >
                Reset
              </button>
              {onClose && (
                <button
                  type="button"
                  className="wo-btn wo-btn-close"
                  onClick={onClose}
                  aria-label="Back to the answer"
                >
                  ← Back to the answer
                </button>
              )}
            </div>
          </header>

          {illustrative && (
            <div className="wo-banner wo-banner-illustrative">
              Illustrative model — shows the shape, not your numbers.
            </div>
          )}

          {/* Announced, not merely printed. Pressing a chip rearranged the entire stage in complete
              silence for a screen-reader user — the largest orientation gap on this surface, and one
              attribute wide. The view's NAME leads, so the announcement says what happened before it
              explains what the geometry means. */}
          <p className="wo-legend" aria-live="polite">
            <span className="wo-legend-view">{REP_TEXT[rep].caption}.</span> {REP_TEXT[rep].legend}
          </p>

          <div className="wo-body">
            <div
              className="wo-stage"
              id={STAGE_ID}
              role={readings.length > 1 ? 'tabpanel' : undefined}
              aria-labelledby={readings.length > 1 ? `wo-tab-${rep}` : undefined}
              data-uniform-tier={uniformTier}
              data-illustrative={illustrative ? '' : undefined}
              onWheelCapture={dismissCard}
              onPointerDownCapture={dismissCard}
              style={
                air === null
                  ? undefined
                  : ({ '--wo-air-1': air.air1, '--wo-air-2': air.air2 } as CSSProperties)
              }
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
                inviting={untouched}
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
                {/* The kicker names what is under it, so it only appears once something is
                    selected — over the standing panel it headed an invitation and three counts,
                    none of which is evidence. */}
                <span className="wo-rail-kicker">{selection ? 'EVIDENCE' : 'THIS WORLD'}</span>
                {!selection && (
                  // The rail is a third of the surface and used to spend all of it, until something
                  // was clicked, on one sentence asking to be clicked. What a reader wants before
                  // they have picked anything is the shape of the thing they are looking at: how
                  // many causes it holds, how much of it is actually evidenced, and where it ends.
                  // (Counts, not claims — a magnitude still only reaches the screen via ProvValue.)
                  <div className="wo-standing">
                    {/* What to DO leads; the counts follow. They used to be reversed, which put the
                        only sentence telling a reader what this surface is for at the bottom of the
                        rail in the faintest ink on screen — under three numbers that are orientation
                        rather than an invitation. */}
                    <p className="wo-invite">
                      Press <strong>Walk me through it</strong> and Mavéa takes you cause by cause —
                      free, and as often as you like.
                    </p>
                    <p className="wo-hint">
                      Or tap any cause or link to see what stands behind it.
                    </p>
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
                    {/* What the levers are for. They rendered as a row of unexplained sliders,
                        and the frame below them only said anything once one had been pulled — so
                        the surface's most interesting control was also its most mysterious. Prose,
                        and digit-free: the shift is computed from the world's own structure with
                        nothing measuring it. */}
                    <p className="wo-hint">
                      Turn a root cause down and the rest of the web re-weights — nothing is
                      re-computed by a model, and no projected number is invented.
                    </p>
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
