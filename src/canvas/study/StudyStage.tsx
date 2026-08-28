import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { Block, ConversationSpec } from '../../data/conversation';
import { Icon } from '../../icons/icons';
import { BlockBoundary } from '../BlockBoundary';
import { FallbackCard } from '../FallbackCard';
import { blockKind, blockLabel } from '../blockLabel';
import { deriveStudyScene } from './scene';
import type { StudyAside, StudyNoteKind } from './types';
import { useStudyTravel } from './useStudyTravel';
import { useStudyMargin } from './useStudyMargin';
import { useFullscreen } from '../../lib/useFullscreen';
import './study.css';

interface Point {
  x: number;
  y: number;
}

interface Props {
  data: ConversationSpec;
  blocks: Block[];
  spot: string | null;
  renderBlock: (block: Block, depth?: number) => ReactNode;
  onAskBlock?: (block: Block) => void;
  /** What Mavéa has written about each object, keyed by block id. The SET is stable for an answer
   *  — what changes as the study re-casts is only which note is emphasised, which is a class rather
   *  than a remount, so nothing tears down as the study moves. */
  asides?: Readonly<Record<string, StudyAside>>;
  selectedBlockIds?: ReadonlySet<string>;
  onNarrate?: (block: Block) => void;
  narratingId?: string | null;
  muted?: boolean;
}

const DRAG_LIMIT_X = 96;
const DRAG_LIMIT_Y = 72;
const DRAG_THRESHOLD = 5;

const NOTE_LABELS: Record<StudyNoteKind, string> = {
  insight: 'Pattern',
  evidence: 'Evidence',
  caution: 'Assumption',
  question: 'Pressure test',
  takeaway: 'Decision cue',
};

