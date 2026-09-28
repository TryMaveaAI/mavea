// The data-driven canvas renderer: it maps each typed block to its component and lays the
// blocks out on the card grid, applying the spotlight/dim treatment on the wrapper so every
// block type can be spotlighted. Block types beyond the core set resolve through the
// per-family loader (./blocks/loader) — a canvas render only downloads the families its
// answer actually uses, never the whole library; useBlockFamilies gates the grid so every
// card still mounts (and staggers) together.
import '../styles/canvas-runtime.css';
import '../live/print/print.css';
import { useBlockFamilies, useExtendedRender } from './blocks/useBlockFamilies';
// Shared visual foundations used across families (axis/legend primitives, empty states,
// entrance motion, exploration controls) — they ride the canvas, not any one family chunk.
import './lib/axis.css';
import './lib/empty.css';
import './lib/motion.css';
import './controls/controls.css';
import { FitBox, type FitFacts } from './layout/FitBox';
import { diagramLabelPx, type DiagramFloors } from './layout/diagramFloor';
import { observeResize } from './layout/sharedResize';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useFocusTrap } from '../live/useFocusTrap';
import { FIT_TYPES } from './layout/fitPolicy';
import { CanvasTakeover } from './focus/CanvasView';
import { boardCapable } from './focus/canvasGate';
import type { StudyAside } from './study/types';
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
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useResponsiveGrid } from './hooks/useResponsiveGrid';
import { useSectionMasonry } from './depth/useSectionMasonry';
import { useAccessibleScrollRegions } from './hooks/useAccessibleScrollRegions';
import { useTruncatedTextDisclosures } from './hooks/useTruncatedTextDisclosures';
import './layout/hscroll.css';
import './layout/mobileText.css';
import './layout/textDisclosure.css';
import { BlockBoundary } from './BlockBoundary';
import { BlockEmpty } from './lib/BlockEmpty';
import { FallbackCard } from './FallbackCard';
import { LensStrip } from './lens/LensStrip';
import { skeletonCard, skeletonCell } from './CanvasSkeleton';
import { measureActionsWidth } from './layout/measureActionsWidth';
import { depthLens, hasSections } from '../live/depth/depthLens';
import { SectionGroup } from './depth/SectionGroup';
import { BendStrip } from './BendStrip';
import { bendBlock } from './bendBlock';
import { ActionProposal, type ActionProposalProps } from './ActionProposal';
import { blockLabel } from './blockLabel';
import { BlankFillContext, type BlankFillState } from './lib';
import { useCardDrag } from './dnd/useCardDrag';
import { savedViewMode, type ViewMode } from './focus/useFocusMode';
import { StudyStage } from './study/StudyStage';
import { deskObjects } from './study/scene';
import type {
  Block,
  BendSpec,
  ConversationSpec,
  Extra,
  PreviewProps,
  AccentVar,
} from '../data/conversation';
import { answerSignature } from '../data/conversation';
import type {
  ReactNode,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useBackdropDismiss } from '../lib/useBackdropDismiss';

// A replay extra is rare and opt-in; keeping its story composer out of the canvas's static graph
// avoids making every answer, course lesson, and Gallery tile download the reel runtime up front.
const ReplayCard = lazy(() =>
  import('./ReplayCard').then((module) => ({ default: module.ReplayCard })),
);

// Bounds for the zoomed sheet's magnification, adjustable via its +/- controls. Zooming out stops
// where the card's smallest type would paint under 9px (the fit reports that scale), and never
// under ZOOM_MIN whatever the card holds; in, it stops at 2.5x, past which a reader is panning a
// fragment rather than reading a card.
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
/** The Lens opens a card FITTED to its stage (`'fit'`), the way a viewer opens a picture: a short
 *  card is grown toward a reading size, a tall one is fitted down to the room, and neither ever
 *  runs wider than the sheet. At its board size a one-row stat card floated in a sheet five
 *  times its height, which is not looking closer. A number is the reader's own magnification,
 *  stepped from wherever the fit left the card. The readout toggles between the fit and actual
 *  size, on the keys a design tool uses for the same two views: Shift+0 is actual size, Shift+1
 *  the fit. ⌘0 and ⌘9 belong to the browser (its own zoom reset, its last tab), so taking them
 *  over a page is taking them from the reader. */
type LensZoom = 'fit' | number;
/** The body size the fit grows a card toward, in rendered px. The board's body type is ~14–16px
 *  on a laptop, so this is a visible step closer without a paragraph ballooning; FitBox caps the
 *  growth at 1.5x and never past the room. */
const LENS_READING_PX = 20;
/** …and past a 1920px window, where the sheet grows with the type scale and the board's body step
 *  is ~16px. */
const LENS_WIDE_READING_PX = 24;
/** The sheet width from which Mavéa's notes sit BESIDE the card rather than under it. Mirrors
 *  the `@container lens` query in wow-polish.css (a test holds the two together): under it a
 *  column of notes would leave the card too narrow to be worth the look. */
export const LENS_BESIDE_PX = 880;

// The Lens: click a card and it comes forward, the rest of the board dimming behind it. The
// gesture rides the cell, not the card, because the cell is what carries `.spotlit`/`.dimmed`.
//
// A card is not a button — it is full of links, controls and selectable prose — so the click has
// to prove it MEANT the card. Everything below is a way of not stealing a gesture that was aimed
// at something else; the keyboard route is a real button in the action cluster, never this.
const LENS_SLOP = 6; // px of travel still counted as a click, not a drag

/** Anything that owns its own click. A near-miss on the action cluster's padding is a miss, not
 *  an invitation to open the Lens, so the cluster itself is listed alongside real controls. */
