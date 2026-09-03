import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Block, ConversationSpec } from '../../data/conversation';
import { answerSignature } from '../../data/conversation';
import { Icon } from '../../icons/icons';
import { BlockBoundary } from '../BlockBoundary';
import { FallbackCard } from '../FallbackCard';
import { blockLabel } from '../blockLabel';
import { condenseForNote } from '../../live/annotate/marginNote';
import { deriveStudyScene, deskObjects } from './scene';
import {
  BACK_SLOTS,
  CARD_W,
  CONNECT_SLOT,
  FRONT_SLOT,
  SLOT_ORDER,
  WIDE_CARD_W,
  WIDE_CONNECT_SLOT,
  WIDE_FRONT_SLOT,
} from './slots';
import type { StudyAside, StudyNoteKind } from './types';
import {
  PEN_MARK_MAX,
  PEN_SLOTS,
  RIGHT_GUTTER_SLOTS,
  type PenMark,
  type PenSlot,
} from '../../live/content/penQuip';
import { fitVoiceLine } from './voiceFit';
import { useStudyScale } from './useStudyScale';
import { useAmbientPause } from '../../hooks/useInView';
import { useTruncatedTextDisclosures } from '../hooks/useTruncatedTextDisclosures';
import { useFullscreen } from '../../lib/useFullscreen';
import '../layout/textDisclosure.css';
import './study.css';

/** The reader's motion preference, live. It used to be read once per render with nothing
 *  listening, so turning "reduce motion" on mid-session left the gate and the fan-out running
 *  until something else happened to re-render the desk. Module-scope so every desk shares one
 *  listener, and it degrades to "motion is fine" where matchMedia does not exist (tests, SSR). */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const INTRO_MS = 3400;
const INTRO_MAX_MS = 12_000;
let reducedMotionQuery: MediaQueryList | null = null;

function motionQuery(): MediaQueryList | null {
  if (typeof matchMedia !== 'function') return null;
  return (reducedMotionQuery ??= matchMedia(REDUCED_MOTION));
}