function NoteIcon({ kind }: { kind: StudyNoteKind }) {
  switch (kind) {
    case 'evidence':
      return <Icon.proof />;
    case 'caution':
      return <Icon.alert />;
    case 'question':
      return <Icon.chat />;
    case 'takeaway':
      return <Icon.check />;
    default:
      return <Icon.spark />;
  }
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
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
}: Props) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [parkedIds, setParkedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [offsets, setOffsets] = useState<ReadonlyMap<string, Point>>(() => new Map());
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    start: Point;
    origin: Point;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setPinnedId(null);
    setParkedIds(new Set());
    setOffsets(new Map());
  }, [data.id]);

  const eligibleIds = useMemo(
    () => new Set(blocks.flatMap((block) => (block.id ? [block.id] : []))),
    [blocks],
  );
  const activeId =
    (pinnedId && eligibleIds.has(pinnedId) && !parkedIds.has(pinnedId) ? pinnedId : null) ?? spot;
  const scene = useMemo(
    () => deriveStudyScene(blocks, activeId, parkedIds, selectedBlockIds),
    [blocks, activeId, parkedIds, selectedBlockIds],
  );

  const foregroundId = scene.active?.id ?? null;
  const { stageRef, capture } = useStudyTravel(foregroundId);
  // Scoped to the stage element, so filling the screen gives the screen to the STUDY — not to the
  // app around it. The control and its target live together rather than being plumbed through
  // two components that would both have to be told which element they meant.
  const fullscreen = useFullscreen();
  // What Mavéa has written about the object being held up, and where that note sits.
  const activeAside = foregroundId ? (asides?.[foregroundId] ?? null) : null;
  const margin = useStudyMargin(stageRef, activeAside ? foregroundId : null, activeAside?.text);

  const choose = useCallback(
    (block: Block, keepContext = false) => {
      if (!block.id) return;
      // Holding an object in context must not disturb the study — it is an addition, not a recast.
      if (keepContext) {
        onAskBlock?.(block);
        return;
      }
      capture(block.id, foregroundId);
      setPinnedId(block.id);
      onNarrate?.(block);
    },
    [capture, foregroundId, onAskBlock, onNarrate],
  );

  const park = useCallback((block: Block) => {
    if (!block.id) return;
    setParkedIds((current) => new Set(current).add(block.id as string));
    setPinnedId((current) => (current === block.id ? null : current));
  }, []);

  const restore = useCallback(
    (id: string) => {
      capture(id, foregroundId);
      setParkedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setPinnedId(id);
      // Bringing a parked object back is the same gesture as picking one from the ring — it took
      // the stage in silence only because this path was written before `choose` learned to speak.
      const block = blocks.find((b) => b.id === id);
      if (block) onNarrate?.(block);
    },
    [blocks, capture, foregroundId, onNarrate],
  );

  const beginDrag = useCallback(
    (event: PointerEvent<HTMLElement>, id: string) => {
      if (event.button !== 0) return;
      const origin = offsets.get(id) ?? { x: 0, y: 0 };
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin,
        moved: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [offsets],
  );

  const moveDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) drag.moved = true;
    if (!drag.moved) return;
    setOffsets((current) => {
      const next = new Map(current);
      next.set(drag.id, {
        x: clamp(drag.origin.x + dx, DRAG_LIMIT_X),
        y: clamp(drag.origin.y + dy, DRAG_LIMIT_Y),
      });
      return next;
    });
  }, []);

  const endDrag = useCallback(
    (event: PointerEvent<HTMLElement>, block: Block) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (!drag.moved) choose(block, event.shiftKey);
    },
    [choose],
  );

  const onActorKey = useCallback(
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

  // Which object the narration is on, as a data attribute rather than a label. The pill that used
  // to say "Following this" named what the voice was already doing; the fact itself still has to
  // reach CSS (and, next, the face), so it stays — as state, not as copy.
  const speakingId = !muted && narratingId && active.id === narratingId ? narratingId : undefined;
  const lessonBlocks = blocks.filter((block) => block.id && !parkedIds.has(block.id));
  const lessonIndex = lessonBlocks.findIndex((block) => block.id === active.id);
  const moveLesson = (delta: -1 | 1): void => {
    if (lessonBlocks.length < 2 || lessonIndex < 0) return;
    const next = lessonBlocks[(lessonIndex + delta + lessonBlocks.length) % lessonBlocks.length];
    if (next) choose(next);
  };

  return (
    <section
      ref={stageRef}
      className={`study-stage intensity-${scene.intensity}${fullscreen.active ? ' is-fullscreen' : ''}`}
      aria-label="The Study"
      data-study-active={active.id}
      data-study-speaking={speakingId}
      data-study-note-kind={activeAside?.kind}
      // The study reserves its own margins, so MarginNoteRail can write the walk's asides beside
      // the objects they belong to. The gutter is measured off this element's own padding, which
      // keeps CSS the single source of the width.
      data-note-gutter={activeAside ? '' : undefined}
    >
      {/* Mavéa's note about the object being held up, and the arrow that makes it point.
          ONE note: showing every object's at once filled a single gutter with arrows crossing the
          foreground card and each other to reach objects on the far side. The others are not lost
          — each becomes the note the moment its object is brought forward. */}
      {activeAside && margin?.tether && (
        <svg
          className={`study-tether kind-${activeAside.kind}`}
          viewBox={`0 0 ${Math.round(margin.w)} ${Math.round(margin.h)}`}
          width={margin.w}
          height={margin.h}
          aria-hidden="true"
        >
          <path className="study-tether-line" d={margin.tether.d} />
          <path className="study-tether-head" d={margin.tether.head} />
        </svg>
      )}
      {activeAside && (
        <aside
          key={foregroundId ?? 'aside'}
          className={`study-aside kind-${activeAside.kind} side-${margin?.side ?? 'right'}`}
          style={
            margin
              ? ({
                  top: `${Math.round(margin.top)}px`,
                  rotate: `${margin.tilt.toFixed(2)}deg`,
                } as CSSProperties)
              : undefined
          }
          aria-live="polite"
        >
          <span className="study-note-kicker">
            <NoteIcon kind={activeAside.kind} />
            {NOTE_LABELS[activeAside.kind]}
          </span>
          <p className="study-note-copy">{activeAside.text}</p>
          {lessonBlocks.length > 1 && (
            <footer className="study-note-footer">
              <span aria-label={`Teaching point ${lessonIndex + 1} of ${lessonBlocks.length}`}>
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
        </aside>
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

      <div className="study-field">
        {scene.nearby.map((actor) => {
          const point = offsets.get(actor.id) ?? { x: 0, y: 0 };
          const selected = !!selectedBlockIds?.has(actor.id);
          const actorStyle = {
            '--study-slot': actor.slot,
            '--study-dx': `${point.x}px`,
            '--study-dy': `${point.y}px`,
          } as CSSProperties;
          return (
            <article
              key={actor.id}
              className={`study-actor study-actor-${actor.slot}${selected ? ' is-context' : ''}`}
              style={actorStyle}
              data-study-actor={actor.id}
              // The pen resolves its targets by data-spot-id alone (AnnotationLayer's host
              // lookup). Stamping only the foreground object meant Mavéa could mark exactly one
              // thing in the study and could never draw a connector between two — the study had
              // objects but no way to point at them. Every actor is a mark target now.
              data-spot-id={actor.id}
              data-kind={actor.block.type}
            >
              <div
                className="study-actor-pick"
                role="button"
                tabIndex={0}
                aria-label={`Bring ${blockLabel(actor.block)} forward`}
                onKeyDown={(event) => onActorKey(event, actor.block)}
                onPointerDown={(event) => beginDrag(event, actor.id)}
                onPointerMove={moveDrag}
                onPointerUp={(event) => endDrag(event, actor.block)}
                onPointerCancel={() => {
                  dragRef.current = null;
                }}
              >
                {/* Named, not previewed. A real card shrunk to a 148px box renders its body text
                    at ~5px — the shape of a chart with none of its information, which reads as
                    broken rather than as a preview. What survives the shrink is what the object
                    IS and what it is called, so that is what the study shows. */}
                <span className="study-actor-meta">
                  <span className="study-actor-kind">{blockKind(actor.block)}</span>
                  <span className="study-actor-title">{blockLabel(actor.block)}</span>
                  {actor.block.note && <span className="study-actor-note">{actor.block.note}</span>}
                </span>
              </div>
              <button
                type="button"
                className="study-actor-park"
                onClick={() => park(actor.block)}
                aria-label={`Park ${blockLabel(actor.block)}`}
                title="Move out of the way"
              >
                <Icon.x />
              </button>
            </article>
          );
        })}

        <div className="study-foreground">
          <div className="study-hero-shell">
            {/* Nothing floats over the object. Every pill tray tried here — a persistent one under
                the hero, then the grid's hover cluster in its corner — read as chrome bolted to a
                scene whose whole point is that there is nothing between the reader and the thing.
                The per-object actions live in the answer grid, which is the surface for working on
                a card; the study is the surface for looking at one. */}
            <div
              className={`study-hero${spot === active.id ? ' spotlit' : ''}`}
              key={active.id}
              data-spot-id={active.id}
            >
              <BlockBoundary fallback={<FallbackCard block={active} />}>
                {renderBlock(active)}
              </BlockBoundary>
            </div>
          </div>
          {active.note && !asides?.[active.id ?? ''] && (
            <p className="study-caption" aria-live="polite">
              {active.note}
            </p>
          )}
        </div>
      </div>

      {(scene.horizon.length > 0 || scene.parked.length > 0) && (
        <div className="study-horizon" aria-label="More in this answer">
          {scene.horizon.map((actor) => (
            <button
              key={actor.id}
              type="button"
              className="study-horizon-chip"
              onClick={(event) => choose(actor.block, event.shiftKey)}
              title="Bring forward"
            >
              <span>{blockKind(actor.block)}</span>
              {blockLabel(actor.block)}
            </button>
          ))}
          {scene.parked.map((actor) => (
            <button
              key={actor.id}
              type="button"
              className="study-horizon-chip is-parked"
              onClick={() => restore(actor.id)}
              aria-label={`Restore ${blockLabel(actor.block)}`}
              title="Restore to the study"
            >
              <span>Parked</span>
              {blockLabel(actor.block)}
              <b aria-hidden="true">+</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
