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
import { deriveStudyScene } from './scene';
import { BACK_SLOTS, CARD_W, CONNECT_SLOT, FRONT_SLOT } from './slots';
import type { StudyAside, StudyNoteKind } from './types';
import { useStudyScale } from './useStudyScale';
import { useStudyParallax } from './useStudyParallax';
import { useFullscreen } from '../../lib/useFullscreen';
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
  asides?: Readonly<Record<string, StudyAside>>;
  selectedBlockIds?: ReadonlySet<string>;
  onNarrate?: (block: Block) => void;
  narratingId?: string | null;
  muted?: boolean;
  /** The walk's written asides for this turn, in walk order — each stop's spoken line condensed
   *  to a handwritten note. The one about the object on the desk is written beside it (the
   *  mockup's margin quip); all of them collect in the session-notes crib. */
  walkNotes?: readonly { spot: string; text: string }[];
}

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
  anchorTop = false,
): CSSProperties {
  return {
    '--sx': `${slot.x}px`,
    '--sy': `${slot.y}px`,
    '--sz': `${slot.z}px`,
    '--sry': `${slot.ry}deg`,
    '--ss': slot.s,
    '--sd': `${order * 55}ms`,
    '--say': anchorTop ? '0%' : '-50%',
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
}: Props) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [cribOpen, setCribOpen] = useState(false);
  const [visitedIds, setVisitedIds] = useState<readonly string[]>([]);
  const stageRef = useRef<HTMLElement | null>(null);
  const beatsRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPinnedId(null);
    setCribOpen(false);
    setVisitedIds([]);
  }, [data.id]);

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

  const eligibleIds = useMemo(
    () => new Set(blocks.flatMap((block) => (block.id ? [block.id] : []))),
    [blocks],
  );
  const activeId = (pinnedId && eligibleIds.has(pinnedId) ? pinnedId : null) ?? spot;
  const scene = useMemo(
    () => deriveStudyScene(blocks, activeId, selectedBlockIds),
    [blocks, activeId, selectedBlockIds],
  );

  // Scoped to the stage element, so filling the screen gives the screen to the STUDY — not to the
  // app around it. The control and its target live together rather than being plumbed through
  // two components that would both have to be told which element they meant.
  const fullscreen = useFullscreen();
  useStudyScale(stageRef);
  useStudyParallax(stageRef);

  // What Mavéa has written about the object on the desk.
  const foregroundId = scene.active?.id ?? null;
  const activeAside = foregroundId ? (asides?.[foregroundId] ?? null) : null;

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
    const chip = row.querySelector<HTMLElement>('.study-beat.is-now');
    if (!chip) return;
    const target = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2;
    if (typeof row.scrollTo === 'function') row.scrollTo({ left: Math.max(0, target) });
  }, [foregroundId]);

  const choose = useCallback(
    (block: Block, keepContext = false) => {
      if (!block.id) return;
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
  if (!active) return null;

  // Which object the narration is on, as a data attribute rather than a label: the fact has to
  // reach CSS (the speaking ring, later the equalizer) without becoming copy.
  const speakingId = !muted && narratingId && active.id === narratingId ? narratingId : undefined;
  const lessonBlocks = blocks.filter((block) => block.id);
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
  if (scene.active) slotById.set(scene.active.id, slotStyle(FRONT_SLOT, 0, true));
  for (const actor of scene.nearby) {
    const slot = BACK_SLOTS[actor.slot];
    if (slot) slotById.set(actor.id, slotStyle(slot, actor.slot + 1));
  }
  const cast = lessonBlocks.filter((block) => block.id && slotById.has(block.id));

  // The takeaway is the block's own one-line note — the desk restates nothing and invents
  // nothing. An object without one simply has no takeaway line.
  const takeaway = active.note ?? null;
  const noteCount = asides ? Object.keys(asides).length : 0;

  // The pen's margin quip beside the object: a live walk's own written line when one exists
  // (the latest wins — a stop revisited says the newer thing), else the aside's second voice.
  let walkNote: string | null = null;
  if (walkNotes) {
    for (let i = walkNotes.length - 1; i >= 0; i -= 1) {
      if (walkNotes[i].spot === active.id) {
        walkNote = walkNotes[i].text;
        break;
      }
    }
  }
  const deskNote = walkNote ?? activeAside?.quip ?? null;

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
    const text = latestWalkNote(spot) ?? block.note;
    return text ? [{ spot, text }] : [];
  });
  const beatNumberFor = (spot: string): string => {
    const index = lessonBlocks.findIndex((block) => block.id === spot);
    return String((index >= 0 ? index : 0) + 1).padStart(2, '0');
  };

  return (
    <section
      ref={stageRef}
      className={`study-stage intensity-${scene.intensity}${fullscreen.active ? ' is-fullscreen' : ''}`}
      aria-label="The Study"
      data-study-active={active.id}
      data-study-speaking={speakingId}
      data-study-note-kind={activeAside?.kind}
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
                </article>
              );
            })}

            {deskNote && (
              <div key={`margin-${active.id}`} className="study-margin-wrap">
                <div className="study-margin-note">{deskNote}</div>
                <svg
                  className="study-margin-arrow"
                  viewBox="0 0 90 70"
                  width="90"
                  height="70"
                  aria-hidden="true"
                >
                  <path className="study-margin-line" d="M8,14 C34,24 56,38 76,52" />
                  <path className="study-margin-head" d="M76,52 L62,48 M76,52 L66,62" />
                </svg>
              </div>
            )}

            {activeAside && (
              <>
                <svg
                  key={`connect-${active.id}`}
                  className="study-connect"
                  viewBox={`0 0 ${CONNECT_SLOT.w} ${CONNECT_SLOT.h}`}
                  width={CONNECT_SLOT.w}
                  height={CONNECT_SLOT.h}
                  aria-hidden="true"
                >
                  <path className="study-connect-line" d="M146,20 C112,44 64,48 14,34" />
                  <path className="study-connect-head" d="M14,34 L30,26 M14,34 L28,44" />
                </svg>
                <div className="study-note-wrap">
                  <div className="study-note-layer" aria-hidden="true">
                    MAVÉA'S LAYER · {String(Math.max(noteCount, 1)).padStart(2, '0')} NOTES
                  </div>
                  <div
                    key={active.id}
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
                    {lessonBlocks.length > 1 && (
                      <footer className="study-note-footer">
                        <span
                          aria-label={`Teaching point ${lessonIndex + 1} of ${lessonBlocks.length}`}
                        >
                          {String(lessonIndex + 1).padStart(2, '0')} /{' '}
                          {String(lessonBlocks.length).padStart(2, '0')}
                        </span>
                        <span className="study-note-nav">
                          <button
                            type="button"
                            onClick={() => moveLesson(-1)}
                            aria-label="Previous teaching point"
                            title="Previous teaching point"
                          >
                            <Icon.chevL />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLesson(1)}
                            aria-label="Next teaching point"
                            title="Next teaching point"
                          >
                            <Icon.chevR />
                          </button>
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
            viewBox="0 0 210 9"
            width="210"
            height="9"
            aria-hidden="true"
          >
            <path d="M3,5 C34,1 66,8 105,5 C144,2 176,8 207,4" />
          </svg>
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
