// The data-driven canvas renderer: it maps each typed block to its component and lays the
// blocks out on the card grid, applying the spotlight/dim treatment on the wrapper so every
// block type can be spotlighted. Block types beyond the core set resolve through the
// per-family loader (./blocks/loader) — a canvas render only downloads the families its
// answer actually uses, never the whole library; useBlockFamilies gates the grid so every
// card still mounts (and staggers) together.
import '../styles/canvas-runtime.css';
import '../live/print/print.css';
import { extendedRender } from './blocks/loader';
import { useBlockFamilies } from './blocks/useBlockFamilies';
// Shared visual foundations used across families (axis/legend primitives, empty states,
// entrance motion, exploration controls) — they ride the canvas, not any one family chunk.
import './lib/axis.css';
import './lib/empty.css';
import './lib/motion.css';
import './controls/controls.css';
import { FitBox } from './layout/FitBox';
import { FIT_TYPES } from './layout/fitPolicy';
import { useBloomMode } from './reveal/useBloomMode';
import { CanvasTakeover } from './focus/CanvasView';
import { boardCapable } from './focus/canvasGate';
import { InsightCard } from './InsightCard';
import { TrendChart } from './TrendChart';
import { BreakdownCard } from './BreakdownCard';
import { Timeline } from './Timeline';
import { ListCard } from './ListCard';
import { ComparisonMatrix } from './ComparisonMatrix';
import { SlidePreview } from './SlidePreview';
import { ActionCard } from './ActionCard';
import { ContextPill } from './trust';
// charts & diagrams
import { RingStat } from './RingStat';
import { BarChart } from './BarChart';
import { StackedBar } from './StackedBar';
import { Scatter } from './Scatter';
import { Heatmap } from './Heatmap';
import { FlowSteps } from './FlowSteps';
import { WebSnippets } from './WebSnippets';
import { Gallery } from './Gallery';
import { CodeMap } from './CodeMap';
import { DiffView } from './DiffView';
import { Checks } from './Checks';
// stats, sports & funnels
import { Donut } from './Donut';
import { Gauge } from './Gauge';
import { Scoreboard } from './Scoreboard';
import { Standings } from './Standings';
import { Pipeline } from './Pipeline';
import { KpiGrid } from './KpiGrid';
import { QuoteBlock } from './QuoteBlock';
import { ProgressChecklist } from './ProgressChecklist';
// creation layer
import { UnderstandCard } from './UnderstandCard';
import { SchemaDiagram } from './SchemaDiagram';
import { ScreenMap } from './ScreenMap';
import { BuildProgress } from './BuildProgress';
import { PreviewFrame } from './PreviewFrame';
import { Icon, type IconKey } from '../icons/icons';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResponsiveGrid, retileSection } from './hooks/useResponsiveGrid';
import { useAccessibleScrollRegions } from './hooks/useAccessibleScrollRegions';
import { useTruncatedTextDisclosures } from './hooks/useTruncatedTextDisclosures';
import './layout/hscroll.css';
import './layout/mobileText.css';
import './layout/textDisclosure.css';
import { BlockBoundary } from './BlockBoundary';
import { FallbackCard } from './FallbackCard';
import { CanvasSkeleton } from './CanvasSkeleton';
import { measureActionsWidth } from './layout/measureActionsWidth';
import { depthLens, hasSections } from '../live/depth/depthLens';
import { SectionGroup } from './depth/SectionGroup';
import { BendStrip } from './BendStrip';
import { ActionProposal, type ActionProposalProps } from './ActionProposal';
import { blockLabel } from './blockLabel';
import { BlankFillContext, type BlankFillState } from './lib';
import { useCardDrag } from './dnd/useCardDrag';
import { FocusStage } from './focus/FocusStage';
import { FocusToggle } from './focus/FocusToggle';
import type { ViewMode } from './focus/useFocusMode';
import type {
  Block,
  BendSpec,
  ConversationSpec,
  Extra,
  PreviewProps,
  AccentVar,
} from '../data/conversation';
import type { ReactNode, CSSProperties } from 'react';

// A replay extra is rare and opt-in; keeping its story composer out of the canvas's static graph
// avoids making every answer, course lesson, and Gallery tile download the reel runtime up front.
const ReplayCard = lazy(() =>
  import('./ReplayCard').then((module) => ({ default: module.ReplayCard })),
);

// Bounds for the zoomed sheet's magnification, adjustable via its +/- controls.
const ZOOM_MIN = 1;
const ZOOM_MAX = 1.75;
const ZOOM_STEP = 0.15;
const ZOOM_DEFAULT = 1.15;