function readReducedMotion(): boolean {
  return motionQuery()?.matches ?? false;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = motionQuery();
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function noReducedMotion(): boolean {
  return false;
}

interface Props {
  data: ConversationSpec;
  blocks: Block[];
  spot: string | null;
  renderBlock: (block: Block, depth?: number) => ReactNode;
  onAskBlock?: (block: Block) => void;
  /** What Mavéa has written about each object, keyed by block id. The SET is stable for an answer
   *  — what changes as the study re-casts is only which note is on the desk, which is a key swap
   *  on the note card alone, so nothing else tears down as the desk moves. */
  asides?: Readonly<Record<string, readonly StudyAside[]>>;
  /** Blocks whose current aside set includes model-authored notes. */
  asidesAuthored?: ReadonlySet<string>;
  selectedBlockIds?: ReadonlySet<string>;
  onNarrate?: (block: Block) => void;
  narratingId?: string | null;
  muted?: boolean;
  /** Flips the app's voice. Offered on the beat bar because the guide speaks from here and, in
   *  full screen, the dock's own switch is off the screen. */
  onToggleMute?: () => void;
  /** The walk's written asides for this turn, in walk order — each stop's spoken line condensed
   *  to a handwritten note. The one about the object on the desk is written beside it (the
   *  mockup's margin quip); all of them collect in the session-notes crib. */
  walkNotes?: readonly { spot: string; text: string }[];
  /** The line the voice is on right now (the walk caption, else the opener) — typed into the
   *  desk's voice bubble. */
  voiceLine?: string | null;
  /** Whether Mavéa is audibly speaking — runs the bubble's equalizer and caret. */
  speaking?: boolean;
  /** The answer's lead line, spoken by the intro overlay's speech card. */
  lead?: string;
  /** 'full' plays the per-answer intro (THE ANSWER → the desk assembles); 'skip' — the default,
   *  and what the tour passes — opens straight onto the settled desk. */
  intro?: 'full' | 'skip';
  /** The turn is still streaming blocks in. The desk shows the answer's FIRST card the moment it
   *  exists and then holds still — arc and beat bar frozen — dealing the complete cast once when
   *  the stream settles. Watching the arc reshuffle and the beat bar grow for every arriving
   *  card read as the desk re-rendering over and over. */
  streaming?: boolean;
  /** Reducer-owned identity that stays fixed while one answer streams. */
  answerEpoch?: number;
}

/** The arrow each scrawl points with, in its own 90×70 frame — the design's own curves: the
 *  left mark reaches right into the card, the bottom one sweeps up into it, the top one comes
 *  down over its shoulder. */
const MARK_ARROWS: Record<PenSlot, { line: string; head: string }> = {
  // Each head is DERIVED from the curve it ends: two barbs 24° either side of the direction the
  // line actually arrives from, 13 units long. Hand-picked endpoints put barbs on the wrong
  // side of the tip, which is what made these read as bent pipes rather than arrows.
  left: { line: 'M6,10 C34,16 58,26 78,36', head: 'M78,36 L70,26 M78,36 L65,35' },
  bottom: { line: 'M12,58 C40,50 64,34 80,12', head: 'M80,12 L69,18 M80,12 L77,25' },
  top: { line: 'M78,8 C60,22 40,38 14,52', head: 'M14,52 L27,51 M14,52 L22,42' },
  right: { line: 'M84,34 C60,30 38,24 12,18', head: 'M12,18 L25,16 M12,18 L22,26' },
  rightlow: { line: 'M84,50 C60,44 38,32 12,18', head: 'M12,18 L25,17 M12,18 L21,27' },
};

/** The pause between one object's line ending and the next taking the desk. Long enough to let
 *  a card settle and be read, short enough that the walk still feels like it is going
 *  somewhere. The guide is paced by the VOICE, not by a clock — this is only the air between. */
const GUIDE_GAP_MS = 2600;

/** Whether the intro gate has played this session, surviving remounts. v3's rule: the overlay
 *  is a first-arrival beat — later answers (and Study → Focus → Study flips) skip the gate and
 *  simply reassemble in place. Session-local by design. */
let introPlayed = false;

/** The kicker Mavéa's note wears, in the desk's own vocabulary. */
const NOTE_LABELS: Record<StudyNoteKind, string> = {
  insight: 'Pattern',
  evidence: 'Evidence check',
  caution: 'Assumption',
  question: 'Pressure-test',
  takeaway: 'Decision cue',
};

const NOTE_GLYPHS: Record<StudyNoteKind, string> = {
  insight: '◈',
  evidence: '✓',
  caution: '△',
  question: '?',
  takeaway: '◆',
};

/** A slot, spoken as CSS. Position and transform live in the desk's own 1440×740 space, so the
 *  outer scale never enters the arithmetic and a promotion is a pure CSS transition. */
function slotStyle(
  slot: { x: number; y: number; z: number; ry: number; s: number },
  order: number,
): CSSProperties {
  return {
    '--sx': `${slot.x}px`,
    '--sy': `${slot.y}px`,
    '--sz': `${slot.z}px`,
    '--sry': `${slot.ry}deg`,
    '--ss': slot.s,
    '--sd': `${order * 55}ms`,
  } as CSSProperties;
}

export function StudyStage({
  data,
  blocks,
  spot,
  renderBlock,
  onAskBlock,
  asides,
  asidesAuthored,
  selectedBlockIds,
  onNarrate,
  narratingId,
  muted,
  onToggleMute,
  walkNotes,
  voiceLine,
  speaking,
  lead,
  intro = 'skip',
  streaming,
  answerEpoch,
}: Props) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [cribOpen, setCribOpen] = useState(false);
  // Which of the active object's notes is face-up, and which object those pages belong to. The
  // pair is one piece of state on purpose: reset in an effect, the first paint after the desk
  // moved still used the previous object's page — a note of the wrong kind for one frame, and the
  // note card remounted twice for every beat.
  const [notePage, setNotePage] = useState<{ spot: string | null; page: number }>({
    spot: null,
    page: 0,
  });
  // Set when the reader pressed a pager chip, so focus can follow the note card's remount.
  const pagedByHand = useRef(false);
  const noteNavRef = useRef<HTMLSpanElement | null>(null);
  // "Guide me": the desk walks itself, one object every GUIDE_MS. It never talks over the
  // voice (a tick while Mavéa is speaking simply waits), never fights the reader (any manual
  // pick stops it), and stops itself at the last object rather than looping forever.
  const [guiding, setGuiding] = useState(false);
  // True for the first step after pressing play, so it fires immediately instead of waiting.
  const guideStartRef = useRef(false);
  const [visitedIds, setVisitedIds] = useState<readonly string[]>(() => {
    const seen: string[] = [];
    for (const note of walkNotes ?? []) if (!seen.includes(note.spot)) seen.push(note.spot);
    return seen;
  });
  // Whether this mount is still behind the intro gate. The overlay shows until the reader
  // clicks (or the 3.4s auto-enter lands); entering releases the gathered cards to fan out.
  const [entered, setEntered] = useState(introPlayed);
  // The assembly window: cards carry their fan-out stagger ONLY while it is open, so a later
  // promotion or re-cast responds instantly instead of waiting out the entrance delays.
  const [assembling, setAssembling] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);
  const beatsRowRef = useRef<HTMLDivElement | null>(null);

  // Live supplies an epoch that stays fixed as partial blocks arrive. Gallery and isolated test
  // mounts fall back to a bounded content digest because they do not own turn state.
  const answerKey = useMemo(
    () => answerEpoch ?? answerSignature({ id: data.id, blocks: deskObjects(data.blocks) }),
    [answerEpoch, data.id, data.blocks],
  );

  // A NEW answer clears the desk's per-answer state. The first run is not a new answer — it is
  // this mount's own answer, whose state the initializers above already hold — and clearing there
  // threw away the visited spine seeded from the walk's notes: a reader who flipped to Everything
  // and back landed on an empty session-notes pad in the middle of the same answer.
  const clearedFor = useRef(answerKey);
  useEffect(() => {
    if (clearedFor.current === answerKey) return;
    clearedFor.current = answerKey;
    setPinnedId(null);
    setCribOpen(false);
    setVisitedIds([]);
    setGuiding(false);
  }, [answerKey]);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    noReducedMotion,
  );
  const gathered = intro === 'full' && !reducedMotion && !entered;
  const enter = useCallback(() => {
    introPlayed = true;
    setEntered(true);
    setAssembling(true);
  }, []);

  // The assembly stagger outlives the fan-out just long enough to cover the last slot's delay.
  useEffect(() => {
    if (!assembling) return;
    const timer = window.setTimeout(() => setAssembling(false), 1500);
    return () => window.clearTimeout(timer);
  }, [assembling]);

  const introStartedAt = useRef<number | null>(null);
  // Keep the first answer covered until its full cast is ready. The absolute cap still lets a
  // reader through if a provider wedges without settling the turn.
  useEffect(() => {
    if (!gathered) {
      introStartedAt.current = null;
      return;
    }
    const started = (introStartedAt.current ??= Date.now());
    const elapsed = Date.now() - started;
    const target = streaming ? INTRO_MAX_MS : INTRO_MS;
    const timer = window.setTimeout(enter, Math.max(0, target - elapsed));
    return () => window.clearTimeout(timer);
  }, [gathered, enter, streaming]);

  // The desk holds things to LOOK at. A world preview is a doorway to another surface, not an
  // object to examine — on the desk it takes a slot, a beat and a set of notes to say only
  // "there is more elsewhere". It stays on the grid, where a doorway belongs.
  const liveBlocks = useMemo(() => deskObjects(blocks), [blocks]);
  // While the turn streams, the desk composes from the last SETTLED set plus the newest card —
  // the reader gets the answer's first object immediately and a still desk behind it, then one
  // re-deal with the full cast when the stream ends.
  //
  // Identity is id:type, never id alone. A live spec's id is the constant 'live' and a REPLACE
  // answer restarts its block ids at live-1 — compared by id only, the new answer's first card
  // collided with the old answer's and the desk held the PREVIOUS answer's cards for the whole
  // stream. A broken prefix (same position, different type) is a new answer: the settled set is
  // dropped on the spot and the new cast takes the desk.
  const blockSig = (block: Block): string => `${block.id ?? ''}:${block.type}`;
  // Held as STATE, not written to a ref during render. A render-body ref write commits from a
  // pass React is free to discard, and this value decides WHICH ANSWER the desk is showing —
  // the most expensive thing in here to get wrong. React's documented adjust-during-render
  // pattern instead: set it, and React re-runs this component with the new value before it
  // commits anything, throwing the in-flight output away.
  const [settledState, setSettledState] = useState<{ answer: string | number; blocks: Block[] }>(
    () => ({
      answer: answerKey,
      blocks: liveBlocks,
    }),
  );
  const settled = settledState.blocks;
  // A follow-UP appends to the settled cast, so its list can only ever GROW. A list that shrank
  // is therefore a new answer — which is the case the type comparison below cannot see, because
  // early in a stream only index 0 exists and the prompt pushes an answer card first, so the new
  // answer's opener routinely matches the old one's id:type exactly.
  const shrank = streaming && liveBlocks.length > 0 && liveBlocks.length < settled.length;
  const replaced =
    shrank ||
    (streaming &&
      liveBlocks.length > 0 &&
      settled.length > 0 &&
      liveBlocks.some((block, i) => {
        const prior = settled[i];
        return !!prior && blockSig(prior) !== blockSig(block);
      }));
  if (settledState.answer !== answerKey) {
    setSettledState({ answer: answerKey, blocks: liveBlocks });
  } else if ((!streaming || replaced) && settled !== liveBlocks) {
    setSettledState({ answer: answerKey, blocks: liveBlocks });
  }
  const deskBlocks = useMemo(() => {
    if (!streaming) return liveBlocks;
    // LOAD ALL, THEN SHOW (user-directed): a follow-up streams behind the settled desk, which
    // holds completely still — no per-card churn, no half-built arc — and the full new cast
    // deals once at settle. The composer's own "Composing your answer" pill carries the
    // progress. Two exceptions keep it honest: a REPLACE switches to the new answer's first
    // card immediately (holding a different question's cards under a new title was the
    // original stale-desk bug), and a FIRST answer shows its first card rather than an empty
    // room (settled is empty — there is nothing to hold).
    if (settled.length > 0) return settled;
    const first = liveBlocks.find((block) => block.id);
    return first ? [first] : settled;
  }, [streaming, liveBlocks, settled]);

  // A follow-UP answers IN PLACE: continuity 'augment' keeps the spec id and appends blocks, so
  // none of the data.id resets above fire — and the desk sat on the previous answer's card, with
  // its old beat lit, while the title bar already named the new one. Stale content on a surface
  // whose whole premise is "the thing we are talking about is on the desk" reads as the app
  // ignoring the question.
  //
  // When new blocks land in an existing answer, RECAST the desk to the first new one. A recast
  // is deliberately weaker than a pin: a pin is the reader's own hand and holds against the
  // walk, while the recast only bridges the gap until the walk's narration next moves the spot —
  // then the walk has the wheel exactly as it always did. Session notes survive: it is the same
  // session, and the crib is its running spine.
  const [recastId, setRecastId] = useState<string | null>(null);
  const recastIdRef = useRef<string | null>(null);
  const spotAtRecast = useRef<string | null>(null);
  const dealtCastRef = useRef<{ answer: string | number; ids: string[] } | null>(null);
  const pendingRedealRef = useRef(false);
  const pendingFirstDealRef = useRef(false);
  useEffect(() => {
    const ids = deskBlocks.map((block) => `${block.id ?? ''}:${block.type}`);
    const previous = dealtCastRef.current;
    dealtCastRef.current = { answer: answerKey, ids };
    const firstCast = previous === null;
    const replaced =
      !!previous &&
      (previous.answer !== answerKey ||
        ids.length < previous.ids.length ||
        ids.some((id, index) => previous.ids[index] !== undefined && previous.ids[index] !== id));

    if (streaming) {
      if (firstCast) {
        pendingFirstDealRef.current = true;
      } else if (replaced) {
        pendingRedealRef.current = true;
        const id = deskBlocks[0]?.id ?? null;
        recastIdRef.current = id;
        setRecastId(id);
        spotAtRecast.current = spot;
      }
      return;
    }

    const settledReplacement = pendingRedealRef.current;
    pendingRedealRef.current = false;
    const settledFirstDeal = pendingFirstDealRef.current;
    pendingFirstDealRef.current = false;
    const before = new Set(previous?.ids ?? []);
    const fresh =
      previous && !settledFirstDeal
        ? deskBlocks.find((block) => block.id && !before.has(`${block.id}:${block.type}`))
        : undefined;
    const shouldRecast = replaced || settledReplacement || !!fresh;
    if (shouldRecast) {
      const id = replaced || settledReplacement ? (deskBlocks[0]?.id ?? null) : (fresh?.id ?? null);
      if (!(recastIdRef.current !== null && spot === spotAtRecast.current && !settledReplacement)) {
        recastIdRef.current = id;
        setRecastId(id);
        spotAtRecast.current = spot;
      }
    }

    // Arrival aligns a new answer once; an in-place augment never moves the reading column.
    let scrollFrame = 0;
    if (firstCast || replaced || settledReplacement || settledFirstDeal) {
      scrollFrame = requestAnimationFrame(() => {
        const stage = stageRef.current;
        stage?.scrollIntoView?.({
          block: stage.hasAttribute('data-compact') ? 'start' : 'end',
          behavior: 'auto',
        });
      });
    }

    if (!shouldRecast || reducedMotion || gathered) {
      return () => cancelAnimationFrame(scrollFrame);
    }
    // The dealt cast owns the single re-deal animation. Partial casts never touch this attribute.
    const stage = stageRef.current;
    if (!stage) return () => cancelAnimationFrame(scrollFrame);
    stage.setAttribute('data-gathered', '');
    setAssembling(true);
    let releaseFrame = 0;
    const gatherFrame = requestAnimationFrame(() => {
      releaseFrame = requestAnimationFrame(() => stage.removeAttribute('data-gathered'));
    });
    return () => {
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(gatherFrame);
      cancelAnimationFrame(releaseFrame);
      stage.removeAttribute('data-gathered');
    };
  }, [answerKey, deskBlocks, gathered, reducedMotion, spot, streaming]);
  // The walk moving on is the recast's end: the voice is now talking about a different object,
  // and the desk follows the voice.
  useEffect(() => {
    if (recastId && spot !== spotAtRecast.current) {
      recastIdRef.current = null;
      setRecastId(null);
    }
  }, [spot, recastId]);
  const eligibleIds = useMemo(
    () => new Set(deskBlocks.flatMap((block) => (block.id ? [block.id] : []))),
    [deskBlocks],
  );
  const activeId =
    (recastId && eligibleIds.has(recastId) ? recastId : null) ??
    (pinnedId && eligibleIds.has(pinnedId) ? pinnedId : null) ??
    spot;
  const scene = useMemo(
    () => deriveStudyScene(deskBlocks, activeId, selectedBlockIds),
    [deskBlocks, activeId, selectedBlockIds],
  );

  // Scoped to the stage element, so filling the screen gives the screen to the STUDY — not to the
  // app around it. The control and its target live together rather than being plumbed through
  // two components that would both have to be told which element they meant.
  const fullscreen = useFullscreen();
  // Re-fit on a re-cast as well as a resize: the fit reserves the handwritten takeaway's
  // measured band, and the sentence changes with the object on the desk. Filling the screen is
  // also a re-fit — the stage leaves the reading column for the viewport, and nothing the
  // observer watches changes size when it does.
  useStudyScale(stageRef, `${data.id}:${scene.active?.id ?? ''}:${fullscreen.active}`);
  // Truncation without a way back to the words is just lost text. The canvas grid gets this
  // treatment already; the desk renders its cards outside that grid, so it asks for its own —
  // re-scanned whenever the desk re-casts, since the object on it changes.
  useTruncatedTextDisclosures(stageRef, `${data.id}:${scene.active?.id ?? ''}`);

  // A block taller than the front slot scrolls INSIDE the card — the honest behavior (the
  // legibility floor forbids shrinking it, and the desk's height is spoken for) — but a scroll
  // nobody can see is indistinguishable from a card that ends there: the Roman timeline's last
  // event sat half-hidden with nothing saying so. Measure the face and flag it; CSS paints a
  // fade + chevron at the clipped edge, and the flag clears the moment the reader reaches the
  // bottom. One rAF after each cast change: layout must have run for scrollHeight to be real.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const face = stage.querySelector<HTMLElement>('.study-card.is-front .study-card-face');
    if (!face) return;
    const judge = (): void => {
      const more = face.scrollHeight - face.clientHeight - face.scrollTop > 8;
      face.toggleAttribute('data-more-below', more);
    };
    let scrollTimer = 0;
    const onScroll = (): void => {
      judge();
      face.setAttribute('data-scrolling', '');
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => face.removeAttribute('data-scrolling'), 650);
    };
    const frame = requestAnimationFrame(judge);
    face.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(judge) : null;
    ro?.observe(face);
    // A ResizeObserver on the SCROLL CONTAINER never fires when its content grows: a chart family
    // chunk landing, a web font swapping, an image decoding all move scrollHeight while the box
    // itself is unchanged. That is exactly the card this cue exists for — one taller than its slot
    // — so watch what scrolls, not only the window onto it.
    for (const child of Array.from(face.children)) ro?.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(scrollTimer);
      face.removeAttribute('data-scrolling');
      face.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [scene.active?.id, deskBlocks]);
  // Scrolled out of view, the desk stops animating entirely — the equalizer and the narrated
  // card's ring are the only loops left, and neither is worth a frame nobody is looking at.
  const idleRef = useAmbientPause<HTMLElement>();

  // What Mavéa has written about the object on the desk — several notes per object, paged.
  const foregroundId = scene.active?.id ?? null;
  // Once a card's notes have been SEEN they hold still. The model's notes stream in, so without
  // this the remark under the reader's eyes could rewrite itself mid-sentence. While the intro
  // gate is closed the notes are `visibility: hidden` (study.css), so an upgrade during the gate
  // costs nothing and is allowed — the freeze begins the moment the desk is actually visible.
  const [heldNotes, setHeldNotes] = useState<
    Record<string, { notes: readonly StudyAside[]; authored: boolean; block: Block }>
  >({});
  useEffect(() => setHeldNotes({}), [answerKey]);
  useEffect(() => {
    if (gathered || !foregroundId) return;
    const shown = asides?.[foregroundId];
    const block = data.blocks.find((candidate) => candidate.id === foregroundId);
    if (!shown?.length || !block) return;
    const authored = asidesAuthored?.has(foregroundId) ?? false;
    setHeldNotes((prev) => {
      const held = prev[foregroundId];
      if (held?.block === block && (held.authored || !authored)) return prev;
      return { ...prev, [foregroundId]: { notes: shown, authored, block } };
    });
  }, [asides, asidesAuthored, data.blocks, foregroundId, gathered]);
  const currentNoteBlock = foregroundId
    ? data.blocks.find((candidate) => candidate.id === foregroundId)
    : undefined;
  const held = foregroundId ? heldNotes[foregroundId] : undefined;
  const activeNotes =
    (foregroundId
      ? held && held.block === currentNoteBlock
        ? held.notes
        : asides?.[foregroundId]
      : undefined) ?? [];
  if (notePage.spot !== foregroundId) setNotePage({ spot: foregroundId, page: 0 });
  const pageIndex = activeNotes.length
    ? Math.min(notePage.spot === foregroundId ? notePage.page : 0, activeNotes.length - 1)
    : 0;
  const activeAside = activeNotes[pageIndex] ?? null;

  // The note card is keyed on its page so the entrance replays, which takes the pager's own
  // buttons with it — the chip the reader just pressed stops existing and focus falls to the
  // document. Put it back on the chip that is now current.
  useEffect(() => {
    if (!pagedByHand.current) return;
    pagedByHand.current = false;
    noteNavRef.current?.querySelector<HTMLButtonElement>('button.is-now')?.focus();
  }, [pageIndex]);

  // Which beats the reader has actually seen, in first-visit order — the session notes' spine.
  useEffect(() => {
    if (!foregroundId) return;
    setVisitedIds((current) =>
      current.includes(foregroundId) ? current : [...current, foregroundId],
    );
  }, [foregroundId]);

  // The row's edge fades are a promise that the sentence continues, so each side is flagged from
  // the row's own scroll position: a chip parked at either end can never be scrolled away from it,
  // and a permanent gradient would just sit over a real, clickable label.
  const markBeatOverflow = useCallback((row: HTMLElement): void => {
    const max = row.scrollWidth - row.clientWidth;
    row.toggleAttribute('data-more-start', row.scrollLeft > 1);
    row.toggleAttribute('data-more-end', row.scrollLeft < max - 1);
  }, []);

  const attachBeatsRow = useCallback(
    (row: HTMLDivElement | null) => {
      beatsRowRef.current = row;
      if (!row) return;
      const mark = (): void => markBeatOverflow(row);
      mark();
      row.addEventListener('scroll', mark, { passive: true });
      // A widened row can stop overflowing without ever scrolling, which would strand a fade over
      // the last chip — the one thing the fades must never do.
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark);
      observer?.observe(row);
      return () => {
        observer?.disconnect();
        row.removeEventListener('scroll', mark);
        beatsRowRef.current = null;
      };
    },
    [markBeatOverflow],
  );

  // The active beat chip keeps itself in the visible window of the (scrollable) row. Manual
  // scrollLeft math, not scrollIntoView: the latter is free to scroll every ancestor, which
  // would yank the page each time the walk advances.
  useEffect(() => {
    const row = beatsRowRef.current;
    if (!row) return;
    if (row.matches(':hover')) return;
    const chip = row.querySelector<HTMLElement>('.study-beat.is-now');
    if (!chip) return;
    // Measured against the ROW, not the chip's offset parent: the beat bar is the positioned
    // ancestor here, so offsetLeft carried the Guide button's width into the target and scrolled
    // the first chip's label off the left edge every time the walk opened.
    const left = chip.getBoundingClientRect().left - row.getBoundingClientRect().left;
    // Centre it, but never past the ends — and when the row does not scroll at all, leave it be.
    const target = row.scrollLeft + left - row.clientWidth / 2 + chip.offsetWidth / 2;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    if (typeof row.scrollTo === 'function') {
      row.scrollTo({ left: Math.min(max, Math.max(0, target)) });
    }
    markBeatOverflow(row);
  }, [foregroundId, markBeatOverflow]);

  const choose = useCallback(
    (block: Block, keepContext = false) => {
      if (!block.id) return;
      // The reader's own pick ends the guided walk — one hand on the wheel at a time.
      setGuiding(false);
      // Holding an object in context must not disturb the desk — it is an addition, not a recast.
      if (keepContext) {
        onAskBlock?.(block);
        return;
      }
      recastIdRef.current = null;
      setRecastId(null);
      setPinnedId(block.id);
      onNarrate?.(block);
    },
    [onAskBlock, onNarrate],
  );

  const onCardClick = useCallback(
    (event: MouseEvent<HTMLElement>, block: Block) => {
      choose(block, event.shiftKey);
    },
    [choose],
  );

  const onCardKey = useCallback(
    (event: KeyboardEvent<HTMLElement>, block: Block) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose(block, event.shiftKey);
      }
    },
    [choose],
  );

  const active = scene.active?.block;

  // The guide walks the desk and TALKS: each object takes the desk and is narrated (the same
  // path a tap uses), and the next one waits for that line to finish rather than for a clock.
  // Held in an effect, not a timer chain, so it tears down with the stage and re-arms cleanly
  // whenever the desk, the voice, or the reader's own pick moves it.
  const guideRef = useRef<{ blocks: Block[]; id: string | null }>({ blocks: [], id: null });
  // Written after the commit, never in the render body: the timer below reads it asynchronously,
  // so it only ever needs the LAST committed desk — and a discarded render must not be able to
  // point the guide at a cast that was never shown.
  useEffect(() => {
    guideRef.current = {
      blocks: deskBlocks.filter((block) => block.id),
      id: scene.active?.id ?? null,
    };
  }, [deskBlocks, scene.active?.id]);
  // The object the guide itself last moved to. Anything else moving the desk — above all the
  // turn's own spoken walk — means someone else is driving, and two narrators is two voices
  // over each other.
  const guideMovedTo = useRef<string | null>(null);
  const guideStep = useCallback(
    (fromStart: boolean) => {
      const { blocks: cast, id } = guideRef.current;
      const at = cast.findIndex((block) => block.id === id);
      // Starting ON an object narrates it where it stands; every later step moves along.
      const next = fromStart && at >= 0 ? cast[at] : cast[at + 1];
      if (!next) {
        setGuiding(false);
        return;
      }
      guideMovedTo.current = next.id ?? null;
      setPinnedId(next.id ?? null);
      onNarrate?.(next);
    },
    [onNarrate],
  );

  // A spot moved by something other than the guide — above all a follow-up's own spoken walk —
  // does NOT switch the guide off. Guide me is a mode the reader chose; a follow-up is the same
  // conversation, and making them press it again every turn reads as the app forgetting. The walk
  // never gets talked over because the timer below waits out every audible line, and when the walk
  // is done the guide resumes from wherever the walk left the desk. Only the reader's own pick
  // (`choose`) or the end of the cast ends it.
  // Silence ACCRUES; it does not restart. `speaking` flips at every sentence boundary, and the
  // old effect re-armed the whole gap on each flip — so a voice that pauses more often than
  // GUIDE_GAP_MS left "Guide me" lit and advancing never, which reads as a dead control. Bank the
  // quiet between flickers, and still never fire WHILE a line is audible.
  const quietRef = useRef<{ id: string | null; banked: number; since: number }>({
    id: null,
    banked: 0,
    since: 0,
  });
  // Every step re-arms the pacer, because a step is not guaranteed to move anything the effect
  // watches. The FIRST one narrates the object already on the desk (that is the point — the walk
  // starts where the reader is), so `foregroundId` holds still; and while Mavéa is muted nothing
  // ever flips `speaking` either. With no dep changing, the one timer this effect had scheduled
  // was the only one it would ever schedule, and "Guide me" sat lit and still forever.
  const [guideTick, setGuideTick] = useState(0);
  useEffect(() => {
    if (!guiding) return;
    const quiet = quietRef.current;
    // A new object on the desk is a new beat — its wait starts from zero.
    if (quiet.id !== foregroundId) {
      quiet.id = foregroundId;
      quiet.banked = 0;
      quiet.since = 0;
    }
    if (speaking) {
      if (quiet.since) {
        quiet.banked += Date.now() - quiet.since;
        quiet.since = 0;
      }
      return;
    }
    if (!quiet.since) quiet.since = Date.now();
    const waited = quiet.banked + (Date.now() - quiet.since);
    // The first step lands at once — a control that does nothing for nine seconds reads as
    // broken — and each later one after a beat of air once the voice has stopped.
    const delay = guideStartRef.current ? 0 : Math.max(0, GUIDE_GAP_MS - waited);
    const timer = window.setTimeout(() => {
      const fromStart = guideStartRef.current;
      guideStartRef.current = false;
      quietRef.current = { id: foregroundId, banked: 0, since: 0 };
      guideStep(fromStart);
      setGuideTick((tick) => tick + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [guiding, speaking, foregroundId, guideStep, guideTick]);

  if (!active) return null;

  // Which object the narration is on, as a data attribute rather than a label: the fact has to
  // reach CSS (the speaking ring, later the equalizer) without becoming copy.
  const speakingId =
    !muted && ((narratingId && active.id === narratingId) || (speaking && spot === active.id))
      ? active.id
      : undefined;
  const lessonBlocks = deskBlocks.filter((block) => block.id);
  const lessonIndex = lessonBlocks.findIndex((block) => block.id === active.id);
  const moveLesson = (delta: -1 | 1): void => {
    if (lessonBlocks.length < 2 || lessonIndex < 0) return;
    const next = lessonBlocks[(lessonIndex + delta + lessonBlocks.length) % lessonBlocks.length];
    if (next) choose(next);
  };

  // The desk's cast in a STABLE order (answer order), so React keeps each card's element alive
  // across a promotion and the slot change rides a CSS transition instead of a remount. Zone and
  // slot are looked up per id; membership only changes when the horizon rotates in.
  // A block built for 8+ grid columns gets the wide desk — its own catalog span is the
  // judgment, not a hand-kept list of types. At the standard 560px a twelve-column table
  // truncates every cell, and truncation is the one thing the desk must never do to the object
  // it is presenting. The right-gutter scrawls stand down to make the room (see slots.ts for
  // the geometry); the note card and everything else hold still.
  // `col` is the span the validator stamped from the block's own catalog entry — the same
  // number the answer grid lays it out by — already ON the block, so judging wideness costs no
  // import. (catalogSpan from live/select was tried first and dragged the whole facts index
  // into the eager canvas chunk: the course-lesson route blew its 140KB gzip budget by 8.5KB.)
  const wide = (scene.active?.block.col ?? 0) >= 8;
  const frontW = wide ? WIDE_CARD_W : CARD_W;
  const slotById = new Map<string, CSSProperties>();
  if (scene.active)
    slotById.set(scene.active.id, slotStyle(wide ? WIDE_FRONT_SLOT : FRONT_SLOT, 0));
  for (const actor of scene.nearby) {
    const slot = BACK_SLOTS[SLOT_ORDER[actor.slot] ?? actor.slot];
    if (slot) slotById.set(actor.id, slotStyle(slot, actor.slot + 1));
  }
  const cast = lessonBlocks.filter((block) => block.id && slotById.has(block.id));

  // The block's own note, WHOLE. It was condensed to the design's aphorism length, but the
  // design's own takeaways are short because its demo copy is — a real answer's line is 90-160
  // characters, and an ellipsis on the one sentence meant to be carried away is the opposite of
  // a takeaway. It wraps instead, and the desk reserves the room for it.
  const takeaway = active.note ?? null;

  // The pen's margin quip beside the object: the aside's second voice leads — the walk's line
  // already lives in the voice bubble and the crib, and writing it twice at 140 chars is what
  // buried the desk. A block with no quip falls back to its walk line, cut to desk length.
  let walkNote: string | null = null;
  if (walkNotes) {
    for (let i = walkNotes.length - 1; i >= 0; i -= 1) {
      if (walkNotes[i].spot === active.id) {
        walkNote = walkNotes[i].text;
        break;
      }
    }
  }
  // The card's scrawls. A live walk's own written line, when there is one, takes the left slot —
  // it is what she just SAID about this object, so it is the one the arrow should point with.
  //
  // Two rules the first version got wrong. It DISPLACED whatever was already in the left slot,
  // which silently cost the card one of the model's own scrawls; the displaced one now moves to
  // the next free slot — and when the margin is genuinely full (all five slots taken) it is the
  // displaced scrawl that goes, not one the walk did not touch. Something has to give at five,
  // and the remark the walk pushed out is the honest one to lose. And it condensed with an ellipsis: a scrawl reading "Your needs
  // are the non-negotiables, like…" is handwriting cut off mid-thought. `condenseForNote`
  // returns the first SENTENCE when that fits, so a line that fits whole is used and one that
  // does not is left out — the walk's words are still in the session notes either way.
  const structural = activeNotes[0]?.marks ?? [];
  const condensed = walkNote ? condenseForNote(walkNote, PEN_MARK_MAX) : '';
  const walkMark = condensed.endsWith('…') ? '' : condensed;
  let allMarks: PenMark[] = [...structural];
  if (walkMark) {
    const displaced = structural.find((mark) => mark.slot === 'left');
    const kept = structural.filter((mark) => mark.slot !== 'left');
    const taken = new Set<PenSlot>(['left', ...kept.map((mark) => mark.slot)]);
    const free = PEN_SLOTS.find((slot) => !taken.has(slot));
    allMarks = [
      { text: walkMark, slot: 'left' },
      ...kept,
      ...(displaced && free ? [{ ...displaced, slot: free }] : []),
    ];
  }
  // A wide card takes the strip the right-gutter scrawls lived in — that room is what pays for
  // the width, and the data beats a fourth remark. `deskWide` mirrors the slot decision below
  // (it must, or a scrawl would draw under the widened card).
  const deskWide = (scene.active?.block.col ?? 0) >= 8;
  const deskMarks = deskWide
    ? allMarks.filter((mark) => !RIGHT_GUTTER_SLOTS.has(mark.slot))
    : allMarks;
  // Which of the desk's slots sit in the strip between the card and Mavéa's note.
  const usesRightGutter = deskMarks.some((mark) => RIGHT_GUTTER_SLOTS.has(mark.slot));

  // Session notes: one line per beat the reader has actually visited — the walk's written line
  // where the walk wrote one, else the block's own takeaway. A lesson that leaves nothing
  // written down is a lecture you cannot re-read.
  const latestWalkNote = (spot: string): string | null => {
    if (!walkNotes) return null;
    for (let i = walkNotes.length - 1; i >= 0; i -= 1) {
      if (walkNotes[i].spot === spot) return walkNotes[i].text;
    }
    return null;
  };
  const cribNotes = visitedIds.flatMap((spot) => {
    const block = lessonBlocks.find((item) => item.id === spot);
    if (!block) return [];
    // The walk's own written line first. A beat the reader jumped to without a spoken line
    // falls back to the block's note — but not for the object ON the desk, whose note is
    // already the takeaway inches away; the pad would just say it twice.
    const walked = latestWalkNote(spot);
    const text = walked ?? (spot === active.id ? null : block.note);
    return text ? [{ spot, text }] : [];
  });
  const beatNumberFor = (spot: string): string => {
    const index = lessonBlocks.findIndex((block) => block.id === spot);
    return String((index >= 0 ? index : 0) + 1).padStart(2, '0');
  };

  return (
    <section
      ref={(node) => {
        stageRef.current = node;
        idleRef.current = node;
      }}
      className={`study-stage intensity-${scene.intensity}${fullscreen.active ? ' is-fullscreen' : ''}`}
      aria-label="The Study"
      data-study-active={active.id}
      data-study-speaking={speakingId}
      data-study-note-kind={activeAside?.kind}
      data-gathered={gathered || undefined}
      data-assembling={assembling || undefined}
    >
      <div className="study-desk">
        <div className="study-canvas">
          <div className="study-scene">
            <div className="study-floor" aria-hidden="true" />
            <div className="study-pool" aria-hidden="true" />

            {cast.map((block) => {
              const id = block.id as string;
              const front = id === active.id;
              const selected = !!selectedBlockIds?.has(id);
              return (
                <article
                  key={id}
                  className={`study-card${front ? ' is-front' : ' is-back'}${
                    selected ? ' is-context' : ''
                  }${front && spot === id ? ' spotlit' : ''}`}
                  style={{ ...slotById.get(id), width: `${front ? frontW : CARD_W}px` }}
                  data-study-actor={id}
                  // The pen resolves its targets by data-spot-id alone (AnnotationLayer's host
                  // lookup), and its rect math assumes an unscaled host: a back card lives behind
                  // a rotateY+scale transform, where a painted stroke would land doubled. So only
                  // the object ON the desk is a mark target — ink draws as each card arrives,
                  // which is also the theater the desk wants.
                  data-spot-id={front ? id : undefined}
                  data-kind={block.type}
                  role={front ? undefined : 'button'}
                  // -1 rather than undefined on the front card: React keeps the element alive
                  // across a promotion, and REMOVING tabindex from the element the reader just
                  // pressed Enter on blurs it — focus fell to the document and the next Tab
                  // restarted at the top of the page. It keeps the focus it had, and stays out
                  // of the tab order.
                  tabIndex={front ? -1 : 0}
                  aria-label={front ? undefined : `Bring ${blockLabel(block)} forward`}
                  onClick={front ? undefined : (event) => onCardClick(event, block)}
                  onKeyDown={front ? undefined : (event) => onCardKey(event, block)}
                >
                  <div className="study-card-face" aria-hidden={front ? undefined : true}>
                    <BlockBoundary fallback={<FallbackCard block={block} />}>
                      {renderBlock(block)}
                    </BlockBoundary>
                  </div>
                  <div className="study-card-mute" aria-hidden="true" />
                  {front &&
                    deskMarks.map((mark) => (
                      <div
                        key={`${id}-${mark.slot}`}
                        className={`study-mark slot-${mark.slot}`}
                        aria-hidden="true"
                      >
                        <span className="study-mark-text">{mark.text}</span>
                        <svg className="study-mark-arrow" viewBox="0 0 90 70" aria-hidden="true">
                          <path className="study-mark-line" d={MARK_ARROWS[mark.slot].line} />
                          <path className="study-mark-head" d={MARK_ARROWS[mark.slot].head} />
                        </svg>
                      </div>
                    ))}
                </article>
              );
            })}

            {activeAside && !cribOpen && (
              <>
                {/* The connector spans the WHOLE right gutter — measured, x 1397-1557 against a
                    card ending at 1394 — which is the same strip the right-hand scrawls live in,
                    so with both drawn the reader gets two arrows crossing each other and the
                    words. The gutter holds one or the other, and a scrawl carrying a real remark
                    beats an arrow restating an adjacency the eye already made. */}
                {!usesRightGutter && (
                  <svg
                    key={`connect-${active.id}`}
                    className="study-connect"
                    viewBox={`0 0 ${CONNECT_SLOT.w} ${CONNECT_SLOT.h}`}
                    width={CONNECT_SLOT.w}
                    height={CONNECT_SLOT.h}
                    // The wide desk moves the card's right flank; the arrow moves with it so
                    // its curve still lands ON the card rather than in the parchment beside it.
                    style={{ left: `${(wide ? WIDE_CONNECT_SLOT : CONNECT_SLOT).x}px` }}
                    aria-hidden="true"
                  >
                    <path className="study-connect-line" d="M146,170 C118,128 66,78 16,44" />
                    {/* Barbs derived from the curve's arrival direction, like the desk's marks. */}
                    <path className="study-connect-head" d="M16,44 L23,55 M16,44 L29,46" />
                  </svg>
                )}
                <div className="study-note-wrap">
                  <div className="study-note-layer" aria-hidden="true">
                    MAVÉA'S LAYER · {String(activeNotes.length).padStart(2, '0')} NOTES
                  </div>
                  <div
                    key={`${active.id}-${pageIndex}`}
                    className={`study-note kind-${activeAside.kind}`}
                    aria-live="polite"
                  >
                    <span className="study-note-kicker">
                      <b aria-hidden="true">{NOTE_GLYPHS[activeAside.kind]}</b>
                      {NOTE_LABELS[activeAside.kind]}
                    </span>
                    <p className="study-note-copy">{activeAside.text}</p>
                    <div className="study-note-sig" aria-hidden="true">
                      — mavéa
                    </div>
                    {activeNotes.length > 1 && (
                      <footer className="study-note-footer">
                        <span aria-label={`Note ${pageIndex + 1} of ${activeNotes.length}`}>
                          {String(pageIndex + 1).padStart(2, '0')} /{' '}
                          {String(activeNotes.length).padStart(2, '0')}
                        </span>
                        {/* One chip per note, wearing that note's own glyph — the reader picks
                            the KIND of thing they want to hear rather than paging blindly. */}
                        <span className="study-note-nav" ref={noteNavRef}>
                          {activeNotes.map((note, index) => (
                            <button
                              key={`${note.kind}-${index}`}
                              type="button"
                              className={index === pageIndex ? 'is-now' : undefined}
                              aria-current={index === pageIndex ? 'true' : undefined}
                              onClick={() => {
                                pagedByHand.current = true;
                                setNotePage({ spot: foregroundId, page: index });
                              }}
                              aria-label={`${NOTE_LABELS[note.kind]}, note ${index + 1} of ${activeNotes.length}`}
                              title={NOTE_LABELS[note.kind]}
                            >
                              {NOTE_GLYPHS[note.kind]}
                            </button>
                          ))}
                        </span>
                      </footer>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="study-vignette" aria-hidden="true" />
        <div className="study-grain" aria-hidden="true" />
      </div>

      {/* HUD, not scenery: card heights vary with real answers and the desk scales, so the
          takeaway lives above the beat bar at authored size — it can never slide under the
          glass or collide with a tall object. */}
      {takeaway && (
        <div key={`take-${active.id}`} className="study-takeaway">
          <span className="study-takeaway-kicker">Takeaway</span>
          <span className="study-takeaway-line">{takeaway}</span>
          <svg
            className="study-takeaway-stroke"
            viewBox="0 0 210 14"
            width="210"
            height="14"
            aria-hidden="true"
          >
            <path d="M3,5 C34,1 66,8 105,5 C144,2 176,8 207,4" />
            {/* A hand underlines twice — the second pass shorter, lighter, offset. */}
            <path className="is-second" d="M22,11 C56,8 92,13 150,10" />
          </svg>
        </div>
      )}

      {voiceLine && !gathered && (
        <div className="study-voice" aria-hidden="true">
          {speaking && (
            <span className="study-voice-eq">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
          {(() => {
            const { text, size } = fitVoiceLine(voiceLine);
            return (
              <span
                key={voiceLine}
                className="study-voice-text"
                style={{ '--study-voice-size': `${size}px` } as CSSProperties}
              >
                {text}
                {speaking && <b className="study-voice-caret">▌</b>}
              </span>
            );
          })()}
        </div>
      )}

      {gathered && (
        <div className="study-intro" role="status">
          {/* The whole layer is a click target, as a REAL button stretched under the copy — a
              div with a click handler is a target only a mouse can find. */}
          <button
            type="button"
            className="study-intro-skip"
            aria-label="Enter the Study now"
            onClick={enter}
          />
          <span className="study-intro-kicker">The answer</span>
          <div className="study-intro-card">
            <p>{lead || data.opener || data.sub || data.title}</p>
          </div>
          <span className="study-intro-watch">Watch it become the Study</span>
          <button type="button" className="study-intro-enter" onClick={enter}>
            Enter the Study →
          </button>
        </div>
      )}

      <button
        type="button"
        className="study-fullscreen"
        onClick={fullscreen.toggle}
        aria-pressed={fullscreen.active}
        title={fullscreen.active ? 'Leave full screen (Esc)' : 'Fill the screen with this study'}
        aria-label={fullscreen.active ? 'Leave full screen' : 'Fill the screen with this study'}
      >
        {fullscreen.active ? <Icon.collapse /> : <Icon.expand />}
      </button>

      {lessonBlocks.length > 1 && (
        <div className="study-beats" role="group" aria-label="Beats">
          <button
            type="button"
            className={`study-guide${guiding ? ' is-on' : ''}`}
            aria-pressed={guiding}
            onClick={() =>
              setGuiding((on) => {
                if (!on) {
                  guideStartRef.current = true;
                  guideMovedTo.current = null;
                }
                return !on;
              })
            }
          >
            {guiding ? '❚❚ Pause' : '▶ Guide me'}
          </button>
          {onToggleMute && (
            <button
              type="button"
              className="study-mute"
              aria-pressed={!!muted}
              aria-label={muted ? "Unmute Mavéa's voice" : "Mute Mavéa's voice"}
              title={muted ? "Unmute Mavéa's voice" : "Mute Mavéa's voice"}
              onClick={onToggleMute}
            >
              {muted ? <Icon.speakerOff /> : <Icon.speaker />}
            </button>
          )}
          <div className="study-beats-row" ref={attachBeatsRow}>
            {lessonBlocks.map((block, index) => {
              const now = block.id === active.id;
              return (
                <button
                  key={block.id}
                  type="button"
                  className={`study-beat${now ? ' is-now' : ''}`}
                  aria-current={now ? 'step' : undefined}
                  aria-label={`Beat ${index + 1} of ${lessonBlocks.length}: ${blockLabel(block)}`}
                  // A chip is an ellipsis by design; the whole name has to stay reachable.
                  title={blockLabel(block)}
                  onClick={(event) => choose(block, event.shiftKey)}
                >
                  <span className="study-beat-num" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="study-beat-label">{blockLabel(block)}</span>
                </button>
              );
            })}
          </div>
          <div className="study-stepper" aria-live="polite">
            <button type="button" onClick={() => moveLesson(-1)} aria-label="Previous beat">
              ‹
            </button>
            <span>
              {String(lessonIndex + 1).padStart(2, '0')} /{' '}
              {String(lessonBlocks.length).padStart(2, '0')} · Step {lessonIndex + 1}:{' '}
              {blockLabel(active)}
            </span>
            <button type="button" onClick={() => moveLesson(1)} aria-label="Next beat">
              ›
            </button>
          </div>
          <button type="button" className="study-beat-next" onClick={() => moveLesson(1)}>
            Next →
          </button>
          {cribNotes.length > 0 && (
            <>
              <span className="study-beats-divider" aria-hidden="true" />
              <button
                type="button"
                className={`study-crib-toggle${cribOpen ? ' is-open' : ''}`}
                aria-pressed={cribOpen}
                onClick={() => setCribOpen((open) => !open)}
              >
                ✎ Notes ({cribNotes.length})
              </button>
            </>
          )}
        </div>
      )}

      {cribOpen && cribNotes.length > 0 && (
        <div className="study-crib" role="note" aria-label="Session notes">
          <span className="study-crib-tape" aria-hidden="true" />
          <button
            type="button"
            className="study-crib-close"
            aria-label="Close session notes"
            onClick={() => setCribOpen(false)}
          >
            ✕
          </button>
          <div className="study-crib-head" aria-hidden="true">
            <span>Session notes</span>
            <span>The Study</span>
          </div>
          <div className="study-crib-lines">
            {cribNotes.map((note, index) => (
              <button
                key={`${note.spot}-${index}`}
                type="button"
                className="study-crib-line"
                onClick={() => {
                  const block = lessonBlocks.find((item) => item.id === note.spot);
                  if (block) choose(block);
                }}
              >
                {beatNumberFor(note.spot)} — {note.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
