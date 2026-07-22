// PrismOverlay.tsx — "drop a PDF, watch it bloom into a world." A full-screen overlay (mounted
// like AtlasView) that explodes the attached document into grounded claim cards, clustered into the
// document's own regions, with contradiction threads drawn only between two real passages. Every
// card carries a verbatim quote + page anchor — if Mavéa can't cite it, the card doesn't exist.
//
// Layout is deterministic (no physics, no randomness): regions are placed on a ring, claims spiral
// within their region by golden angle. So the same document always reads the same way, and the
// "Ask the whole doc / Find contradictions" actions just re-weight what's emphasized — they never
// move the map.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Attachment } from '../attachments';
import type { ModelConfig } from '../../types/mavea';
import { usePrismWorld } from './usePrismWorld';
import { usePanZoom } from './usePanZoom';
import { layout, CARD_W, CARD_H, type LayoutResult, type Placed } from './layout';
import { layoutPrismOffMain } from './layoutOffMain';
import { DocPageView } from './DocPageView';
import { destroyRenderDoc } from './extractPdf';
import { safeHttpUrl } from '../../lib/sourceHost';
import { useFocusTrap } from '../useFocusTrap';
import type { SearchProviderId } from '../search/types';
import type { ClaimBox, ClaimKind, PrismPhase, PrismSpec, ThreadRelation } from './types';
import type { CorpusCounts, Lens } from './synthesis/types';
import type { PlacedContradiction, PlacedGap, PlacedConsensus } from './synthesis/layoutCorpus';
import { runVeracity, standingLine, VERDICT_META, type Veracity } from './veracity';
import type { AnswerSpan, AskAnswer } from './ask/types';
import type { AskContext } from './ask/ask';
import { buildBriefing } from './briefing/path';
import type { BriefingBeat } from './briefing/types';
import type { Reconciliation } from './reconcile/types';
import type { Objection } from './crossexam/types';
import type { ForecastGrade } from './autopsy/types';
import type { LeverModel, LeverNode } from './levers/types';
// "Why" — a grounded causal web over the uploaded document's corpus (Prism's own per-page text), so
// it's a lens on what you uploaded rather than a separate app.
import type { WhyDag } from '../why/types';
import { useAnnotationReel } from './annotation/useAnnotationReel';
import { accentForClaim, claimExplain, inkForKind, INK_KEY } from './annotation/pen';
import type { PenAccent } from '../annotate/penStrokes';
import { AnnotationReelButton } from './annotation/AnnotationReelButton';
import type { AnnotationStep, PenGeometry } from './annotation/steps';
import { AsyncSurface } from '../../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../../lib/preloadableLazy';
import './prism.css';
import './synthesis/synthesis.css';

const askSurface = createPreloadableLazy(() =>
  import('./ask/PrismAskController').then((m) => ({ default: m.PrismAskController })),
);
const briefingSurface = createPreloadableLazy(() =>
  import('./briefing/PrismBriefingPlayer').then((m) => ({ default: m.PrismBriefingPlayer })),
);
const crossExamSurface = createPreloadableLazy(() =>
  import('./crossexam/CrossExamPanel').then((m) => ({ default: m.CrossExamPanel })),
);
const forecastSurface = createPreloadableLazy(() =>
  import('./autopsy/ForecastPanel').then((m) => ({ default: m.ForecastPanel })),
);
const leverSurface = createPreloadableLazy(() =>
  import('./levers/LeverPanel').then((m) => ({ default: m.LeverPanel })),
);
const whySurface = createPreloadableLazy(() =>
  import('../why/WhyMachineOverlay').then((m) => ({ default: m.WhyMachineOverlay })),
);

const PrismAskController = askSurface.Component;
const PrismBriefingPlayer = briefingSurface.Component;
const CrossExamPanel = crossExamSurface.Component;
const ForecastPanel = forecastSurface.Component;
const LeverPanel = leverSurface.Component;
const WhyMachineOverlay = whySurface.Component;

let reconcileRunner: Promise<typeof import('./reconcile/run')> | null = null;
let crossExamRunner: Promise<typeof import('./crossexam/run')> | null = null;
let autopsyRunner: Promise<typeof import('./autopsy/run')> | null = null;
let leversRunner: Promise<typeof import('./levers/model')> | null = null;
let whyRunner: Promise<typeof import('../why/explode')> | null = null;
const loadReconcile = () => (reconcileRunner ??= import('./reconcile/run'));
const loadCrossExam = () => (crossExamRunner ??= import('./crossexam/run'));
const loadAutopsy = () => (autopsyRunner ??= import('./autopsy/run'));
const loadLevers = () => (leversRunner ??= import('./levers/model'));
const loadWhy = () => (whyRunner ??= import('../why/explode'));

let kokoroModule: Promise<typeof import('../../voice/kokoro')> | null = null;
function loadKokoro(): Promise<typeof import('../../voice/kokoro')> {
  kokoroModule ??= import('../../voice/kokoro');
  return kokoroModule;
}
function cancelKokoro(): void {
  if (kokoroModule) void kokoroModule.then((m) => m.cancelKokoro());
}
function speakKokoroResult(text: string): void {
  void loadKokoro().then((m) => m.speakKokoroResult(text, 'mavea'));
}

/** Kind → accent token + label. Tints a card; never organizes layout (regions do that). */
const KIND_META: Record<ClaimKind, { color: string; label: string }> = {
  forecast: { color: 'var(--presence)', label: 'FORECAST' },
  stat: { color: 'var(--insight)', label: 'STAT' },
  finding: { color: 'var(--insight-soft)', label: 'FINDING' },
  risk: { color: 'var(--danger)', label: 'RISK' },
  definition: { color: 'var(--text-muted)', label: 'DEFINITION' },
  method: { color: 'var(--warning)', label: 'METHOD' },
  diagram: { color: 'var(--presence)', label: 'FIGURE' },
};

const REGION_PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-deep)',
  'var(--insight-soft)',
  'var(--danger)',
];

/** Thread relation → label. "agrees" is the cross-document positive case (two papers concur). */
const THREAD_LABEL: Record<ThreadRelation, string> = {
  contradicts: 'contradicts',
  'in-tension': 'in tension',
  agrees: 'agrees',
};

/** The kind palette legend — what each card color means. Order matches the mockup's two columns. */
const KIND_LEGEND: { kind: ClaimKind; desc: string }[] = [
  { kind: 'forecast', desc: 'what it predicts' },
  { kind: 'finding', desc: 'what it observed' },
  { kind: 'definition', desc: 'its terms' },
  { kind: 'method', desc: 'how it knows' },
  { kind: 'stat', desc: 'a hard number' },
  { kind: 'risk', desc: 'the caveats' },
  { kind: 'diagram', desc: 'a figure or chart' },
];

/** The thread palette legend — the line style + meaning of each relation. */
const THREAD_LEGEND: { relation: ThreadRelation; name: string; desc: string }[] = [
  { relation: 'agrees', name: 'Supports', desc: 'one claim props up another' },
  { relation: 'contradicts', name: 'Contradicts', desc: 'two passages disagree' },
  { relation: 'in-tension', name: 'In tension', desc: 'a softer pull, not a clash' },
];

/** Per-document swatch colors for the multi-PDF source legend (distinct from kind/region accents). */
const DOC_PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--insight-soft)'];

/** The on-card flag for a claim that's linked to another passage, by relation + cross-doc-ness. */
function flagText(relation: ThreadRelation, crossDoc?: boolean): string {
  const where = crossDoc ? 'another document' : 'another passage';
  if (relation === 'agrees') return `agrees with ${where}`;
  if (relation === 'in-tension') return `in tension with ${where}`;
  return `contradicts ${where}`;
}

/** A settled card's certainty state, for styling the state pill. A grounded card with no thread is
 *  "anchored" (ready to interrogate); a threaded one wears its relation. (The "blooming" state in the
 *  mockup is the pre-settle phase, shown by the bloom ticker — settled cards are all anchored.) */
function claimState(thread?: { relation: ThreadRelation }): 'anchored' | ThreadRelation {
  return thread ? thread.relation : 'anchored';
}
/** The short state label shown under a card (mockup's "anchored · ready" / "in contradiction"). */
function stateLabel(thread?: { relation: ThreadRelation }): string {
  if (!thread) return 'anchored · ready';
  if (thread.relation === 'agrees') return 'agrees · ready';
  if (thread.relation === 'in-tension') return 'in tension';
  return 'in contradiction';
}

/** What the source panel is currently showing — generalized over a clicked CLAIM and an Ask It answer
 *  SPAN, so the same DocPageView renders either: a verbatim quote on its real page.
 *  `fromAsk` distinguishes an answer span (no neighbor walk, presence-tinted) from a claim. */
interface PanelView {
  source: number;
  page: number;
  quote: string;
  color: string;
  kindLabel: string;
  title: string;
  isFigure: boolean;
  box?: ClaimBox;
  /** Other claims grounded on this same page — the page shows all its marks at once. */
  also?: { quote: string; color: string }[];
  connections: { id: string; title: string }[];
  fromAsk: boolean;
  /** True when the reader is just paging through the document (no claim/answer) — no highlight. */
  browse?: boolean;
  /** The pen's explanation for this view (the caption, and the reel narration when recorded). */
  penExplain: string;
  /** Concrete ink for the pen — theme-agnostic, so the live mark matches the exported reel. */
  penColor: string;
  /** Claim-aware judgment ink (a load-bearing star, a forecast's "?") — absent for Ask views. */
  penAccent?: PenAccent;
}

/** An already-settled world fed in from OUTSIDE (the corpus/Synthesis pipeline), instead of exploding
 *  a PDF here. When provided, the overlay skips its own explode and renders this spec with the full
 *  Prism experience — typed cards, source panels, threads, and the whole toolbar — so corpus mode IS
 *  Prism, not a lesser copy. `spec` is a PrismSpec whose regions are themes and whose claims span
 *  sources; `corpus` is the per-source page text (for Ask + source panels). */
export interface ExternalWorld {
  phase: PrismPhase;
  spec: PrismSpec | null;
  corpus: string[][] | null;
  proposed: number;
  error: string | null;
  /** The current pipeline stage line, shown under the bloom while a corpus settles. */
  stage?: string;
}

/** The corpus-only chrome layered on top of the shared Prism view: a 4-way lens, the gap + consensus
 *  objects (contradictions already draw as threads), and the labels/positions to render them. All
 *  positions are in the SAME world coordinates as layout(), so they align with the cards. */
export interface CorpusChrome {
  lens: Lens;
  setLens: (l: Lens) => void;
  counts: CorpusCounts;
  contradictions: readonly PlacedContradiction[];
  gaps: readonly PlacedGap[];
  consensus: readonly PlacedConsensus[];
  /** A short citation label for a source index (shown on object receipts). */
  sourceLabel: (source: number) => string;
}

export interface PrismOverlayProps {
  /** One PDF to explode, or several to explode and compare (multi-PDF mode). */
  pdf: Attachment | readonly Attachment[];
  /** The model that reads the PDF (Anthropic/Gemini). Null → the hook surfaces a friendly error. */
  cfg: ModelConfig | null;
  /** Web-grounding settings, taken straight from the user's Live settings, for the veracity check.
   *  When omitted or `enabled` is false (the default — web search is off), the live-data check does
   *  NOT run and no verdict seals are shown: Prism simply maps the document. */
  search?: { enabled: boolean; providerId: SearchProviderId; apiKey?: string };
  onClose: () => void;
  /** Corpus mode: render this externally-settled world instead of exploding `pdf`. */
  world?: ExternalWorld;
  /** Corpus mode: the lens switcher + gap/consensus objects layered on the shared view. */
  corpusChrome?: CorpusChrome;
  /** The first-run tour: once the map settles, auto-play the silent claim fly-through (camera glows
   *  each grounded claim in turn) — no bytes, no model. */
  autoBriefing?: boolean;
}