/** Clamp a composite region's span to the 1..12 sub-grid; default to a readable half-width. */
function clampSpan(span: number | undefined): number {
  if (typeof span !== 'number' || !Number.isFinite(span)) return 6;
  return Math.min(12, Math.max(1, Math.round(span)));
}

/** The composite eyebrow icon, snapped to a real icon key (falls back to the layers glyph). */
function CompositeIcon(icon: IconKey, color: AccentVar | undefined): ReactNode {
  const Ic = Icon[icon] || Icon.layers;
  return <Ic className="ic" style={{ color: color || 'var(--presence)' }} />;
}

/** Everything one block's render depends on, shaped so the memo boundary below can hold:
 *  primitives plus stable references only. `spot` is non-null ONLY for composites (their
 *  nested regions light individually); every other block sees null, so a walk beat can't
 *  reach it through this prop. */
interface BlockViewProps {
  block: Block;
  nest: number;
  spotlight: boolean;
  dimmed: boolean;
  spot: string | null;
  onProve: () => void;
  onUnrenderable: (id: string) => void;
}

function BlockViewImpl({
  block: b,
  nest,
  spotlight,
  dimmed,
  spot,
  onProve,
  onUnrenderable,
}: BlockViewProps): ReactNode {
  const common = { delay: b.delay };
  // A composite is a model-arranged sub-grid of other blocks. Render it here (where the
  // full render path is in scope) so every region goes through the SAME vetted renderer.
  // A nesting cap stops a pathological self-nesting payload from recursing without bound.
  if (b.type === 'composite') {
    if (nest >= 2) return null;
    const p = b.props;
    return (
      <div
        className="card reveal cmp-card"
        style={{ ['--delay' as string]: (b.delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          {p.icon && CompositeIcon(p.icon, p.iconColor)} {p.title}
        </div>
        <div className="cmp-grid">
          {p.regions.map((r, i) => (
            <div
              key={i}
              className="cmp-cell"
              // Anchor each child so ink can mark it individually (a bracket groups N children,
              // a circle resolves to the child rather than the whole composite).
              data-spot-id={r.block.id}
              data-kind={r.block.type}
              style={{ ['--cmp-span' as string]: clampSpan(r.span) } as CSSProperties}
            >
              <BlockView
                block={r.block}
                nest={nest + 1}
                spotlight={!!r.block.id && spot === r.block.id}
                dimmed={!!r.block.id && !!spot && spot !== r.block.id}
                spot={r.block.type === 'composite' ? spot : null}
                onProve={onProve}
                onUnrenderable={onUnrenderable}
              />
            </div>
          ))}
        </div>
        {p.footer && <div className="cmp-foot">{p.footer}</div>}
      </div>
    );
  }
  if (b.type === 'insight')
    return (
      <InsightCard
        num={b.num}
        {...b.props}
        {...common}
        spotlight={spotlight}
        dimmed={dimmed}
        onProve={b.prove ? onProve : undefined}
      />
    );
  if (b.type === 'chart') return <TrendChart {...b.props} {...common} />;
  if (b.type === 'breakdown') return <BreakdownCard {...b.props} {...common} />;
  if (b.type === 'timeline') return <Timeline {...b.props} {...common} />;
  if (b.type === 'list') return <ListCard {...b.props} {...common} />;
  if (b.type === 'compare') return <ComparisonMatrix {...b.props} {...common} />;
  // --- charts & diagrams ---
  if (b.type === 'ring') return <RingStat {...b.props} {...common} />;
  if (b.type === 'bars') return <BarChart {...b.props} {...common} />;
  if (b.type === 'stack') return <StackedBar {...b.props} {...common} />;
  if (b.type === 'scatter') return <Scatter {...b.props} {...common} />;
  if (b.type === 'heat') return <Heatmap {...b.props} {...common} />;
  if (b.type === 'flow') return <FlowSteps {...b.props} {...common} />;
  if (b.type === 'web') return <WebSnippets {...b.props} {...common} />;
  if (b.type === 'gallery') return <Gallery {...b.props} {...common} />;
  if (b.type === 'codemap') return <CodeMap {...b.props} {...common} />;
  if (b.type === 'diff') return <DiffView {...b.props} {...common} />;
  if (b.type === 'checks') return <Checks {...b.props} {...common} />;
  // --- stats, sports & funnels ---
  if (b.type === 'donut') return <Donut {...b.props} {...common} />;
  if (b.type === 'gauge') return <Gauge {...b.props} {...common} />;
  if (b.type === 'scoreboard') return <Scoreboard {...b.props} {...common} />;
  if (b.type === 'standings') return <Standings {...b.props} {...common} />;
  if (b.type === 'pipeline') return <Pipeline {...b.props} {...common} />;
  if (b.type === 'kpi') return <KpiGrid {...b.props} {...common} />;
  if (b.type === 'quotes') return <QuoteBlock {...b.props} {...common} />;
  if (b.type === 'checklist') return <ProgressChecklist {...b.props} {...common} />;
  // --- creation layer ---
  if (b.type === 'understand') return <UnderstandCard {...b.props} {...common} />;
  if (b.type === 'schema') return <SchemaDiagram {...b.props} {...common} />;
  if (b.type === 'screenmap') return <ScreenMap {...b.props} {...common} />;
  if (b.type === 'buildprog') return <BuildProgress {...b.props} {...common} />;
  if (b.type === 'preview') return <PreviewFrame {...b.props} {...common} />;
  // A model-proposed action (Live only, not in the core Block union) — renders as a
  // confirm card; nothing runs until the user confirms. Coerced by liveSchema, so the
  // props are already validated.
  if ((b.type as string) === 'action') {
    const p = (b as unknown as { props: ActionProposalProps }).props;
    return <ActionProposal {...p} {...common} />;
  }
  // Extended library (~575 components, 23 families) — looked up through the per-family
  // loader (null while that family's chunk is in flight; useBlockFamilies holds the grid
  // back until every needed family has settled, so this is never null mid-render).
  // Cast through unknown so this compiles whether the extended union is empty (never) or full.
  const bx = b as unknown as { type: string; props: unknown; delay?: number; id?: string };
  const ext = extendedRender(bx.type);
  if (ext) {
    const rendered = ext(bx.props, {
      delay: bx.delay,
      spotlight,
      dimmed,
      blockId: bx.id,
      onUnrenderable,
    });
    // A handful of extended types carry an intrinsic minimum size CSS alone can't shrink
    // (see fitPolicy.ts) — scale the whole block down to the card instead of letting the
    // universal overflow net clip it.
    return FIT_TYPES.has(bx.type) ? <FitBox>{rendered}</FitBox> : rendered;
  }
  // No renderer resolved — the type is unknown here or its family chunk failed to load.
  // The block already passed validation, so its content is real: show it as a plain card
  // rather than nothing (a vanished block orphans its section header and eats the answer).
  return <FallbackCard block={b} />;
}

/** The single type → component dispatch, memoized. The streaming reveal re-sends the whole
 *  blocks-so-far list every time a block completes, and the spotlight walk re-renders the grid
 *  on every beat; with block identity preserved upstream (emitSpec / adaptiveCols) this one
 *  boundary turns both from "re-render every card" into "re-render the card that changed". */
const BlockView = memo(BlockViewImpl);

interface Props {
  data: ConversationSpec;
  spot: string | null;
  built: Record<string, boolean>;
  onProve: () => void;
  /** Live-only: tap "ask about this" on a block to pin it for a follow-up. Absent in the
   *  Demo, so no affordance renders there and the scripted surface stays pristine. */
  onAskBlock?: (b: Block) => void;
  /** Live-only: tap "+" on a block to pin THAT card onto a dashboard. Absent in the Demo. */
  onAddToDashboard?: (b: Block) => void;
  /** Ids of blocks the user has pinned, so they read as visibly selected on the canvas. */
  selectedBlockIds?: ReadonlySet<string>;
  /** When set, the canvas offers a Focus/Everything view toggle (the surface owns the
   *  remembered preference). Absent → the classic full grid, exactly as before — clips and
   *  any other embedder are unaffected. */
  viewMode?: ViewMode;
  onViewMode?: (mode: ViewMode) => void;
  /** Focus mode: tapping a filmstrip card asks the surface to narrate that block aloud. */
  onNarrate?: (b: Block) => void;
  /** Focus mode: the id of the block Mavéa is currently narrating, so the stage can show a quiet
   *  "describing this" indicator on it. */
  narratingId?: string | null;
  /** Live-only: output is muted. In Focus mode the stage reads calmly (no "Speaking" cue). */
  muted?: boolean;
  /** Live-only: reserve the margin-note gutter beside the grid (padding-right on `.card-grid`,
   *  where MarginNoteRail portals its notes). Reserved as padding so the responsive grid's
   *  content-box measurement re-budgets the card tiling on its own. Absent → classic grid. */
  noteGutter?: boolean;
  /** Live-only: the muted walk's written asides so far, in walk order — the Focus stage shows
   *  them as its clickable trail column ("Mavéa's notes"); the grid renders them via the
   *  annotation layer's rail instead. Absent/empty → no column. */
  walkNotes?: readonly { spot: string; text: string }[];
  /** Live-only: the answer's one draggable number (spec.bend) — renders a BendStrip under
   *  its block. Absent (the Demo, clips) → nothing renders. */
  bend?: BendSpec;
  /** Live-only: tap "Cards" on a block to turn it into flashcards (suggest-then-edit). Absent in
   *  the Demo, so the affordance is Live-only and the scripted surface stays pristine. */
  onAddToFlashcard?: (b: Block) => void;
  /** Ids captured to the flashcard deck this session, so the chip reads "Added". */
  flashedIds?: ReadonlySet<string>;
  /** Optional node rendered at the trailing edge of the canvas header, next to the
   *  Focus/Everything toggle. Used by Live to inject the persistent pen toggle. */
  headerSlot?: ReactNode;
  /** Optional node rendered between the canvas header and the card grid. Used by Live to
   *  place the voice scrubber below the Pen/Focus/Everything controls. */
  belowHeaderSlot?: ReactNode;
  /** Present mode: forwarded to FocusStage to hide the filmstrip and show the slide nav bar. */
  presenting?: boolean;
  /** Live-only: "The Blank Space" fill wiring (filled values, the armed hole, and how a fill
   *  commits). Provided via context so a BlankSlot nested inside any block reaches it. Absent in
   *  the Demo → holes fall back to local state and no card-drag affordance renders. */
  blankFill?: BlankFillState;
}

export function TopicCanvas({
  data,
  spot,
  built,
  onProve,
  onAskBlock,
  onAddToDashboard,
  selectedBlockIds,
  viewMode,
  onViewMode,
  onNarrate,
  narratingId,
  muted,
  noteGutter,
  walkNotes,
  bend,
  onAddToFlashcard,
  flashedIds,
  headerSlot,
  belowHeaderSlot,
  presenting,
  blankFill,
}: Props) {
  // The "Open my CRM/tracker" action launches the real built app full-screen.
  // The app it opens IS the topic's `preview` block (the same interactive PreviewFrame).
  const [launched, setLaunched] = useState<PreviewProps | null>(null);
  // Reading mode: expand every "Go deeper" drawer at once (find-in-page + screen reader access).
  // Offered only when the current answer has section-tagged blocks.
  const [readingMode, setReadingMode] = useState(false);
  // Zoom: the "magnify" pill on a card's action cluster opens that ONE block full-screen, re-using
  // the same renderBlock path so the zoomed view is pixel-identical to the card, just larger.
  const [zoomedBlock, setZoomedBlock] = useState<Block | null>(null);
  // How far the zoomed sheet's content is magnified, adjustable via the sheet's +/- controls.
  // Uses the CSS `zoom` property (not `transform: scale`) so the enlarged content participates in
  // layout — the sheet's scroll area grows to match, instead of clipping the painted overflow.
  const [zoomLevel, setZoomLevel] = useState(ZOOM_DEFAULT);
  useEffect(() => {
    if (!zoomedBlock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomedBlock(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedBlock]);
  const gridRef = useRef<HTMLDivElement>(null);
  // The "answers bloom" reveal choreography (off == today's plain .reveal entrance).
  const [bloomOn] = useBloomMode();
  // Responsive layout: re-runs the adaptive-cols algorithm at the actual container width
  // so rows are always full and blocks scale proportionally at every viewport size.
  // displayBlocks defaults to data.blocks as a safety net — the hook always returns
  // a valid array, but destructuring with a default prevents any edge-case undefined crash.
  // Blocks that reported themselves unrenderable at runtime (today: a `photo` whose every candidate
  // URL failed to load AND that carries no caption/title to degrade to). We drop them from the
  // tiling input so the grid reflows and closes the gap — a broken/empty tile is never shown.
  // Keyed by block id and reset per answer (data.id), so a fresh answer re-shows any dropped id.
  const [droppedIds, setDroppedIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setDroppedIds((prev) => (prev.size ? new Set() : prev));
  }, [data.id]);
  const markUnrenderable = useCallback((id: string) => {
    setDroppedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const sourceBlocks = useMemo(
    () =>
      droppedIds.size ? data.blocks.filter((b) => !b.id || !droppedIds.has(b.id)) : data.blocks,
    [data.blocks, droppedIds],
  );
  const { displayBlocks = sourceBlocks, budget } = useResponsiveGrid(sourceBlocks, gridRef);
  // Per-family chunk gate: hold the cards back until every family this answer uses has
  // loaded, then mount the whole grid in one pass (preloading at the stream/intent stage
  // means this is almost always already true — see blocks/loader.ts).
  const familiesLoaded = useBlockFamilies(data.blocks);
  const contentRevision = `${data.id}:${familiesLoaded}:${budget}`;
  useAccessibleScrollRegions(gridRef, contentRevision);
  useTruncatedTextDisclosures(gridRef, contentRevision);
  const previewBlock = data.blocks.find((b) => b.type === 'preview');
  const previewProps = previewBlock ? (previewBlock.props as PreviewProps) : null;

  // Focus mode is offered only when the surface opts in (viewMode set) AND there are at least two
  // id-bearing cards to page through — a single card has nothing to focus, so it stays a plain
  // grid and the toggle is hidden (without disturbing the remembered preference).
  const focusCapable = viewMode !== undefined && displayBlocks.filter((b) => !!b.id).length >= 2;
  const focused = focusCapable && viewMode === 'focus';
  // The spatial "Canvas" board is offered only when the answer is genuinely board-shaped. Gate on
  // data.blocks (not the responsive-trimmed set) so the offer is stable as the container resizes.
  const canvasCapable = viewMode !== undefined && boardCapable(data);
  const canvasView = canvasCapable && viewMode === 'canvas';
  // Canvas is a per-answer view, never a sticky mode: when a NEW answer arrives, fall back to the
  // normal view so the board can't hijack the next reply (voice + spotlight run in the normal view,
  // and the page scrolls normally). Read viewMode via a ref so this fires only on the answer change,
  // not the moment the user opens the canvas.
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  useEffect(() => {
    if (viewModeRef.current === 'canvas') onViewMode?.('everything');
  }, [data.id, onViewMode]);

  // The Blank Space: card-into-hole drag is offered only in Live (blankFill present) and only when
  // this answer actually has a card-kind hole to receive a card. Tap-to-place is the touch fallback.
  const cardBlanks = data.blanks?.filter((b) => b.kind === 'card') ?? [];
  const canDragCards = !!blankFill && cardBlanks.length > 0;
  const cardDrag = useCardDrag(
    data.blanks,
    (key, block) => blankFill?.fill({ kind: 'card', key, label: blockLabel(block), block }),
    (block) => {
      const target = cardBlanks.find((b) => b.key === blankFill?.activeKey) ?? cardBlanks[0];
      if (target)
        blankFill?.fill({ kind: 'card', key: target.key, label: blockLabel(block), block });
    },
  );

  // Parents hand onProve down as a fresh closure most renders; routing it through a ref keeps
  // the identity BlockView sees constant, so a changing callback can't defeat the memo for
  // every card on the canvas. (The per-block `b.prove` gating happens inside BlockView.)
  const onProveRef = useRef(onProve);
  onProveRef.current = onProve;
  const stableProve = useCallback(() => onProveRef.current(), []);

  const renderBlock = (b: Block): ReactNode => (
    <BlockView
      block={b}
      nest={0}
      spotlight={!!b.id && spot === b.id}
      dimmed={!!b.id && !!spot && spot !== b.id}
      spot={b.type === 'composite' ? spot : null}
      onProve={stableProve}
      onUnrenderable={markUnrenderable}
    />
  );

  const renderExtra = (ex: Extra): ReactNode => {
    if (ex.kind === 'slide') return <SlidePreview {...ex.props} />;
    if (ex.kind === 'action')
      return (
        <ActionCard
          {...ex.props}
          onConfirm={previewProps ? () => setLaunched(previewProps) : undefined}
        />
      );
    // `data` is the ConversationSpec this canvas is showing — the replay card turns it into a
    // shareable Mavéa Story of the real components.
    if (ex.kind === 'replay') {
      return (
        <Suspense fallback={null}>
          <ReplayCard {...ex.props} spec={data} />
        </Suspense>
      );
    }
    return null;
  };

  // Partition display blocks into concept sections when the model tagged them.
  // Falls back to a single anonymous section — the zero-regression path for untagged answers.
  // Each section is RE-TILED on its own: the flat pass fills rows across the whole answer, packing
  // blocks over section boundaries, so a section split back out can be left partial (col-4 + col-4
  // filling only 8/12 — a narrow, left-aligned block with an empty right edge). Re-tiling per
  // section restores full, even rows so every section spans the same width. Memoised on the inputs.
  const sections = useMemo(
    () =>
      depthLens(displayBlocks).map((s) => ({
        ...s,
        standard: retileSection(s.standard, budget),
        deeper: retileSection(s.deeper, budget),
      })),
    [displayBlocks, budget],
  );
  const useSections = hasSections(displayBlocks);
  // The "Expand/Collapse sections" toggle only does anything when a section actually has a "Go
  // deeper" drawer to open — otherwise it's a no-op that confuses. Show it only then.
  const hasDeeper = sections.some((s) => s.deeper.length > 0);

  // renderCard wraps a block in its col div + spotlight/dim/ask/flashcard chrome.
  // Both the flat card-grid and SectionGroup section paths use the same function so
  // block chrome is identical whether a block lives on the main canvas or in a drawer.
  const renderCard = (b: Block, i: number): ReactNode => {
    const isCard = !!b.id;
    const spotlit = isCard && spot === b.id;
    const dimmed = isCard && !!spot && spot !== b.id;
    // Live passes onAskBlock; the Demo doesn't, so the affordance is Live-only.
    const askable = isCard && !!onAskBlock;
    const addable = isCard && !!onAddToDashboard;
    const flashcardable = isCard && !!onAddToFlashcard;
    const flashed = flashcardable && !!flashedIds?.has(b.id!);
    const picked = askable && !!selectedBlockIds?.has(b.id!);
    // Zoom rides alongside the other Live-only pills — offered wherever the action cluster
    // already appears, never on its own in the Demo/Gallery's non-interactive cards.
    const zoomable = isCard && (askable || addable || flashcardable);
    // A real answer card can be dragged into a card-kind hole (never the holes card itself).
    const draggable = canDragCards && isCard && b.type !== 'blanks';
    return (
      <div
        className={
          'col-' +
          b.col +
          (spotlit ? ' spotlit' : '') +
          (dimmed ? ' dimmed' : '') +
          (askable ? ' askable' : '') +
          (addable ? ' addable' : '') +
          (flashcardable ? ' flashcardable' : '') +
          (zoomable ? ' zoomable' : '') +
          (picked ? ' picked' : '')
        }
        key={b.id || i}
        data-spot-id={b.id}
        data-kind={b.type}
      >
        <BlockBoundary fallback={<FallbackCard block={b} />}>{renderBlock(b)}</BlockBoundary>
        {bend && bend.blockId === b.id && <BendStrip bend={bend} />}
        {(askable || addable || flashcardable || zoomable || draggable) && (
          <div className="block-actions" ref={measureActionsWidth}>
            {draggable && (
              <button
                type="button"
                className="card-drag-handle"
                title={`Drag ${blockLabel(b)} into a slot`}
                aria-label={`Use ${blockLabel(b)} to fill a slot`}
                {...cardDrag.handleProps(b)}
              >
                <span aria-hidden>⠿</span>
              </button>
            )}
            {askable && (
              <button
                type="button"
                className="block-action-pill block-ask"
                aria-pressed={picked}
                title={picked ? 'Selected — ask about it below' : `Ask about ${blockLabel(b)}`}
                aria-label={picked ? `Unpin ${blockLabel(b)}` : `Ask about ${blockLabel(b)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAskBlock(b);
                }}
              >
                <Icon.chat />
                <span className="block-pill-label">{picked ? 'Selected' : 'Ask'}</span>
              </button>
            )}
            {addable && (
              <button
                type="button"
                className="block-action-pill block-ask block-add"
                title={`Add ${blockLabel(b)} to a dashboard`}
                aria-label={`Add ${blockLabel(b)} to a dashboard`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToDashboard!(b);
                }}
              >
                <Icon.plus />
                <span className="block-pill-label">Dashboard</span>
              </button>
            )}
            {flashcardable && (
              <button
                type="button"
                className={'block-action-pill block-cards' + (flashed ? ' is-flashed' : '')}
                aria-pressed={flashed}
                title={
                  flashed
                    ? `${blockLabel(b)} is in your flashcards`
                    : `Make flashcards from ${blockLabel(b)}`
                }
                aria-label={`Make flashcards from ${blockLabel(b)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToFlashcard!(b);
                }}
              >
                {flashed ? <Icon.check /> : <Icon.layers />}
                <span className="block-pill-label">{flashed ? 'Added' : 'Cards'}</span>
              </button>
            )}
            {zoomable && (
              <button
                type="button"
                className="block-action-pill block-zoom"
                title={`Zoom into ${blockLabel(b)}`}
                aria-label={`Zoom into ${blockLabel(b)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomedBlock(b);
                  setZoomLevel(ZOOM_DEFAULT);
                }}
              >
                <Icon.zoomIn />
                <span className="block-pill-label">Zoom</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    // Provide the fill wiring so a BlankSlot nested in any block reaches it; a null value (Demo)
    // is equivalent to no provider — the slot then keeps its own local state.
    <BlankFillContext.Provider value={blankFill ?? null}>
      {cardDrag.ghost}
      <div className="canvas-header">
        <div>
          <div className="canvas-title">{data.title}</div>
          <div className="canvas-sub">{data.sub}</div>
        </div>
        <div className="canvas-header-actions">
          {headerSlot}
          {canvasView ? (
            <button
              type="button"
              className="canvas-exit"
              onClick={() => onViewMode?.('everything')}
            >
              <span aria-hidden>←</span> Back to answer
            </button>
          ) : (
            <>
              {useSections && hasDeeper && !focused && (
                <button
                  type="button"
                  className={'depth-reading-toggle' + (readingMode ? ' is-reading' : '')}
                  aria-pressed={readingMode}
                  title={
                    readingMode ? 'Collapse all deeper sections' : 'Expand all deeper sections'
                  }
                  onClick={() => setReadingMode((m) => !m)}
                >
                  {readingMode ? 'Collapse sections' : 'Expand sections'}
                </button>
              )}
              {focusCapable && onViewMode && (
                <FocusToggle value={focused ? 'focus' : 'everything'} onChange={onViewMode} />
              )}
              {/* Canvas is an OPT-IN alternate view of this one answer, not a sticky mode: a button
                  that appears only when the answer is board-shaped, never the default. */}
              {canvasCapable && onViewMode && (
                <button
                  type="button"
                  className="canvas-open"
                  onClick={() => onViewMode('canvas')}
                  title="Spread this answer's cards on a board you can wander"
                >
                  <span className="canvas-open-glyph" aria-hidden>
                    ◇
                  </span>{' '}
                  View as canvas
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {belowHeaderSlot}
      {data.context.length > 0 && (
        <div className="context-row" style={{ marginBottom: 18 }}>
          <span className="faint" style={{ fontSize: 12.5, marginRight: 2 }}>
            Reading
          </span>
          {data.context.map((c, i) => (
            <ContextPill key={i} name={c.name} color={c.color} />
          ))}
        </div>
      )}
      {!familiesLoaded ? (
        // A needed family chunk is still in flight (a cold mount that skipped the preload —
        // e.g. a restored session). Keep the grid mounted so useResponsiveGrid's observer
        // stays live, but hold the cards: skeletons occupy the tracks the real cards will
        // fill, then everything reveals together when the loads settle.
        // The note gutter rides the placeholder too, so the width never jumps when cards land.
        <div
          className={
            'card-grid' + (bloomOn ? ' bloom-on' : '') + (noteGutter ? ' note-gutter' : '')
          }
          ref={gridRef}
          role="status"
          aria-busy="true"
          aria-label="Loading visuals"
        >
          <CanvasSkeleton blocks={displayBlocks} budget={budget} />
        </div>
      ) : canvasView ? (
        // The board takes the whole screen (a portal, so no column can clip it); closing lands
        // back in the conversation. Nothing renders in-flow — the takeover covers the page.
        <CanvasTakeover
          data={data}
          blocks={displayBlocks}
          spot={spot}
          renderBlock={renderBlock}
          onAskBlock={onAskBlock}
          selectedBlockIds={selectedBlockIds}
          onExit={() => onViewMode?.('everything')}
        />
      ) : focused ? (
        <FocusStage
          data={data}
          blocks={displayBlocks}
          spot={spot}
          renderBlock={renderBlock}
          onAskBlock={onAskBlock}
          selectedBlockIds={selectedBlockIds}
          onNarrate={onNarrate}
          narratingId={narratingId}
          muted={muted}
          walkNotes={walkNotes}
          presenting={presenting}
        />
      ) : (
        <div
          className={
            'card-grid' + (bloomOn ? ' bloom-on' : '') + (noteGutter ? ' note-gutter' : '')
          }
          ref={gridRef}
        >
          {useSections
            ? sections.map((sec, si) => (
                <SectionGroup
                  key={sec.label || si}
                  section={sec}
                  renderCard={renderCard}
                  readingMode={readingMode}
                />
              ))
            : displayBlocks.map((b, i) => renderCard(b, i))}
          {Object.keys(built)
            .filter((k) => built[k] && data.extras && data.extras[k as keyof typeof data.extras])
            .map((k) => {
              const ex = data.extras[k as keyof typeof data.extras] as Extra;
              // Extras carry CSS-12 col values. At tablet/mobile budgets go full-width;
              // at desktop/laptop keep the authored col so pairs share a row cleanly.
              const rawCol = Math.min(12, Math.max(1, ex.col || 6));
              const scaledCol = budget < 9 ? 12 : rawCol;
              return (
                <div className={'col-' + scaledCol} key={k}>
                  {renderExtra(ex)}
                </div>
              );
            })}
        </div>
      )}

      {/* The Blank Space: once the answer is awaiting input, a bar to finish it with the values
          filled so far. It sticks to the bottom of the canvas (CSS) so it stays in view however far
          the user has scrolled — the finish action is never stranded below the fold. Lives here (not
          LiveApp) so the whole affordance ships in one place; present only in Live, where blankFill
          + a complete handler are wired. */}
      {data.awaiting &&
        blankFill?.complete &&
        (() => {
          const filledCount = Object.keys(blankFill.values).length;
          const total = data.blanks?.length ?? 0;
          const allFilled = total > 0 && filledCount === total;
          // Four honest states: completing (the refine is running), everything filled (the answer
          // never submits itself — this state hands the moment to the user), some filled, and
          // nothing filled yet (a nudge toward what to do). The label carries the whole message so
          // the user never has to guess what the bar is for.
          const message = blankFill.busy
            ? 'Completing your answer…'
            : allFilled
              ? 'All filled — finish when ready'
              : filledCount === 0
                ? 'Fill the blanks above to finish'
                : `${filledCount} of ${total} filled`;
          return (
            <div
              className={`blank-complete-bar${blankFill.busy ? ' is-busy' : ''}${allFilled && !blankFill.busy ? ' is-ready' : ''}`}
              role="status"
              aria-live="polite"
            >
              <span className="blank-complete-count">
                {blankFill.busy && <span className="blank-complete-spinner" aria-hidden="true" />}
                {message}
              </span>
              <button
                type="button"
                className="blank-complete-btn"
                disabled={blankFill.busy || filledCount === 0}
                onClick={blankFill.complete}
              >
                Complete the answer
              </button>
            </div>
          );
        })()}

      {launched && (
        <div
          className="app-scrim"
          role="button"
          tabIndex={0}
          aria-label="Close app preview"
          onClick={() => setLaunched(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setLaunched(null);
            }
          }}
        >
          <div
            className="app-launch"
            role="button"
            tabIndex={0}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
          >
            <div className="app-launch-head">
              <span className="app-launch-title">
                {launched.app}
                <span className="app-launch-pill">
                  <span className="web-live-dot" /> Live on your workspace
                </span>
              </span>
              <button className="drawer-x" onClick={() => setLaunched(null)} aria-label="Close app">
                <Icon.x />
              </button>
            </div>
            <div className="app-launch-body">
              <PreviewFrame {...launched} />
            </div>
          </div>
        </div>
      )}

      {zoomedBlock && (
        <div
          className="zoom-scrim"
          role="button"
          tabIndex={0}
          aria-label="Close zoomed view"
          onClick={() => setZoomedBlock(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setZoomedBlock(null);
            }
          }}
        >
          <div
            className="zoom-sheet"
            role="button"
            tabIndex={0}
            aria-label={blockLabel(zoomedBlock)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
          >
            <div className="zoom-sheet-toolbar">
              <button
                type="button"
                className="zoom-sheet-zoom-btn"
                aria-label="Zoom out"
                disabled={zoomLevel <= ZOOM_MIN}
                onClick={() => setZoomLevel((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
              >
                <Icon.zoomOut />
              </button>
              <span className="zoom-sheet-zoom-level">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                className="zoom-sheet-zoom-btn"
                aria-label="Zoom in"
                disabled={zoomLevel >= ZOOM_MAX}
                onClick={() => setZoomLevel((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
              >
                <Icon.zoomIn />
              </button>
              <button
                type="button"
                className="zoom-sheet-x"
                aria-label="Close"
                onClick={() => setZoomedBlock(null)}
              >
                <Icon.x />
              </button>
            </div>
            <div className="zoom-sheet-body" style={{ zoom: zoomLevel }}>
              {renderBlock(zoomedBlock)}
            </div>
          </div>
        </div>
      )}
    </BlankFillContext.Provider>
  );
}