const LENS_IGNORE = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
  '.block-actions',
  '[data-no-lens]',
].join(',');

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
  // Read before any early return: a hook, and the cell's own subscription to its family's chunk.
  const ext = useExtendedRender(b.type);
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
  // Extended library (595 components, 24 families) — looked up through the per-family
  // loader. A family still in flight shows a placeholder card, which this cell swaps for the
  // real one when the chunk lands.
  // Cast through unknown so this compiles whether the extended union is empty (never) or full.
  const bx = b as unknown as { type: string; props: unknown; delay?: number; id?: string };
  if (ext === 'pending') return skeletonCard(0);
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
  /** What Mavéa has written about each object in the Study, keyed by block id. */
  studyAsides?: Readonly<Record<string, readonly StudyAside[]>>;
  /** Block ids whose current Study aside set contains model-authored notes. */
  studyAsidesAuthored?: ReadonlySet<string>;
  /** The turn is still streaming blocks in — the Study holds its desk still and deals once. */
  studyStreaming?: boolean;
  /** Live's stable per-answer identity. Standalone consumers fall back to a content digest. */
  studyAnswerEpoch?: number;
  /** When set, the canvas offers its view doors (Guide me, View as canvas) and renders the view
   *  the surface names. Absent → the classic full grid, exactly as before — clips and
   *  any other embedder are unaffected. */
  viewMode?: ViewMode;
  onViewMode?: (mode: ViewMode) => void;
  /** Study: tapping a card asks the surface to narrate that block aloud. */
  onNarrate?: (b: Block) => void;
  /** Study: the id of the block Mavéa is currently narrating, so the stage can show a quiet
   *  "describing this" indicator on it. */
  narratingId?: string | null;
  /** Live-only: output is muted. The desk then reads calmly (no "Speaking" cue). */
  muted?: boolean;
  onToggleMute?: () => void;
  /** Live-only: reserve the margin-note gutter beside the grid (padding-right on `.card-grid`,
   *  where MarginNoteRail portals its notes). Reserved as padding so the responsive grid's
   *  content-box measurement re-budgets the card tiling on its own. Absent → classic grid. */
  noteGutter?: boolean;
  /** Live-only: the muted walk's written asides so far, in walk order — the desk shows them
   *  beside its cards; the grid renders them via the annotation layer's rail instead. */
  walkNotes?: readonly { spot: string; text: string }[];
  /** Study only: the line the voice is on, whether it is audible, the answer's lead, and
   *  whether the per-answer intro plays — see StudyStage's props. */
  voiceLine?: string | null;
  speaking?: boolean;
  preparing?: boolean;
  lead?: string;
  studyIntro?: 'full' | 'skip';
  /** Live-only: the answer's one draggable number (spec.bend) — renders a BendStrip under
   *  its block. Absent (the Demo, clips) → nothing renders. */
  bend?: BendSpec;
  /** Live-only: tap "Cards" on a block to turn it into flashcards (suggest-then-edit). Absent in
   *  the Demo, so the affordance is Live-only and the scripted surface stays pristine. */
  onAddToFlashcard?: (b: Block) => void;
  /** Ids captured to the flashcard deck this session, so the chip reads "Added". */
  flashedIds?: ReadonlySet<string>;
  /** Optional node rendered at the trailing edge of the canvas header, next to Guide
   *  me. Used by Live to inject the persistent pen toggle. */
  headerSlot?: ReactNode;
  /** Optional node rendered beside "View as canvas", at the very end of the header's action row.
   *  For controls that are that button's PEER — another way of looking at this same answer — so
   *  they read as a set rather than as one control stranded at the far end of the row. */
  viewSlot?: ReactNode;
  /** Optional node rendered between the canvas header and the card grid. Used by Live to
   *  place the voice scrubber below the Pen and the view doors. */
  belowHeaderSlot?: ReactNode;
  /** Live-only: enables the Lens — clicking a card opens it on its own stage. Called with the
   *  block when the stage opens and with null when it closes, so the surface can prepare that
   *  one card's notes. Absent (the Demo, the gallery, clips) → no gesture, no affordance. */
  onLens?: (b: Block | null) => void;
  /** Live-only: what the last turn did to THIS canvas — which cards it edited, which it added,
   *  stamped with the canvas's own signature. Applied only when that signature still matches, so
   *  a delta can never paint on an answer it did not describe. */
  revision?: { sig: string; changedIds: readonly string[]; addedIds: readonly string[] } | null;
  /** Live-only: this turn declared it corrects an earlier answer. Rendered as an honest
   *  was → now line, because a correction the reader cannot see is a silent rewrite. */
  corrects?: { what: string; was: string; now: string } | null;
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
  studyAsides,
  studyAsidesAuthored,
  studyStreaming,
  studyAnswerEpoch,
  viewMode,
  onViewMode,
  onNarrate,
  narratingId,
  muted,
  onToggleMute,
  noteGutter,
  walkNotes,
  voiceLine,
  speaking,
  preparing,
  lead,
  studyIntro,
  bend,
  onAddToFlashcard,
  flashedIds,
  headerSlot,
  viewSlot,
  belowHeaderSlot,
  onLens,
  revision,
  corrects,
  blankFill,
}: Props) {
  // The "Open my CRM/tracker" action launches the real built app full-screen.
  // The app it opens IS the topic's `preview` block (the same interactive PreviewFrame).
  const [launched, setLaunched] = useState<PreviewProps | null>(null);
  const [bendValue, setBendValue] = useState<number | null>(bend?.param.value ?? null);
  useEffect(() => setBendValue(bend?.param.value ?? null), [bend?.blockId, bend?.param.value]);
  // Reading mode: expand every "Go deeper" drawer at once (find-in-page + screen reader access).
  // Offered only when the current answer has section-tagged blocks.
  const [readingMode, setReadingMode] = useState(false);
  // The Lens: a card's "Look closer" pill (or a click on the card) opens that ONE block on a
  // stage, re-using the same renderBlock path so the view is pixel-identical to the card.
  const [zoomedBlock, setZoomedBlock] = useState<Block | null>(null);
  // How far the zoomed sheet's content is magnified, adjustable via the sheet's +/- controls.
  // Uses the CSS `zoom` property (not `transform: scale`) so the enlarged content participates in
  // layout — the sheet's scroll area grows to match, instead of clipping the painted overflow.
  const [zoomLevel, setZoomLevel] = useState<LensZoom>('fit');
  // The scale the fit settled on, reported by the stage's FitBox: the readout states it, and a
  // magnification starts from it rather than jumping back to the card's board size.
  const [fitScale, setFitScale] = useState(1);
  // What the fit learned beyond its scale: where the card's smallest type reaches the floor
  // (the zoom-out stops there), and whether the card still runs past the stage at that scale.
  const [lensFit, setLensFit] = useState<FitFacts>({ legibleMin: 0, spills: false });
  const onLensFit = useCallback((k: number, facts: FitFacts) => {
    setFitScale(k);
    setLensFit(facts);
  }, []);
  // The size the board already shows this card at. The Lens is for looking closer, so a fit
  // never takes the card below it; a card taller than the stage at that size scrolls instead.
  const [boardScale, setBoardScale] = useState(1);
  // What the card's diagrams' smallest labels painted at on the board. A diagram draws its labels
  // at whatever width its box gives it, and the stage is often narrower than the board's card
  // (the notes sit beside it), so a scale alone cannot keep the promise above for them.
  const [boardDiagramPx, setBoardDiagramPx] = useState<DiagramFloors>(() => new Map());
  // A narrow sheet stacks the notes under the card in the one scroll. When the card already runs
  // past the stage, four notes under it are a long way down, so they start folded to one line;
  // the reader's own choice (null until they make one) outranks that, until the next card.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [lensNarrow, setLensNarrow] = useState(false);
  const [notesOpen, setNotesOpen] = useState<boolean | null>(null);
  const lensOpen = zoomedBlock !== null;
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!lensOpen || !sheet) return;
    const read = () => setLensNarrow(sheet.clientWidth > 0 && sheet.clientWidth < LENS_BESIDE_PX);
    read();
    return observeResize(sheet, read);
  }, [lensOpen]);
  // The Lens is modal. While it is open the board behind it takes no focus, clicks or reading
  // cursor. Declared before the trap on purpose: effects clean up in order, so on close the board
  // is live again before the trap hands focus back to a card on it.
  const scrimRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const scrim = scrimRef.current;
    if (!lensOpen || !scrim?.parentElement) return;
    // Only what this effect set is undone: a sibling already inert stays that way.
    const quieted = Array.from(scrim.parentElement.children).filter(
      (el) => el !== scrim && !el.hasAttribute('inert'),
    );
    for (const el of quieted) el.setAttribute('inert', '');
    return () => {
      for (const el of quieted) el.removeAttribute('inert');
    };
  }, [lensOpen]);
  // Where the reader was when the Lens opened, and the card it last showed. A reader who opened it
  // from the board with the keyboard goes back to the card they stepped to, not the one they
  // started on; one who opened it any other way goes back to whatever held focus before.
  const lensOpener = useRef<HTMLElement | null>(null);
  const lensLastId = useRef<string | undefined>(undefined);
  useFocusTrap(scrimRef, {
    active: lensOpen,
    initialFocus: closeRef,
    onEscape: () => setZoomedBlock(null),
    returnTo: () => {
      const opener = lensOpener.current;
      if (!opener?.isConnected || !opener.closest('[data-spot-id]')) return null;
      const cell = boardCellOf(lensLastId.current);
      if (!cell) return null;
      return cell.contains(opener) ? opener : cell.querySelector<HTMLElement>('.block-lens');
    },
  });
  const fitted = zoomLevel === 'fit';
  // Honest in both modes: fitted, the stage's one FitBox is the whole scale (any FitBox inside
  // the block stands down under it); magnified, the fit holds at 1 and `zoom` is the whole scale.
  const shownZoom = fitted ? fitScale : zoomLevel;
  // A fit that landed on 100% is already actual size. Offering "100%" there would only swap the
  // notes' layout for a magnified one at the same scale.
  const atActual = fitted && Math.round(fitScale * 100) === 100;
  // Never under the floor, and never above 1 either: a card whose own type is already under 9px
  // can still be seen at its own size, which is what the board shows.
  const zoomFloor = Math.max(ZOOM_MIN, Math.min(1, lensFit.legibleMin));
  // The fit scale a magnification lays the card out against: the fit's own when a step leaves
  // the fit (so the picture carries on from it), 1 at actual size (the card's own layout).
  const [layoutFit, setLayoutFit] = useState(1);
  const zoomBy = (d: number): void => {
    if (fitted) setLayoutFit(fitScale);
    const from = fitted ? fitScale : zoomLevel;
    setZoomLevel(Math.min(ZOOM_MAX, Math.max(zoomFloor, +(from + d).toFixed(2))));
  };
  const actualSize = (): void => {
    setLayoutFit(1);
    setZoomLevel(1);
  };
  // What a press on the readout does: actual size from a fit, the fit from a magnification, and
  // nothing from a fit that is already actual size.
  const readoutOffer = atActual
    ? null
    : fitted
      ? { label: 'Actual size', keys: 'Shift+0', short: '100%', run: actualSize }
      : {
          label: 'Fit to the stage',
          keys: 'Shift+1',
          short: 'Fit',
          run: () => setZoomLevel('fit'),
        };
  // Past a 1920px window the Lens sheet grows with the type scale, so the reading size the fit
  // grows a card toward grows with it.
  const lensGrows = useMediaQuery('(width > 1920px)');
  useEffect(() => {
    if (!zoomedBlock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedBlock(null);
        return;
      }
      // Never steal the arrows from something the reader is typing in, or from a control that
      // uses them itself (a slider, a tab strip) inside the card on stage.
      // On a window keydown the target can be the document itself, which has no `closest` —
      // hence the instanceof rather than a cast.
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')
      ) {
        return;
      }
      // Shift+0 actual size, Shift+1 the fit. Matched on the physical key, not the character:
      // Shift+0 types ")" on a US keyboard and "0" on AZERTY, and both are the same key. Any other
      // modifier held means the chord is someone else's.
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.code === 'Digit0' || e.code === 'Digit1') {
          e.preventDefault();
          if (e.code === 'Digit0') {
            if (!atActual) actualSize();
          } else setZoomLevel('fit');
          return;
        }
      }
      // A focused pan region inside the card (a diagram held at its legible width, a wide table)
      // scrolls on the arrows; stepping the card there takes the pan away. Keyed to the region
      // role every pan carries: a truncated button overflows its box too, and does not pan.
      if (
        t instanceof HTMLElement &&
        t.matches('[role="region"]') &&
        t.closest('.card') &&
        t.scrollWidth > t.clientWidth
      ) {
        return;
      }
      if (e.key === 'ArrowRight') stepLens(1);
      else if (e.key === 'ArrowLeft') stepLens(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // The surface writes Mavéa's notes for whichever card is on the Lens stage, so it has to be
  // told when that changes — including on close, so it stops.
  const lensedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = zoomedBlock?.id ?? null;
    // The surface withdraws `onLens` while a turn streams, and the sheet can close in that window.
    // Recording the change with nobody listening would leave the surface believing the Lens is
    // still open — which now also holds a replay's chrome back — so it is reported once the
    // listener returns instead.
    if (!onLens || lensedIdRef.current === id) return;
    lensedIdRef.current = id;
    onLens?.(zoomedBlock);
  }, [zoomedBlock, onLens]);

  const gridRef = useRef<HTMLDivElement>(null);
  // Responsive layout: re-runs the adaptive-cols algorithm at the actual container width
  // so rows are always full and blocks scale proportionally at every viewport size.
  // displayBlocks defaults to data.blocks as a safety net — the hook always returns
  // a valid array, but destructuring with a default prevents any edge-case undefined crash.
  // Blocks that reported themselves unrenderable at runtime (today: a `photo` whose every candidate
  // URL failed to load AND that carries no caption/title to degrade to). We drop them from the
  // tiling input so the grid reflows and closes the gap — a broken/empty tile is never shown.
  // Keyed by block id and reset per answer (data.id), so a fresh answer re-shows any dropped id.
  const [droppedIds, setDroppedIds] = useState<ReadonlySet<string>>(() => new Set());
  // Keyed on the ANSWER, not `data.id`: a live spec's id is the constant 'live', so this reset
  // never fired between answers — a block that reported itself unrenderable once stayed suppressed
  // for the rest of the session, and because ids restart at live-1 on a replace it went on to
  // suppress an unrelated block in every later answer.
  const answerSig = useMemo(
    () => answerSignature({ id: data.id, blocks: data.blocks }),
    [data.id, data.blocks],
  );
  useEffect(() => {
    if (studyStreaming) return;
    setDroppedIds((prev) => (prev.size ? new Set() : prev));
  }, [answerSig, studyStreaming]);

  // The bloom's hidden FROM frames — a retracted trend line, an unwiped bar, a number resolving
  // out of a blur — are only safe while their animations are actually running. `bloom-on` sits on
  // the grid for its whole life, so on its own it holds those frames indefinitely, and a
  // `backwards` fill keeps showing the 0% frame for as long as its animation has not started. An
  // animation that never starts therefore hides its content for good: a chart paints its axes,
  // gridlines and legend around a line retracted out of view. Scope them to the window the
  // choreography needs and let every element rest settled afterwards.
  //
  // The window covers the longest chain the layer can draw: the lead (150ms) + the per-card
  // stagger cap (560ms, see generateLive's block delays) + a cinematic draw (900ms) at the calm
  // motion scale, with room to spare. Anything still moving at the end is already on its settled
  // frame, so dropping the class cannot leave a gap.
  const BLOOM_WINDOW_MS = 4000;
  const [blooming, setBlooming] = useState(false);
  useEffect(() => {
    setBlooming(true);
    const timer = setTimeout(() => setBlooming(false), BLOOM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [answerSig]);
  const markUnrenderable = useCallback((id: string) => {
    setDroppedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const sourceBlocks = useMemo(
    () =>
      droppedIds.size ? data.blocks.filter((b) => !b.id || !droppedIds.has(b.id)) : data.blocks,
    [data.blocks, droppedIds],
  );
  const { displayBlocks = sourceBlocks, budget } = useResponsiveGrid(sourceBlocks, gridRef);
  // Per-family chunk gate: hold the first paint until every family it uses has loaded, then
  // mount the whole grid in one pass (preloading at the stream/intent stage means this is
  // almost always already true — see blocks/loader.ts). A family a later block brings is
  // waited on by that card alone.
  const familiesLoaded = useBlockFamilies(data.blocks);
  const contentRevision = `${data.id}:${familiesLoaded}:${budget}`;
  useAccessibleScrollRegions(gridRef, contentRevision);
  useTruncatedTextDisclosures(gridRef, contentRevision);
  const previewBlock = data.blocks.find((b) => b.type === 'preview');
  const previewProps = previewBlock ? (previewBlock.props as PreviewProps) : null;

  // Study mode needs one addressable object, and never disturbs the remembered preference if a
  // particular answer cannot use it.
  // The desk drops a world preview — it is a doorway to another surface, not an object to examine
  // (StudyStage does the same filter) — so counting one here offered a Study that then rendered
  // nothing at all: no cards, no message, no way back but the toggle.
  const deskCount = deskObjects(displayBlocks).filter((b) => !!b.id).length;
  const studyCapable = viewMode !== undefined && deskCount >= 1;
  const inStudy = studyCapable && viewMode === 'study';
  // The spatial "Canvas" board is offered only when the answer is genuinely board-shaped. Gate on
  // data.blocks (not the responsive-trimmed set) so the offer is stable as the container resizes.
  const canvasCapable = viewMode !== undefined && boardCapable(data);
  const canvasView = canvasCapable && viewMode === 'canvas';
  // Canvas is a per-answer view, never a sticky mode: when a NEW answer arrives, fall back to the
  // standing view so the board can't hijack the next reply (voice + spotlight run there,
  // and the page scrolls normally). Read viewMode via a ref so this fires only on the answer change,
  // not the moment the user opens the canvas. Keyed on the ANSWER, not `data.id` — that is the
  // constant 'live', so this only ever ran on mount, and a follow-up that MERGES (no remount)
  // landed on the board the previous answer had opened.
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  useEffect(() => {
    if (viewModeRef.current === 'canvas') onViewMode?.(savedViewMode());
  }, [answerSig, onViewMode]);

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

  const drawBlock = (b: Block, onStage: boolean): ReactNode => (
    <BlockView
      block={bend && bendValue !== null ? bendBlock(b, bend, bendValue) : b}
      nest={0}
      spotlight={!onStage && !!b.id && spot === b.id}
      dimmed={!onStage && !!b.id && !!spot && spot !== b.id}
      spot={b.type === 'composite' ? spot : null}
      onProve={stableProve}
      onUnrenderable={markUnrenderable}
    />
  );
  const renderBlock = (b: Block): ReactNode => drawBlock(b, false);
  // The Lens shows one card at a time, so the board's spotlight has no meaning there: a card the
  // narration is not on would otherwise sit on the stage dimmed to 42%.
  const renderOnStage = (b: Block): ReactNode => drawBlock(b, true);

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
  // Each section is RE-TILED by SectionGroup for the width it actually has (see there).
  const sections = useMemo(() => depthLens(displayBlocks), [displayBlocks]);
  // Whether this answer renders as concept sections. The raw hasSections() answer can change
  // mid-stream — the first section-tagged block may land several blocks in, and a tagged block
  // can drop out later (unrenderable) — and every flip re-parents each mounted card between
  // SectionGroup and the plain grid: a full remount that replays every entrance. Latch
  // sticky-true per answer instead: once an answer has shown sections it stays sectioned until
  // a new data.id re-decides. Guarded render-phase set, so the latch lands in the same pass.
  const [sectionedAnswer, setSectionedAnswer] = useState<string | null>(null);
  if (sectionedAnswer !== data.id && hasSections(displayBlocks)) setSectionedAnswer(data.id);
  const useSections = sectionedAnswer === data.id;
  // The takeovers unmount the grid, so the flag includes them: coming back re-attaches the packing
  // to the grid element that is mounted then.
  useSectionMasonry(gridRef, useSections && sections.length >= 2 && !inStudy && !canvasView);
  // The "Expand/Collapse sections" toggle only does anything when a section actually has a "Go
  // deeper" drawer to open — otherwise it's a no-op that confuses. Show it only then.
  const hasDeeper = sections.some((s) => s.deeper.length > 0);

  // A delta only means anything on the canvas it was measured against — block ids are positional
  // and reused, so `live-3` here is a different object from `live-3` a turn ago. The signature is
  // the guard, and it is the bug class this codebase has already lost four separate effects to.
  const revOps = revision && revision.sig === answerSig ? revision : null;

  // Where a press started, so a click can prove it began on the card it ended on. A drag released
  // past the card's edge, and a click whose target unmounted mid-gesture (the browser retargets to
  // the nearest survivor), both read as "I clicked a thing and it did something else".
  const lensDown = useRef<{ id: string; x: number; y: number } | null>(null);
  const zoomScrim = useBackdropDismiss(() => setZoomedBlock(null));

  const lensPointerDown = (b: Block) => (e: ReactPointerEvent<HTMLDivElement>) => {
    lensDown.current = e.button === 0 && b.id ? { id: b.id, x: e.clientX, y: e.clientY } : null;
  };

  /** The card's cell on the board (the Lens stage renders its own copy, which this skips). */
  function boardCellOf(id: string | undefined): HTMLElement | undefined {
    return Array.from(
      gridRef.current?.parentElement?.querySelectorAll<HTMLElement>('[data-spot-id]') ?? [],
    ).find((el) => el.dataset.spotId === id && !el.closest('.zoom-scrim'));
  }
  /** The scale the board's own fit draws a card at (1 unless it had to shrink it). */
  const boardScaleOf = (id: string | undefined): number => {
    const cell = boardCellOf(id);
    const fit = cell?.querySelector<HTMLElement>(':scope > .fit-box > div');
    const k = Number(/scale\(([\d.]+)\)/.exec(fit?.style.transform ?? '')?.[1]);
    return k > 0 ? k : 1;
  };
  /** Open the Lens on a block: its own stage, over a board faded back behind it. */
  const openLens = (b: Block): void => {
    if (!zoomedBlock) lensOpener.current = document.activeElement as HTMLElement | null;
    lensLastId.current = b.id;
    setBoardScale(boardScaleOf(b.id));
    const cell = boardCellOf(b.id);
    setBoardDiagramPx(cell ? diagramLabelPx(cell) : new Map());
    setNotesOpen(null);
    setZoomedBlock(b);
    setZoomLevel('fit');
  };
  // Every card the Lens can step to, in reading order: one object at a time, and the others still
  // within reach without leaving the stage.
  const lensSteps = displayBlocks.filter((b) => b.id);
  const lensAt = zoomedBlock ? lensSteps.findIndex((b) => b.id === zoomedBlock.id) : -1;
  // Clamped, never wrapping: wrapping in a reading surface quietly loses your place.
  const stepLens = (d: number): void => {
    const next = lensAt >= 0 ? lensSteps[lensAt + d] : undefined;
    if (next) openLens(next);
  };

  const lensClick = (b: Block) => (e: ReactMouseEvent<HTMLDivElement>) => {
    const start = lensDown.current;
    lensDown.current = null;
    if (!onLens || !b.id || !start || start.id !== b.id) return;
    // A modified click belongs to the browser: ⌘/ctrl opens a link in a tab, shift extends a
    // selection. Only a plain primary click is ours.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > LENS_SLOP) return;
    // A reader who just dragged out a sentence to copy did not ask for the Lens.
    const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
    if (sel && !sel.isCollapsed && sel.toString().trim() !== '') return;
    if ((e.target as HTMLElement | null)?.closest(LENS_IGNORE)) return;
    // The Lens has taken this click, so nothing above may also act on it. The surface hangs a
    // click-away dismiss on the scroller — "a click outside the spotlit card puts the board
    // back" — and this click IS outside the previously spotlit card, so without this the two
    // handlers run in order and cancel each other out: the card lights and goes dark again.
    e.stopPropagation();
    openLens(b);
  };

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
    // Magnification is a control ON the Lens stage now, not a second pill beside it: two
    // adjacent buttons for "show me this card alone" is the mode-picker problem one level down,
    // and the sheet they both opened was always the same sheet.

    // A real answer card can be dragged into a card-kind hole (never the holes card itself).
    const draggable = canDragCards && isCard && b.type !== 'blanks';
    const lensable = isCard && !!onLens;
    const revKind =
      revOps && b.id
        ? revOps.changedIds.includes(b.id)
          ? 'edit'
          : revOps.addedIds.includes(b.id)
            ? 'add'
            : null
        : null;
    return (
      // The cell takes a pointer gesture but is NOT given a role or a tab stop: it holds buttons
      // and links, so calling it a button would be an ARIA lie, and 16 new tab stops in front of
      // the composer would be worse than no shortcut at all. The keyboard (and screen-reader)
      // route to the same thing is the "Look closer" button in the action cluster below — which
      // is why this disable is safe, and the same trade `.canvas-scroll` already makes.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div
        className={
          'col-' +
          b.col +
          (spotlit ? ' spotlit' : '') +
          (dimmed ? ' dimmed' : '') +
          (askable ? ' askable' : '') +
          (addable ? ' addable' : '') +
          (flashcardable ? ' flashcardable' : '') +
          (picked ? ' picked' : '') +
          (lensable ? ' lensable' : '')
        }
        // An EDITED card is remounted, by keying it on the revision as well as its slot. A refine
        // swaps props under the same id, so the component instance survives — and 252 of the
        // extended components hold their own state, so a card edited from five rows to three can
        // be left pointing at row four. Remounting discards that uniformly, and gives the edit
        // the entrance it otherwise never gets. Unchanged cards keep their plain id, so the rest
        // of the board does not churn.
        key={revKind === 'edit' && b.id ? `${b.id}:${revOps!.sig}` : b.id || i}
        data-spot-id={b.id}
        data-kind={b.type}
        data-rev={revKind ?? undefined}
        onPointerDown={lensable ? lensPointerDown(b) : undefined}
        onClick={lensable ? lensClick(b) : undefined}
      >
        {revKind && (
          <aside className={'rev-chip is-' + revKind}>
            {revKind === 'edit' ? 'Edited' : 'New'}
          </aside>
        )}
        <BlockBoundary fallback={<FallbackCard block={b} />}>{renderBlock(b)}</BlockBoundary>
        {bend && bend.blockId === b.id && (
          <BendStrip bend={bend} value={bendValue ?? bend.param.value} onChange={setBendValue} />
        )}
        {(askable || addable || flashcardable || draggable || lensable) && (
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
            {lensable && (
              <button
                type="button"
                className="block-action-pill block-lens"
                title={`Look closer at ${blockLabel(b)}`}
                aria-label={`Look closer at ${blockLabel(b)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openLens(b);
                }}
              >
                <Icon.eye />
                <span className="block-pill-label">Look closer</span>
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
          </div>
        )}
      </div>
    );
  };

  const appScrim = useBackdropDismiss(() => setLaunched(null));
  return (
    // Provide the fill wiring so a BlankSlot nested in any block reaches it; a null value (Demo)
    // is equivalent to no provider — the slot then keeps its own local state.
    <BlankFillContext.Provider value={blankFill ?? null}>
      {cardDrag.ghost}
      <div className="canvas-header">
        <div>
          <div className="canvas-title">{data.title}</div>
          <div className="canvas-sub">{data.sub}</div>
          {corrects && (
            // Owning it out loud. This was computed, validated and carried on the frame all
            // along, and shown only inside a `title` tooltip — which is invisible on a touch
            // device and invisible to anyone not hovering the right row of the rail.
            <p className="rev-corrects">
              <span className="rev-corrects-what">{corrects.what}</span>
              <span className="rev-corrects-was">{corrects.was}</span>
              <span className="rev-corrects-arrow" aria-hidden>
                →
              </span>
              <span className="rev-corrects-now">{corrects.now}</span>
            </p>
          )}
        </div>
        <div className="canvas-header-actions">
          {revOps && (revOps.changedIds.length > 0 || revOps.addedIds.length > 0) && (
            <button
              type="button"
              className="rev-pill"
              // Dead text naming something you cannot reach is worse than no text: this takes
              // you to the first card the turn touched.
              title="Show me what changed"
              onClick={() => {
                const id = revOps.changedIds[0] ?? revOps.addedIds[0];
                const block = displayBlocks.find((x) => x.id === id);
                if (block && onLens) openLens(block);
              }}
              disabled={!onLens}
            >
              {[
                revOps.changedIds.length > 0 && `${revOps.changedIds.length} edited`,
                revOps.addedIds.length > 0 && `${revOps.addedIds.length} new`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </button>
          )}
          {headerSlot}
          {canvasView ? (
            <button
              type="button"
              className="canvas-exit"
              onClick={() => onViewMode?.(savedViewMode())}
            >
              <span aria-hidden>←</span> Back to the board
            </button>
          ) : (
            <>
              {useSections && hasDeeper && !inStudy && (
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
              {/* The desk is a takeover of THIS answer, so it carries its own door back. The board itself needs no control: it is where the canvas
                  rests, and reading one card closer is a gesture on the card. */}
              {onViewMode && inStudy && (
                <button
                  type="button"
                  className="study-exit"
                  onClick={() => onViewMode(savedViewMode())}
                >
                  <span aria-hidden>←</span> Back to the board
                </button>
              )}
              {studyCapable && onViewMode && !inStudy && (
                <button
                  type="button"
                  className="guide-me"
                  onClick={() => onViewMode('study')}
                  title="Pull this answer onto one desk and walk it with Mavéa"
                >
                  <span className="guide-me-glyph" aria-hidden>
                    ◐
                  </span>{' '}
                  Guide me
                </button>
              )}
              {viewSlot}
              {/* Canvas is an OPT-IN alternate view of this one answer, not a sticky mode: a button
                  that appears only when the answer is board-shaped, never the default. */}
              {canvasCapable && onViewMode && (
                <button
                  type="button"
                  className="canvas-open"
                  onClick={() => onViewMode('canvas')}
                  title="Spread this answer's cards on a canvas you can wander"
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
      {familiesLoaded && displayBlocks.length === 0 ? (
        <div className="card reveal canvas-empty-answer">
          <BlockEmpty
            message="Nothing usable to show"
            hint="Try asking again or choosing another model."
          />
        </div>
      ) : familiesLoaded && canvasView ? (
        // The board takes the whole screen (a portal, so no column can clip it); closing lands
        // back in the conversation. Nothing renders in-flow — the takeover covers the page.
        <CanvasTakeover
          data={data}
          blocks={displayBlocks}
          spot={spot}
          renderBlock={renderBlock}
          onAskBlock={onAskBlock}
          selectedBlockIds={selectedBlockIds}
          onExit={() => onViewMode?.(savedViewMode())}
        />
      ) : familiesLoaded && inStudy ? (
        <StudyStage
          data={data}
          blocks={displayBlocks}
          spot={spot}
          renderBlock={renderBlock}
          onAskBlock={onAskBlock}
          asides={studyAsides}
          asidesAuthored={studyAsidesAuthored}
          selectedBlockIds={selectedBlockIds}
          onNarrate={onNarrate}
          narratingId={narratingId}
          muted={muted}
          onToggleMute={onToggleMute}
          walkNotes={walkNotes}
          voiceLine={voiceLine}
          speaking={speaking}
          preparing={preparing}
          lead={lead}
          intro={studyIntro}
          streaming={studyStreaming}
          answerEpoch={studyAnswerEpoch}
        />
      ) : (
        // ONE grid element for both the loading and the loaded state: two sibling .card-grid
        // divs made React tear one subtree down and rebuild the other on the swap — every card
        // re-inserted (replaying its entrance, a visible flicker) and useResponsiveGrid's
        // observer left watching the destroyed node. The element (and gridRef) survive the
        // families gate opening; only the children change. While a needed family chunk is
        // still in flight (a cold mount that skipped the preload — e.g. a restored session),
        // skeletons occupy the very tracks the real cards will fill, then everything reveals
        // together when the loads settle. The note gutter rides the placeholder too, so the
        // width never jumps when cards land.
        <div
          className={
            'card-grid bloom-on' +
            (blooming ? ' blooming' : '') +
            (noteGutter ? ' note-gutter' : '')
          }
          ref={gridRef}
          role={familiesLoaded ? undefined : 'status'}
          aria-busy={familiesLoaded ? undefined : true}
          aria-label={familiesLoaded ? undefined : 'Loading visuals'}
        >
          {!familiesLoaded && useSections ? (
            // A sectioned answer nests its cards under section shells, so there is no cell-for-cell
            // mapping to hold onto — it keeps the whole-subtree swap.
            displayBlocks.map((b, i) => skeletonCell(b, i, budget))
          ) : (
            <>
              {useSections
                ? sections.map((sec, si) => (
                    <SectionGroup
                      key={sec.label || si}
                      section={sec}
                      renderCard={renderCard}
                      readingMode={readingMode}
                    />
                  ))
                : // ONE map for both states: each block renders as its skeleton until its family
                  // chunk lands and as its card after, under the same key, so the grid cell is
                  // reconciled rather than torn down and re-inserted.
                  displayBlocks.map((b, i) =>
                    familiesLoaded ? renderCard(b, i) : skeletonCell(b, i, budget),
                  )}
              {/* Extras join only once the chunks are in: they render through the same family
                  registry the cards do, and the skeleton state has no placeholder for them. */}
              {Object.keys(built)
                .filter(
                  (k) =>
                    familiesLoaded &&
                    built[k] &&
                    data.extras &&
                    data.extras[k as keyof typeof data.extras],
                )
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
            </>
          )}
        </div>
      )}

      {/* The Blank Space: once the answer is awaiting input, a bar to finish it with the values
          filled so far. It sticks to the bottom of the canvas (CSS) so it stays in view however far
          the user has scrolled — the finish action is never stranded below the fold. Lives here (not
          LiveApp) so the whole affordance ships in one place; present only in Live, where blankFill
          + a complete handler are wired. The Study walks an answer rather than finishing it, so
          the bar stays on the board. */}
      {data.awaiting &&
        !inStudy &&
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
          onPointerDown={appScrim.onPointerDown}
          onClick={appScrim.onClick}
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

      {zoomedBlock &&
        (() => {
          const lensNotes = zoomedBlock.id ? (studyAsides?.[zoomedBlock.id] ?? []) : [];
          const notesShown = !lensNarrow || (notesOpen ?? !lensFit.spills);
          return (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
            <div
              ref={scrimRef}
              className="zoom-scrim"
              // The dialog is the whole stage: the sheet and the strip of cards under it.
              role="dialog"
              aria-modal="true"
              aria-label={blockLabel(zoomedBlock)}
              onPointerDown={zoomScrim.onPointerDown}
              onClick={zoomScrim.onClick}
            >
              <div
                ref={sheetRef}
                className="zoom-sheet"
                data-notes={lensNotes.length > 0 ? '' : undefined}
                data-magnified={fitted ? undefined : ''}
              >
                <div className="zoom-sheet-toolbar">
                  {/* What you are looking at. The row was controls-only and right-aligned, which
                      left the top of the stage reading as an empty band. */}
                  {/* One quiet label. The card states its own kind and headline immediately
                      below, and the controls already say which card of how many — anything more
                      here is the same sentence twice. */}
                  <div className="zoom-sheet-title">Looking closer</div>
                  <div className="zoom-sheet-tools">
                    {/* Always a visible way to the next card. The strip is the rich way, and a
                        short window has no room for it; arrow keys alone are no way at all for
                        a reader who does not know they exist. */}
                    {lensSteps.length > 1 && (
                      // At either end the button says so rather than going `disabled`: a
                      // disabled button drops the focus it holds to the page, and a keyboard
                      // reader pressing Next to the last card would land back on the board.
                      <div className="zoom-sheet-stepper" role="group" aria-label="Cards">
                        <button
                          type="button"
                          className="zoom-sheet-step-btn"
                          aria-label="Previous card"
                          aria-disabled={lensAt <= 0}
                          onClick={() => stepLens(-1)}
                        >
                          <Icon.chevL />
                        </button>
                        <span className="zoom-sheet-step-at" aria-live="polite">
                          {lensAt + 1} of {lensSteps.length}
                        </span>
                        <button
                          type="button"
                          className="zoom-sheet-step-btn"
                          aria-label="Next card"
                          aria-disabled={lensAt >= lensSteps.length - 1}
                          onClick={() => stepLens(1)}
                        >
                          <Icon.chevR />
                        </button>
                      </div>
                    )}
                    {/* One group, so a narrow sheet under a thumb can set it aside whole: pinch
                        is the zoom there. */}
                    <div className="zoom-sheet-zoom" role="group" aria-label="Zoom">
                      <button
                        type="button"
                        className="zoom-sheet-zoom-btn"
                        aria-label="Zoom out"
                        disabled={shownZoom <= zoomFloor + 0.005}
                        onClick={() => zoomBy(-ZOOM_STEP)}
                      >
                        <Icon.zoomOut />
                      </button>
                      {/* The readout is also the toggle between the fit and actual size. At rest
                        it reads as the number it always was; hovered or focused it names what a
                        press will do. The offer is painted from `data-offer`, never written as
                        text, so the button holds one value: its text is the zoom, nothing else. */}
                      <button
                        type="button"
                        className="zoom-sheet-zoom-level"
                        aria-label={`Zoom ${Math.round(shownZoom * 100)}%. ${
                          readoutOffer?.label ?? 'Already actual size'
                        }`}
                        aria-disabled={readoutOffer ? undefined : true}
                        aria-keyshortcuts={readoutOffer?.keys}
                        title={
                          readoutOffer ? `${readoutOffer.label} (${readoutOffer.keys})` : undefined
                        }
                        onClick={readoutOffer?.run}
                        data-offer={readoutOffer?.short}
                      >
                        <span className="zoom-sheet-zoom-now">{Math.round(shownZoom * 100)}%</span>
                      </button>
                      <button
                        type="button"
                        className="zoom-sheet-zoom-btn"
                        aria-label="Zoom in"
                        disabled={shownZoom >= ZOOM_MAX}
                        onClick={() => zoomBy(ZOOM_STEP)}
                      >
                        <Icon.zoomIn />
                      </button>
                    </div>
                  </div>
                  {/* Its own slot at the end of the first row, whatever wraps: the way out is
                      never pushed onto a second line or off the edge of a phone. */}
                  <button
                    ref={closeRef}
                    type="button"
                    className="zoom-sheet-x"
                    aria-label="Back to the board"
                    onClick={() => setZoomedBlock(null)}
                  >
                    <Icon.x />
                  </button>
                </div>
                {/* The ONE thing that scrolls: the card, and Mavéa's notes beside it on a wide
                    sheet or under it on a narrow one. Only the card scales. The toolbar sits
                    outside, so magnifying can never move, shrink or scroll the controls — a sticky
                    toolbar inside the scroller was sized to the sheet and, once the zoomed card
                    overflowed, its right end (and the close button) went with it. */}
                <div className="zoom-sheet-scroll">
                  <div
                    className="zoom-sheet-body"
                    // A magnification keeps the width the fit laid the card out at (--lens-fit),
                    // so the first step in or out moves on from the fitted picture instead of
                    // re-flowing the card at its board size first.
                    style={
                      fitted
                        ? undefined
                        : ({ zoom: zoomLevel, '--lens-fit': layoutFit } as CSSProperties)
                    }
                  >
                    {/* Fitted, the card is grown toward a reading size or shrunk to the room
                        before it scrolls; once the reader magnifies, scrolling is the point. */}
                    <FitBox
                      fitHeight={fitted}
                      hold={!fitted}
                      governs
                      onStage
                      minScale={boardScale}
                      diagramFloorPx={boardDiagramPx}
                      readingPx={
                        fitted ? (lensGrows ? LENS_WIDE_READING_PX : LENS_READING_PX) : undefined
                      }
                      onScale={fitted ? onLensFit : undefined}
                    >
                      {renderOnStage(zoomedBlock)}
                    </FitBox>
                  </div>
                  {lensNotes.length > 0 && (
                    <aside
                      className="lens-notes"
                      aria-label={`Mavéa's notes on ${blockLabel(zoomedBlock)}`}
                    >
                      {lensNarrow ? (
                        <button
                          type="button"
                          className="lens-notes-eyebrow lens-notes-toggle"
                          aria-expanded={notesShown}
                          onClick={() => setNotesOpen(!notesShown)}
                        >
                          Mavéa&rsquo;s notes
                          {!notesShown && (
                            <span className="lens-notes-count"> · {lensNotes.length}</span>
                          )}
                          <Icon.chevR className="lens-notes-chev" aria-hidden="true" />
                        </button>
                      ) : (
                        <div className="lens-notes-eyebrow">Mavéa&rsquo;s notes</div>
                      )}
                      {notesShown &&
                        lensNotes.map((n, ni) => (
                          <p key={ni} className={'lens-note is-' + n.kind}>
                            {n.text}
                          </p>
                        ))}
                    </aside>
                  )}
                </div>
              </div>
              {lensSteps.length > 1 && (
                // Under the sheet, on the backdrop — not inside it. The stage is one card; the
                // strip is the rest of the answer, and keeping it outside means it never scrolls
                // away with the card and never competes with the notes for the sheet's height.
                // The filmstrip rail, reused whole: real miniatures, a roving tab stop and
                // arrow-key walking all come with it.
                <LensStrip
                  blocks={lensSteps}
                  activeId={zoomedBlock.id ?? null}
                  onPick={(id) => {
                    const b = lensSteps.find((x) => x.id === id);
                    if (b) openLens(b);
                  }}
                  renderBlock={renderOnStage}
                />
              )}
            </div>
          );
        })()}
    </BlankFillContext.Provider>
  );
}