export function PrismOverlay({
  pdf,
  cfg,
  search,
  onClose,
  world,
  corpusChrome,
  autoBriefing,
}: PrismOverlayProps): ReactElement {
  const pdfs = useMemo(() => (Array.isArray(pdf) ? pdf : [pdf as Attachment]), [pdf]);
  const multiDoc = pdfs.length > 1;
  const [expanded, setExpanded] = useState(false);
  // The internal explode hook always runs (hook order), but in corpus mode we ignore its state and use
  // the externally-fed `world` instead — one rich view drives both single-doc Prism and the corpus.
  const internal = usePrismWorld(cfg);
  const { phase, spec, corpus, proposed, error } = world ?? internal;
  const { explode } = internal;
  const [openId, setOpenId] = useState<string | null>(null);
  // Free reading: page through a whole document, decoupled from the claims. {doc, page} when the
  // reader is browsing; null when not. Takes the source panel over to a plain page view (no highlight).
  const [browse, setBrowse] = useState<{ doc: number; page: number } | null>(null);
  // Ask It: the span currently spotlighted in the source panel (an answer's verbatim anchor), the
  // set of (doc:page) keys an answer cited (so those cards light up), and whether the dock is shown.
  const [askFocus, setAskFocus] = useState<AnswerSpan | null>(null);
  const [citedKey, setCitedKey] = useState<ReadonlySet<string>>(() => new Set());
  const [askOpen, setAskOpen] = useState(false);
  const [askLoaded, setAskLoaded] = useState(false);
  const [askSeed, setAskSeed] = useState<{ id: number; question: string } | null>(null);
  const [askSession, setAskSession] = useState(0);
  // The Briefing: the built flight (null = not briefing) + the claim ids the current beat frames+glows.
  const [briefing, setBriefing] = useState<BriefingBeat[] | null>(null);
  const [briefingIds, setBriefingIds] = useState<ReadonlySet<string>>(() => new Set());
  // Latest camera "fit" — held in a ref so the early Escape handler can reframe on briefing exit
  // without depending on the pan hook (which is created further down).
  const fitRef = useRef<() => void>(() => {});
  // Reconcile: the document's own figures that don't add up (null = not run yet; [] = ran, all consistent),
  // an in-flight flag, and whether the reconcile lens is showing.
  const [recon, setRecon] = useState<Reconciliation[] | null>(null);
  const [reconBusy, setReconBusy] = useState(false);
  const [reconOn, setReconOn] = useState(false);
  const reconAbort = useRef<AbortController | null>(null);
  // Cross-Examine: the objections raised against the load-bearing claims (null = not run yet), an
  // in-flight flag, whether the dock is showing, and the objection currently spotlighted.
  const [xe, setXe] = useState<Objection[] | null>(null);
  const [xeBusy, setXeBusy] = useState(false);
  const [xeOpen, setXeOpen] = useState(false);
  const [xeActiveId, setXeActiveId] = useState<string | null>(null);
  const xeAbort = useRef<AbortController | null>(null);
  // Forecast Autopsy: the document's dated predictions graded against reality (web-grounded, opt-in).
  const [fa, setFa] = useState<ForecastGrade[] | null>(null);
  const [faBusy, setFaBusy] = useState(false);
  const [faOpen, setFaOpen] = useState(false);
  const [faActiveId, setFaActiveId] = useState<string | null>(null);
  const faAbort = useRef<AbortController | null>(null);
  // Live Levers: the gated model implied under the document (null = not run / none that checks out).
  const [lv, setLv] = useState<LeverModel | null>(null);
  const [lvBusy, setLvBusy] = useState(false);
  const [lvOpen, setLvOpen] = useState(false);
  const lvRan = useRef(false);
  const lvAbort = useRef<AbortController | null>(null);
  // Which lens is emphasized: null = the map, 'contra' = highlight only contradiction threads.
  const [lens, setLens] = useState<'map' | 'contra'>('map');
  // The Why lens opens as its own layer over the map. Null = closed; `lensBusy` guards the build.
  const [whyDag, setWhyDag] = useState<WhyDag | null>(null);
  const [lensBusy, setLensBusy] = useState<'why' | null>(null);
  const whyAbort = useRef<AbortController | null>(null);
  // The kind + thread palette legend — the vocabulary of the map. Off by default so it never sits on
  // the cards; a footer toggle opens it when you want to read what the colors and line styles mean.
  const [legendOpen, setLegendOpen] = useState(false);
  // The source-page panel's share of the split (%), driven by a draggable divider. 100 = PDF-only.
  const [pdfPct, setPdfPct] = useState(44);
  const splitRef = useRef<HTMLDivElement>(null);
  const dragDivider = useRef(false);
  // Traps Tab inside the dialog and restores focus to whatever opened it on close. Escape is
  // handled separately below (it backs out of nested panels before closing the whole overlay),
  // so onEscape is intentionally left unset here.
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef);
  // Veracity: load-bearing claims checked against the live world → a verdict + gated web citation per
  // claim (keyed by claim id). `verifying` shows the honest "checking N claims" state while in flight.
  const [veracity, setVeracity] = useState<Map<string, Veracity>>(() => new Map());
  const [verifying, setVerifying] = useState(false);
  // Annotate (pen) mode — an independent toggle (default off). When on, asking / clicking a claim /
  // the Briefing each draw a hand-drawn mark over the cited passage. `penAudioOn` opts into spoken
  // narration (silent by default — Prism never auto-talks). `askText` holds the last Ask readout so
  // the pen can explain an answer span. `reel` records the marks for the share reel.
  // The walkthrough's auto-briefing runs with the pen already in hand: each beat's page gets the
  // quote highlight PLUS the hand-drawn circles/underlines, animating in as the flight lands.
  const [penOn, setPenOn] = useState(autoBriefing === true);
  const [penAudioOn, setPenAudioOn] = useState(false);
  const [askText, setAskText] = useState('');
  const { steps: reelSteps, record: recordStep, clear: clearReel } = useAnnotationReel();

  const onDividerDown = useCallback((e: React.PointerEvent) => {
    dragDivider.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);
  const onDividerMove = useCallback((e: React.PointerEvent) => {
    if (!dragDivider.current || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const fromRight = ((rect.right - e.clientX) / rect.width) * 100;
    // clamp: never smaller than 24% (panel still useful), up to 100% (PDF-only, map hidden)
    setPdfPct(Math.max(24, Math.min(100, fromRight)));
  }, []);
  const onDividerUp = useCallback((e: React.PointerEvent) => {
    dragDivider.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  // Auto-explode on mount (the gesture is "open it → it blooms"). Skipped in corpus mode — the world
  // is fed in already settled.
  const startedRef = useRef(false);
  useEffect(() => {
    if (world || startedRef.current) return;
    startedRef.current = true;
    explode(pdfs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfs, explode]);

  // Release the cached pdf.js render document when Prism closes — otherwise the parsed document
  // (and its worker-side memory) is held for the rest of the session.
  useEffect(() => () => void destroyRenderDoc(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (briefing) {
          cancelKokoro();
          setBriefing(null);
          setBriefingIds(new Set());
          setOpenId(null);
          fitRef.current();
        } else if (browse) setBrowse(null);
        else if (askFocus) setAskFocus(null);
        else if (openId) setOpenId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [briefing, browse, askFocus, openId, onClose]);

  const [largeLayout, setLargeLayout] = useState<{
    spec: PrismSpec;
    result: LayoutResult;
  } | null>(null);
  useEffect(() => {
    if (!spec || spec.claims.length < 48) return;
    let live = true;
    void layoutPrismOffMain(spec, REGION_PALETTE).then((result) => {
      if (live) setLargeLayout({ spec, result });
    });
    return () => {
      live = false;
    };
  }, [spec]);
  const placed = useMemo(() => {
    if (!spec) return null;
    if (spec.claims.length < 48) return layout(spec, REGION_PALETTE);
    return largeLayout?.spec === spec ? largeLayout.result : null;
  }, [largeLayout, spec]);

  // Pan + zoom the map. The world is rendered at its natural size and moved by a camera transform, so
  // the whole map is framed to fit on open AND re-frames when the source panel steals half the width.
  const stageRef = useRef<HTMLDivElement>(null);
  // The tight bounding box of the actual content (cards + region labels), so the camera frames THAT
  // and fills the viewport — a 5-claim map shouldn't sit tiny inside the whole (much larger) world.
  const contentBox = useMemo(() => {
    if (!placed || placed.claims.length === 0) return undefined;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of placed.claims) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + CARD_W);
      maxY = Math.max(maxY, c.y + CARD_H);
    }
    for (const r of placed.regions) {
      minX = Math.min(minX, r.cx);
      minY = Math.min(minY, r.cy);
      maxX = Math.max(maxX, r.cx);
      maxY = Math.max(maxY, r.cy);
    }
    const pad = 56;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [placed]);
  const pan = usePanZoom(stageRef, placed?.width ?? 1, placed?.height ?? 1, contentBox);

  const claimById = useMemo(() => {
    const m = new Map<string, Placed>();
    if (placed) for (const c of placed.claims) m.set(c.id, c);
    return m;
  }, [placed]);

  // Adjacency from the structural links + relation threads, so the open page can step to a connected
  // claim. Neighbours are ordered by reading order (page, then title) for a predictable walk.
  const neighborsOf = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string): void => {
      (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
      (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
    };
    if (placed) for (const l of placed.links) link(l.a, l.b);
    if (spec) for (const t of spec.threads) link(t.a, t.b);
    const ordered = new Map<string, string[]>();
    for (const [id, set] of adj) {
      ordered.set(
        id,
        [...set]
          .map((nid) => claimById.get(nid))
          .filter((c): c is Placed => !!c)
          .sort((a, b) => a.page - b.page || a.title.localeCompare(b.title))
          .map((c) => c.id),
      );
    }
    return ordered;
  }, [placed, spec, claimById]);

  // The claim whose source page is open in the split panel (null = map only).
  const openClaim = openId ? (claimById.get(openId) ?? null) : null;
  // Memoized so it's a stable dependency of the panelView memo (its identity gates a re-render).
  const openNeighbors = useMemo(
    () => (openId ? (neighborsOf.get(openId) ?? []) : []),
    [openId, neighborsOf],
  );
  const crossDocCount = spec?.threads.filter((t) => t.crossDoc).length ?? 0;

  const settled = phase === 'settled' && !!placed;

  // ── Corpus mode extras (all no-ops in single-doc Prism, where corpusChrome is undefined) ──
  // Which corpus OBJECT (contradiction / gap / consensus) is open in the side panel.
  const [openObject, setOpenObject] = useState<{
    kind: 'contradiction' | 'gap' | 'consensus';
    id: string;
  } | null>(null);
  // Claim-id membership sets that drive lens dimming.
  const corpusContraIds = useMemo(() => {
    const s = new Set<string>();
    corpusChrome?.contradictions.forEach((x) => {
      s.add(x.a);
      s.add(x.b);
    });
    return s;
  }, [corpusChrome]);
  const corpusMemberIds = useMemo(() => {
    const s = new Set<string>();
    corpusChrome?.consensus.forEach((c) => c.memberClaimIds.forEach((id) => s.add(id)));
    return s;
  }, [corpusChrome]);
  const corpusLens = corpusChrome?.lens ?? 'all';
  // When the lens changes, fly the camera to the active objects (or fit for "all").
  useEffect(() => {
    if (!corpusChrome || !settled) return;
    const pts =
      corpusLens === 'contradictions'
        ? corpusChrome.contradictions
        : corpusLens === 'gaps'
          ? corpusChrome.gaps
          : corpusLens === 'consensus'
            ? corpusChrome.consensus
            : [];
    if (corpusLens === 'all' || pts.length === 0) {
      pan.fit();
      return;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = Math.max(CARD_W, CARD_H);
    pan.frame(
      {
        x: Math.min(...xs) - pad,
        y: Math.min(...ys) - pad,
        w: Math.max(...xs) - Math.min(...xs) + pad * 2,
        h: Math.max(...ys) - Math.min(...ys) + pad * 2,
      },
      { maxScale: 1.1 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpusLens, settled]);

  const phaseLabel =
    phase === 'igniting'
      ? 'EXTRACTING'
      : phase === 'blooming'
        ? 'MAPPING'
        : phase === 'settled'
          ? 'SETTLED'
          : phase === 'error'
            ? 'COULDN’T MAP'
            : 'READY';

  const grounded = spec?.claims.length ?? 0;

  const replay = useCallback(() => {
    setOpenId(null);
    setBrowse(null);
    setAskFocus(null);
    setCitedKey(new Set());
    cancelKokoro();
    setBriefing(null);
    setBriefingIds(new Set());
    reconAbort.current?.abort();
    setRecon(null);
    setReconOn(false);
    setReconBusy(false);
    xeAbort.current?.abort();
    setXe(null);
    setXeOpen(false);
    setXeBusy(false);
    setXeActiveId(null);
    faAbort.current?.abort();
    setFa(null);
    setFaOpen(false);
    setFaBusy(false);
    setFaActiveId(null);
    lvAbort.current?.abort();
    setLv(null);
    setLvOpen(false);
    setLvBusy(false);
    lvRan.current = false;
    whyAbort.current?.abort();
    setWhyDag(null);
    setLensBusy(null);
    setLens('map');
    explode(pdfs);
  }, [explode, pdfs]);

  // Answer-first open: the instant the map settles, frame the load-bearing claims (the few the model
  // marked as carrying the document's case) so the point comes to the reader instead of a flat field
  // of equal cards. Runs once per explode; if nothing is load-bearing (or everything is), we keep the
  // whole-map fit. The frame is an immediate camera set — no motion — so it's reduced-motion-safe.
  const framedFor = useRef<PrismSpec | null>(null);
  const { frame: frameCamera, fit: fitCamera } = pan;
  fitRef.current = fitCamera;
  useEffect(() => {
    if (!settled || !placed || !spec || framedFor.current === spec) return;
    framedFor.current = spec;
    const key = placed.claims.filter((c) => c.role === 'load-bearing');
    if (key.length === 0 || key.length === placed.claims.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of key) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }
    // pad by a card so the framed cards aren't flush against the viewport edge
    const padW = CARD_W;
    const padH = CARD_H * 1.3;
    frameCamera(
      { x: minX - padW, y: minY - padH, w: maxX - minX + padW * 2, h: maxY - minY + padH * 2 },
      { maxScale: 1.2 },
    );
  }, [settled, placed, spec, frameCamera]);

  // Veracity pass: once the map settles, check the load-bearing claims against the live world — but
  // ONLY when the user has web search enabled in their Live settings (off by default). When it's off,
  // we run no extra model/web call and show no seals: Prism just maps the document. When it's on, the
  // check verifies through the user's configured search provider + key (the same one from settings).
  // Runs once per explode, aborts on unmount/replay; claim ids are deterministic across re-explodes,
  // so we clear the prior map before refilling.
  const verifiedFor = useRef<PrismSpec | null>(null);
  useEffect(() => {
    if (!settled || !spec || !cfg || verifiedFor.current === spec) return;
    verifiedFor.current = spec;
    setVeracity(new Map());
    // Clear any lingering "checking…" from a prior spec's aborted run before the early returns, so a
    // new spec with web grounding off (or no key claims) never leaves the Standing strip spinning.
    setVerifying(false);
    if (!search?.enabled) return; // web grounding off → no live-data check, no seals
    const keyClaims = spec.claims.filter((c) => c.role === 'load-bearing');
    if (keyClaims.length === 0) return;
    const ctrl = new AbortController();
    setVerifying(true);
    runVeracity(spec.claims, {
      cfg,
      searchProviderId: search.providerId,
      apiKey: search.apiKey,
      signal: ctrl.signal,
    })
      .then((vs) => {
        if (ctrl.signal.aborted) return;
        setVeracity(new Map(vs.map((v) => [v.claimId, v])));
      })
      .catch(() => {
        /* runVeracity never throws, but never let a stray rejection escape */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setVerifying(false);
      });
    return () => ctrl.abort();
  }, [settled, spec, cfg, search]);

  // The Standing line — the one honest summary of how the checked claims fared. Pure, zero tokens.
  const checkedVerdicts = useMemo(() => [...veracity.values()].map((v) => v.verdict), [veracity]);
  const standing = useMemo(() => standingLine(checkedVerdicts), [checkedVerdicts]);

  // ── Ask It — chat the document; the answer lights up the exact lines on the page ──
  // A short, human label for a document, for a span chip in multi-document mode.
  const docLabelFor = useCallback(
    (doc: number): string => {
      const name = spec?.documents[doc]?.fileName ?? `Doc ${doc + 1}`;
      const base = name.replace(/\.[^.]+$/, '').trim();
      return base.length > 18 ? base.slice(0, 17).trimEnd() + '…' : base || `Doc ${doc + 1}`;
    },
    [spec],
  );

  // Fly the camera to the claims on a document page (where an answer's span lives). Falls back to the
  // nearest page in that document; does nothing when the document has no placed claims to aim at.
  const flyToDocPage = useCallback(
    (doc: number, page: number): void => {
      if (!placed) return;
      let cands = placed.claims.filter((c) => c.source === doc && c.page === page);
      if (cands.length === 0) {
        const sameDoc = placed.claims.filter((c) => c.source === doc);
        if (sameDoc.length === 0) return;
        const nearest = sameDoc.reduce((a, b) =>
          Math.abs(b.page - page) < Math.abs(a.page - page) ? b : a,
        );
        cands = sameDoc.filter((c) => c.page === nearest.page);
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of cands) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x);
        maxY = Math.max(maxY, c.y);
      }
      frameCamera(
        {
          x: minX - CARD_W,
          y: minY - CARD_H * 1.3,
          w: maxX - minX + CARD_W * 2,
          h: maxY - minY + CARD_H * 2.6,
        },
        { maxScale: 1.4 },
      );
    },
    [placed, frameCamera],
  );

  // Spotlight one answer span: open it on its real page (replacing any open claim) and fly to it.
  const focusSpan = useCallback(
    (span: AnswerSpan): void => {
      setBrowse(null);
      setOpenId(null);
      // Clear any stale ask explanation; onAnswer re-sets it right after for a real answer. A span
      // focused by another feature (objection/forecast/lever) leaves it empty → the pen falls back.
      setAskText('');
      setAskFocus(span);
      flyToDocPage(span.doc, span.page);
    },
    [flyToDocPage],
  );

  // When an answer lands: light up the (doc:page)s it cited, and fly to the first span — so the
  // document literally answers by lighting up. A pure-outside answer (no spans) lights nothing.
  const onAnswer = useCallback(
    (answer: AskAnswer): void => {
      setCitedKey(new Set(answer.spans.map((s) => `${s.doc}:${s.page}`)));
      if (answer.spans.length > 0) focusSpan(answer.spans[0]);
      // After focusSpan (which clears it): the readout is the pen's explanation for this answer.
      setAskText(answer.text);
    },
    [focusSpan],
  );

  const askCtx: AskContext | null = useMemo(() => {
    if (!settled || !cfg || !corpus) return null;
    return { corpus, cfg, multiDoc, ...(search ? { search } : {}) };
  }, [settled, cfg, corpus, multiDoc, search]);

  // Why lens — explode the uploaded document(s) into a grounded causal web (the corpus IS the doc, so
  // its receipts point at real pages; ungrounded links stay qualitative T0).
  useEffect(() => () => whyAbort.current?.abort(), []);
  const openWhyLens = useCallback(() => {
    if (!cfg || !corpus) return;
    whyAbort.current?.abort();
    const ac = new AbortController();
    whyAbort.current = ac;
    setLensBusy('why');
    const text = corpus.flat().join('\n').slice(0, 8000);
    const q = multiDoc
      ? 'Why — the argument these documents make'
      : `Why does "${pdfs[0].name.replace(/\.[a-z0-9]+$/i, '')}" reach its conclusion?`;
    void loadWhy()
      .then(({ explodeWhy }) => explodeWhy(q, text, cfg, ac.signal))
      .then((dag) => {
        if (ac.signal.aborted) return; // a replay/re-explode superseded this build — never show its result
        setWhyDag(dag);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLensBusy(null);
      });
  }, [cfg, corpus, multiDoc, pdfs]);

  // A fresh map is a fresh notebook: clear the ask thread + spotlight (and any briefing) on explode.
  useEffect(() => {
    setAskSession((value) => value + 1);
    setAskOpen(false);
    setAskLoaded(false);
    setAskSeed(null);
    setAskFocus(null);
    setAskText('');
    setOpenObject(null);
    setCitedKey(new Set());
    cancelKokoro();
    clearReel();
    setBriefing(null);
    setBriefingIds(new Set());
    reconAbort.current?.abort();
    setRecon(null);
    setReconOn(false);
    setReconBusy(false);
    xeAbort.current?.abort();
    setXe(null);
    setXeOpen(false);
    setXeBusy(false);
    setXeActiveId(null);
    faAbort.current?.abort();
    setFa(null);
    setFaOpen(false);
    setFaBusy(false);
    setFaActiveId(null);
    lvAbort.current?.abort();
    setLv(null);
    setLvOpen(false);
    setLvBusy(false);
    lvRan.current = false;
    whyAbort.current?.abort();
    setWhyDag(null);
    setLensBusy(null);
  }, [spec, clearReel]);

  // The source panel shows either a clicked claim or an Ask It answer span — the span takes precedence.
  const panelView: PanelView | null = useMemo(() => {
    if (!settled) return null;
    if (browse) {
      return {
        source: browse.doc,
        page: browse.page,
        quote: '',
        color: 'var(--presence)',
        kindLabel: 'PAGE',
        title: 'Reading the document',
        isFigure: false,
        connections: [],
        fromAsk: false,
        browse: true,
        penExplain: '',
        penColor: INK_KEY,
      };
    }
    if (askFocus) {
      return {
        source: askFocus.doc,
        page: askFocus.page,
        quote: askFocus.quote,
        color: 'var(--presence)',
        kindLabel: 'ANSWER',
        title: 'From your question',
        isFigure: false,
        connections: [],
        fromAsk: true,
        // The answer readout explains the marked span; fall back to the verbatim quote (e.g. a span
        // focused by another feature, where there's no readout).
        penExplain: askText || `“${askFocus.quote.slice(0, 160)}”`,
        penColor: INK_KEY,
      };
    }
    if (openClaim) {
      // Every OTHER claim grounded on this same page rides along, so the page shows all its
      // marks at once — a claim-dense page reads as the map promised, not one bar at a time.
      const siblings = (placed?.claims ?? [])
        .filter(
          (c) =>
            c.id !== openClaim.id &&
            c.source === openClaim.source &&
            c.page === openClaim.page &&
            c.quote.trim().length > 0,
        )
        .slice(0, 6)
        .map((c) => ({ quote: c.quote, color: KIND_META[c.kind].color, note: c.title }));
      return {
        source: openClaim.source,
        page: openClaim.page,
        quote: openClaim.quote,
        color: KIND_META[openClaim.kind].color,
        kindLabel: KIND_META[openClaim.kind].label,
        title: openClaim.title,
        isFigure: openClaim.kind === 'diagram',
        ...(openClaim.box ? { box: openClaim.box } : {}),
        also: siblings,
        connections: openNeighbors.map((id) => ({ id, title: claimById.get(id)?.title ?? '' })),
        fromAsk: false,
        penExplain: claimExplain(openClaim),
        penColor: inkForKind(openClaim.kind),
        ...(accentForClaim(openClaim) ? { penAccent: accentForClaim(openClaim) } : {}),
      };
    }
    return null;
  }, [settled, browse, askFocus, askText, openClaim, openNeighbors, claimById, placed]);

  const panelOpen = settled && (!!panelView || !!openObject);

  // When the page is rendered with the pen on, the surface hands up the geometry; we add the
  // explanation + color (which we know from the panel view) and record the step, optionally reading
  // it aloud.
  const onAnnotated = useCallback(
    (geo: PenGeometry): void => {
      if (!panelView) return;
      const step: AnnotationStep = {
        ...geo,
        color: panelView.penColor,
        title: panelView.title,
        explanation: panelView.penExplain,
        ...(panelView.penAccent ? { accent: panelView.penAccent } : {}),
      };
      recordStep(step);
      if (penAudioOn && step.explanation) {
        cancelKokoro();
        speakKokoroResult(step.explanation);
      }
    },
    [panelView, penAudioOn, recordStep],
  );

  // ── The Briefing — a silent, captioned flight along the argument's spine ──
  const briefingOn = !!briefing;

  // Frame the camera on a set of claim cards (one claim → zoom in; two → frame both passages).
  const frameClaimIds = useCallback(
    (ids: readonly string[]): void => {
      const cs = ids.map((id) => claimById.get(id)).filter((c): c is Placed => !!c);
      if (cs.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of cs) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x);
        maxY = Math.max(maxY, c.y);
      }
      frameCamera(
        {
          x: minX - CARD_W,
          y: minY - CARD_H * 1.4,
          w: maxX - minX + CARD_W * 2,
          h: maxY - minY + CARD_H * 2.8,
        },
        { maxScale: cs.length > 1 ? 1.05 : 1.5 },
      );
    },
    [claimById, frameCamera],
  );

  // The verdicts checked so far, narrowed to id→verdict — for the briefing path and the reel tour.
  const verdictById = useMemo(
    () => new Map([...veracity].map(([id, v]) => [id, v.verdict] as const)),
    [veracity],
  );

  // Each beat glows its cards and tight-frames the map on them. With the pen on (or the first-run
  // tour's auto-briefing), the page is also the hero: open the beat's claim so the mark draws +
  // records — opening each claim's real page (quote highlighted) is the proof the map is grounded
  // in the document. usePanZoom tracks camera intent, so the panel-open resize re-applies this
  // same frame instead of snapping back to overview.
  const onBriefBeat = useCallback(
    (beat: BriefingBeat): void => {
      setBriefingIds(new Set(beat.claimIds));
      frameClaimIds(beat.claimIds);
      if (penOn || autoBriefing) setOpenId(beat.claimIds[0] ?? null);
    },
    [penOn, autoBriefing, frameClaimIds],
  );

  const exitBriefing = useCallback((): void => {
    cancelKokoro();
    setBriefing(null);
    setBriefingIds(new Set());
    setOpenId(null);
    fitCamera();
  }, [fitCamera]);

  // Switching analysis modes (or starting a briefing): stop any OTHER mode still mid-flight so we
  // don't burn a model call whose result will never show, and never strand its spinner. Aborting
  // skips that run's own `finally` (it guards on !aborted), so reset the busy flag here too.
  const cancelOtherRuns = useCallback((keep: 'recon' | 'xe' | 'fa' | 'lv' | 'none'): void => {
    if (keep !== 'recon') {
      reconAbort.current?.abort();
      setReconBusy(false);
    }
    if (keep !== 'xe') {
      xeAbort.current?.abort();
      setXeBusy(false);
    }
    if (keep !== 'fa') {
      faAbort.current?.abort();
      setFaBusy(false);
    }
    if (keep !== 'lv') {
      lvAbort.current?.abort();
      setLvBusy(false);
    }
  }, []);

  // Build + start the flight from the settled map (claims + threads + the verdicts checked so far).
  const startBriefing = useCallback((): void => {
    if (!placed || !spec) return;
    const beats = buildBriefing(placed.claims, spec.threads, verdictById);
    if (beats.length === 0) return;
    cancelKokoro(); // a pen narration may be mid-sentence; the briefing is silent by default
    cancelOtherRuns('none'); // a briefing supersedes any in-flight analysis
    setOpenId(null);
    setAskFocus(null);
    setAskOpen(false);
    setReconOn(false);
    setXeOpen(false);
    setFaOpen(false);
    setLvOpen(false);
    // Pen on (or the tour's auto-brief) → the source page is the hero; give it most of the split.
    if (penOn || autoBriefing) setPdfPct((p) => Math.max(p, 60));
    setBriefing(beats);
  }, [placed, spec, verdictById, penOn, autoBriefing, cancelOtherRuns]);

  // First-run tour: once the map settles, auto-play the claim fly-through — once, opening each
  // beat's real source page (see onBriefBeat). The pending timer lives in a ref with an
  // unmount-only cleanup: `placed` (relayout on the stage's first resize) and startBriefing's
  // identity both churn right after settle, and an effect-scoped cleanup kept clearing the timer
  // while the fired flag blocked a reschedule — the briefing never started.
  const autoBriefFired = useRef(false);
  const startBriefingRef = useRef(startBriefing);
  startBriefingRef.current = startBriefing;
  const autoBriefTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!autoBriefing || autoBriefFired.current) return;
    if (phase !== 'settled' || !placed || !spec) return;
    autoBriefFired.current = true;
    autoBriefTimer.current = setTimeout(() => startBriefingRef.current(), 800);
  }, [autoBriefing, phase, placed, spec]);
  useEffect(
    () => () => {
      if (autoBriefTimer.current !== null) clearTimeout(autoBriefTimer.current);
    },
    [],
  );

  // ── Reconcile — catch the document's own numbers that don't add up ──
  useEffect(() => () => reconAbort.current?.abort(), []);

  const reconIds = useMemo(() => {
    const s = new Set<string>();
    if (recon) for (const r of recon) for (const id of r.claimIds) s.add(id);
    return s;
  }, [recon]);

  const runReconcileNow = useCallback((): void => {
    if (reconOn) {
      setReconOn(false); // toggle the lens off (keeps the computed result)
      return;
    }
    cancelOtherRuns('recon'); // one analysis mode at a time — stop the others mid-flight
    setXeOpen(false);
    setFaOpen(false);
    setLvOpen(false);
    setAskOpen(false);
    if (recon) {
      setReconOn(true); // already computed — just show it again
      return;
    }
    if (!spec || !corpus || !cfg) return;
    reconAbort.current?.abort();
    const ac = new AbortController();
    reconAbort.current = ac;
    setReconBusy(true);
    const sources = spec.claims.map((c) => ({ id: c.id, page: c.page, quote: c.quote }));
    loadReconcile()
      .then(({ runReconcile }) => runReconcile(sources, corpus, cfg, ac.signal))
      .then((rs) => {
        if (ac.signal.aborted) return;
        setRecon(rs);
        setReconOn(true);
      })
      .catch(() => {
        if (!ac.signal.aborted) setRecon([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setReconBusy(false);
      });
  }, [reconOn, recon, spec, corpus, cfg, cancelOtherRuns]);

  // ── Cross-Examine — the sharpest objection per load-bearing claim, resolved against the doc itself ──
  useEffect(() => () => xeAbort.current?.abort(), []);

  // Every objected claim (for dimming the rest); the OPEN ones (the doc never answers) glow danger.
  const xeClaimIds = useMemo(() => {
    const s = new Set<string>();
    if (xe) for (const o of xe) s.add(o.claimId);
    return s;
  }, [xe]);
  const openObjClaimIds = useMemo(() => {
    const s = new Set<string>();
    if (xe) for (const o of xe) if (o.status === 'open') s.add(o.claimId);
    return s;
  }, [xe]);

  const onFocusObjection = useCallback(
    (o: Objection): void => {
      setXeActiveId(o.id);
      focusSpan({ doc: o.doc, page: o.anchorPage, quote: o.anchorQuote });
    },
    [focusSpan],
  );

  const runCrossExamNow = useCallback((): void => {
    if (xeOpen) {
      setXeOpen(false); // toggle off (keeps the computed result)
      return;
    }
    cancelOtherRuns('xe'); // one analysis mode at a time — stop the others mid-flight
    setReconOn(false);
    setFaOpen(false);
    setLvOpen(false);
    setAskOpen(false);
    if (xe) {
      setXeOpen(true); // already computed — just show it again
      return;
    }
    if (!spec || !corpus || !cfg) return;
    xeAbort.current?.abort();
    const ac = new AbortController();
    xeAbort.current = ac;
    setXeBusy(true);
    setXeOpen(true);
    const claims = spec.claims
      .filter((c) => c.role === 'load-bearing')
      .map((c) => ({ id: c.id, source: c.source, page: c.page, quote: c.quote, title: c.title }));
    loadCrossExam()
      .then(({ runCrossExam }) => runCrossExam(claims, corpus, cfg, ac.signal))
      .then((os) => {
        if (ac.signal.aborted) return;
        setXe(os);
      })
      .catch(() => {
        if (!ac.signal.aborted) setXe([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setXeBusy(false);
      });
  }, [xeOpen, xe, spec, corpus, cfg, cancelOtherRuns]);

  // ── Forecast Autopsy — grade the document's dated predictions against what actually happened ──
  useEffect(() => () => faAbort.current?.abort(), []);

  const faClaimIds = useMemo(() => {
    const s = new Set<string>();
    if (fa) for (const g of fa) s.add(g.claimId);
    return s;
  }, [fa]);

  const onFocusForecast = useCallback(
    (g: ForecastGrade): void => {
      setFaActiveId(g.claimId);
      const claim = claimById.get(g.claimId);
      if (claim) focusSpan({ doc: claim.source, page: g.page, quote: g.predicted });
    },
    [claimById, focusSpan],
  );

  const runAutopsyNow = useCallback((): void => {
    if (faOpen) {
      setFaOpen(false);
      return;
    }
    cancelOtherRuns('fa'); // one analysis mode at a time — stop the others mid-flight
    setReconOn(false);
    setXeOpen(false);
    setLvOpen(false);
    setAskOpen(false);
    if (fa) {
      setFaOpen(true);
      return;
    }
    if (!spec || !cfg || !search?.enabled) return;
    faAbort.current?.abort();
    const ac = new AbortController();
    faAbort.current = ac;
    setFaBusy(true);
    setFaOpen(true);
    const claims = spec.claims
      .filter((c) => c.kind === 'forecast')
      .map((c) => ({ id: c.id, page: c.page, quote: c.quote }));
    loadAutopsy()
      .then(({ runAutopsy }) =>
        runAutopsy(claims, {
          cfg,
          searchProviderId: search.providerId,
          apiKey: search.apiKey,
          signal: ac.signal,
        }),
      )
      .then((gs) => {
        if (ac.signal.aborted) return;
        setFa(gs);
      })
      .catch(() => {
        if (!ac.signal.aborted) setFa([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setFaBusy(false);
      });
  }, [faOpen, fa, spec, cfg, search, cancelOtherRuns]);

  // ── Live Levers — drag a grounded assumption, watch the conclusion recompute and flip red ──
  useEffect(() => () => lvAbort.current?.abort(), []);

  const lvPageKeys = useMemo(() => {
    const s = new Set<string>();
    if (lv) for (const n of lv.nodes) s.add(`${n.doc}:${n.page}`);
    return s;
  }, [lv]);

  const onFocusLeverNode = useCallback(
    (n: LeverNode): void => {
      focusSpan({ doc: n.doc, page: n.page, quote: n.quote });
    },
    [focusSpan],
  );

  const runLeversNow = useCallback((): void => {
    if (lvOpen) {
      setLvOpen(false);
      return;
    }
    cancelOtherRuns('lv'); // one analysis mode at a time — stop the others mid-flight
    setReconOn(false);
    setXeOpen(false);
    setFaOpen(false);
    setAskOpen(false);
    if (lvRan.current) {
      setLvOpen(true); // already extracted (even if it found no model) — just show it again
      return;
    }
    if (!spec || !corpus || !cfg) return;
    lvAbort.current?.abort();
    const ac = new AbortController();
    lvAbort.current = ac;
    lvRan.current = true;
    setLvBusy(true);
    setLvOpen(true);
    const claims = spec.claims.map((c) => ({ quote: c.quote, page: c.page, doc: c.source }));
    loadLevers()
      .then(({ runLevers }) => runLevers(claims, corpus, cfg, ac.signal))
      .then((m) => {
        if (ac.signal.aborted) return;
        setLv(m);
      })
      .catch(() => {
        if (!ac.signal.aborted) setLv(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLvBusy(false);
      });
  }, [lvOpen, spec, corpus, cfg, cancelOtherRuns]);

  return (
    <div
      className="prism-scrim"
      data-expanded={expanded ? 'true' : undefined}
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label="Close Prism"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onClose();
      }}
    >
      {/* Clicks inside the panel are swallowed so they don't bubble to the scrim above and close
          the dialog — a propagation guard, not a click affordance, so it has no keyboard twin. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <section
        className="prism-panel"
        role="dialog"
        aria-label="Prism"
        data-phase={phase}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── top bar ── */}
        <header className="prism-head">
          <div className="prism-file">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M6 2h8l4 4v16H6z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 2v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span className="prism-file-name">
              {multiDoc ? `${pdfs.length} documents` : pdfs[0].name}
            </span>
            {spec && <span className="prism-file-pages">· {spec.pageCount} pages</span>}
          </div>
          <div className="prism-head-right">
            {/* Corpus lens: filter the fused map to everything / the disputes / the holes / the
                agreement. Only in corpus mode; single-doc Prism never shows it. */}
            {settled && corpusChrome && (
              <div className="syn-lenses" role="tablist" aria-label="Lens">
                {(
                  [
                    ['all', 'All', 0],
                    ['contradictions', 'Contradictions', corpusChrome.counts.contradictions],
                    ['gaps', 'Gaps', corpusChrome.counts.gaps],
                    ['consensus', 'Consensus', corpusChrome.counts.consensus],
                  ] as const
                ).map(([id, label, n]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={corpusChrome.lens === id}
                    className={'syn-lens' + (corpusChrome.lens === id ? ' is-active' : '')}
                    onClick={() => {
                      setOpenObject(null);
                      corpusChrome.setLens(id);
                    }}
                  >
                    {label}
                    {n > 0 && <span className="syn-lens-n">{n}</span>}
                  </button>
                ))}
              </div>
            )}
            {/* the dropped counter — the grounding gate working FOR you, in the open: every shown claim
                is verbatim on its page; anything that couldn't be cited was dropped before it rendered */}
            {settled && proposed > 0 && (
              <span
                className="prism-counter"
                title="Every shown claim is a verbatim quote on its real page. Anything that couldn't be cited was dropped before it rendered."
              >
                <strong>{proposed}</strong> read · <strong>{grounded}</strong> grounded
                {proposed > grounded ? (
                  <>
                    {' '}
                    · <strong>{proposed - grounded}</strong> dropped
                  </>
                ) : null}
              </span>
            )}
            <span
              className="prism-phase"
              data-active={phase === 'igniting' || phase === 'blooming'}
              title={phaseLabel}
            >
              <span className="prism-phase-dot" aria-hidden="true" />
              <span className="prism-phase-label">{phaseLabel}</span>
            </span>
            {settled && (
              <button
                type="button"
                className="prism-replay"
                onClick={() => {
                  setAskFocus(null);
                  setOpenId(null);
                  setBrowse({ doc: 0, page: 1 });
                }}
                aria-label="Read the whole document, page by page"
                title="Read the whole document, page by page"
              >
                ▤<span className="prism-replay-label"> Read document</span>
              </button>
            )}
            {settled && (
              <button
                type="button"
                className="prism-replay"
                onClick={replay}
                aria-label="Replay — re-map the document from scratch"
                title="Replay — re-map the document from scratch"
              >
                ↻<span className="prism-replay-label"> Replay</span>
              </button>
            )}
            <button
              type="button"
              className="prism-close"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
              title={expanded ? 'Exit full screen' : 'Full screen'}
            >
              {expanded ? '⤡' : '⤢'}
            </button>
            <button
              type="button"
              className="prism-close"
              onClick={onClose}
              aria-label="Close Prism"
            >
              ✕
            </button>
          </div>
        </header>

        {/* source legend — which document is which, in multi-PDF mode */}
        {multiDoc && settled && spec && (
          <div className="prism-legend" role="list" aria-label="Documents">
            {spec.documents.map((d, i) => {
              const count = spec.claims.filter((c) => c.source === i).length;
              return (
                <span key={i} className="prism-legend-item" role="listitem">
                  <span
                    className="prism-legend-swatch"
                    style={{ background: DOC_PALETTE[i % DOC_PALETTE.length] }}
                    aria-hidden="true"
                  />
                  <span className="prism-legend-name">{d.fileName.replace(/\.pdf$/i, '')}</span>
                  <span className="prism-legend-count">{count}</span>
                </span>
              );
            })}
            {crossDocCount > 0 && (
              <span className="prism-legend-cross">
                {crossDocCount} cross-document link{crossDocCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        {/* ── the stage (+ source page panel when a claim is open) ── */}
        <div
          className="prism-split"
          data-split={panelOpen ? 'true' : undefined}
          data-pdfonly={panelOpen && pdfPct >= 99 ? 'true' : undefined}
          ref={splitRef}
        >
          <div
            className={'prism-stage' + (pan.panning ? ' is-panning' : '')}
            ref={stageRef}
            onWheel={settled ? pan.onWheel : undefined}
            onPointerDown={settled ? pan.onPointerDown : undefined}
            onPointerMove={settled ? pan.onPointerMove : undefined}
            onPointerUp={settled ? pan.onPointerUp : undefined}
            onPointerCancel={settled ? pan.onPointerUp : undefined}
            onClickCapture={(e) => {
              // swallow the click that ends a real drag so panning over a card doesn't open it
              if (pan.movedRef.current) {
                e.stopPropagation();
                e.preventDefault();
                pan.movedRef.current = false;
              }
            }}
          >
            {/* idle/igniting: the document, then the shard burst */}
            {(phase === 'idle' || phase === 'igniting') && (
              <div className="prism-doc" data-igniting={phase === 'igniting'} aria-hidden="true">
                <div className="prism-doc-page">
                  <span className="prism-doc-eyebrow">{multiDoc ? 'DOCUMENTS' : 'DOCUMENT'}</span>
                  <span className="prism-doc-title">
                    {multiDoc ? `${pdfs.length} documents` : pdfs[0].name.replace(/\.pdf$/i, '')}
                  </span>
                  <div className="prism-doc-lines">
                    {[92, 84, 88, 70, 90, 60, 80, 66].map((w, i) => (
                      <span key={i} className="prism-doc-line" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </div>
                {phase === 'igniting' && (
                  <>
                    <span className="prism-shock" />
                    {SHARDS.map((s, i) => (
                      <span
                        key={i}
                        className="prism-shard"
                        style={
                          {
                            '--sx': s.x,
                            '--sy': s.y,
                            '--sr': s.r,
                            width: s.w,
                            height: s.h,
                            animationDelay: `${s.d}ms`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* blooming: the mapping ticker */}
            {phase === 'blooming' && (
              <div className="prism-blooming">
                <span className="prism-bloom-orb" aria-hidden="true" />
                <span className="prism-bloom-label">
                  Reading the document — mapping its claims…
                </span>
              </div>
            )}

            {/* error */}
            {phase === 'error' && (
              <div className="prism-error" role="alert">
                <p className="prism-error-msg">{error}</p>
                <button type="button" className="prism-error-retry" onClick={replay}>
                  Try again
                </button>
              </div>
            )}

            {/* settled: the world */}
            {settled && placed && (
              <div
                className="prism-world"
                data-briefing={briefingOn ? 'true' : undefined}
                style={{
                  width: placed.width,
                  height: placed.height,
                  transform: pan.transform,
                }}
              >
                {/* region nebulae + headers */}
                {placed.regions.map((r) => (
                  <div
                    key={r.name}
                    className="prism-region"
                    style={{ left: r.cx, top: r.cy, '--region-color': r.color } as CSSProperties}
                  >
                    <span className="prism-region-glow" aria-hidden="true" />
                    <span className="prism-region-name">{r.name}</span>
                  </div>
                ))}

                {/* structural backbone — faint connector lines so the map reads as one document */}
                {placed.links.length > 0 && (
                  <svg
                    className="prism-links"
                    width={placed.width}
                    height={placed.height}
                    aria-hidden="true"
                  >
                    {placed.links.map((l, i) => {
                      const a = claimById.get(l.a);
                      const b = claimById.get(l.b);
                      if (!a || !b) return null;
                      return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                    })}
                  </svg>
                )}

                {/* contradiction threads */}
                {spec && spec.threads.length > 0 && (
                  <svg
                    className="prism-threads"
                    width={placed.width}
                    height={placed.height}
                    aria-hidden="true"
                  >
                    {spec.threads.map((t, i) => {
                      const a = claimById.get(t.a);
                      const b = claimById.get(t.b);
                      if (!a || !b) return null;
                      const mx = (a.x + b.x) / 2;
                      const my = (a.y + b.y) / 2 - 28;
                      const hot = lens === 'map' ? '' : ' prism-thread-hot';
                      return (
                        <g
                          key={i}
                          className={'prism-thread' + hot}
                          data-relation={t.relation}
                          data-cross={t.crossDoc ? 'true' : undefined}
                        >
                          <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} fill="none" />
                          <foreignObject x={mx - 90} y={my - 12} width="180" height="22">
                            <span className="prism-thread-label">
                              {THREAD_LABEL[t.relation]}
                              {t.crossDoc ? ' across docs' : ` · p.${a.page}↔p.${b.page}`}
                            </span>
                          </foreignObject>
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* Reconcile — red threads between figures the document's own arithmetic contradicts */}
                {reconOn && recon && recon.length > 0 && (
                  <svg
                    className="prism-threads prism-recon"
                    width={placed.width}
                    height={placed.height}
                    aria-hidden="true"
                  >
                    {recon.map((r) => {
                      if (r.a === r.b) return null; // both figures share one card — the card glows instead
                      const a = claimById.get(r.a);
                      const b = claimById.get(r.b);
                      if (!a || !b) return null;
                      const mx = (a.x + b.x) / 2;
                      const my = (a.y + b.y) / 2 - 28;
                      return (
                        <g
                          key={r.id}
                          className="prism-thread prism-thread-hot"
                          data-relation="contradicts"
                        >
                          <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} fill="none" />
                          <foreignObject x={mx - 90} y={my - 16} width="180" height="30">
                            <span className="prism-thread-label prism-recon-label">
                              {r.stated} ≠ {r.computed}
                            </span>
                          </foreignObject>
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* claim cards */}
                {placed.claims.map((c) => {
                  const meta = KIND_META[c.kind];
                  const open = openId === c.id;
                  const seal = veracity.get(c.id);
                  const thread = spec?.threads.find((t) => t.a === c.id || t.b === c.id);
                  const citationUrl = seal?.citation ? safeHttpUrl(seal.citation.url) : null;
                  const flagged = !!thread;
                  const flagColor = thread
                    ? thread.relation === 'agrees'
                      ? 'var(--insight)'
                      : thread.relation === 'in-tension'
                        ? 'var(--warning)'
                        : 'var(--danger)'
                    : meta.color;
                  const dim = lens === 'contra' && !flagged;
                  // Ask It: a card whose (doc:page) an answer cited lights up; when actively viewing
                  // an answer span, the uncited cards dim so the cited evidence reads at a glance.
                  const cited = citedKey.has(`${c.source}:${c.page}`);
                  const dimByAsk = !!askFocus && citedKey.size > 0 && !cited;
                  // The Briefing: the current beat's card(s) glow; everything else recedes.
                  const briefGlow = briefingIds.has(c.id);
                  const dimByBrief = briefingOn && briefingIds.size > 0 && !briefGlow;
                  // Reconcile: cards whose figures don't add up glow; the rest recede.
                  const reconGlow = reconOn && reconIds.has(c.id);
                  const dimByRecon = reconOn && reconIds.size > 0 && !reconGlow;
                  // Cross-Examine: a claim with an OPEN objection glows danger; the rest recede
                  // (an objected-but-answered claim stays neutral — neither glowing nor dimmed).
                  const objGlow = xeOpen && openObjClaimIds.has(c.id);
                  const dimByXe = xeOpen && openObjClaimIds.size > 0 && !xeClaimIds.has(c.id);
                  // Forecast Autopsy: graded prediction cards glow; the rest recede.
                  const faGlow = faOpen && faClaimIds.has(c.id);
                  const dimByFa = faOpen && faClaimIds.size > 0 && !faGlow;
                  // Live Levers: cards on a page the model is built from glow; the rest recede.
                  const lvGlow = lvOpen && lvPageKeys.has(`${c.source}:${c.page}`);
                  const dimByLv = lvOpen && lvPageKeys.size > 0 && !lvGlow;
                  // Corpus lens dimming: recede cards that aren't part of the active lens.
                  const dimByCorpus =
                    !!corpusChrome &&
                    (corpusLens === 'gaps'
                      ? true
                      : corpusLens === 'contradictions'
                        ? !corpusContraIds.has(c.id)
                        : corpusLens === 'consensus'
                          ? !corpusMemberIds.has(c.id)
                          : false);
                  const toggleOpen = (): void => {
                    if (briefingOn) return;
                    setBrowse(null);
                    setAskFocus(null);
                    setOpenObject(null);
                    setOpenId(open ? null : c.id);
                  };
                  // A div, not a <button>: the open card contains a real <a> citation link, and an
                  // anchor nested in a button is invalid HTML (hydration warning + flaky clicks).
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={open}
                      className={
                        'prism-claim' +
                        (open ? ' is-open' : '') +
                        (flagged ? ' is-flagged' : '') +
                        (cited || briefGlow || reconGlow || faGlow || lvGlow ? ' is-cited' : '') +
                        (objGlow ? ' is-objected' : '') +
                        (dim ||
                        dimByAsk ||
                        dimByBrief ||
                        dimByRecon ||
                        dimByXe ||
                        dimByFa ||
                        dimByLv ||
                        dimByCorpus
                          ? ' is-dim'
                          : '')
                      }
                      data-role={c.role}
                      style={
                        {
                          left: c.x,
                          top: c.y,
                          '--kind-color': flagColor,
                        } as CSSProperties
                      }
                      onClick={toggleOpen}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        toggleOpen();
                      }}
                    >
                      <span className="prism-claim-head">
                        <span className="prism-claim-kind">
                          <span className="prism-claim-dot" aria-hidden="true" />
                          {meta.label}
                        </span>
                        {c.role === 'load-bearing' && (
                          <span
                            className="prism-claim-key"
                            title="Load-bearing — the document leans on this"
                          >
                            ★ KEY
                          </span>
                        )}
                        <span className="prism-claim-page">p.{c.page}</span>
                      </span>
                      <span className="prism-claim-title">{c.title}</span>
                      {/* veracity seal — how this claim stands against the live world (load-bearing
                          claims only). Tinted by verdict; tap the card to see the receipts. */}
                      {seal && (
                        <span
                          className="prism-seal"
                          data-verdict={seal.verdict}
                          style={
                            { '--seal-color': VERDICT_META[seal.verdict].token } as CSSProperties
                          }
                        >
                          <span className="prism-seal-dot" aria-hidden="true" />
                          {VERDICT_META[seal.verdict].label}
                        </span>
                      )}
                      {open && (
                        <span className="prism-claim-body">
                          {/* receipt 1 — the document's own words (the sacred tint), shown on the real
                              page by the source panel when this card is open */}
                          <span className="prism-claim-quote">“{c.quote}”</span>
                          {thread && (
                            <span className="prism-claim-flag">
                              {flagText(thread.relation, thread.crossDoc)} — follow the thread
                            </span>
                          )}
                          {/* receipt 2 — the world's verdict + a gated web citation (a DISTINCT tint,
                              never blended with the document's words). Honest grey when unsupported. */}
                          {seal && (
                            <span
                              className="prism-claim-verdict"
                              data-verdict={seal.verdict}
                              style={
                                {
                                  '--seal-color': VERDICT_META[seal.verdict].token,
                                } as CSSProperties
                              }
                            >
                              <span className="prism-verdict-head">
                                <span className="prism-verdict-label">
                                  {VERDICT_META[seal.verdict].label}
                                </span>
                                <span className="prism-verdict-note">{seal.note}</span>
                              </span>
                              {seal.citation && citationUrl && (
                                <a
                                  className="prism-verdict-cite"
                                  href={citationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  “{seal.citation.quote}”
                                  <span className="prism-verdict-host">
                                    — {seal.citation.host}
                                    {seal.citation.date ? ` · ${seal.citation.date}` : ''}
                                  </span>
                                </a>
                              )}
                            </span>
                          )}
                        </span>
                      )}
                      {/* State line — the card's certainty, in the mockup's vocabulary. A grounded
                          card is "anchored · ready"; a threaded one wears its relation (in
                          contradiction / in tension / agrees) so its status reads without opening it. */}
                      {!open && (
                        <span className="prism-claim-state" data-state={claimState(thread)}>
                          {stateLabel(thread)}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Corpus objects — the fused map's cross-source relations as things you can click:
                    consensus rings (behind cards), contradiction collisions, and gap holes. */}
                {corpusChrome && (
                  <>
                    {corpusChrome.consensus.map((c) => {
                      const dimC = corpusLens !== 'all' && corpusLens !== 'consensus';
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={'syn-consensus' + (dimC ? ' is-dim' : '')}
                          style={{
                            left: c.x - c.r,
                            top: c.y - c.r,
                            width: c.r * 2,
                            height: c.r * 2,
                          }}
                          onClick={() => {
                            if (pan.movedRef.current) return;
                            setOpenId(null);
                            setOpenObject({ kind: 'consensus', id: c.id });
                          }}
                        >
                          <span className="syn-consensus-badge">
                            {c.sourceCount} of {c.corpusSize} agree
                          </span>
                        </button>
                      );
                    })}
                    {corpusChrome.contradictions.map((x) => {
                      const dimX = corpusLens !== 'all' && corpusLens !== 'contradictions';
                      return (
                        <button
                          key={x.id}
                          type="button"
                          className={'syn-obj syn-obj-' + x.relation + (dimX ? ' is-dim' : '')}
                          style={{ left: x.x, top: x.y }}
                          onClick={() => {
                            if (pan.movedRef.current) return;
                            setOpenId(null);
                            setOpenObject({ kind: 'contradiction', id: x.id });
                          }}
                        >
                          <span className="syn-obj-dot" aria-hidden="true" />
                          {x.label}
                        </button>
                      );
                    })}
                    {corpusChrome.gaps.map((g) => {
                      const dimG = corpusLens !== 'all' && corpusLens !== 'gaps';
                      return (
                        <button
                          key={g.id}
                          type="button"
                          className={'syn-obj syn-gap' + (dimG ? ' is-dim' : '')}
                          style={{ left: g.x, top: g.y }}
                          onClick={() => {
                            if (pan.movedRef.current) return;
                            setOpenId(null);
                            setOpenObject({ kind: 'gap', id: g.id });
                          }}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* zoom controls — the map pans by drag and zooms by wheel; these are the explicit knobs */}
            {settled && (
              <div className="prism-zoom" aria-label="Zoom the map">
                <button type="button" onClick={() => pan.zoomBy(1.25)} aria-label="Zoom in">
                  +
                </button>
                <button type="button" onClick={() => pan.zoomBy(1 / 1.25)} aria-label="Zoom out">
                  −
                </button>
                <button
                  type="button"
                  onClick={() => pan.fit()}
                  aria-label="Fit the whole map"
                  title="Fit"
                >
                  ⤢
                </button>
              </div>
            )}

            {/* Ask It — the floating "chat the document" dock; the answer lights up the real lines.
                Hidden while a briefing plays or a cross-examination is open (one mode at a time). */}
            {settled && askLoaded && askCtx && (
              <AsyncSurface label="Document ask">
                <PrismAskController
                  key={askSession}
                  open={askOpen && !briefingOn && !xeOpen && !faOpen && !lvOpen}
                  ctx={askCtx}
                  seed={askSeed}
                  onAnswer={onAnswer}
                  onFocusSpan={focusSpan}
                  activeSpan={askFocus}
                  multiDoc={multiDoc}
                  docLabel={docLabelFor}
                  onClose={() => setAskOpen(false)}
                />
              </AsyncSurface>
            )}

            {/* The Briefing — a silent, captioned, camera-led flight through the document's argument */}
            {settled && briefing && (
              <AsyncSurface label="Briefing">
                <PrismBriefingPlayer beats={briefing} onBeat={onBriefBeat} onExit={exitBriefing} />
              </AsyncSurface>
            )}

            {/* Cross-Examine — the objections dock; the ones the document never answers lead */}
            {settled && xeOpen && !briefingOn && (
              <AsyncSurface label="Cross-examination">
                <CrossExamPanel
                  objections={xe ?? []}
                  busy={xeBusy}
                  onFocusObjection={onFocusObjection}
                  activeId={xeActiveId}
                  multiDoc={multiDoc}
                  docLabel={docLabelFor}
                  onClose={() => setXeOpen(false)}
                />
              </AsyncSurface>
            )}

            {/* Forecast Autopsy — the document's dated predictions graded against reality */}
            {settled && faOpen && !briefingOn && (
              <AsyncSurface label="Forecast review">
                <ForecastPanel
                  grades={fa ?? []}
                  busy={faBusy}
                  onFocusForecast={onFocusForecast}
                  activeId={faActiveId}
                  onClose={() => setFaOpen(false)}
                />
              </AsyncSurface>
            )}

            {/* Live Levers — drag a grounded assumption; the conclusion recomputes and flips red */}
            {settled && lvOpen && !briefingOn && (
              <AsyncSurface label="Live levers">
                <LeverPanel
                  model={lv}
                  busy={lvBusy}
                  onFocusNode={onFocusLeverNode}
                  onClose={() => setLvOpen(false)}
                />
              </AsyncSurface>
            )}
          </div>

          {/* draggable divider — grab and move left/right to resize the map vs the page (full right =
              PDF-only). Keyboard-accessible: ←/→ nudge the split. */}
          {panelOpen && (
            // Window-splitter pattern (WAI-ARIA APG): role="separator" plus tabIndex and
            // pointer/arrow-key support is the correct semantics for a resizable divider, but
            // jsx-a11y's static role table doesn't know a separator becomes a focusable widget
            // once it's given a value to adjust, so these two lines are false positives.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <div
              className="prism-divider"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the map and the source page"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see comment above
              tabIndex={0}
              onPointerDown={onDividerDown}
              onPointerMove={onDividerMove}
              onPointerUp={onDividerUp}
              onPointerCancel={onDividerUp}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setPdfPct((p) => Math.min(100, p + 4));
                else if (e.key === 'ArrowRight') setPdfPct((p) => Math.max(24, p - 4));
              }}
            >
              <span className="prism-divider-grip" aria-hidden="true" />
            </div>
          )}

          {/* source panel — the claim's quote on its real page. PDFs render the actual page (pdf.js);
              Word/plain-text/Markdown/code show the extracted text as a zoomable sheet with the
              quote highlighted (and ink/margin notes now work there too); a PowerPoint deck with real
              text shows a fixed 16:9 slide with title/body hierarchy (same zoom + ink); CSV/Excel show
              a real <table> (SheetSurface) with the matching row highlighted; an image-exported deck
              shows the real slide image with the transcribed quote beside it. */}
          {panelView &&
            settled &&
            pdfs[panelView.source] &&
            (() => {
              const sourceDoc = pdfs[panelView.source];
              // An image-exported deck: the document carries its slide images; show the slide.
              const slideImages = spec?.documents[panelView.source]?.slideImages;
              const pageCount = spec?.documents[panelView.source]?.pageCount ?? 1;
              const closePanel = (): void => {
                setBrowse(null);
                setAskFocus(null);
                setOpenId(null);
              };
              // Walking to a connected claim leaves the answer-span view for that claim's view.
              const navTo = (id: string): void => {
                setBrowse(null);
                setAskFocus(null);
                setOpenId(id);
              };
              // Page freely through the whole document (any type) — drops the claim anchor and just
              // reads. The document is already local (rendered/extracted client-side), so this is cheap.
              const goPage = (p: number): void => {
                const page = Math.min(pageCount, Math.max(1, p));
                setAskFocus(null);
                setOpenId(null);
                setBrowse({ doc: panelView.source, page });
              };
              return (
                <div
                  className="prism-page-wrap"
                  style={{ '--pdf-pct': `${pdfPct}%` } as CSSProperties}
                >
                  {/* DocPageView is the one dispatch point: PDF, image-exported deck, reflowable
                      text (Word/TXT/Markdown/code), a real-text PowerPoint slide, or a real-table
                      CSV/Excel sheet (SheetSurface) — it picks the right surface for sourceDoc's
                      actual type. */}
                  <DocPageView
                    pdf={sourceDoc}
                    slideImages={slideImages}
                    source={panelView.source}
                    page={panelView.page}
                    quote={panelView.quote}
                    color={panelView.color}
                    also={panelView.also}
                    note={panelView.penExplain}
                    penOn={penOn}
                    penColor={panelView.penColor}
                    penAccent={panelView.penAccent}
                    onAnnotated={onAnnotated}
                    kindLabel={panelView.kindLabel}
                    isFigure={panelView.isFigure}
                    docName={multiDoc ? sourceDoc.name : undefined}
                    title={panelView.title}
                    connections={panelView.connections}
                    onNavigate={navTo}
                    onClose={closePanel}
                    pageCount={pageCount}
                    onPageChange={goPage}
                  />
                  {/* the pen's explanation — the caption is the explanation (Prism is silent by
                      default); 🔊 opts into narration. Suppressed during the briefing, which shows
                      its own caption. */}
                  {penOn && !briefingOn && panelView.penExplain && (
                    <div className="prism-pen-caption">
                      <span className="prism-pen-caption-text">{panelView.penExplain}</span>
                      <button
                        type="button"
                        className="prism-pen-mute"
                        onClick={() => setPenAudioOn((v) => !v)}
                        aria-pressed={penAudioOn}
                        title={penAudioOn ? 'Mute narration' : 'Read it aloud'}
                      >
                        {penAudioOn ? '🔊' : '🔇'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {/* Corpus object detail — a contradiction (Tale-of-the-Tape + Interrogate), a gap receipt, or
              a consensus cluster. Reuses the source-panel column; the verbatim quotes come off the
              grounded claims, so nothing here can drift from what was proven. */}
          {openObject && settled && corpusChrome && (
            <div
              className="prism-page-wrap syn-detail-panel"
              style={{ '--pdf-pct': `${pdfPct}%` } as CSSProperties}
            >
              <div className="syn-detail">
                <button
                  type="button"
                  className="prism-page-close syn-detail-close"
                  onClick={() => setOpenObject(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
                {openObject.kind === 'contradiction' &&
                  (() => {
                    const x = corpusChrome.contradictions.find((c) => c.id === openObject.id);
                    if (!x) return null;
                    const a = claimById.get(x.a);
                    const b = claimById.get(x.b);
                    return (
                      <>
                        <span className="syn-detail-kind" data-rel={x.relation}>
                          {x.relation === 'contradicts' ? 'Contradiction' : 'In tension'}
                        </span>
                        <h3 className="syn-detail-title">{x.label}</h3>
                        {!x.comparable && (
                          <p className="syn-banner">
                            Not directly comparable{x.caveat ? ` — differs on ${x.caveat}` : ''}.
                          </p>
                        )}
                        <div className="syn-tape">
                          {[a, b].map(
                            (c, i) =>
                              c && (
                                <button
                                  key={i}
                                  type="button"
                                  className="syn-tape-side"
                                  onClick={() => {
                                    setOpenObject(null);
                                    setOpenId(c.id);
                                  }}
                                >
                                  <span className="syn-tape-cite">
                                    {corpusChrome.sourceLabel(c.source)} · p.{c.page}
                                  </span>
                                  <span className="syn-tape-quote">“{c.quote}”</span>
                                </button>
                              ),
                          )}
                        </div>
                        {x.delta && (
                          <p className="syn-delta">
                            {x.delta.aValue} vs {x.delta.bValue} {x.delta.unit}
                          </p>
                        )}
                        <button
                          type="button"
                          className="syn-interrogate"
                          onClick={() => {
                            setAskLoaded(true);
                            setAskOpen(true);
                            setAskSeed((current) => ({
                              id: (current?.id ?? 0) + 1,
                              question: x.seedQuestion,
                            }));
                          }}
                        >
                          Interrogate — are these comparable?
                        </button>
                      </>
                    );
                  })()}
                {openObject.kind === 'gap' &&
                  (() => {
                    const g = corpusChrome.gaps.find((x) => x.id === openObject.id);
                    if (!g) return null;
                    return (
                      <>
                        <span className="syn-detail-kind" data-rel="gap">
                          {g.kind === 'absent' ? 'Gap' : 'Thin coverage'}
                        </span>
                        <h3 className="syn-detail-title">{g.facet.label}</h3>
                        <p className="syn-receipt">
                          <strong>
                            {g.coveredCount} of {g.sourcesScanned} sources
                          </strong>{' '}
                          mention this
                          {g.coveredCount === 0 ? ' — nothing in the corpus covers it' : ''}.
                        </p>
                        <p className="syn-searched-label">Searched for, verbatim:</p>
                        <ul className="syn-searched">
                          {g.searchedForms.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                        <p className="syn-note">
                          A statement about the corpus text — it dissolves the moment a source
                          covers it.
                        </p>
                      </>
                    );
                  })()}
                {openObject.kind === 'consensus' &&
                  (() => {
                    const c = corpusChrome.consensus.find((x) => x.id === openObject.id);
                    if (!c) return null;
                    return (
                      <>
                        <span className="syn-detail-kind" data-rel="agrees">
                          Consensus
                        </span>
                        <p className="syn-consensus-count">
                          <strong>
                            {c.sourceCount} of {c.corpusSize} sources
                          </strong>{' '}
                          agree
                        </p>
                        <p className="syn-proposition">{c.proposition}</p>
                        <p className="syn-proposition-note">
                          A paraphrase of the shared point — the verbatim lines are below.
                        </p>
                        <div className="syn-members">
                          {c.memberClaimIds.map((id) => {
                            const m = claimById.get(id);
                            return (
                              m && (
                                <button
                                  key={id}
                                  type="button"
                                  className="syn-member"
                                  onClick={() => {
                                    setOpenObject(null);
                                    setOpenId(id);
                                  }}
                                >
                                  <span className="syn-tape-cite">
                                    {corpusChrome.sourceLabel(m.source)} · p.{m.page}
                                  </span>
                                  <span className="syn-tape-quote">“{m.quote}”</span>
                                </button>
                              )
                            );
                          })}
                        </div>
                        {c.band && (
                          <p className="syn-delta">
                            {c.band.min}–{c.band.max} {c.band.unit}
                          </p>
                        )}
                      </>
                    );
                  })()}
              </div>
            </div>
          )}
        </div>

        {/* the Standing strip — what the load-bearing claims came to when checked against the world.
            Shows the honest "checking…" state while in flight, then the one screenshottable line. */}
        {settled && !reconBusy && !reconOn && (verifying || standing) && (
          <div
            className="prism-standing"
            data-verifying={verifying ? 'true' : undefined}
            role="status"
          >
            <span className="prism-standing-dot" aria-hidden="true" />
            <span className="prism-standing-text">
              {verifying ? 'Checking the key claims against the public record…' : standing}
            </span>
          </div>
        )}

        {/* Reconcile standing — the document's own figures checked against each other in pure code */}
        {settled && (reconBusy || reconOn) && (
          <div
            className="prism-standing"
            data-verifying={reconBusy ? 'true' : undefined}
            data-recon="true"
            role="status"
          >
            <span className="prism-standing-dot" aria-hidden="true" />
            <span className="prism-standing-text">
              {reconBusy
                ? 'Checking the document’s own numbers against each other…'
                : recon && recon.length > 0
                  ? `${recon.length === 1 ? 'A number doesn’t' : `${recon.length} numbers don’t`} add up — the document’s own figures disagree`
                  : 'Every number checks out — the document’s figures are consistent.'}
            </span>
          </div>
        )}

        {/* ── action bar (settled) ── */}
        {settled && (
          <footer className="prism-foot">
            <span className="prism-foot-stat">
              {grounded} claim{grounded === 1 ? '' : 's'} · {placed?.regions.length ?? 0} region
              {(placed?.regions.length ?? 0) === 1 ? '' : 's'} · every card cites a real page
              {proposed > grounded ? ` · ${proposed - grounded} ungrounded dropped` : ''}
            </span>
            <div className="prism-foot-actions">
              {/* Ask — the primary entry point: put a question to the document, or let it narrate itself */}
              <div className="prism-foot-group">
                <span className="prism-foot-group-label">Ask</span>
                <button
                  type="button"
                  className={
                    'prism-foot-btn' + (askOpen ? ' is-active' : ' prism-foot-btn--primary')
                  }
                  onClick={() => {
                    // Opening the ask dock closes the other analysis modes (they share its slot), so the
                    // footer never shows two modes active at once.
                    if (!askOpen) {
                      setReconOn(false);
                      setXeOpen(false);
                      setFaOpen(false);
                      setLvOpen(false);
                    }
                    if (!askOpen) setAskLoaded(true);
                    setAskOpen((v) => !v);
                  }}
                  {...preloadIntentProps(askSurface.preload)}
                  aria-pressed={askOpen}
                  title="Ask the document a question — the answer lights up the exact lines"
                >
                  {askOpen ? 'Hide ask' : 'Ask the document'}
                </button>
                <button
                  type="button"
                  className={'prism-foot-btn' + (briefingOn ? ' is-active' : '')}
                  onClick={briefingOn ? exitBriefing : startBriefing}
                  {...preloadIntentProps(briefingSurface.preload)}
                  disabled={!placed || placed.claims.length === 0}
                  aria-pressed={briefingOn}
                  title="Play a silent, captioned flight through the document's argument — ending on its weakest point"
                >
                  {briefingOn ? 'End briefing' : 'Brief me'}
                </button>
              </div>

              {/* Verify — scrutiny passes that return a verdict: numbers, objections, forecasts, the model itself */}
              <div className="prism-foot-group">
                <span className="prism-foot-group-label">Verify</span>
                <button
                  type="button"
                  className={'prism-foot-btn' + (reconOn ? ' is-active' : '')}
                  onClick={runReconcileNow}
                  {...preloadIntentProps(() => loadReconcile().then(() => undefined))}
                  disabled={reconBusy || !cfg || !spec || spec.claims.length === 0}
                  aria-pressed={reconOn}
                  title="Check the document's own figures against each other — flags numbers that don't add up, computed in pure code"
                >
                  {reconBusy ? 'Checking…' : reconOn ? 'Hide numbers' : 'Check the numbers'}
                </button>
                <button
                  type="button"
                  className={'prism-foot-btn' + (xeOpen ? ' is-active' : '')}
                  onClick={runCrossExamNow}
                  {...preloadIntentProps(() =>
                    Promise.all([crossExamSurface.preload(), loadCrossExam()]).then(
                      () => undefined,
                    ),
                  )}
                  disabled={
                    xeBusy ||
                    !cfg ||
                    !spec ||
                    spec.claims.filter((c) => c.role === 'load-bearing').length === 0
                  }
                  aria-pressed={xeOpen}
                  title="Raise the sharpest objection to each load-bearing claim — and show only the ones the document never answers"
                >
                  {xeBusy ? 'Examining…' : xeOpen ? 'Hide objections' : 'Cross-examine'}
                </button>
                {spec && spec.claims.some((c) => c.kind === 'forecast') && (
                  <button
                    type="button"
                    className={'prism-foot-btn' + (faOpen ? ' is-active' : '')}
                    onClick={runAutopsyNow}
                    {...preloadIntentProps(() =>
                      Promise.all([forecastSurface.preload(), loadAutopsy()]).then(() => undefined),
                    )}
                    disabled={faBusy || !cfg || !search?.enabled}
                    aria-pressed={faOpen}
                    title={
                      search?.enabled
                        ? "Grade the document's dated predictions against what actually happened (uses web search)"
                        : 'Turn on web search in Live settings to grade the document’s forecasts against reality'
                    }
                  >
                    {faBusy ? 'Grading…' : faOpen ? 'Hide forecasts' : 'Grade forecasts'}
                  </button>
                )}
                {spec && spec.claims.some((c) => /\d/.test(c.quote)) && (
                  <button
                    type="button"
                    className={'prism-foot-btn' + (lvOpen ? ' is-active' : '')}
                    onClick={runLeversNow}
                    {...preloadIntentProps(() =>
                      Promise.all([leverSurface.preload(), loadLevers()]).then(() => undefined),
                    )}
                    disabled={lvBusy || !cfg || !corpus}
                    aria-pressed={lvOpen}
                    title="Find the model implied under the document and drag its assumptions — every figure traces to a page, the conclusion recomputes live"
                  >
                    {lvBusy ? 'Modeling…' : lvOpen ? 'Hide levers' : 'Live levers'}
                  </button>
                )}
              </div>

              {/* Explore — lenses that redraw the map itself, revealing structure across the document */}
              <div className="prism-foot-group">
                <span className="prism-foot-group-label">Explore</span>
                <button
                  type="button"
                  className={'prism-foot-btn' + (lens === 'contra' ? ' is-active' : '')}
                  onClick={() => setLens((l) => (l === 'contra' ? 'map' : 'contra'))}
                  disabled={!spec || spec.threads.length === 0}
                  title={
                    spec && spec.threads.length === 0
                      ? multiDoc
                        ? 'No links found between these documents'
                        : 'No contradictions found in this document'
                      : undefined
                  }
                >
                  {spec && spec.threads.length > 0
                    ? multiDoc
                      ? `Show links (${spec.threads.length})`
                      : `Find contradictions (${spec.threads.length})`
                    : multiDoc
                      ? 'No links'
                      : 'No contradictions'}
                </button>
                <button
                  type="button"
                  className="prism-foot-btn"
                  onClick={openWhyLens}
                  {...preloadIntentProps(() =>
                    Promise.all([whySurface.preload(), loadWhy()]).then(() => undefined),
                  )}
                  disabled={!cfg || !corpus || lensBusy !== null}
                  title="Explode this document into a causal web — every link traces to a page"
                >
                  {lensBusy === 'why' ? 'Tracing…' : 'Why (causes)'}
                </button>
              </div>

              {/* Annotate & share — pen the source, then turn the marked-up pages into something to
                  send. Named apart from Live's "Highlight" (the user's own tool) — this pen is
                  Mavéa's own annotation, same as Live's Pen control. */}
              <div className="prism-foot-group">
                <span className="prism-foot-group-label">Annotate &amp; share</span>
                <button
                  type="button"
                  className={'prism-foot-btn' + (penOn ? ' is-active' : '')}
                  onClick={() => setPenOn((v) => !v)}
                  aria-pressed={penOn}
                  title="Annotate — Mavéa draws a pen mark over the cited lines and explains, on every question, claim, and briefing beat"
                >
                  {penOn ? 'Pen on' : 'Annotate'}
                </button>
                {spec && (
                  <AnnotationReelButton
                    steps={reelSteps}
                    spec={spec}
                    pdfs={pdfs}
                    cfg={cfg}
                    placed={placed?.claims}
                    verdicts={verdictById}
                  />
                )}
              </div>

              {/* View — plain navigation, not analysis, so it sits apart and stays quiet */}
              <div className="prism-foot-group prism-foot-group--quiet">
                <button type="button" className="prism-foot-btn" onClick={() => setLens('map')}>
                  Reset view
                </button>
                <button
                  type="button"
                  className={'prism-foot-btn' + (legendOpen ? ' is-active' : '')}
                  onClick={() => setLegendOpen((v) => !v)}
                  aria-pressed={legendOpen}
                >
                  Legend
                </button>
              </div>
            </div>
          </footer>
        )}

        {/* the palette legend — the kind colors + thread line styles that make the map readable */}
        {settled && legendOpen && (
          <aside className="prism-legend-panel" aria-label="What the colors and lines mean">
            <div className="prism-legend-col">
              <span className="prism-legend-title">THE KIND PALETTE</span>
              <ul className="prism-legend-kinds">
                {KIND_LEGEND.map((k) => (
                  <li key={k.kind} className="prism-legend-kind">
                    <span
                      className="prism-legend-kind-dot"
                      style={{ background: KIND_META[k.kind].color }}
                      aria-hidden="true"
                    />
                    <span className="prism-legend-kind-name">{KIND_META[k.kind].label}</span>
                    <span className="prism-legend-kind-desc">· {k.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="prism-legend-col">
              <span className="prism-legend-title">THE THREAD PALETTE</span>
              <ul className="prism-legend-threads">
                {THREAD_LEGEND.map((t) => (
                  <li key={t.relation} className="prism-legend-thread">
                    <svg
                      className="prism-legend-thread-line"
                      data-relation={t.relation}
                      viewBox="0 0 40 8"
                      width="40"
                      height="8"
                      aria-hidden="true"
                    >
                      <line x1="2" y1="4" x2="38" y2="4" />
                    </svg>
                    <span className="prism-legend-thread-name">{t.name}</span>
                    <span className="prism-legend-thread-desc">· {t.desc}</span>
                  </li>
                ))}
              </ul>
              <p className="prism-legend-note">
                Threads never turn into red errors — a contradiction is a line you can follow to
                both pages. The thread map is what makes the document <strong>arguable</strong>, not
                just readable.
              </p>
            </div>
          </aside>
        )}

        {/* idle/loading footer hint */}
        {!settled && phase !== 'error' && (
          <footer className="prism-foot prism-foot-quiet">
            <span className="prism-foot-stat">
              The document blooms into a map of its claims — each one a verbatim quote anchored to
              its page.
            </span>
          </footer>
        )}
      </section>
      {/* The Why lens, layered over the map (a fixed-position scrim of its own). */}
      {whyDag && (
        <AsyncSurface label="Why map" overlay>
          <WhyMachineOverlay dag={whyDag} onClose={() => setWhyDag(null)} />
        </AsyncSurface>
      )}
    </div>
  );
}

/** Deterministic page-shard trajectories for the ignition burst (no randomness). */
const SHARDS: { x: string; y: string; r: string; w: number; h: number; d: number }[] = [
  { x: '-210px', y: '-150px', r: '-34deg', w: 34, h: 44, d: 0 },
  { x: '190px', y: '-170px', r: '28deg', w: 28, h: 38, d: 40 },
  { x: '-260px', y: '40px', r: '-14deg', w: 40, h: 30, d: 20 },
  { x: '250px', y: '70px', r: '22deg', w: 30, h: 40, d: 60 },
  { x: '-120px', y: '190px', r: '-44deg', w: 24, h: 32, d: 80 },
  { x: '150px', y: '200px', r: '18deg', w: 36, h: 28, d: 30 },
  { x: '-300px', y: '-40px', r: '-24deg', w: 26, h: 36, d: 50 },
  { x: '300px', y: '-30px', r: '30deg', w: 32, h: 42, d: 10 },
  { x: '40px', y: '-220px', r: '12deg', w: 22, h: 30, d: 70 },
  { x: '-60px', y: '230px', r: '-18deg', w: 30, h: 24, d: 90 },
];
