import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Block, ConversationSpec } from '../../data/conversation';
import { Icon } from '../../icons/icons';
import { BlockBoundary } from '../BlockBoundary';
import { FallbackCard } from '../FallbackCard';
import { blockLabel } from '../blockLabel';
import { condenseForNote } from '../../live/annotate/marginNote';
import { deriveStudyScene } from './scene';
import { BACK_SLOTS, CARD_W, CONNECT_SLOT, FRONT_SLOT, SLOT_ORDER } from './slots';
import type { StudyAside, StudyNoteKind } from './types';
import type { PenMark, PenSlot } from '../../live/content/penQuip';
import { useStudyScale } from './useStudyScale';
import { useAmbientPause } from '../../hooks/useInView';
import { useTruncatedTextDisclosures } from '../hooks/useTruncatedTextDisclosures';
import { useFullscreen } from '../../lib/useFullscreen';
import '../layout/textDisclosure.css';
import './study.css';

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
  selectedBlockIds?: ReadonlySet<string>;
  onNarrate?: (block: Block) => void;
  narratingId?: string | null;
  muted?: boolean;
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
  selectedBlockIds,
  onNarrate,
  narratingId,
  muted,
  walkNotes,
  voiceLine,
  speaking,
  lead,
  intro = 'skip',
}: Props) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [cribOpen, setCribOpen] = useState(false);
  // Which of the active object's notes is face-up. Reset per object: the pages belong to the
  // thing on the desk, not to the reader's place in some global list.
  const [notePage, setNotePage] = useState(0);
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

  useEffect(() => {
    setPinnedId(null);
    setCribOpen(false);
    setVisitedIds([]);
    setGuiding(false);
  }, [data.id]);

  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  // v3: a NEW answer after the gate has played reassembles in place — the cards gather for one
  // frame and fan back out, no overlay. (The first answer is handled by the gate itself.)
  const reassembleRef = useRef(data.id);
  useEffect(() => {
    if (reassembleRef.current === data.id) return;
    reassembleRef.current = data.id;
    if (intro !== 'full' || reducedMotion || !introPlayed) return;
    const stage = stageRef.current;
    if (!stage) return;
    stage.setAttribute('data-gathered', '');
    setAssembling(true);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => stage.removeAttribute('data-gathered'));
    });
    return () => {
      cancelAnimationFrame(frame);
      stage.removeAttribute('data-gathered');
    };
  }, [data.id, intro, reducedMotion]);

  // The intro never traps: click anywhere or just wait — 3.4s and the desk assembles on its
  // own. No Escape shortcut: the demo driver owns that key, and v3 reads Escape as "leave",
  // never "enter". Reduced motion skips the whole beat (no gate, no fan-out).
  useEffect(() => {
    if (!gathered) return;
    const timer = window.setTimeout(enter, 3400);
    return () => window.clearTimeout(timer);
  }, [gathered, enter]);

  // The desk is a single composition — arriving with its beat bar under the fold reads as a
  // missing control, not a scrollable page. On each new answer the stage aligns its own bottom
  // edge to the scroll column once, after paint; the walk's later per-card scrolls then find
  // every target already visible. Instant, not smooth: this is arrival, not animation.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (typeof stage?.scrollIntoView === 'function') {
        stage.scrollIntoView({ block: 'end', behavior: 'auto' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [data.id]);

  // The desk holds things to LOOK at. A world preview is a doorway to another surface, not an
  // object to examine — on the desk it takes a slot, a beat and a set of notes to say only
  // "there is more elsewhere". It stays on the grid, where a doorway belongs.
  const deskBlocks = useMemo(() => blocks.filter((block) => block.type !== 'world'), [blocks]);
  const eligibleIds = useMemo(
    () => new Set(deskBlocks.flatMap((block) => (block.id ? [block.id] : []))),
    [deskBlocks],
  );
  const activeId = (pinnedId && eligibleIds.has(pinnedId) ? pinnedId : null) ?? spot;
  const scene = useMemo(
    () => deriveStudyScene(deskBlocks, activeId, selectedBlockIds),
    [deskBlocks, activeId, selectedBlockIds],
  );

  // Scoped to the stage element, so filling the screen gives the screen to the STUDY — not to the
  // app around it. The control and its target live together rather than being plumbed through
  // two components that would both have to be told which element they meant.
  const fullscreen = useFullscreen();
  useStudyScale(stageRef);
  // Truncation without a way back to the words is just lost text. The canvas grid gets this
  // treatment already; the desk renders its cards outside that grid, so it asks for its own —
  // re-scanned whenever the desk re-casts, since the object on it changes.
  useTruncatedTextDisclosures(stageRef, `${data.id}:${scene.active?.id ?? ''}`);
  // Scrolled out of view, the desk stops animating entirely — the equalizer and the narrated
  // card's ring are the only loops left, and neither is worth a frame nobody is looking at.
  const idleRef = useAmbientPause<HTMLElement>();

  // What Mavéa has written about the object on the desk — several notes per object, paged.
  const foregroundId = scene.active?.id ?? null;
  const activeNotes = (foregroundId ? asides?.[foregroundId] : undefined) ?? [];
  const pageIndex = activeNotes.length ? Math.min(notePage, activeNotes.length - 1) : 0;
  const activeAside = activeNotes[pageIndex] ?? null;

  useEffect(() => setNotePage(0), [foregroundId]);

  // Which beats the reader has actually seen, in first-visit order — the session notes' spine.
  useEffect(() => {
    if (!foregroundId) return;
    setVisitedIds((current) =>
      current.includes(foregroundId) ? current : [...current, foregroundId],
    );
  }, [foregroundId]);

  // The active beat chip keeps itself in the visible window of the (scrollable) row. Manual
  // scrollLeft math, not scrollIntoView: the latter is free to scroll every ancestor, which
  // would yank the page each time the walk advances.
  useEffect(() => {
    const row = beatsRowRef.current;
    if (!row) return;
    if (row.matches(':hover')) return;
    const chip = row.querySelector<HTMLElement>('.study-beat.is-now');
    if (!chip) return;
    // Centre it, but never past the ends — and when the row does not scroll at all, leave it be.
    const target = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    if (typeof row.scrollTo === 'function') {
      row.scrollTo({ left: Math.min(max, Math.max(0, target)) });
    }
  }, [foregroundId]);

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
  guideRef.current = {
    blocks: deskBlocks.filter((block) => block.id),
    id: scene.active?.id ?? null,
  };
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

  // A spot change the guide did not cause hands the wheel back: the walk is speaking, and the
  // guide must not speak over it.
  useEffect(() => {
    if (!guiding) return;
    if (foregroundId && guideMovedTo.current && foregroundId !== guideMovedTo.current) {
      setGuiding(false);
    }
  }, [guiding, foregroundId]);
  useEffect(() => {
    if (!guiding) return;
    // Never talk over her: while a line is audible the guide simply waits for it.
    if (speaking) return;
    // The first step lands at once — a control that does nothing for nine seconds reads as
    // broken — and each later one after a beat of air once the voice has stopped.
    const delay = guideStartRef.current ? 0 : GUIDE_GAP_MS;
    const timer = window.setTimeout(() => {
      const fromStart = guideStartRef.current;
      guideStartRef.current = false;
      guideStep(fromStart);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [guiding, speaking, foregroundId, guideStep]);

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
  const slotById = new Map<string, CSSProperties>();
  if (scene.active) slotById.set(scene.active.id, slotStyle(FRONT_SLOT, 0));
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
  // The card's scrawls. A live walk's own written line, when there is one, takes the left slot
  // (it is what she just SAID about this object); the structural marks fill the rest.
  const structural = activeNotes[0]?.marks ?? [];
  const walkMark = walkNote ? condenseForNote(walkNote, 46) : '';
  const allMarks: PenMark[] = walkMark
    ? [
        { text: walkMark, slot: 'left' as const },
        ...structural.filter((mark) => mark.slot !== 'left'),
      ]
    : [...structural];
  const deskMarks = allMarks;

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
                  style={{ ...slotById.get(id), width: `${CARD_W}px` }}
                  data-study-actor={id}
                  // The pen resolves its targets by data-spot-id alone (AnnotationLayer's host
                  // lookup), and its rect math assumes an unscaled host: a back card lives behind
                  // a rotateY+scale transform, where a painted stroke would land doubled. So only
                  // the object ON the desk is a mark target — ink draws as each card arrives,
                  // which is also the theater the desk wants.
                  data-spot-id={front ? id : undefined}
                  data-kind={block.type}
                  role={front ? undefined : 'button'}
                  tabIndex={front ? undefined : 0}
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
                <svg
                  key={`connect-${active.id}`}
                  className="study-connect"
                  viewBox={`0 0 ${CONNECT_SLOT.w} ${CONNECT_SLOT.h}`}
                  width={CONNECT_SLOT.w}
                  height={CONNECT_SLOT.h}
                  aria-hidden="true"
                >
                  <path className="study-connect-line" d="M146,170 C118,128 66,78 16,44" />
                  {/* Barbs derived from the curve's arrival direction, like the desk's marks. */}
                  <path className="study-connect-head" d="M16,44 L23,55 M16,44 L29,46" />
                </svg>
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
                        <span className="study-note-nav">
                          {activeNotes.map((note, index) => (
                            <button
                              key={`${note.kind}-${index}`}
                              type="button"
                              className={index === pageIndex ? 'is-now' : undefined}
                              aria-current={index === pageIndex ? 'true' : undefined}
                              onClick={() => setNotePage(index)}
                              aria-label={NOTE_LABELS[note.kind]}
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
          <span key={voiceLine} className="study-voice-text">
            {voiceLine}
            {speaking && <b className="study-voice-caret">▌</b>}
          </span>
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
          <div className="study-beats-row" ref={beatsRowRef}>
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
