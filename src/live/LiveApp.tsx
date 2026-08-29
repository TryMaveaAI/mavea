// LiveApp.tsx — the dedicated, standalone Live surface (mounted at #/live).
//
// A focused sibling of the demo App: NO persona library, beat-runner, uploads, or
// intent router — just talk → stream → see. It reuses the shared shell (Presence,
// TopicCanvas, CommandComposer) and CSS so it looks native, and drives the
// provider-agnostic streaming engine via useLiveTurn. Voice-first: real STT (when
// available) + two-voice TTS, with the face speaking the narration as it streams.
import '../styles/live-runtime.css';
import '../styles/templates.css';
import '../styles/presence-styles.css';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { loadFamilies, familiesFor } from '../canvas/blocks/loader';
import type { WorldSpec } from './world/types';
import type { Block, Blank } from '../data/conversation';
import { routeBlankVoice } from './blankVoice';
import { micShouldBeOpen } from '../voice/alwaysOnGate';
import { useAlwaysOnVisibility } from '../voice/useAlwaysOnVisibility';
import { Presence } from '../presence/Presence';
// The canvas pulls the entire ~270-component block library + its CSS (see App.tsx's TopicCanvas
// lazy split for the same rationale). LiveApp used to import it eagerly from the barrel, which
// meant every first #/live visit downloaded the whole block library before the face even
// appeared. Lazy-load it from its own module (not the barrel) so it's a separate chunk fetched
// only when the first canvas actually renders.
const TopicCanvas = lazy(() =>
  import('../canvas/TopicCanvas').then((m) => ({ default: m.TopicCanvas })),
);
import { useTapNarration } from '../canvas/focus/useTapNarration';
import { savedViewMode, useViewMode, type ViewMode } from '../canvas/focus/useFocusMode';
import type { StudyAside } from '../canvas/study/types';

import { blockLabel, speakableLine } from '../canvas/blockLabel';
import { CommandComposer } from '../components/CommandComposer';
import { takeSeedQuery } from './seedQuery';
import {
  peekTourMode,
  clearTourModeFlag,
  stashTourMode,
  peekTourChapter,
  clearTourChapterFlag,
  peekTourSolo,
  clearTourSoloFlag,
  launchSoloChapter,
  peekOpenRipple,
  clearOpenRipple,
} from '../tour/tourEntry';
import { useTourDriver, type TourOps } from '../tour/useTourDriver';
import { TourOverlay } from '../tour/TourOverlay';
import { TourEndCard } from '../tour/TourEndCard';
import { tourConversation } from '../tour/corpus';
import { peekDemoPersona, clearDemoPersonaFlag, peekDemoStep } from '../demo/demoEntry';
import { useDemoDriver } from '../demo/useDemoDriver';
import { DemoOverlay } from '../demo/DemoOverlay';
import { castMember } from '../demo/cast';
import { loadTourPrism, type TourPrismDoc } from '../tour/corpus/prism';
import { ensureTourDashboard } from '../tour/dashboardSeed';
import { prewarmLive } from './prewarm';
import { warmSemanticFit, embedText } from './semantic';
import { Icon } from '../icons/icons';
import { useVoiceController } from '../voice/useVoiceController';
import type { VoicePhase } from '../voice/types';
import {
  speakLine as speakLineTwoVoice,
  primeLine,
  cancelSpeech,
  isSpeaking,
  subscribeSpeaking,
  type SpokenLine,
} from '../voice/tts';
import { setKokoroVoice, kokoroKnownAvailable } from '../voice/kokoro';
import { useVoiceEnergySink } from '../voice/voiceEnergy';
import {
  awaitWalkReady,
  awaitFirstPaint,
  waitLineStart,
  waitLineEnd,
  waitQueueQuiet,
  delay,
  finishCapMs,
  MIN_STOP_MS,
  PREPARE_CUE_DELAY_MS,
  SETTLE_TIMEOUT_MS,
  SETTLE_IMG_MS,
} from './walkSync';
import { ensureFigureReady } from '../canvas/embed/ready';
import { findPreset, VOICE_MAVEA_STORAGE_KEY, DEFAULT_MAVEA_VOICE_ID } from '../voice/presets';
import { ALWAYS_ON_STORAGE_KEY } from '../hooks/useTweaks';
import { livePresence } from './presenceMap';
import { celebrationWorthy, emotionForSpec } from '../presence/expression';
import { useInterjections } from './interject';
import { Overview, deriveChapters } from './scrubber';
import type { Chapter } from './scrubber';
import { composeThread } from './composeThread';
import './livedock.css';
import { liveTourBeats, shouldRevealTour } from './generateBeats';
import { revealInkPlan } from './mutedReveal';
import { claim as claimStepper } from '../canvas/focus/stepDriver';
import { runDiagramWalk, STEP_DWELL_MS } from './diagramWalk';
import { prefersReducedMotion } from '../canvas/focus/motion';
import { TopbarMenu, type TopbarMenuItem } from './TopbarMenu';
import type { PaletteItem } from './features/CommandPalette';
import { useCommandPalette } from './features/useCommandPalette';
import { TopbarSearchButton } from './features/TopbarSearchButton';
import { PALETTE_SHORTCUT } from './features/paletteShortcut';
import { FEATURES } from './features/registry';
import { StartWith, type StartWithItem } from './welcome/StartWith';
import { START_WITH_IDS, NEEDS_LIVE_SURFACE, prismRow } from './welcome/startWithIds';
import { useLibrary } from './library/useLibrary';
import { removeEntry, saveCanvas, getLibrary } from './library/store';
import { MEMORY_EVENT, getMemoryNodes } from './memory/store';
import {
  useLiveTurn,
  hydrateFromSession,
  TURN_REFUSAL_NOTICE,
  type TurnPhase,
} from './useLiveTurn';
import { loadSession, saveSession, clearSession, hasSavedSession } from './session/store';
import {
  useLiveConfig,
  setLiveConfigV2,
  toModelConfig,
  toCaps,
  getLiveConfigV2,
  secretsReady,
  type LiveConfigV2,
} from './useLiveConfig';
import { providerInfo, getAdapter } from './providers';
import {
  attachmentLabel,
  isImage,
  isPdf,
  isOffice,
  isText,
  isExplodable,
  ACCEPTED_TYPES,
  type Attachment,
} from './attachments';
import { SetupWizard } from './setup/SetupWizard';
import { isSetupDone } from './setup/setup';
import { TemplatePicker } from './TemplatePicker';
import { MicModePopover, type MicMode } from './voice/MicModePopover';
import { applyPresenceStyle, automaticPresenceStyle, clearPresenceStyle } from './presenceStyles';
import type { ExportAnswer } from '../export';
import { DashPill } from './dashboards/DashPill';
import { useDashboards } from './dashboards/useDashboards';
import { LiveEvidence } from './LiveEvidence';
import {
  AnswerHero,
  AnswerFooter,
  DockBar,
  SessionRail,
  TopicSweep,
  heroSource,
  inferredClaims,
} from './voice';
import { useTurnLatency, formatLatency } from './voice/useTurnLatency';
import type { HeroContent } from './voice/heroSource';
import { AnnotationLayer, BADGE_MS, MARK_STEP_MS } from './annotate/AnnotationLayer';
import { GestureTrack, type GestureEntry } from './annotate/GestureTrack';
import { PenPill } from './annotate/PenPill';
import { isTeachAsk } from './annotate/teach';
import { condenseForNote } from './annotate/marginNote';
import { answerToContent } from './content/fromAnswer';
import { asideFor } from './content/asideFor';
import { assumptionIn, notableIn, studyPromptIn } from './content/notableIn';
import { penMarks } from './content/penQuip';

/** How far apart the study's opening marks land — a quick cascade that reads as a hand
 *  moving across the board, not a batch that appears all at once. CSS delay, not a wait. */
const STUDY_INK_STEP_MS = 190;
import { UserInkLayer } from './annotate/UserInkLayer';
import { useInkIntent } from './annotate/useInkIntent';
import { InkBar } from './annotate/InkBar';
import { MarkToggle } from './annotate/MarkToggle';
import { resolveInkTargets, dedupeById, inkPromptText } from './annotate/inkIntent';
import type { TourMark } from '../engine/liveSchema';
import type { ZoomLevel } from './zoom/ZoomDeck';
import { useZoomGesture } from './zoom/useZoomGesture';
import { getAtlas, syncFromLibrary, matchLibraryEntry } from './atlas/store';
import { SEED_SHIP } from './ripple/seed';
import { buildShipFromDiff } from './ripple/ingest/buildShip';
import { parseUnifiedDiff } from './ripple/ingest/parseDiff';
import { enrichShipModel } from './ripple/ingest/generate';
import type { ShipModel } from './ripple/model';
// Why Machine + Synthesis (Compare) now live INSIDE Prism (upload-first), not as standalone Live
import { briefNeeded, markBriefShown, buildBriefPrompt } from './brief';
import {
  addCards,
  getAllCards,
  getStudyPrefs,
  listDecks,
  markStyleAsked,
  removeCards,
  setStudyStyle,
} from './srs/store';
import { useStudyableCount, useStudyStyle } from './srs/useStudy';
import { ReadyShelf } from './welcome/ReadyShelf';
import type { SrsCard, SrsSource, StudyStyle } from './srs/store';
import { initialCardsForBlock, draftCardsFromBlock } from './srs/suggestCards';
import type { DraftCard } from './srs/suggestCards';
import './srs/flashpill.css';
import { extractFlashcards } from './srs/extractCards';
import { takeCourseLesson } from './course/courseSeed';
import {
  getCourse,
  getProgress as getCourseProgress,
  setCurrentLesson,
  recordCheckpoint,
  cacheLessonFrame,
  getCachedLessonFrame,
  COURSE_EVENT,
  type CourseProgress,
  type CheckpointResult,
} from './course/store';
import { buildLessonSpine } from './course/lessonSpine';
import {
  getMastery,
  attachQuizMasteryListener,
  MASTERY_CHECKPOINT_EVENT,
  type MasteryCheckpointDetail,
} from './course/mastery';
import { ensureTourCourse } from '../tour/courseSeed';
import type { TopicCourse } from './course/model';
// NB: print.css is imported globally in main.tsx (the demo also exports to PDF), not here.
import { setStreamTap } from '../voice/streamTts';
import {
  recorderTap,
  beginTurn as beginTurnAudio,
  endTurn as endTurnAudio,
  setTapSuspended,
  getVersion as getTurnAudioVersion,
  markBlocks,
  subscribe as subscribeTurnAudio,
  snapshot as snapshotTurnAudio,
  type TurnAudio,
} from './scrubvoice/recorder';
import { unbuiltCount } from './scrubvoice/unbuild';
import { TurnAudioStore } from './scrubvoice/retain';
import { turnFrameId } from './history';
import { VoiceScrubber } from './scrubvoice/VoiceScrubber';
import { VoiceSpeedChip } from './scrubvoice/VoiceSpeedChip';
import { ExplainLevelChip } from './ExplainLevelChip';
import { useGhosts } from './ghost/useGhosts';
import { GhostRow } from './ghost/GhostRow';
import { useWhisper, WHISPER_GAIN } from './whisper/quietHours';
import { useMindShape } from './mindshape/useMindShape';
import { MindShapeCanvas } from './mindshape/MindShapeCanvas';
import { registerWorldOpener } from './world/openWorld';
import './world/worldChip.css';
import { mindShapeToPrompt } from './mindshape/mindShapeToPrompt';
import { completeWordsOnly, countThoughts } from './mindshape/localExtract';
import type { MindShapeSpec } from './mindshape/types';
import './whisper/whisper.css';
import { setVoiceGain, setOutputMuted } from '../voice/streamTts';
import { isThoughtsTrigger, bankable, sortAsk, listenChipTitle } from './thinkaloud/thinkaloud';
import {
  sharedUrl,
  looksLikeShare,
  claimCheckAsk,
  SCREENSHOT_CHECK_ASK,
  inTextField,
} from './shareIn';
import './present/present.css';
import { type PersonaId, PERSONAS, readPersona, persistPersona } from './present/personas';
import { buildRecap } from './recap/recapModel';
import {
  ListeningCard,
  WorkingSkeletons,
  ComposingStatus,
  TurnActivityChips,
  useSpeaking,
  useSpeakingHeld,
  useVoicePreparing,
  skeletonPlan,
} from './turnstate';
// pendingCard is catalog-free now (it takes the pre-resolved data shape from the turn state), but
// it stays out of the './turnstate' barrel anyway — the barrel is imported by the eager demo, and
// this keeps its surface minimal. See index.ts.
import { pendingCard } from './turnstate/pendingCard';
import { anyOverlayOpen } from './hooks/overlayGuard';
import { markCircleLoop } from '../tour/markCircle';
import {
  MIC_AUDIO_MSG,
  MIC_DENIED_MSG,
  MIC_TRANSCRIPTION_MSG,
  MIC_UNSUPPORTED_MSG,
} from './voiceMessages';
import { useAttachments } from './hooks/useAttachments';
import { useBookmarks } from './hooks/useBookmarks';
import { useAskHint } from './hooks/useAskHint';
import { AsyncSurface, PendingShell } from '../components/AsyncSurface';
import { CanvasSkeleton } from '../canvas/CanvasSkeleton';
import { createPreloadableLazy, scheduleIdlePreload } from '../lib/preloadableLazy';
import { FeatureUseNotice } from '../legal/FeatureUseNotice';
import { hasLegalAcceptance } from '../legal/acceptance';
import { preloadRoute } from '../routes';
import { mountTemplateSkin } from './templates';
import { sentenceCase } from '../lib/sentenceCase';

// Remembers whether the user collapsed the desktop conversation rail to a slim strip.
// What the lazy-canvas Suspense fallback sketches while the TopicCanvas chunk downloads: two
// half-width cards over a full-width one — the generic shape of an answer, no catalog reach.
const CANVAS_LOADING_SHAPE = [{ col: 6 }, { col: 6 }, { col: 12 }];

const RAIL_COLLAPSED_STORAGE_KEY = 'mavea-live-rail-collapsed-v1';

// The world view, named against its neighbour so the pair reads as a pair rather than as two words
// for the same thing: "View as canvas" spreads THIS answer's cards in space; "View as living
// answer" opens why the answer is true — matching what the view calls itself once it's open (the
// card marker and the overlay's own kicker both read "Living answer"). The reason is what a reader
// gets instead of a button that does nothing — worlds are offered for causal questions, so most
// answers honestly have none.
const WORLD_VIEW_LABEL = 'View as living answer';
const WORLD_VIEW_HINT = 'Why this answer is true — the causal web behind it, and its receipts';

// Remembers a Hold pick in MicModePopover (vs. Tap) so it remains a true input mode across visits.
const MIC_HOLD_PREFERRED_STORAGE_KEY = 'mavea-mic-hold-preferred';
const LOW_CONFIDENCE_VOICE_MSG = 'I may have misheard that. Review the draft, then send it.';

// VAD already waits ~1.6s to close an utterance. Another 6.4s makes quiet-only Watch Me Think
// settling an 8s fallback; the visible Done thinking button is the primary completion action.
const SETTLE_SILENCE_MS = 6400;

// A settled answer is usually still talking: the reveal tour holds every stop past its own line
// (MIN_STOP_MS) and a claimed diagram dwells a whole step with nothing spoken (STEP_DWELL_MS), so
// plain silence is not the end of the turn. Quiet held past both of those is — the moment the
// voice recording can close without eating the rest of the tour.
const TURN_VOICE_QUIET_MS = STEP_DWELL_MS + MIN_STOP_MS;

/** True when a transport key (←/→/Space) belongs to the focused control, not to the walkthrough
 *  or demo replay. Both drive REAL UI under a pointer-transparent overlay — the API-key input,
 *  the end-card buttons — so a global preventDefault would swallow typing and a focused button's
 *  native Space activation. Escape stays global: it always means "leave the tour". */
function transportKeyBelongsToControl(e: KeyboardEvent): boolean {
  if (inTextField(e.target)) return true;
  const isSpace = e.key === ' ' || e.key === 'Spacebar';
  return isSpace && e.target instanceof HTMLElement && !!e.target.closest('button');
}

// Overlays and modals that only ever mount on an explicit user action — open Prism, compare
// sources, export, share the reel, replay a moment, pin to a dashboard, present, rehearse a
// hard conversation, review flashcards, resume the library. Each is heavy (the PDF
// engine, jspdf, the reel director, the block-extraction preview) and none is needed for the
// first Live paint or the first answer, so we split them off the route's initial download: each
// chunk arrives only the first time the user
// opens it. They render inside a local <Suspense> (LazyOverlay) so a first-open fetch can't bubble
// to the route-level fallback and blank the whole surface. This mirrors App.tsx, which already
// lazy-loads ExportModal and the canvas for the same reason.
const howItWorksLoad = createPreloadableLazy(() =>
  import('./HowItWorks').then((m) => ({ default: m.HowItWorks })),
);
const HowItWorks = howItWorksLoad.Component;
const commandPaletteLoad = createPreloadableLazy(() =>
  import('./features/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);
const CommandPalette = commandPaletteLoad.Component;
const libraryLoad = createPreloadableLazy(() =>
  import('./Library').then((m) => ({ default: m.Library })),
);
const Library = libraryLoad.Component;
const liveSettingsLoad = createPreloadableLazy(() =>
  import('./LiveSettings').then((m) => ({ default: m.LiveSettings })),
);
const LiveSettings = liveSettingsLoad.Component;
const dashboardDetailLoad = createPreloadableLazy(() =>
  import('./dashboards/DashboardDetail').then((m) => ({ default: m.DashboardDetail })),
);
const DashboardDetail = dashboardDetailLoad.Component;
const dashboardSettingsLoad = createPreloadableLazy(() =>
  import('./dashboards/DashboardSettings').then((m) => ({ default: m.DashboardSettings })),
);
const DashboardSettings = dashboardSettingsLoad.Component;
const understoodPanelLoad = createPreloadableLazy(() =>
  import('./understand/UnderstoodPanel').then((m) => ({ default: m.UnderstoodPanel })),
);
const UnderstoodPanel = understoodPanelLoad.Component;
const zoomDeckLoad = createPreloadableLazy(() =>
  import('./zoom/ZoomDeck').then((m) => ({ default: m.ZoomDeck })),
);
const ZoomDeck = zoomDeckLoad.Component;
const atlasViewLoad = createPreloadableLazy(() =>
  import('./atlas/AtlasView').then((m) => ({ default: m.AtlasView })),
);
const AtlasView = atlasViewLoad.Component;
const rippleOverlayLoad = createPreloadableLazy(() =>
  import('./ripple/RippleOverlay').then((m) => ({ default: m.RippleOverlay })),
);
const RippleOverlay = rippleOverlayLoad.Component;
const cardEditorLoad = createPreloadableLazy(() =>
  import('./srs/CardEditor').then((m) => ({ default: m.CardEditor })),
);
const CardEditor = cardEditorLoad.Component;
const courseRailLoad = createPreloadableLazy(() =>
  import('./course/CourseRail').then((m) => ({ default: m.CourseRail })),
);
const CourseRail = courseRailLoad.Component;
const mindMapViewerLoad = createPreloadableLazy(() =>
  import('./mindshape/MindMapViewerDrawer').then((m) => ({ default: m.MindMapViewerDrawer })),
);
const MindMapViewerDrawer = mindMapViewerLoad.Component;
const recapLoad = createPreloadableLazy(() =>
  import('./recap/Recap').then((m) => ({ default: m.Recap })),
);
const Recap = recapLoad.Component;
const libraryOverlayLoad = createPreloadableLazy(() =>
  import('./library/LibraryOverlay').then((m) => ({ default: m.LibraryOverlay })),
);
const LibraryOverlay = libraryOverlayLoad.Component;
const replayOverlayLoad = createPreloadableLazy(() =>
  import('./ReplayOverlay').then((m) => ({ default: m.ReplayOverlay })),
);
const ReplayOverlay = replayOverlayLoad.Component;
const shareModalLoad = createPreloadableLazy(() =>
  import('../clip/ShareModal').then((m) => ({ default: m.ShareModal })),
);
const ShareModal = shareModalLoad.Component;
const exportModalLoad = createPreloadableLazy(() =>
  import('../export/ExportModal').then((m) => ({ default: m.ExportModal })),
);
const ExportModal = exportModalLoad.Component;
const extractionPreviewLoad = createPreloadableLazy(() =>
  import('./dashboards/ExtractionPreview').then((m) => ({ default: m.ExtractionPreview })),
);
const ExtractionPreview = extractionPreviewLoad.Component;
// PinToDashboard now plans a standing check (refine + refresh engine) rather than just writing a
// snapshot, so it carries real weight — lazy like its ExtractionPreview sibling instead of eager.
const pinToDashboardLoad = createPreloadableLazy(() =>
  import('./dashboards/PinToDashboard').then((m) => ({ default: m.PinToDashboard })),
);
const PinToDashboard = pinToDashboardLoad.Component;
const prismOverlayLoad = createPreloadableLazy(() =>
  import('./prism/PrismOverlay').then((m) => ({ default: m.PrismOverlay })),
);
const PrismOverlay = prismOverlayLoad.Component;
// The living-answer takeover. Heavy (the morph stage, the trust layer, the cascade engine) and
// only ever reached by tapping a world card, so it never rides the first paint.
const worldOverlayLoad = createPreloadableLazy(() =>
  import('./world/WorldOverlay').then((m) => ({ default: m.WorldOverlay })),
);
const WorldOverlay = worldOverlayLoad.Component;
const synthesisOverlayLoad = createPreloadableLazy(() =>
  import('./prism/SynthesisOverlay').then((m) => ({ default: m.SynthesisOverlay })),
);
const SynthesisOverlay = synthesisOverlayLoad.Component;
const presentationDeckLoad = createPreloadableLazy(() =>
  import('./present/PresentationDeck').then((m) => ({ default: m.PresentationDeck })),
);
const PresentationDeck = presentationDeckLoad.Component;
const delegatePanelLoad = createPreloadableLazy(() =>
  import('./delegate/DelegatePanel').then((m) => ({ default: m.DelegatePanel })),
);
const DelegatePanel = delegatePanelLoad.Component;
const srsReviewLoad = createPreloadableLazy(() =>
  import('./srs/SrsReview').then((m) => ({ default: m.SrsReview })),
);
const SrsReview = srsReviewLoad.Component;
// The first-run walkthrough's baked Prism replay. It statically pulls the whole PrismOverlay
// (the PDF engine + the annotation reel), so keeping it lazy is what actually holds those chunks
// off every Live mount — a returning visitor who never triggers the tour never downloads Prism.
const tourPrismLoad = createPreloadableLazy(() =>
  import('../tour/TourPrism').then((m) => ({ default: m.TourPrism })),
);
const TourPrism = tourPrismLoad.Component;

function LazyOverlay({
  children,
  label = 'Feature',
}: {
  children: ReactNode;
  label?: string;
}): ReactElement {
  return (
    <AsyncSurface label={label} overlay>
      {children}
    </AsyncSurface>
  );
}

function goDemo(): void {
  try {
    window.location.hash = '';
  } catch {
    /* no window */
  }
}

function warmRoute(hash: string): Promise<void> {
  return preloadRoute(hash) ?? Promise.resolve();
}

/**
 * True when an utterance is filler or an explicit "keep going" signal — not a real question.
 * Used during always-on barge-in: if the user just said something trivial while Mavéa was
 * speaking, we resume the narration rather than firing a new turn.
 */
function isContinuePhrase(text: string): boolean {
  const t = text
    .toLowerCase()
    .trim()
    .replace(/[.,!?]+$/, '');
  // Very short utterances (≤3 words) that aren't a real question
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    // Common affirmations and fillers
    if (
      /^(yeah|yep|yes|ok|okay|sure|right|uh huh|uh-huh|mhm|mm|hmm|hm|go on|go ahead|carry on|continue|keep going|please continue|please go on|go ahead|keep it up|got it|alright)$/.test(
        t,
      )
    )
      return true;
  }
  // Explicit continue phrases regardless of length
  return /\b(keep going|go on|continue|carry on|go ahead|please continue|please go on)\b/.test(t);
}

export function LiveApp(): ReactElement {
  const [cfg] = useLiveConfig();
  const info = providerInfo(cfg.provider);
  const connected = cfg.models[cfg.provider] || info.defaultModel;
  // Hold the skin for as long as Live is mounted. Ref-counted (mountTemplateSkin) because the
  // setup wizard renders its own picker inside this surface: the picker's unmount used to strip
  // `data-template`, so the first answer after "New" rendered in the stock skin.
  useLayoutEffect(() => mountTemplateSkin(document), []);

  // Reading text size (Appearance → Text size): stamps the root so the `--fs-scale` token
  // override in wow-polish.css takes effect. 'normal' clears the attribute rather than writing
  // it, so the token falls through to its unscaled default.
  useEffect(() => {
    const root = document.documentElement;
    if (cfg.fontScale === 'normal') delete root.dataset.fontScale;
    else root.dataset.fontScale = cfg.fontScale;
    return () => {
      delete root.dataset.fontScale;
    };
  }, [cfg.fontScale]);

  // A typed question handed over from the landing's hero composer (one-shot, cleared on read).
  // If setup is already done, an effect below auto-starts the session with it — the user "just
  // started a live session". If not, it prefills the setup wizard's composer so the question is
  // ready the moment they finish configuring. Read once so a re-render can't resurrect it.
  const seedQuery = useRef(takeSeedQuery());
  // Topic Courses: "Start course"/"Continue" from #/courses hands off which lesson to open the
  // same way — one-shot, cleared on read. Consumed by the mount effect below (openCourseLesson),
  // which either replays a cached lesson canvas for free or runs a real lesson turn.
  const courseSeed = useRef(takeCourseLesson());
  // First-run cinematic walkthrough: replay the baked corpus AS a live session (no key).
  // `peekTourMode` only READS the flag — a plain useRef(fn()) initializer is evaluated on every
  // render (React re-invokes a function component's body more than once for a single eventual
  // commit, e.g. an interruptible concurrent render that gets abandoned and retried
  // synchronously), so a read that also consumed the one-shot flag could have it burned by a
  // discarded attempt before the render that actually sticks ever saw it — "Take the tour"
  // occasionally dropping onto the ordinary Live home. The actual consume (clearTourModeFlag)
  // happens once below, in an effect that only ever runs for a render that truly committed.
  const tourMode = useRef(peekTourMode());
  // A landing vignette can deep-link straight to one chapter ("see it live") — same peek/clear
  // split as tourMode, for the same reason.
  const tourStartChapter = useRef(tourMode.current ? peekTourChapter() : null);
  // A deep-link or palette "Watch" can ask for a single chapter to play SOLO (return to the end
  // card when done) rather than continuing the tour — same one-shot peek/clear split.
  const tourSolo = useRef(tourMode.current ? peekTourSolo() : false);
  // Demo replay: a landing demo card (or a ?demo= deep link) boots this surface as a baked
  // persona session — same peek/clear split as tourMode, for the same reason. The tour wins
  // if both are somehow stashed; only one scripted driver is ever active per boot. An id with
  // no cast entry (a garbage deep link) is ignored, so the surface boots normally instead of
  // stranding the visitor on an empty stage.
  const demoPersona = useRef(
    (() => {
      if (tourMode.current) return null;
      const id = peekDemoPersona();
      return id && castMember(id) ? id : null;
    })(),
  );
  const demoStartStep = useRef(demoPersona.current ? peekDemoStep() : null);
  useEffect(() => {
    if (tourMode.current) clearTourModeFlag();
    if (tourStartChapter.current) clearTourChapterFlag();
    if (tourSolo.current) clearTourSoloFlag();
    if (demoPersona.current) clearDemoPersonaFlag();
  }, []);
  const [value, setValue] = useState('');
  // Files staged for the next turn (chips above the composer) + the encode/guard handlers and the
  // "this turn carried files" flag — self-contained staging state, owned by the hook.
  const {
    attached,
    setAttached,
    attachError,
    setAttachError,
    turnHadFiles,
    setTurnHadFiles,
    onFiles,
    removeAttachment,
  } = useAttachments();
  // Blocks the user pinned from the current answer to ask a follow-up about (multi-select).
  // Shown as removable chips above the composer; their real props feed the next turn, then clear.
  const [pinned, setPinned] = useState<Block[]>([]);
  // Ink marking: armed for mouse/touch (a pen always draws). The hook below owns the pending marks.
  const [inkArmed, setInkArmed] = useState(false);
  // One-time coach hint pointing out the per-element "ask about this" affordance. Once the user
  // has seen it (dismissed or used it), it never returns.
  const { askHintSeen, dismissAskHint } = useAskHint();
  const [listening, setListening] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  // The mic has closed but the words aren't text yet. Nothing has been submitted, so every
  // indicator that said "I'm hearing you" unmounts at once and the surface goes blank for the
  // length of a transcription — the gap that read as "it missed that". The face and the listening
  // card both hold through it.
  //
  // It starts EARLIER than the phase does: VadVoice reports a provisional end of speech as soon as
  // the person has plainly stopped, about 1.3s before its redemption window closes the utterance
  // for real, and takes the guess back if they were only pausing mid-thought. That whole window
  // was previously spent looking like an open mic.
  const [speechEnding, setSpeechEnding] = useState(false);
  const transcribing = voicePhase === 'transcribing' || speechEnding;
  const [heard, setHeard] = useState<string | null>(null);
  // The ask that produced the canvas on screen — the answer hero's "YOU — …" label. Null for a
  // files-only turn (there's no sentence to quote) and before the first ask.
  const [lastAsk, setLastAsk] = useState<string | null>(null);
  // Visible voice failure (unsupported browser / denied mic / audio trouble) — rendered as a
  // dismissible inline notice above the composer. Cleared the moment listening actually starts.
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // "+ Dashboard": turn the current conversation into a living dashboard without leaving Live.
  const [dashOpen, setDashOpen] = useState(false);
  // The walkthrough's curated dashboard (a real store entry) shown in a full-screen takeover.
  const [tourDashId, setTourDashId] = useState<string | null>(null);
  // Within that takeover, flip from the dashboard itself to its Settings panel — the real
  // refresh-cadence control that backs up "I'll turn it into a living dashboard that keeps itself
  // up to date". A local flag rather than DashboardSettings' own #/dashboards/.../settings link:
  // that link is a real hash href, and following it here would navigate the whole surface away
  // from #/live mid-tour.
  const [tourDashSettings, setTourDashSettings] = useState(false);
  // The single answer card the user tapped "+" on, to pin onto a dashboard (null = picker closed).
  // `question` (the ask that produced it) rides along so the pinned widget can carry a
  // refreshQuery — without it, a pinned card would freeze at whatever it looked like at pin-time.
  const [pinBlock, setPinBlock] = useState<{ block: Block; question?: string } | null>(null);
  // The brief "Added to X" pill shown once a pin lands — lives here (not inside PinToDashboard)
  // because the sheet closes the instant a pin confirms, and the pill needs to outlive it.
  const [pinAdded, setPinAdded] = useState<{ id: string; title: string } | null>(null);
  // Flashcards: block ids captured this session (so the "Cards" chip reads "Added"), the open add
  // sheet, and the brief confirmation pill.
  const [flashedIds, setFlashedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [flashAdd, setFlashAdd] = useState<{
    block: Block;
    initial: DraftCard[];
    deck: string;
    source: SrsSource;
    enrich?: () => Promise<DraftCard[]>;
  } | null>(null);
  const [cardsPill, setCardsPill] = useState<{ count: number; ids: string[] } | null>(null);
  const cardsPillTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The one-time question about how these cards should behave. Replaces the plain confirmation on
  // the very first save and never appears again.
  const [styleAsk, setStyleAsk] = useState<{ count: number; deck: string } | null>(null);
  const styleAskTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Morning brief: guards the once-per-day auto-run so it never fires twice in a session.
  const [briefFired, setBriefFired] = useState(false);
  // Spaced-repetition review overlay.
  const [srsOpen, setSrsOpen] = useState(false);
  // The session recap overlay ("Tonight, so far.") — state lives up here because the
  // interjection gates read it during render.
  const [recapOpen, setRecapOpen] = useState(false);
  // The Rehearsal: both seats of the practice overlay (also gates interjections, like recap).
  const [delegateOpen, setDelegateOpen] = useState(false);
  // The atlas overlay — every saved conversation as a flyable map. The count gates the
  // topbar button (the index outlives Library eviction, so it can be >0 with an empty Library).
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [atlasCount, setAtlasCount] = useState(() => getAtlas().length);
  // Count of living dashboards, for the Explore menu's "Dashboards" entry. useDashboards is a
  // useSyncExternalStore hook, so this reflects a dashboard built mid-session (or one that only
  // finished its async hydrate after mount — see useDashboards.ts) without ever needing a reload.
  const dashCount = useDashboards().length;
  useEffect(() => {
    // Warm the on-device semantic embedder so it's ready by the first turn. It never blocks an
    // answer (selection treats it as optional), and it runs in a worker — but it is still ~7MB of
    // model pulled over the network, and it used to be fetched the moment Live mounted. Someone who
    // opens Live, looks around and leaves paid for all of it and used none of it; on a metered
    // connection or a weak laptop that is exactly the kind of thing that makes an app feel heavy.
    //
    // So it waits for a sign the person actually intends to ask something — touching the composer,
    // or reaching for the mic. There are seconds between that and a finished question, which is far
    // more than the warm needs, so nothing is slower in practice and a visitor who never asks pays
    // nothing at all.
    // The sign has to be the COMPOSER, not any key or click: a bare keydown/pointerdown listener
    // treats scrolling the page, dismissing a hint or opening a menu as "about to ask", which is
    // most of what a visitor who never asks anything does. Focus reaches the field before the
    // first keystroke does, so typing arms it just as early as it used to.
    const stop = (): void => {
      window.removeEventListener('focusin', start);
      window.removeEventListener('pointerdown', start);
    };
    function start(e: Event): void {
      const el = e.target instanceof Element ? e.target : null;
      if (!el?.closest('.composer, .mic-btn')) return;
      stop();
      warmSemanticFit();
    }
    window.addEventListener('focusin', start);
    window.addEventListener('pointerdown', start, { passive: true });
    return stop;
  }, []);

  // Quiz-graded mastery tracking: any quiz block anywhere can grade an answer (Quiz.tsx broadcasts
  // it generically), but only course/mastery.ts's own join against a course lesson's checkpoint
  // list turns that into anything — see its header. Zero model calls either way.
  useEffect(() => attachQuizMasteryListener(), []);

  // Prism — the document the user chose to "explode" into a map of grounded claims. Holds the
  // staged file(s) so the overlay has them even after the composer clears on send.
  // The document(s) currently exploded into a world. One document, or several to compare.
  const [prismDocs, setPrismDocs] = useState<Attachment[] | null>(null);
  // First-run tour: a baked Prism analysis of a real public document (null = closed).
  const [tourPrismDoc, setTourPrismDoc] = useState<TourPrismDoc | null>(null);

  // A whole PILE of sources fuses into the Synthesis World (themes + contradictions + gaps across the
  // corpus); a document or a few go to Prism. Same "explode" gesture — it just scales by input count.
  const [synthesis, setSynthesis] = useState<Attachment[] | null>(null);
  // The Synthesis World is OFFERED from 3 sources, and taken automatically at 4+. A single document is
  // classic Prism; 2 (and 3, by choice) compare in Prism; 3 also offers Synthesize; 4+ synthesize.
  const SYNTHESIS_MIN_SOURCES = 3; // synth available as a choice from here
  const SYNTHESIS_AUTO_SOURCES = 4; // synth is the automatic default from here
  const openExplode = useCallback((docs: Attachment[]) => {
    if (docs.length >= SYNTHESIS_AUTO_SOURCES) setSynthesis(docs);
    else if (docs.length > 0) setPrismDocs(docs);
  }, []);
  // Ripple — the code/ship companion. Null = closed; a ShipModel = the open overlay. For now it
  // opens the worked example; real ingestion (paste a diff / connect a repo) lands in a later pass.
  const [ripple, setRipple] = useState<ShipModel | null>(null);
  // The flagship's Ripple "See it live" (which can't deep-link a tour chapter — Ripple was cut from
  // the walkthrough) hands off through a one-shot flag: open Ripple's own overlay on mount, seeded
  // with its demo ship, so the preview honestly shows Ripple rather than dropping into the tour.
  useEffect(() => {
    if (peekOpenRipple()) {
      clearOpenRipple();
      setRipple(SEED_SHIP);
    }
  }, []);
  // The read-only "Watch Me Think" map re-opened from a chat. `spec` is kept while closing so the
  // drawer still has content during its slide-out.
  const [mindView, setMindView] = useState<{ open: boolean; spec: MindShapeSpec | null }>({
    open: false,
    spec: null,
  });
  // Present mode: chrome falls away, the Focus stage fills the room, the mic stays live.
  // Frames born while presenting are room questions — the rail labels them honestly.
  const [presenting, setPresenting] = useState(false);
  const presentingRef = useRef(false);
  presentingRef.current = presenting;
  const [presentationPreparing, setPresentationPreparing] = useState(false);
  const presentationRequestRef = useRef(0);
  const openPresentation = useCallback(() => {
    const request = ++presentationRequestRef.current;
    setPresentationPreparing(true);
    // Keep the current answer painted while the split deck chunk arrives. Flipping `presenting`
    // first applies the theatre background immediately, so a cold import used to show a gray
    // full-screen interstitial before the first slide existed.
    const enter = (): void => {
      if (presentationRequestRef.current !== request) return;
      setPresentationPreparing(false);
      setPresenting(true);
    };
    void presentationDeckLoad.preload().then(enter, enter);
  }, []);

  useEffect(
    () => () => {
      presentationRequestRef.current += 1;
    },
    [],
  );
  const [persona, setPersona] = useState<PersonaId>(() => readPersona());
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [roomFrames, setRoomFrames] = useState<ReadonlySet<number>>(new Set());
  // Semantic zoom: pinch out on the canvas and the session reads at altitude — chapters,
  // then the whole night in one breath. null = at the canvas (no deck).
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel | null>(null);
  // Scrub-the-voice: the settled turn's recorded spoken track, and where the playhead sits.
  // scrubT is the playhead, updated while dragging and at playback boundaries (start/pause/end) —
  // the 60fps walk while the voice plays forward stays local to VoiceScrubber, so playback never
  // re-renders this surface per frame. scrubBuild is the separate "un-build the canvas to this
  // moment" switch — true ONLY while the user is actively dragging to rewind. Pressing Play to
  // listen leaves it false, so the answer stays whole and only the playhead moves (a slow model's
  // degenerate timing can't collapse it).
  const [turnAudio, setTurnAudio] = useState<TurnAudio | null>(null);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [scrubBuild, setScrubBuild] = useState(false);
  const onScrub = useCallback((t: number | null, building = false): void => {
    setScrubT(t);
    setScrubBuild(t !== null && building);
  }, []);
  const resetScrub = useCallback((): void => {
    setScrubT(null);
    setScrubBuild(false);
  }, []);
  // Recent turns' finished voice tracks, kept (bounded) so the scrubber works on a chat you've
  // scrolled back to — not just the live head.
  const audioStore = useRef(new TurnAudioStore()).current;
  // Ghost blocks ("it answers while you talk"): tiny speculative glimpses off the partial
  // transcript. Off on the 'fast' quality dial — speculation is a spend the user opted into
  // by choosing a deeper setting. (The hook itself runs below, once the turn it defers to exists.)
  const ghostCfg = useMemo(() => (cfg.quality !== 'fast' ? toModelConfig(cfg) : null), [cfg]);
  // Think-out-loud's "just listening" mode — utterances bank into a ramble instead of
  // answering, until the user says "thoughts?".
  const [justListen, setJustListen] = useState(false);
  const justListenRef = useRef(false);
  justListenRef.current = justListen;
  const rambleRef = useRef<string[]>([]);
  const [rambleCount, setRambleCount] = useState(0);
  const rambleStartRef = useRef(0);
  const listenTitle = listenChipTitle(justListen, rambleCount);
  // "Watch Me Think" mode — the user talks, a mindshape forms live, no prose answer.
  // Utterances bank here (like justListen's ramble) so the canvas sees the full
  // accumulated transcript, not just each individual VAD segment.
  const [watchThinking, setWatchThinking] = useState(false);
  const watchThinkingRef = useRef(false);
  watchThinkingRef.current = watchThinking;
  const mindShapeRambleRef = useRef<string[]>([]);
  const mindShapeCfg = useMemo(() => toModelConfig(cfg), [cfg]);
  // Always hand the hook the model config (it stays idle until onTranscript runs), so the very
  // first thinking-aloud utterance can seed the map immediately instead of a beat late.
  const mindShape = useMindShape(mindShapeCfg);
  // Latest mindShape for the async settle timer below (mindShape is a fresh object each render, so
  // the timer must read it through a ref to see the current phase + a stable onSpeechEnd).
  const mindShapeRef = useRef(mindShape);
  mindShapeRef.current = mindShape;
  // Watch Me Think resolves ("settle") when the user has been quiet a beat longer than a normal
  // between-thoughts pause. This holds that pending timer.
  const settleTimerRef = useRef<number | null>(null);
  // Done thinking can land while the active utterance is still being finalized. The next result
  // is banked first, then this flag settles the complete transcript exactly once.
  const finishWatchPendingRef = useRef(false);
  const voicePhaseRef = useRef<VoicePhase>('idle');
  const settleWatchThinkingNow = useCallback((): void => {
    const ramble = mindShapeRambleRef.current.join(' ').trim();
    if (ramble && mindShapeRef.current.phase === 'listening') {
      mindShapeRef.current.onSpeechEnd(ramble);
    }
  }, []);
  // Whisper mode: quiet hours dim the room and drop the voice to a murmur.
  const whisper = useWhisper();
  // Small screens only: the conversation rail collapses into a bottom sheet; this opens it.
  // On desktop the rail is always visible and the toggle button is hidden by CSS.
  const [chatOpen, setChatOpen] = useState(false);
  // Desktop only: collapse the conversation rail to a slim strip so the canvas gets the room.
  // Persisted so the choice sticks across reloads. Drives --rail-w via the root .rail-collapsed class.
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_COLLAPSED_STORAGE_KEY, String(railCollapsed));
    } catch {
      /* private mode — collapse still works for the session, just won't persist */
    }
  }, [railCollapsed]);
  // Mid-session access to the saved-canvas library (past conversations), opened from the rail footer.
  const [pastOpen, setPastOpen] = useState(false);
  const [memorySaved, setMemorySaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Which tab the settings modal opens on — the palette's "Connect apps" jumps straight to
  // Actions (the tab is otherwise hidden until something is connected).
  const [settingsTab, setSettingsTab] = useState<'model' | 'settings' | 'you'>();
  // Set once by the palette's "Whisper mode" so the You tab lands with More options already
  // open on Quiet hours, instead of one more click to find the setting that was just promised.
  // Cleared whenever settings closes (any path — backdrop click, Escape, the panel's own close)
  // so a later, unrelated visit to Settings doesn't inherit an expansion it didn't ask for.
  const [showAdvancedYou, setShowAdvancedYou] = useState(false);
  useEffect(() => {
    if (!showSettings) setShowAdvancedYou(false);
  }, [showSettings]);
  // The ⌘K command palette — the product's discoverable feature registry, searchable. Open-state +
  // the global ⌘K hotkey come from the shared hook (the same one the landing uses), so the two
  // surfaces can't drift into two hand-rolled copies of the toggle.
  const { open: paletteOpen, openPalette, closePalette } = useCommandPalette();
  // "Prove it" evidence panel: open when the user taps the affordance on a grounded answer.
  const [proofOpen, setProofOpen] = useState(false);
  const [composerFocus, setComposerFocus] = useState(0);
  // Bump to pulse the attach button — used when Prism is invoked with no document attached, to point
  // the user at the paperclip rather than silently doing nothing.
  const [attachPulse, setAttachPulse] = useState(0);
  // Whether a file is currently being dragged over the surface — shows the drop-to-attach hint
  // (the composer's own paperclip is otherwise the only sign Mavéa reads documents at all).
  const [dragActive, setDragActive] = useState(false);
  const [alwaysOn, setAlwaysOn] = useState(() => {
    try {
      return localStorage.getItem(ALWAYS_ON_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  // Session-local pause: the durable Always-on preference stays selected, but the mic hardware is
  // released until the user clicks Resume. This must never be persisted as a mode change.
  const [alwaysPaused, setAlwaysPaused] = useState(false);
  // null when no listening surface currently has always-on borrowed; see enterListening below.
  // Preserve a paused Always-on session too — Watch/Listen may borrow the mic, but must return it
  // to the exact armed/paused state the user left behind.
  const alwaysOnBeforeListenRef = useRef<{ enabled: boolean; paused: boolean } | null>(null);
  // Hold is a distinct input mode: only a held mic button or the configured shortcut opens it.
  const [micHoldPreferred, setMicHoldPreferred] = useState(() => {
    try {
      return localStorage.getItem(MIC_HOLD_PREFERRED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const micMode: MicMode = alwaysOn ? 'always' : micHoldPreferred ? 'hold' : 'tap';

  // Apply any stored Mavéa voice preset (set here or in the Demo's tweaks). Kokoro is the only
  // real voice; when its service isn't reachable, lines are silent (captions still show). The
  // "user"/echo voice has no settings UI to set it anymore, so it stays at its module default
  // (voice/presets.ts) with nothing to re-apply here.
  useEffect(() => {
    try {
      // Apply the stored choice OR the displayed default — so the runtime voice always matches
      // what settings shows as selected, even before the user ever changes it.
      const p = findPreset(localStorage.getItem(VOICE_MAVEA_STORAGE_KEY) || DEFAULT_MAVEA_VOICE_ID);
      if (p) setKokoroVoice('mavea', p.kokoro);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Briefly flag "Memory updated" when Mavéa saves a new fact about you (like other
  // assistants do), so a silent, local write is still visible. Self-cleans its timer.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onMemory = (e: Event): void => {
      // The store broadcasts `{ nodes, changed }`; `changed` is non-empty only on a genuine save
      // (mergeNodes), and empty on edit/delete/forget — so the pill fires exactly when a new fact
      // is stored, never on a removal. (Was reading a non-existent `added` field, so it never fired.)
      const changed = (e as CustomEvent<{ changed?: unknown[] }>).detail?.changed;
      if (Array.isArray(changed) && changed.length > 0) {
        setMemorySaved(true);
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setMemorySaved(false), 2600);
      }
    };
    window.addEventListener(MEMORY_EVENT, onMemory);
    return () => {
      window.removeEventListener(MEMORY_EVENT, onMemory);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  /** Write the durable Tap↔Always-on preference. */
  const persistAlwaysOn = useCallback((enabled: boolean) => {
    try {
      localStorage.setItem(ALWAYS_ON_STORAGE_KEY, String(enabled));
    } catch {
      /* storage unavailable */
    }
  }, []);

  // ---- always-on: persist toggle + auto-restart mic after each turn. ----
  // Never persist the BORROWED value. Watch Me Think and Just listen flip always-on on for the
  // duration of the surface (alwaysOnBeforeListenRef holds what the user actually picked) and put
  // it back on exit — but a reload or a closed tab never reaches that exit, so writing the borrowed
  // `true` left a Tap user hands-free forever, mic opening by itself, having never chosen it.
  // A borrow is runtime state; only the user's own choice is a preference.
  useEffect(() => {
    const borrowed = alwaysOnBeforeListenRef.current;
    persistAlwaysOn(borrowed ? borrowed.enabled : alwaysOn);
  }, [alwaysOn, persistAlwaysOn]);

  useEffect(() => {
    try {
      localStorage.setItem(MIC_HOLD_PREFERRED_STORAGE_KEY, String(micHoldPreferred));
    } catch {
      /* storage unavailable */
    }
  }, [micHoldPreferred]);

  // Holds the live voice controller so `speak` (defined before the controller) can flag it as
  // speaking. Filled in once `voice` exists below; the ref breaks the definition-order cycle.
  const voiceRef = useRef<{
    setMaveaSpeaking: (s: boolean) => void;
    start: (ctx?: { inCanvas: boolean; continuous?: boolean }) => void;
    stop: () => void;
    forceStop: () => void;
  } | null>(null);

  // A ref mirror of `muted` so callers that outlive a render — the spoken tour's setTimeout chain
  // and `speak` itself — read the CURRENT mute state at call time, not the value captured when the
  // walk (or callback) was created. Without this, muting mid-narration was ignored: the closure
  // still held `muted: false` and kept talking. Kept stable (empty deps) so `speak`'s identity
  // never changes — the turn engine and tour effect hold onto it without churning.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // The first line of the current speech burst — the sentence that broke the silence. The
  // pre-walk barrier awaits ITS `started` so the reveal opens exactly when the turn's opener
  // becomes audible; later sentences of the same burst queue behind it and matter only to the
  // per-stop pacing. A stale handle (from a burst that already played out) is harmless: its
  // promises are settled, so any await on it resolves immediately.
  const burstLineRef = useRef<SpokenLine | null>(null);

  // A world the WALKTHROUGH seeded. The overlay renders only off world blocks on the canvas, so a
  // key-free visitor — who has no answer and cannot pay for one — had nothing to be shown. This is
  // the same answer deepzoom and synthesis give (a canned surface), expressed the way this feature
  // works: the shipped illustrative world, mounted as an ordinary block. Loaded lazily so the seed
  // never rides in the Live bundle.
  const [seededWorld, setSeededWorld] = useState<Extract<Block, { type: 'world' }> | null>(null);
  // Whether that seeded world should narrate itself on open — true only for the walkthrough's own
  // world. A world the reader opened is theirs to start. Declared beside the world it belongs to and
  // above the showcase op that sets it, so the binding is never read through a TDZ window.
  const [seededWorldWalks, setSeededWorldWalks] = useState(false);
  // Read-through so the walkthrough's showcase, which is defined above the world state, can ask
  // whether the reader already has a world of their own before seeding one.
  const worldBlocksRef = useRef<ReadonlyArray<Extract<Block, { type: 'world' }>>>([]);
  const enterWorldRef = useRef<(blockId?: string) => void>(() => {});
  const speak = useCallback((text: string): SpokenLine => {
    // Muted still SYNTHESIZES — the output gain is zero (streamTts.setOutputMuted), so nothing
    // is heard, but the scrubber's recorder taps the raw PCM upstream of that gain and keeps a
    // full voice track the user can replay later (or mid-answer, after unmuting in a quieter
    // place). Only the echo gate stays off while silent: there's no audible speech to bleed
    // into the mic, and arming it would swallow the user's own words.
    if (!mutedRef.current) {
      // Tell the always-on mic Mavéa is talking BEFORE audio starts, so its echo gate is armed
      // for the whole utterance — otherwise the first words bleed back as a phantom user turn.
      voiceRef.current?.setMaveaSpeaking(true);
    }
    const startsBurst = !isSpeaking();
    const line = speakLineTwoVoice(text, 'mavea');
    if (startsBurst) burstLineRef.current = line;
    return line;
  }, []);

  // The speaker follows the mute switch instantly (mid-sentence too — the clip keeps playing,
  // silently), and the echo gate hands over cleanly: silent speech can't bleed into the mic, so
  // muting releases the gate; unmuting mid-utterance re-arms it for the now-audible remainder.
  useEffect(() => {
    setOutputMuted(muted);
    if (muted) voiceRef.current?.setMaveaSpeaking(false);
    else if (isSpeaking()) voiceRef.current?.setMaveaSpeaking(true);
  }, [muted]);

  // Session continuity: a reload mid-conversation restores the user INTO the conversation
  // (transcript + latest canvas + model context) instead of dropping them on the wizard.
  // Read once at mount; null (nothing recent / corrupt / stale) falls back to the wizard.
  // A landing hand-off is a fresh ask, so it takes precedence — we DON'T resume the old session
  // (which would drop the user on the previous canvas), we start clean and run their question.
  // A pending course lesson is the same kind of fresh hand-off.
  const [restoredSession] = useState(() => {
    // A landing hand-off/course lesson deliberately bypasses resuming — clear the old session
    // right here rather than just ignoring it, so a still-in-flight decrypt of it (session
    // content is encrypted; see session/store.ts) can never conclude moments later that this
    // abandoned session was "unseen and worth protecting" and fold it back into the fresh
    // conversation's next save. Tour/demo mode also returns null below but must NOT clear
    // anything — they're read-only scripted experiences and never touch the real session either
    // way (saveSession's own effect skips them; see below).
    if (seedQuery.current || courseSeed.current) {
      clearSession();
      return null;
    }
    return tourMode.current || demoPersona.current ? null : loadSession();
  });
  // Whether a real conversation is saved to resume — read once at mount (tour mode never persists,
  // so this survives the tour). The end card uses it to offer "Back to what you were doing" after a
  // solo mini-demo instead of "Start Mavéa".
  const hasStoredSession = useRef(hasSavedSession()).current;

  const turn = useLiveTurn({
    // Belt-and-suspenders behind the route-level LegalGate: even on gate-bypassed mounts
    // (tour, demo persona) a real provider turn requires a recorded acknowledgement.
    canRun: hasLegalAcceptance,
    getConfig: () => toModelConfig(getLiveConfigV2()),
    configReady: secretsReady,
    // Hold the turn's FIRST spoken line until its first card is on screen and done appearing, so
    // Mavéa is never describing an answer the reader cannot see yet. Reads scrollRef at CALL time
    // (it is declared below, and the stage it belongs to only mounts once a turn has a spec).
    // Skipped when nothing will be heard anyway — the same test the pre-walk barrier uses — since a
    // muted or captions-only turn must not wait on audio that will never come.
    canvasReady: () =>
      mutedRef.current || kokoroKnownAvailable() === false
        ? Promise.resolve()
        : awaitFirstPaint(() => scrollRef.current),
    getCaps: () => toCaps(getLiveConfigV2()),
    speak,
    cancelSpeak: cancelSpeech,
    getLibraryEnabled: () => getLiveConfigV2().libraryEnabled,
    initial: restoredSession ? hydrateFromSession(restoredSession) : undefined,
  });

  // Speculation stands down while a real turn is in flight: the user keeps talking over the answer
  // that's already streaming, and guessing at it would bill their key for a preview of what they're
  // about to see anyway.
  const ghosts = useGhosts(listening, heard, ghostCfg, turn.busy);

  // (The walkthrough driver is built further below, after all the real controls it drives —
  //  Focus, Present, Share, the palette, the pen, mute — have been declared.)

  // Hand off from the tour into the REAL surface: reload to a clean #/live (dropping tour mode) so
  // the user's first genuine ask runs for real (or the BYOK setup wizard shows). Replay re-stashes
  // the flag first. A reload is deliberate — it drops the tour's in-memory session cleanly.
  const endTourToApp = useCallback(() => {
    window.location.hash = '#/live';
    window.location.reload();
  }, []);
  const replayTour = useCallback(() => {
    stashTourMode();
    window.location.hash = '#/live';
    window.location.reload();
  }, []);

  // The Blank Space: live mirrors so the voice onResult (a stable closure) routes a spoken reply
  // into the currently-armed hole using current turn state.
  const phaseRef = useRef<TurnPhase>('normal');
  phaseRef.current = turn.phase;
  const activeBlankRef = useRef<string | null>(null);
  activeBlankRef.current = turn.activeBlank;
  const blanksRef = useRef<Blank[]>([]);
  blanksRef.current = turn.spec?.blanks ?? [];

  // Warm the provider + TTS connections on mount so the first turn doesn't pay cold-start
  // latency. Idempotent and throttled inside prewarmLive, so this composes with the home
  // composer's focus-warm (a click-through from the landing collapses to one round-trip).
  useEffect(() => {
    prewarmLive();
  }, []);

  // Persist the conversation after every settled turn so a reload can resume it. Bounded and
  // best-effort inside saveSession; an empty timeline (a reset) clears the stored session too.
  // Never during the walkthrough or a demo replay — their baked frames aren't the user's
  // conversation, and persisting them made "Start Mavéa" resume a phantom session instead of
  // a fresh welcome.
  useEffect(() => {
    if (tourMode.current || demoPersona.current) return;
    if (turn.frames.length > 0) saveSession(turn.history, turn.frames);
  }, [turn.frames, turn.history]);

  // Once a real answer settles, Share is the likely next overlay. This fetches code only and is
  // automatically skipped for Save-Data/2G users by scheduleIdlePreload.
  useEffect(() => {
    if (turn.frames.length === 0 || turn.busy) return;
    return scheduleIdlePreload(shareModalLoad.preload);
  }, [turn.frames.length, turn.busy]);

  // A full walkthrough reaches Prism late enough that its renderer + baked public PDF can arrive
  // quietly beforehand. This is code/data warming only: no provider or model logic runs. Respect
  // Save-Data/2G via the shared idle helper, and avoid paying the bytes for unrelated solo demos.
  useEffect(() => {
    if (!tourMode.current) return;
    const prismSolo = tourSolo.current && tourStartChapter.current === 'prism';
    if (tourSolo.current && !prismSolo) return;
    return scheduleIdlePreload(
      () => Promise.all([tourPrismLoad.preload(), loadTourPrism()]).then(() => undefined),
      prismSolo ? 300 : 2500,
    );
  }, []);

  // Every answer this session, as the export modal's selectable list. Memoized so the modal's
  // build effect doesn't re-fire on unrelated re-renders.
  const exportAnswers = useMemo<ExportAnswer[]>(
    () =>
      turn.frames.map((f, i) => ({
        index: i,
        label: f.question ? sentenceCase(f.question) : `Answer ${i + 1}`,
        spec: f.spec,
      })),
    [turn.frames],
  );

  // Flash a brief "N cards added · Undo · View" pill whenever cards reach the deck — the visible,
  // never-silent counterpart to the old hidden auto-save. Self-clears; its timer is cleaned up below.
  const showCardsPill = useCallback((added: SrsCard[]): void => {
    if (!added.length) return;
    // The very first cards anyone saves are the one moment they've clearly shown they want to
    // remember something — so that, and only that, is when we ask how the pile should behave.
    // Every capture path lands here, the question is asked once in the app's lifetime, and letting
    // it time out settles it as a plain pile, which is the default anyway. Changing your mind
    // later lives on the flashcards page and in Settings.
    if (!getStudyPrefs().styleAsked && getAllCards().length === added.length) {
      setStyleAsk({ count: added.length, deck: added[0].deck });
      if (styleAskTimer.current) clearTimeout(styleAskTimer.current);
      styleAskTimer.current = setTimeout(() => {
        markStyleAsked();
        setStyleAsk(null);
      }, 12000);
      return;
    }
    setCardsPill({ count: added.length, ids: added.map((c) => c.id) });
    if (cardsPillTimer.current) clearTimeout(cardsPillTimer.current);
    cardsPillTimer.current = setTimeout(() => setCardsPill(null), 6000);
  }, []);
  // Answer the one-time question and put it away for good.
  const settleStyleAsk = useCallback((style: StudyStyle | null): void => {
    if (styleAskTimer.current) clearTimeout(styleAskTimer.current);
    if (style) setStudyStyle(style);
    else markStyleAsked();
    setStyleAsk(null);
  }, []);
  useEffect(
    () => () => {
      if (cardsPillTimer.current) clearTimeout(cardsPillTimer.current);
      if (styleAskTimer.current) clearTimeout(styleAskTimer.current);
    },
    [],
  );

  // SRS auto-capture (opt-in, OFF by default): when the user turns it on, harvest flashcard blocks
  // after each turn — but show the same pill so it's never silent. The primary path is the explicit
  // "Cards" button on a block (addToFlashcard below), so by default nothing is saved automatically.
  useEffect(() => {
    if (!cfg.autoSaveFlashcards) return;
    const last = turn.frames[turn.frames.length - 1];
    if (!last) return;
    const cards = extractFlashcards(last.spec.blocks);
    if (cards.length > 0) {
      const added = addCards(cards, {
        deck: last.spec.topic || last.spec.title || 'General',
        origin: 'auto',
      });
      showCardsPill(added);
    }
  }, [turn.frames, cfg.autoSaveFlashcards, showCardsPill]);

  // The "Cards" button on a block: open the suggest-then-edit sheet pre-filled with what we'd
  // suggest. Q/A-style blocks yield real cards instantly; any other block gets a deterministic seed
  // that a configured model refines (grounded in the block's own text). Nothing saves until the user
  // confirms in the sheet — so cards are always real and user-approved.
  const addToFlashcard = useCallback(
    (b: Block): void => {
      const spec = turn.viewSpec ?? turn.spec;
      const deck = spec?.topic || spec?.title || 'General';
      const { cards: initial, exact } = initialCardsForBlock(b);
      const source: SrsSource = {
        ts: Date.now(),
        ...(b.id ? { blockId: b.id } : {}),
        ...(lastAsk ? { question: lastAsk } : {}),
        ...(spec?.topic ? { topic: spec.topic } : {}),
      };
      const mc = toModelConfig(cfg);
      const configured = !!mc.apiKey;
      const enrich = !exact && configured ? () => draftCardsFromBlock(b, mc) : undefined;
      setFlashAdd({ block: b, initial, deck, source, enrich });
    },
    [turn.viewSpec, turn.spec, lastAsk, cfg],
  );

  // The scroll container the spotlight glides within (mirrors the demo's .canvas-scroll).
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // The tour's scripted-highlighter action, assigned once `userInk` exists below; the tour ops
  // (created earlier in render) call through this ref so they don't reference it before declaration.
  const scriptedMarkRef = useRef<() => void>(() => {});
  // The tour's scripted bend: glide the answer's bend-it slider toward a higher value in small
  // steps, dispatching real input events so React recomputes every derived number live — the
  // exact gesture a person makes, minus the hand. Controlled input, so the native value setter.
  // The frame timers are tracked so a re-run replaces the previous gesture instead of two
  // interleaving, and unmount cancels the tail outright.
  const bendTimersRef = useRef<number[]>([]);
  const scriptedBendRef = useRef<() => void>(() => {});
  // The tour's "master a subject" action, assigned once the course state + openCourseLesson exist
  // below; the tour ops (created earlier in render) call through this ref to avoid the forward ref.
  const openTourCourseRef = useRef<() => void>(() => {});
  scriptedBendRef.current = () => {
    const el = document.querySelector<HTMLInputElement>('.bend-slider');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!set) return;
    bendTimersRef.current.forEach((id) => window.clearTimeout(id));
    bendTimersRef.current.length = 0; // mutate in place — the unmount cleanup holds this array
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const step = Number(el.step || 1) || 1;
    const from = Number(el.value);
    const to = Math.min(max, min + (max - min) * 0.78);
    const frames = 26;
    for (let i = 1; i <= frames; i++) {
      bendTimersRef.current.push(
        window.setTimeout(
          () => {
            const raw = from + ((to - from) * i) / frames;
            const snapped = Math.round(raw / step) * step;
            set.call(el, String(snapped));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          },
          500 + i * 90,
        ),
      );
    }
  };
  useEffect(() => {
    const timers = bendTimersRef.current;
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);
  // Clears any pinned highlighter marks — assigned once `userInk` exists below; called on every
  // chapter change so a mark from the pen chapter never lingers as a stale "Pen on" annotation.
  const clearInkRef = useRef<() => void>(() => {});
  // Root app div — used to set --scroll-dock for the orb docking animation.
  const appRef = useRef<HTMLDivElement>(null);
  // The resting face docks onto the brand: we measure the brand-dot slot + the presence layer to
  // express that dock as a transform (--home-x/--home-y/--home-scale), so it stays correct as the
  // layout changes and across viewport widths.
  const brandDotRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  // The positioner around the face is where `--voice-energy` is written each frame: the property
  // inherits down to the mouth, so the write never has to invalidate the whole document's style.
  const voiceSinkRef = useVoiceEnergySink();
  // Lets a user cut the guided spotlight short (click the dimmed area or press Esc): the
  // tour loop checks this flag each beat, so dismissing stops the walk AND clears the spot
  // instead of the next scheduled beat re-lighting a block. Reset at the start of each turn.
  const tourDismissed = useRef(false);
  /** True when the walk stopped because the reader picked an object, not because it was dismissed
   *  — see takeWheel and bail(). One-shot: the teardown that honours it clears it. */
  const readerTookOver = useRef(false);
  // The turn whose reveal tour has already played, so the walk runs exactly once per turn even
  // if the effect re-fires for the SAME turn. In dev a hot-module reload (Fast Refresh) re-runs
  // effects against the canvas already on screen — without this guard the spotlight walk replays
  // itself, and silently, because the audio modules reload too and tear down their playback. A
  // production remount would do the same. Genuine new turns bump `turn.turn`, so they still tour.
  const touredTurn = useRef<number | null>(null);
  // True while the reveal walk is stepping blocks — the first-run walkthrough reads it (via its
  // isBusy op) so a chapter never auto-advances mid-walk and chops the narration.
  const walkActive = useRef(false);
  // Set by a running voiced walk to its own early-exit; a mute mid-walk calls it (see the
  // [muted] effect below) so the remaining stops' pen marks land at once instead of the walk
  // outrunning the reader. Null outside a walk — there's nothing to flush.
  const flushWalkRef = useRef<(() => void) | null>(null);
  // Latched ONCE per turn at walk start (never mid-turn, so a mute toggle can't reflow it):
  // `noteGutterTurn` reserves the margin-note gutters only for turns that ARRIVED muted with a
  // spoken tour. This is the muted reading aid now that the voice caption is hidden when muted.
  const [noteGutterTurn, setNoteGutterTurn] = useState(false);
  // True while the pre-walk barrier has been holding longer than the anti-flash delay — the
  // voice strip owes the user an honest "Preparing…" pill for that window (a cold Kokoro or a
  // slow chunk load would otherwise read as a dead canvas right before the walk "randomly"
  // starts). Cleared the moment the walk begins, ends, or is flushed.
  const [walkPreparing, setWalkPreparing] = useState(false);

  // The model's own per-block tour lines, keyed by block id — real narration it already wrote for
  // the lead cards, free to reuse. We key the VOICE-ready twin (saySpoken, from inline [[shown|said]]
  // annotations) so a spoken stop says "$5,000" as "five thousand dollars"; falls back to the shown
  // line. Used both when a tapped card speaks and when the reveal walk voices a stop.
  const tourSpokenById = useMemo(() => {
    const m = new Map<string, string>();
    const blocks = turn.spec?.blocks ?? [];
    for (const t of turn.tour) {
      const id = blocks[t.index]?.id;
      const line = t.saySpoken ?? t.say;
      if (id && line) m.set(id, line);
    }
    return m;
  }, [turn.tour, turn.spec]);
  // The model's drawn-gesture requests, keyed the same way — each stop may name the exact
  // on-block text Mavéa should circle/underline/arrow while speaking that stop's line.
  const tourMarkById = useMemo(() => {
    const m = new Map<string, TourMark>();
    const blocks = turn.spec?.blocks ?? [];
    for (const t of turn.tour) {
      const id = blocks[t.index]?.id;
      if (id && t.mark) m.set(id, t.mark);
    }
    return m;
  }, [turn.tour, turn.spec]);
  // All of a stop's gestures (a block may carry several — circle one figure, underline another),
  // so the walkthrough can draw each as it explains that block. Falls back to the single `mark`.
  const tourMarksById = useMemo(() => {
    const m = new Map<string, TourMark[]>();
    const blocks = turn.spec?.blocks ?? [];
    for (const t of turn.tour) {
      const id = blocks[t.index]?.id;
      const marks = t.marks ?? (t.mark ? [t.mark] : []);
      if (id && marks.length) m.set(id, marks);
    }
    return m;
  }, [turn.tour, turn.spec]);

  // Focus mode: tapping a filmstrip card has Mavéa talk about it. The hook makes the tap respond
  // instantly (quiet the running tour, move the real spotlight) but debounces the spoken line, so a
  // rapid scrub speaks once — about the card you land on — instead of stammering. Tapping the card
  // Mavéa is on hushes it. `speak` respects mute and arms the mic echo gate.
  // Cards Mavéa has gestured at this turn — the annotation layer draws (and keeps) a stroke
  // on each, so an annotated block stays a shareable artifact until the next answer. The
  // spoken line rides along so the stroke can land on the exact words the voice said.
  // `inkedAt` records when each gesture fired so the GestureTrack panel can show elapsed times.
  const [inked, setInked] = useState<
    (GestureEntry & {
      mark?: TourMark;
      generous?: boolean;
      delayMs?: number;
      badgeMs?: number;
      noteText?: string;
      studySeed?: boolean;
    })[]
  >([]);
  // Which of those gestures actually LANDED. The track is a record of what Mavéa drew, so a
  // request whose target never resolved (a conceptual line naming nothing on the card) must not be
  // advertised as a mark the reader can go look at. Keyed by request identity — `inked` entries are
  // appended once and never rebuilt, and the whole set is dropped with them each turn.
  const [drawnInk, setDrawnInk] = useState<ReadonlySet<object>>(() => new Set());
  const notePlaced = useCallback((request: object) => {
    setDrawnInk((cur) => (cur.has(request) ? cur : new Set(cur).add(request)));
  }, []);
  // A margin note is written into the rail rather than placed on a card, so it reports no landing
  // and is always its own proof — it shows in the track as soon as it exists.
  const drawnEntries = useMemo(
    () => inked.filter((e) => e.noteText !== undefined || drawnInk.has(e)),
    [inked, drawnInk],
  );
  // The reference epoch for elapsed-time display in the gesture track (reset each turn).
  const turnStartMsRef = useRef<number>(Date.now());
  useEffect(() => {
    setInked([]);
    setDrawnInk(new Set());
    turnStartMsRef.current = Date.now();
  }, [turn.turn]);
  // Whether the pen popover is open. It opens only when the user clicks the pill — never on its
  // own as Mavéa draws, so the panel can't keep popping over the canvas every time you ask. A small
  // count badge on the pill is the unobtrusive cue that ink was logged while the panel stays shut.
  const [trackVisible, setTrackVisible] = useState(false);
  useEffect(() => setTrackVisible(false), [turn.turn]);
  // Which spots have their annotation hidden by the user (eye toggle in the gesture track).
  const [hiddenSpots, setHiddenSpots] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => setHiddenSpots(new Set()), [turn.turn]);
  // The Retry card mounts at the TOP of the canvas. On a tall answer the user is usually scrolled
  // well past it, so a failed follow-up would land off-screen and read as "nothing happened".
  // Bring the top back into view on the null → error transition ONLY (the ref), so ordinary
  // re-renders can't keep yanking the scroll position while the card is up.
  const hadErrorRef = useRef(false);
  useEffect(() => {
    const failed = !!turn.error;
    if (failed && !hadErrorRef.current) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    hadErrorRef.current = failed;
  }, [turn.error]);
  // Whether the Everything grid has room for the margin-note gutter. Below the threshold the
  // cards would drop to a cramped column budget just to host notes, so the gutter stays off and
  // the words keep flowing through the reading ribbon + the pen pill's log (and, in Focus, the
  // trail column). Observes the canvas scroll container — the same box the grid tiles against.
  const [noteRailFits, setNoteRailFits] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = (): void => setNoteRailFits(el.clientWidth >= 1280);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
    // Re-arm when a turn lands: the scroll container mounts with the first answer, so the
    // mount-time run can find nothing to observe yet.
  }, [turn.turn]);
  // The written asides of this turn's muted walk, in walk order — the gutter rail renders them
  // beside their cards in Everything, the Focus stage as its trail column. Honors the same
  // eye-toggle as the strokes.
  const walkNotes = useMemo(
    () =>
      inked
        .filter((e) => e.noteText && !hiddenSpots.has(e.spot))
        .map((e) => ({ spot: e.spot, text: e.noteText! })),
    [inked, hiddenSpots],
  );
  // Bookmarks: persisted set of frame.at timestamps the user starred in the session rail.
  const { bookmarks, toggleBookmark } = useBookmarks();
  // Ref for click-outside-to-close on the popover anchor.
  const penAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!trackVisible) return;
    function onOutside(e: MouseEvent) {
      if (penAnchorRef.current && !penAnchorRef.current.contains(e.target as Node)) {
        setTrackVisible(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [trackVisible]);
  // Ref so ink() can resolve a block label even when no caption/line was passed (e.g. stop 0
  // on a derived walk whose opener is the full narration, not the block title).
  const specRef = useRef(turn.spec);
  specRef.current = turn.spec;
  const ink = useCallback(
    (
      spot: string | null | undefined,
      line?: string,
      mark?: TourMark,
      generous?: boolean,
      delayMs?: number,
      badgeMs?: number,
      stepNumber?: number,
      noteText?: string,
      studySeed?: boolean,
    ) => {
      if (spot) {
        setInked((cur) => {
          // Dedupe per (block, gesture) — NOT per block — so one block can carry several distinct
          // strokes (a circle on one figure, an underline on another), but never the same twice.
          // A margin note dedupes on its own axis (one note per block): it carries no mark, so
          // without the split it would collide with a teach-mode generous entry (also mark-less)
          // and whichever landed second would silently vanish.
          const dup = noteText
            ? cur.some((e) => e.spot === spot && e.noteText !== undefined)
            : cur.some(
                (e) =>
                  e.spot === spot &&
                  e.kind === mark?.kind &&
                  e.at === mark?.at &&
                  e.noteText === undefined,
              );
          if (dup) return cur;
          // Fall back to the block's own label when no spoken line or named target is available,
          // so the gesture track always shows something human-readable instead of a raw block id.
          const fallback =
            !line && !mark?.at
              ? (specRef.current?.blocks.find((b) => b.id === spot) ?? null)
              : null;
          // "connect" is the one gesture that draws on a DIFFERENT block — resolve its onIndex
          // (already remapped against the current canvas, same numbering as the stop's own
          // index) to that block's real id, exactly how `spot` itself is resolved for a stop.
          const toSpot =
            mark?.kind === 'connect' && typeof mark.onIndex === 'number'
              ? specRef.current?.blocks[mark.onIndex]?.id
              : undefined;
          const entry: GestureEntry & {
            mark?: TourMark;
            generous?: boolean;
            delayMs?: number;
            badgeMs?: number;
            stepNumber?: number;
            toSpot?: string;
            noteText?: string;
            studySeed?: boolean;
          } = {
            spot,
            line: line ?? (fallback ? blockLabel(fallback) : undefined),
            mark,
            generous,
            // A margin note logs as the ✎ kind so the GestureTrack reads "notes: <words>".
            kind: mark?.kind ?? (noteText ? 'note' : undefined),
            at: mark?.at,
            ...(mark?.kind === 'connect' && mark.to ? { to: mark.to } : {}),
            color: mark?.color,
            inkedAt: Date.now(),
            ...(delayMs ? { delayMs } : {}),
            ...(badgeMs ? { badgeMs } : {}),
            ...(stepNumber ? { stepNumber } : {}),
            ...(toSpot ? { toSpot } : {}),
            ...(noteText ? { noteText } : {}),
            ...(studySeed ? { studySeed } : {}),
          };
          return [...cur, entry];
        });
      }
    },
    [],
  );
  // Teach mode widens the pen to every spoken stop — from the setting, or just by asking
  // ("teach me…", "walk me through…").
  const teachTurn = cfg.teachMode || isTeachAsk(lastAsk);
  // The Study is a teaching surface by construction — it exists to hold one object up and talk
  // about it — so it points generously without waiting for the reader to say "walk me through".
  // Generosity costs no model call: with no model-authored mark for a stop, `revealInkPlan`
  // falls through to the component's OWN stamped salient node (BarChart's tallest bar,
  // BreakdownCard's largest row, Donut's biggest slice), which is already there in the DOM.
  const teachSurface = teachTurn || savedViewMode() === 'study';
  // A ref so the tour loop (which runs once per turn) always reads the live toggle value.
  const annotationsEnabledRef = useRef(cfg.annotationsEnabled);
  annotationsEnabledRef.current = cfg.annotationsEnabled;

  // Refs for the barge-in handler (read inside the onResult closure, so must be refs).
  const alwaysOnRef = useRef(alwaysOn);
  alwaysOnRef.current = alwaysOn;
  // Holds the current narration so we can re-speak it if the user says "keep going".
  const narrationRef = useRef<string | null>(null);
  narrationRef.current = turn.narration ?? null;
  // Set true by onBargeIn (VAD detected speech mid-playback) so onResult knows to apply
  // the continue-vs-real-question logic even though isSpeaking() is already false by then.
  const bargedInRef = useRef(false);
  // Whether a turn is still generating, readable inside the onResult closure. A spoken question
  // that lands while Mavéa is busy but SILENT (thinking, or a muted answer) is never flagged as a
  // barge-in, so without this it reached submit() unforced and turn.run's busy guard dropped it —
  // the mic stayed open, the transcript showed, and nothing happened.
  const busyRef = useRef(false);
  busyRef.current = turn.busy;

  // A pen chapter of the walkthrough / demo replay flips the user's REAL annotation settings so
  // Mavéa can draw on the canvas. This holds what they were before the first override, so the run
  // can hand them back — a scripted run must never permanently change a preference the user owns.
  // Cleared on restore, and by a manual toggle (the user has taken ownership; see togglePen).
  const penConfigRestoreRef = useRef<Pick<LiveConfigV2, 'annotationsEnabled' | 'teachMode'> | null>(
    null,
  );

  // The pen toggle (header pill + gesture track share it). Off clears strokes; back ON
  // restores exactly what was there — the full snapshot, not a partial replay.
  const turnFramesRef = useRef(turn.frames);
  turnFramesRef.current = turn.frames;
  const inkSnapshotRef = useRef<typeof inked>([]);
  const togglePen = useCallback(() => {
    const next = !annotationsEnabledRef.current;
    // The user just chose for themselves — drop any tour snapshot so the end of the run can't
    // undo their choice.
    penConfigRestoreRef.current = null;
    setLiveConfigV2({ annotationsEnabled: next, teachMode: next });
    if (!next) {
      // Turning off: save the full ink state then clear.
      setInked((cur) => {
        inkSnapshotRef.current = cur;
        return [];
      });
    } else {
      // Turning on: restore every stroke that was visible before the pen was switched off.
      setInked(inkSnapshotRef.current);
      inkSnapshotRef.current = [];
    }
  }, []);

  // Jump to a card by spot id and briefly flash its container. The glow-removal timer is held in
  // a ref (not returned for the caller to discard): a rapid second jump clears the first so timers
  // can't pile up, and the unmount effect below clears any pending one so it never fires on a
  // detached element.
  const jumpGlowTimerRef = useRef<number | null>(null);
  const jumpToSpot = useCallback((spot: string, toSpot?: string) => {
    const root = stageRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-spot-id="${CSS.escape(spot)}"]`);
    if (!el) return;
    if (el.closest('.study-stage')) {
      // On the desk, "jump to" means "bring it to the desk" — the stage holds still.
      el.classList.add('ink-jump-glow');
      window.setTimeout(() => el.classList.remove('ink-jump-glow'), 800);
      return;
    }
    const toEl = toSpot
      ? root?.querySelector<HTMLElement>(`[data-spot-id="${CSS.escape(toSpot)}"]`)
      : null;
    const cont = scrollRef.current;
    if (toEl && cont) {
      // A "connect" entry names TWO cards — frame both, not just the near one.
      const cRect = cont.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      const spanTop = Math.min(eRect.top, toRect.top);
      const spanBottom = Math.max(eRect.top + eRect.height, toRect.top + toRect.height);
      const delta = (spanTop + spanBottom) / 2 - cRect.top - cont.clientHeight / 2;
      cont.scrollTo({ top: Math.max(0, cont.scrollTop + delta), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const glowing = [el, toEl].filter((n): n is HTMLElement => !!n);
    glowing.forEach((n) => n.classList.add('ink-jump-glow'));
    if (jumpGlowTimerRef.current != null) window.clearTimeout(jumpGlowTimerRef.current);
    jumpGlowTimerRef.current = window.setTimeout(() => {
      glowing.forEach((n) => n.classList.remove('ink-jump-glow'));
      jumpGlowTimerRef.current = null;
    }, 800);
  }, []);
  useEffect(
    () => () => {
      if (jumpGlowTimerRef.current != null) window.clearTimeout(jumpGlowTimerRef.current);
    },
    [],
  );

  // The Overview's jump: switch the canvas to a frame and — when an element was named — scroll to
  // that exact block and flash it. `jumpTo` swaps the frame, so the target card isn't in the DOM
  // this tick; defer the spotlight to the next frame, by which point the new canvas has committed.
  // The rAF is held in a ref and cancelled on unmount so it can never fire on a detached element.
  const overviewJumpRafRef = useRef<number | null>(null);
  const jumpToFrameSpot = useCallback(
    (index: number, spotId?: string) => {
      turn.jumpTo(index);
      if (!spotId) return;
      if (overviewJumpRafRef.current != null) cancelAnimationFrame(overviewJumpRafRef.current);
      overviewJumpRafRef.current = requestAnimationFrame(() => {
        overviewJumpRafRef.current = null;
        jumpToSpot(spotId);
      });
    },
    [turn, jumpToSpot],
  );
  useEffect(
    () => () => {
      if (overviewJumpRafRef.current != null) cancelAnimationFrame(overviewJumpRafRef.current);
    },
    [],
  );

  // Toggle visibility of one annotation spot without clearing it.
  const toggleSpot = useCallback((spot: string) => {
    setHiddenSpots((prev) => {
      const next = new Set(prev);
      if (next.has(spot)) next.delete(spot);
      else next.add(spot);
      return next;
    });
  }, []);

  const [viewMode, setViewMode] = useViewMode();

  // What the pen may draw right now. The Study has no margin rail — the walk's written asides
  // land in its session-notes crib instead — so their requests never reach MarginNoteRail while
  // the Study is the view; the strokes themselves draw exactly as everywhere else.
  const inkSpots = useMemo(() => {
    const visible = hiddenSpots.size > 0 ? inked.filter((s) => !hiddenSpots.has(s.spot)) : inked;
    // The Study has no margin rail (its written asides live in the session-notes crib), and its
    // opening seed cascade is desk theater — on the grid those same generous marks would land as
    // a wall of unexplained ink the reader never asked for.
    return viewMode === 'study'
      ? visible.filter((s) => s.noteText === undefined)
      : visible.filter((s) => !s.studySeed);
  }, [inked, hiddenSpots, viewMode]);

  // What Mavéa writes beside the object the study is holding up.
  //
  // Her read, not the card's: `asideFor` reports which of the block's figures a source sentence
  // actually states and which are the model's shape — the one thing she knows that a card cannot
  // say about itself. Grounded against the turn's OWN sources, so nothing is fetched and no model
  // is called; an answer with no sources honestly yields "I'm illustrating, not measuring".
  //
  // Falls back to the block's own words when it carries no readable figures (prose, a list, a
  // diagram): silence there would be right, but the block's summary is better than nothing and is
  // what the study showed before.
  const studyContent = useMemo(() => {
    const spec = turn.viewSpec ?? turn.spec;
    if (viewMode !== 'study' || !spec) return null;
    const corpus = (spec.sources ?? [])
      .map((src) => src.snippet ?? '')
      .filter(Boolean)
      .join('\n');
    // Nothing to ground against: the trust voice would stamp every figure-bearing card with
    // the same wholesale disclaimer, which says nothing the reader can use. The observation
    // and prompt voices carry the desk instead.
    if (!corpus) return null;
    return answerToContent(spec, corpus);
  }, [viewMode, turn.viewSpec, turn.spec]);

  // One note per object, written once for the answer. Ordered by how much each actually POINTS:
  //   1. What the block's own structure says but never spells out — which option took the most
  //      rows, how far the series really moved. Specific, checkable, and not a paraphrase.
  //   2. What Mavéa can and cannot back. Only speaks on an answer carrying figures.
  //   3. A Study-only pressure-test prompt. It asks the reader to use the nearby objects rather
  //      than recycling the spoken tour or the card's own note.
  // Keyed by block id and stable for the turn, so the study re-casting changes only which note is
  // emphasised — never the set, which is what made the old rail tear down on every move.
  const studyAsides = useMemo(() => {
    // The spec the canvas is SHOWING — block ids repeat across turns, so notes derived from
    // the live spec would file the current answer's remarks onto a scrubbed older frame.
    const spec = turn.viewSpec ?? turn.spec;
    if (viewMode !== 'study' || !spec) return undefined;
    // EVERY honest voice becomes a page on the note card, the way the design pages four notes
    // per object: the structural observation, the trust read, the pressure-test, and the
    // block's own line as the decision cue. The pen's margin quip rides the first note —
    // condensed observation when there is one, the question's core otherwise.
    const out: Record<string, StudyAside[]> = {};
    spec.blocks.forEach((block, index) => {
      if (!block.id) return;
      const notable = notableIn(block);
      const honest = studyContent ? asideFor(studyContent, index) : null;
      // FOUR voices, always, in the design's own order — △ assumption · ◈ pattern · ✓ evidence
      // · ? pressure-test — so the note card's chips are a fixed set the reader learns rather
      // than a count that changes per card. Each is READ from the object (or from the turn's
      // sources), never invented; where a voice has nothing to point at it says so plainly,
      // which is itself the honest answer — "no sources are attached" is a real evidence check.
      const notes: StudyAside[] = [
        { text: assumptionIn(block).text, kind: 'caution' },
        {
          text:
            notable?.text ??
            'Nothing in this object states a relationship on its own — the nearby ones carry it.',
          kind: 'insight',
        },
        honest
          ? { text: honest.text, kind: honest.flagged ? 'caution' : 'evidence' }
          : {
              text: 'No sources are attached to this answer, so nothing here is checked against one yet.',
              kind: 'evidence',
            },
        { text: studyPromptIn(block).text, kind: 'question' },
      ];
      // The margin quip is the block's OWN scrawl, read from its structure (penMarks) — never a
      // stock line: the same words beside every object are wallpaper, not a remark. The block's
      // index seeds the phrasing so three lists in one answer do not repeat themselves.
      const marks = penMarks(block, index);
      if (marks.length) notes[0] = { ...notes[0], marks };
      out[block.id] = notes;
    });
    return out;
  }, [studyContent, turn.viewSpec, turn.spec, viewMode]);

  // Mute is an AUDIO control, not a layout one: it never switches the view. The user reads muted in
  // whichever mode they chose — Everything keeps the whole living canvas (the point of the app), and
  // Focus is theirs to pick. What mute changes is the FEEL (calm face, a centred reading caption),
  // not the layout. See the muted centred caption + the calm-face mapping below.
  // A monotonically increasing generation for the annotation layer: bumped once per ACTUAL
  // viewMode transition (everything ↔ focus ↔ canvas), so a stale portal host gets re-located
  // exactly when the layout really swapped — never as a side effect of some unrelated re-render
  // landing on the same on/off value twice in a row. Set during render (the officially-sanctioned
  // "adjust state from a prop/state change" pattern) so it's ready on the very render that changed.
  // ── The study opens already marked up ────────────────────────────────────────────────────────
  // Everywhere else the pen is a WALK artefact: marks land as the voice reaches each stop, so an
  // answer you scroll back to — or a study you switch into after the walk finished — is a clean,
  // silent page. That is right for a canvas you are reading and wrong for the study, whose whole
  // premise is that Mavea has been working through this with you. A teacher's board still has the
  // working on it when you look up.
  //
  // Deterministic and free: no mark is invented here. `generous` resolves each block against the
  // component's OWN stamped salient node (BarChart's tallest bar, BreakdownCard's largest row,
  // Donut's biggest slice), and the aside is condensed from text the block already carries. A
  // block that stamps nothing simply gets no ink — the hand only points at things really there.
  // Zero model calls, which is the rule on a BYOK turn path.
  //
  // Marks only — no margin notes. The study's aside is a LIVE slot that follows the foreground
  // (see `studyAside` below), not a rail entry: routed through MarginNoteRail it re-measured and
  // re-tethered on every re-cast, so the note visibly tore down and rebuilt each time the study
  // moved. `ink()` dedupes per (block, gesture), so re-entry cannot stack duplicates.
  const studyInkedFor = useRef<string | null>(null);
  useEffect(() => {
    const spec = turn.spec;
    if (viewMode !== 'study' || !spec || !annotationsEnabledRef.current) return;
    // Once per answer. Re-entering the study on the SAME answer must not re-run the cascade.
    if (studyInkedFor.current === spec.id) return;
    studyInkedFor.current = spec.id;
    let step = 0;
    for (const b of spec.blocks) {
      if (!b.id) continue;
      ink(
        b.id,
        b.note ?? undefined,
        undefined,
        true,
        step * STUDY_INK_STEP_MS,
        undefined,
        undefined,
        undefined,
        true,
      );
      step++;
    }
  }, [viewMode, turn.spec, ink]);

  const [canvasRevision, setCanvasRevision] = useState(0);
  const prevViewModeRef = useRef(viewMode);
  if (prevViewModeRef.current !== viewMode) {
    prevViewModeRef.current = viewMode;
    setCanvasRevision((g) => g + 1);
  }
  // The Study re-stamps data-spot-id as the desk re-casts (front card only), so every
  // promotion is a host CHANGE the portals cannot see on their own — same render-phase
  // pattern as the view-mode bump above.
  const prevStudySpotRef = useRef<string | null>(null);
  const studySpotNow = viewMode === 'study' ? (turn.spot ?? null) : null;
  if (prevStudySpotRef.current !== studySpotNow) {
    prevStudySpotRef.current = studySpotNow;
    if (viewMode === 'study') setCanvasRevision((g) => g + 1);
  }

  const restorePenConfig = useCallback(() => {
    const snapshot = penConfigRestoreRef.current;
    if (!snapshot) return;
    penConfigRestoreRef.current = null;
    annotationsEnabledRef.current = snapshot.annotationsEnabled;
    setLiveConfigV2(snapshot);
  }, []);
  /** Switch Mavéa's own annotation layer on for a pen chapter, remembering what it displaced. */
  const enablePenForRun = useCallback(() => {
    if (annotationsEnabledRef.current) return;
    const { annotationsEnabled, teachMode } = getLiveConfigV2();
    penConfigRestoreRef.current ??= { annotationsEnabled, teachMode };
    annotationsEnabledRef.current = true;
    setLiveConfigV2({ annotationsEnabled: true, teachMode: true });
  }, []);

  // Everything a scripted driver needs to drive THIS real surface — the closures behind the
  // first-run walkthrough AND the demo replay (only one is ever active per boot). Declared
  // here, below every setter it exposes, so a driver can fire Focus / Present / Share / the
  // palette / the pen / mute / voice for real.
  const liveOps: TourOps = {
    isBusy: () => turn.busy || walkActive.current,
    isSpeaking: () => isSpeaking(),
    hasCanvas: () => !!turn.spec,
    showFrame: (frame, question, opts) => {
      setLastAsk(question);
      setValue('');
      // Never interrupt: a chapter's coach line finishes, THEN the frame's narration follows.
      // Muted reveals the canvas immediately — there is no voice for the reveal beat to track.
      turn.showFrame(frame, question, {
        interrupt: false,
        revealNow: mutedRef.current,
        silent: opts?.silent,
      });
    },
    typeInto: setValue,
    // A chapter's coach line bypasses the per-turn narration walk (it isn't a new turn), so
    // without this the speak dock keeps showing whatever line the LAST answer walk left behind
    // while the coach's own audio plays over it — caption and voice visibly out of sync.
    speak: (text) => {
      setSpokenNow(text);
      return speak(text);
    },
    cancelSpeech,
    setMuted,
    setViewMode,
    setInkArmed,
    setPresenting,
    setShareOpen,
    // The driver toggles the palette (its ⌘K chapter); compose the boolean setter from the hook.
    setPaletteOpen: (on: boolean) => (on ? openPalette() : closePalette()),
    // Press the named Keep-going chip for real (the .kg-tour-press class plays the tap), so the
    // baked follow-up that lands right after reads as the chip running — not a scene change.
    pressKeepGoing: (label) => {
      const rows = document.querySelectorAll<HTMLButtonElement>('.footer-keepgoing .kg-row');
      const btn = Array.from(rows).find((r) => r.textContent?.includes(label)) ?? rows[0];
      if (!btn) return;
      btn.classList.add('kg-tour-press');
      window.setTimeout(() => btn.classList.remove('kg-tour-press'), 620);
    },
    pinFirstBlock: () => {
      // Timed tour actions can run after showFrame has replaced the canvas. Read the live ref,
      // not the render-time closure captured when the chapter began, so Ask always selects the
      // cards the visitor can currently see.
      const b = specRef.current?.blocks.find((x) => !!x.id);
      if (b) togglePin(b);
    },
    pinFirstBlocks: (count) => {
      const blocks = (specRef.current?.blocks ?? []).filter((b) => !!b.id).slice(0, count);
      setPinned(blocks);
    },
    startWatchThinking: () => {
      setWatchThinking(true);
      watchThinkingRef.current = true; // apply now so the first banked thought seeds the map
    },
    // The same path the composer's Watch-Me-Think branch takes on submit: append the completed
    // thought and re-feed the whole ramble, so the map merges rather than restarts.
    bankThought: (text) => {
      mindShapeRambleRef.current = [...mindShapeRambleRef.current, text];
      mindShape.onTranscript(mindShapeRambleRef.current.join(' '));
    },
    openAtlas: () => {
      // Seed a few explored topics into the Library (which feeds the Atlas) so the map shows real
      // neighborhoods — but only if it's sparse, so a returning user's real Atlas isn't stuffed.
      if (getAtlas().length < 3) {
        for (const id of ['money', 'space', 'travel', 'budget']) {
          const convo = tourConversation(id);
          const spec = convo?.frames[0]?.spec;
          if (convo && spec) saveCanvas(spec, convo.question);
        }
        setAtlasCount(syncFromLibrary(getLibrary()));
      }
      setAtlasOpen(true);
    },
    // The fixture carries whole documents (bytes for the real page renders), so it loads lazily
    // on first open; a stale resolve after the chapter moved on must not reopen the overlay.
    openPrism: (index) => {
      void loadTourPrism().then((docs) => {
        if (tourDriveRef.current.chapter?.action.kind === 'prism') {
          setTourPrismDoc(docs[index] ?? null);
        }
      });
    },
    // Generic feature showcase: seed where a feature would otherwise open empty, then run the
    // feature's OWN action (reused via a ref, since featureActions is built further below) so the
    // walkthrough opens exactly what the palette/menu would — no duplicated open logic.
    showcaseFeature: (featureId) => {
      // Library / Past conversations is an empty shelf until you've saved canvases — seed a few
      // (the same way Atlas does) so the walkthrough shows a real, populated surface.
      if (featureId === 'library' && getLibrary().length < 3) {
        for (const id of ['money', 'space', 'travel']) {
          const convo = tourConversation(id);
          const spec = convo?.frames[0]?.spec;
          if (convo && spec) saveCanvas(spec, convo.question);
        }
      }
      // Deep Zoom + Synthesis generate from a model — route their demos to the key-free canned
      // surfaces (?demo=1) instead, so the walkthrough never needs a connected model.
      if (featureId === 'deepzoom') {
        window.location.hash = '#/deepzoom?demo=1';
        return;
      }
      if (featureId === 'synthesis') {
        window.location.hash = '#/synthesis?demo=1';
        return;
      }
      // The living world is built by a model call, so a key-free walkthrough has nothing to open.
      // Seed the shipped illustrative world instead — imported here rather than at module scope so
      // the fixture stays out of the Live bundle.
      if (featureId === 'living-answer' && worldBlocksRef.current.length === 0) {
        void import('./world/seed').then(({ WORLD_SEED }) => {
          setSeededWorld({
            type: 'world',
            id: 'tour-world',
            col: 12,
            props: { title: WORLD_SEED.title, world: WORLD_SEED },
          });
          // The chapter is called "Walk the why" and its line says it takes the reader cause by
          // cause. Opening the surface and stopping made that line describe something the reader had
          // to do themselves, which on a hands-off replay nothing ever does — so the walk starts
          // itself here. Their first press takes it back; it is the transport's own control.
          setSeededWorldWalks(true);
          enterWorldRef.current('tour-world');
        });
        return;
      }
      featureActionsRef.current[featureId]?.run();
    },
    setSpot: (id) => turn.setSpot(id),
    scriptedMark: () => scriptedMarkRef.current(),
    drawPenTourStep: (step) => {
      // The tour demonstrates Mavéa's own orange annotation layer. Keep this separate from the
      // user's Highlight tool, which creates a question target instead of explaining the answer.
      enablePenForRun();
      if (step === 'result') {
        // Keep the answer header in view while the strokes land below it. Centering the card with
        // turn.setSpot would scroll the sticky Pen underneath the app bar, where its tour ring can
        // look as though it belongs to the neighboring Share control.
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        ink(
          'live-1',
          'After thirty years, the investment reaches seventy-six thousand one hundred twenty-three dollars.',
          { kind: 'circle', at: '$76,123', color: 'key' },
          false,
          undefined,
          5600,
          1,
        );
      } else {
        ink(
          'live-1',
          'Compounding grows the original investment by more than seven point six times.',
          { kind: 'underline', at: '7.6x', color: 'warm' },
          false,
          undefined,
          3000,
          2,
        );
      }
    },
    drawPenOnFirstBlock: () => {
      const block = turn.spec?.blocks.find((b) => !!b.id);
      if (!block?.id) return;
      enablePenForRun();
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      // Generous mode resolves the block's own spoken note or its stamped salient value, so this
      // works on any recorded answer without pretending a hard-coded number belongs to it.
      ink(block.id, block.note, undefined, true, undefined, 3200);
    },
    openDashboards: () => {
      const id = ensureTourDashboard();
      if (id) setTourDashId(id);
      else setDashOpen(true);
    },
    // Flip the tour's dashboard takeover to its Settings panel — see tourDashSettings above.
    dashboardShowSettings: () => setTourDashSettings(true),
    openModelSettings: () => {
      setSettingsTab('model');
      setShowSettings(true);
    },
    openExport: () => setExportOpen(true),
    // The reel's Remix — a genuinely different cut of the same conversation.
    shareRemix: () => {
      document.querySelector<HTMLButtonElement>('.shm-remix')?.click();
    },
    sharePalette: (label) => {
      const chip = Array.from(document.querySelectorAll<HTMLButtonElement>('.shm-chip')).find(
        (b) => b.textContent?.trim().toLowerCase() === label.toLowerCase(),
      );
      chip?.click();
    },
    // Walk the export studio for real: flip formats and templates via their own buttons.
    exportSetFormat: (f) => {
      document.querySelector<HTMLButtonElement>(`[data-export-format="${f}"]`)?.click();
    },
    exportPickTemplate: (i) => {
      document.querySelectorAll<HTMLButtonElement>('[data-export-template]')[i]?.click();
    },
    toggleRail: () => setRailCollapsed((o) => !o),
    bendIt: () => scriptedBendRef.current(),
    openFlashcards: () => {
      const b = turn.spec?.blocks.find((x) => !!x.id);
      if (b) addToFlashcard(b);
    },
    openTourCourse: () => openTourCourseRef.current(),
    fireMemoryGlow: () => {
      setMemorySaved(true);
      window.setTimeout(() => setMemorySaved(false), 2600);
    },
    stopRevealWalk: () => {
      tourDismissed.current = true;
    },
    closeAllOverlays: () => {
      // Close every in-Live overlay/mode so navigating between chapters never leaves one stuck.
      turn.setSpot(null);
      setPinned([]);
      setValue('');
      setViewMode('everything');
      setInkArmed(false);
      clearInkRef.current();
      // The pen's drawn marks belong to the chapter that drew them — leaving them in `inked`
      // past a chapter change (e.g. the 'mark' or 'focus' chapters, which reuse whatever canvas
      // is already up rather than requesting a fresh one) lets a stale mark try to re-resolve
      // its host against a since-changed card and redraw in the wrong place.
      setInked([]);
      setDrawnInk(new Set());
      setHiddenSpots(new Set());
      setTrackVisible(false);
      setPresenting(false);
      setShareOpen(false);
      closePalette();
      setRipple(null);
      setAtlasOpen(false);
      setPrismDocs(null);
      setTourPrismDoc(null);
      setSynthesis(null);
      setFlashAdd(null);
      setDelegateOpen(false);
      setExportOpen(false);
      setDashOpen(false);
      setTourDashId(null);
      setTourDashSettings(false);
      setRailCollapsed(false);
      setSrsOpen(false);
      setRecapOpen(false);
      setShowSettings(false);
      setWatchThinking(false);
      setJustListen(false);
      // Exit any course the 'course' chapter opened, so its CourseRail never lingers over a later
      // chapter's answer (the rail renders whenever activeCourse is set).
      setActiveCourse(null);
      setLessonIdx(0);
      setCourseProgress(null);
    },
  };
  // Latest feature-action map, so the tour's generic `showcaseFeature` op can reuse each feature's
  // own open logic (featureActions is built further below; the ref is assigned there).
  const featureActionsRef = useRef<
    Record<string, { available: boolean; reason?: string; run: () => void }>
  >({});
  // The first-run WALKTHROUGH driver — a chaptered feature tour that plays on this surface.
  // Inert (no work, no chrome) unless the surface booted in tour mode (peekTourMode()).
  const tourDrive = useTourDriver({
    active: tourMode.current,
    startChapter: tourStartChapter.current,
    solo: tourSolo.current,
    ops: liveOps,
  });
  // The DEMO REPLAY driver — a frozen, model-generated role session played on
  // this same surface through the same ops. Inert unless booted via a demo card / ?demo= link.
  const demoDrive = useDemoDriver({
    active: !!demoPersona.current,
    personaId: demoPersona.current,
    startStep: demoStartStep.current,
    ops: liveOps,
  });
  const tourDriveRef = useRef(tourDrive);
  tourDriveRef.current = tourDrive;
  // Keyboard controls for the walkthrough: ←/→ step chapters, Space plays/pauses, Esc skips.
  useEffect(() => {
    if (!tourMode.current) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = tourDriveRef.current;
      if (e.key === 'Escape') {
        t.skip();
      } else if (transportKeyBelongsToControl(e)) {
        return;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        t.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        t.prev();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        t.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const demoDriveRef = useRef(demoDrive);
  demoDriveRef.current = demoDrive;
  // Keyboard controls for a demo replay — same transport keys as the walkthrough.
  useEffect(() => {
    if (!demoPersona.current) return;
    const onKey = (e: KeyboardEvent): void => {
      const d = demoDriveRef.current;
      if (e.key === 'Escape') {
        d.skip();
      } else if (transportKeyBelongsToControl(e)) {
        return;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        d.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        d.prev();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        d.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A pen chapter borrowed the user's annotation settings (see penConfigRestoreRef) — hand them
  // back the moment the run finishes, and again on unmount so leaving Live mid-run also restores.
  useEffect(() => {
    if (tourDrive.done || demoDrive.done) restorePenConfig();
  }, [tourDrive.done, demoDrive.done, restorePenConfig]);
  useEffect(() => () => restorePenConfig(), [restorePenConfig]);

  const { narrate: narrateBlock, narratingId } = useTapNarration(
    {
      takeWheel: () => {
        tourDismissed.current = true;
        // The reader did not dismiss the walk, they REPLACED its subject — so the walk must stop
        // without clearing the spotlight they just set. Without this, `bail()` runs a tick or two
        // later, when the dismissed walk's current await resolves, and does `setSpot(null)` —
        // the object the reader handed over goes dark immediately after being picked, which is
        // exactly the "it ignored me" shape. Cleared by the walk teardown that honours it.
        readerTookOver.current = true;
      },
      hush: cancelSpeech,
      // A tapped card is its own reason — the user asked about it, so Mavéa draws as it
      // speaks, aimed at the words of the line it speaks (the same one lineFor picks).
      moveSpot: (block) => {
        turn.setSpot(block.id ?? null);
        if (annotationsEnabledRef.current) {
          ink(
            block.id,
            block.note ?? (block.id ? tourSpokenById.get(block.id) : undefined) ?? undefined,
            block.id ? tourMarkById.get(block.id) : undefined,
            true,
          );
        }
      },
      canSpeak: () => !mutedRef.current,
      // The model's per-slide note is purpose-written to explain THIS card, so it leads; then its
      // tour line (when this block is a tour stop), then a line derived from the block's own props.
      // Prefer the voice-ready twins (noteSpoken / the spoken tour line) so a spoken figure or term
      // is said the way a person would; the displayed note/caption stays the clean version.
      lineFor: (block) =>
        block.noteSpoken ??
        block.note ??
        (block.id ? tourSpokenById.get(block.id) : undefined) ??
        speakableLine(block),
      speakLine: speak,
    },
    turn.turn,
  );

  // The welcome stays clean (no static example canvas dangling under the setup card). A
  // "See how it works" button plays a labeled example walkthrough on demand instead.
  const [showHow, setShowHow] = useState(false);
  // True once the user starts talking or submits from the wizard Go hub; cleared on "+ New session".
  // Keeps the wizard hidden while the first turn is in-flight (turn.spec is still null then).
  // A restored session counts as started — the user is mid-conversation, not at the wizard. A seeded
  // question from the landing also counts when setup is done: the auto-start effect fires its turn,
  // so starting here avoids a one-frame wizard flash before the conversation surface appears. A
  // pending course lesson counts the same way.
  const [conversationStarted, setConversationStarted] = useState(
    !!restoredSession ||
      (!!seedQuery.current && isSetupDone()) ||
      (!!courseSeed.current && isSetupDone()) ||
      tourMode.current ||
      !!demoPersona.current,
  );

  // The saved-canvas Library (on by default, device-local) — shown on the welcome so a returning user
  // can pick any canvas back up. Empty and hidden until the first eligible canvas is generated.
  const libraryEntries = useLibrary();

  // Keep the atlas index fed: every Library change folds into the light per-conversation
  // records the map is drawn from (asks the Library later evicts stay on the map).
  useEffect(() => {
    setAtlasCount(syncFromLibrary(libraryEntries));
  }, [libraryEntries]);

  // Reveal tour: when a turn's canvas lands, spotlight the lead blocks one at a time —
  // each gliding to center — then release so the whole canvas sits visible at rest. Pure
  // presentation and fully cancellable: a new turn (turn.turn bumps) tears down the run.
  useEffect(() => {
    const spec = turn.spec;
    if (!spec) return;
    // Tour each turn exactly once. The effect re-fires for the same turn on a dev hot-reload
    // (Fast Refresh re-runs effects) or any remount; without this it would replay the whole
    // spotlight walk over the resting canvas — and silently, since the reloaded audio modules
    // have torn down their playback. A real new turn bumps turn.turn, so it still tours.
    if (touredTurn.current === turn.turn) return;
    touredTurn.current = turn.turn;
    // A restored session mounts WITH a canvas (turn 0). Don't replay a spotlight tour over
    // it — the user is picking up where they left off, not seeing the answer for the first
    // time. The next real turn tours as usual.
    if (restoredSession && turn.turn === 0) {
      // The restore opened the spotlight on the lead block; with no tour to run and release it,
      // clear it now so the restored canvas sits at rest instead of stuck-dimmed on the first card.
      if (turn.spot) turn.setSpot(null);
      return;
    }
    // A walkthrough chapter that seeds a canvas silently (no narration, no baked tour) manages the
    // spotlight itself — a derived walk here would talk/step over the chapter's own choreography.
    if (tourMode.current && !turn.narration && turn.tour.length === 0) {
      if (turn.spot) turn.setSpot(null);
      return;
    }
    // A model-authored tour (block indices) overrides the deterministic reading-order
    // walk; resolve its indices to the rendered blocks' ids and drop any that don't land.
    const modelTour: { spot: string; say?: string }[] = [];
    for (const t of turn.tour) {
      const spot = spec.blocks[t.index]?.id;
      if (spot) modelTour.push(t.say ? { spot, say: t.say } : { spot });
    }
    // Spotlight ONLY when it earns its place. The model leads: if it authored a tour, the
    // answer has a story worth walking (a few stops). With no tour, we add a single gentle
    // focus on the lead block ONLY for a substantial canvas that benefits from orienting the
    // eye — a small or simple answer just reveals at rest (a calm canvas beats lighting up
    // the obvious). An augment that brought new content still points at the first new block.
    let beats: ReturnType<typeof liveTourBeats> = [];
    if (modelTour.length) {
      // Walk the model's narrative across several blocks — like the demos, the spotlight
      // moves element to element and the canvas glides up/down to center each one. Capped so
      // it stays a guided highlight, not a walk through the whole canvas.
      beats = liveTourBeats(spec.blocks, { opener: turn.narration, tour: modelTour, maxStops: 5 });
    } else if (
      shouldRevealTour({
        blockCount: spec.blocks.length,
        mode: turn.mode,
        hasModelTour: false,
        teach: teachSurface,
      })
    ) {
      // Spotlight only the FEW lead blocks (the most important ones come first), then release
      // so the whole canvas sits visible. Highlighting every block would flatten the emphasis —
      // the point is to draw the eye to what matters, not narrate the entire page.
      // In teach mode every block is worth calling out, so walk the full canvas.
      beats = liveTourBeats(spec.blocks, {
        opener: turn.narration,
        maxStops: teachTurn ? spec.blocks.length : 3,
        startId: turn.spot ?? undefined,
      });
    }
    // else: no spotlight — let the whole canvas sit visible while the narration plays.
    if (!beats.length) {
      // The canvas opened focused on its lead block (spot was set when the turn landed). With no
      // walk to run — a small or simple answer — release it now so the canvas sits fully visible.
      // Without this the lead card keeps its spotlight forever, since only the tour's release beat
      // clears it and there's no tour here.
      if (turn.spot) turn.setSpot(null);
      return;
    }
    // A model-authored tour carries real per-block lines worth SPEAKING, so Mavéa walks the
    // canvas aloud and each block lights up exactly while its line is spoken. The derived
    // reading-order walk only has block titles, so it stays silent on a fixed dwell.
    const spokenWalk = modelTour.length > 0;
    // Latched here — before the first stop — and held for the turn: the gutter reserves once
    // (cards tile around it from the start), so a later mute flip changes only what's inked
    // next, never the layout. Only a turn that ARRIVED muted with a spoken tour gets one.
    // A muted turn gets notes because there is no voice to carry the asides. The Study gets them
    // for the opposite reason: it is a teaching surface, and a lesson that leaves nothing written
    // down is a lecture you cannot re-read. Latched here — before the first stop — and held for
    // the turn, so the gutter reserves once and a later mute flip changes only what is inked next.
    const withNotes =
      (mutedRef.current || savedViewMode() === 'study') &&
      spokenWalk &&
      annotationsEnabledRef.current;
    setNoteGutterTurn(withNotes);
    // Both paths below read stops off the same reduced beat list.
    const stops = beats.map((beat) => ({
      spot: beat.set && 'spot' in beat.set ? (beat.set.spot ?? undefined) : undefined,
      line: beat.set && 'caption' in beat.set ? beat.set.caption : undefined,
    }));
    // Muted: no spotlight, no pacing — the walk is a voice-sync tool, and with no voice to sync
    // to it has nothing left to earn its keep. The reader gets the whole marked-up canvas (every
    // stop's margin note and pen mark) in one pass instead of watching it arrive one card at a time.
    if (mutedRef.current) {
      if (annotationsEnabledRef.current) {
        const plan = revealInkPlan({
          stops,
          spokenWalk,
          withNotes,
          teach: teachSurface,
          marksById: tourMarksById,
        });
        for (const c of plan) {
          ink(c.spot, c.line, c.mark, c.generous, c.delayMs, c.badgeMs, c.stepNumber, c.noteText);
        }
      }
      turn.setSpot(null);
      return;
    }
    tourDismissed.current = false;
    // Spans the pre-walk barrier too, so the tour/demo drivers' isBusy() reads "still working"
    // for the whole spin-up — their quiet-gates must never mistake a cold voice for "finished".
    walkActive.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cueTimer: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    // Set while a claimed TeachDiagram (or any future stepDriver block) is mid-build for the
    // CURRENT stop — released the moment its sub-loop ends, but also here as a safety net so a
    // walk torn down (mute, turn change, unmount) mid-build never leaves the diagram suspended
    // with nobody driving it.
    let activeDiagramRelease: (() => void) | null = null;
    const releaseActiveDiagram = (): void => {
      if (activeDiagramRelease) {
        activeDiagramRelease();
        activeDiagramRelease = null;
      }
    };
    const finish = (): void => {
      walkActive.current = false;
      flushWalkRef.current = null;
      if (cueTimer) clearTimeout(cueTimer);
      setWalkPreparing(false);
      // The walk's last line must not outlive it: it would keep captioning whatever card the
      // user stages next.
      setSpokenNow(null);
    };
    // The spoken walk awaits real audio below, and a flush/dismiss/turn-change can land during
    // any of those waits — every await re-checks this before touching the canvas again.
    const bail = (): boolean => {
      if (cancelled) return true;
      if (tourDismissed.current) {
        finish();
        // A walk dismissed OUTRIGHT (Escape, mute, "show me everything") leaves the canvas at
        // rest. A walk the reader took the wheel of has already been re-pointed at the object
        // they chose, and clearing it here would undo their own gesture.
        if (readerTookOver.current) readerTookOver.current = false;
        else turn.setSpot(null);
        return true;
      }
      return false;
    };
    // Light one stop — spotlight, caption, and its pen marks. The visual half of a beat, kept
    // separate from the pacing so a spoken stop can apply it at the exact moment its own audio
    // starts (never before — lighting on enqueue is how the spotlight used to outrun the voice).
    const applyStop = (
      spot: string | null | undefined,
      line: string | undefined,
      idx?: number,
    ): void => {
      if (spot !== undefined) turn.setSpot(spot ?? null);
      // The speak strip follows the walk — always the SHOWN caption; the voice twin
      // ("five thousand dollars") is for the TTS engine only, never the screen.
      if (spokenWalk && line) setSpokenNow(line);
      // The whiteboard hand needs a reason: a stop the model deliberately marked always
      // draws, and in teach mode (or a "teach me…" ask) EVERY walk stop takes the pen —
      // including the silent derived walk, where the user asked to be shown around.
      // The written aside, at the moment it is said. A voiced walk used to leave nothing behind:
      // notes were emitted only by the muted planner, so a lesson you LISTENED to could not be
      // re-read. Stop 0 is skipped — it is the opener, already permanent in the answer hero.
      if (spot && withNotes && line && idx !== undefined && idx > 0) {
        const noteText = condenseForNote(line);
        if (noteText)
          ink(spot, line, undefined, undefined, undefined, undefined, undefined, noteText);
      }
      if (spot && annotationsEnabledRef.current) {
        // Draw EVERY gesture this stop calls out on its block (a circle here, an underline there),
        // so the pen teaches multiple points as the line is spoken — not just one per block.
        // Multiple marks draw sequentially (MARK_STEP_MS apart) so each appears as the voice
        // explains that specific datum, like a teacher building up the point.
        const stopMarks = tourMarksById.get(spot);
        if (stopMarks?.length) {
          const totalBadge = BADGE_MS + (stopMarks.length - 1) * MARK_STEP_MS;
          // A lone mark just draws — the numbered chip only earns its keep once there's an
          // actual order to show (2+ marks reading as a step-by-step walk).
          const sequence = stopMarks.length > 1;
          for (let mi = 0; mi < stopMarks.length; mi++) {
            const delayMs = mi * MARK_STEP_MS;
            // Only the last mark in a sequence carries the extended badge duration, since
            // each SpotInk sets its own badge timer — the last one's timer runs longest.
            const badgeMs = mi === stopMarks.length - 1 ? totalBadge : undefined;
            ink(
              spot,
              line,
              stopMarks[mi],
              teachSurface,
              delayMs,
              badgeMs,
              sequence ? mi + 1 : undefined,
            );
          }
        } else if (teachSurface) {
          ink(spot, line, undefined, teachSurface);
        }
      }
    };
    // Once this stop's own line finishes, hand off to a claimed diagram's build (if this
    // stop's block registered one — see stepDriver.ts) before moving to the next stop, then
    // fall through to the normal step(). Voice must actually be live to bother: muted has
    // nothing to sync to, and reduced motion means the diagram already shows its finished
    // figure with no steps to walk.
    const advance = (spot: string | null | undefined): void => {
      const claimed =
        spot && !mutedRef.current && !prefersReducedMotion() ? claimStepper(spot) : null;
      if (!claimed) {
        step();
        return;
      }
      activeDiagramRelease = claimed.release;
      runDiagramWalk(
        claimed,
        {
          speakLine: speak,
          isCancelled: () => cancelled,
          isDismissed: () => tourDismissed.current,
        },
        (reason) => {
          activeDiagramRelease = null;
          if (reason === 'dismissed') {
            finish();
            turn.setSpot(null);
            return;
          }
          if (reason === 'cancelled') return; // the effect's own cleanup is already tearing down
          step();
        },
      );
    };
    // The line a beat will voice, if any — the same derivation step() uses (the voice-ready
    // twin keyed by the stop's block, else the shown caption).
    const spokenLineOf = (b: (typeof beats)[number]): string | undefined => {
      const s = b.set && 'spot' in b.set ? b.set.spot : undefined;
      const c = b.set && 'caption' in b.set ? b.set.caption : undefined;
      return (s ? tourSpokenById.get(s) : undefined) ?? c;
    };
    // Hand the voice layer the next stop's line ahead of time, so its synthesis can run while
    // the current stop's audio still plays (the one-ahead prefetch in voice/kokoro.ts).
    const primeNextSpoken = (idx: number): void => {
      for (let n = idx + 1; n < beats.length; n++) {
        const next = spokenLineOf(beats[n]);
        if (next) {
          primeLine(next, 'mavea');
          return;
        }
      }
    };
    // One spoken stop, paced by its OWN line's lifecycle instead of polling the global queue on
    // a wall clock: enqueue the line, hold the previous stop until this line is audible, light
    // the block WITH the audio, advance when the line has finished. On a slow machine the old
    // poll's fixed cap fired while Kokoro was still synthesizing — the spotlight marched on and
    // every queued line landed a stop late, compounding for the rest of the turn.
    const runSpokenStop = async (
      beat: (typeof beats)[number],
      idx: number,
      spot: string | null | undefined,
      line: string | undefined,
      spokenLine: string | undefined,
    ): Promise<void> => {
      const estimateMs = beat.ms ?? 1700;
      // Stop 0 carries the opener, already queued sentence-by-sentence while the answer
      // streamed — never double-speak it. Light it now and hold until the queue drains, so
      // the walk starts moving exactly when the opener stops talking.
      if (idx === 0 || !spokenLine) {
        applyStop(spot, line, idx);
        primeNextSpoken(idx);
        await waitQueueQuiet({ floorMs: MIN_STOP_MS, capMs: finishCapMs(estimateMs) });
        if (bail()) return;
        advance(spot);
        return;
      }
      const handle = speak(spokenLine);
      const heard = await waitLineStart(handle);
      if (bail()) return;
      applyStop(spot, line, idx);
      // Announce the NEXT stop's line while this one plays: its synthesis then hides behind
      // this stop's audio instead of becoming dead-air between the two (voice/tts primeLine —
      // the queue itself holds one walk line at a time, so the voice layer can't see ahead).
      primeNextSpoken(idx);
      if (heard) {
        await waitLineEnd(handle, estimateMs);
      } else {
        // This line will never be heard (voice down, or hard-stopped) — dwell for the
        // caption's own reading length instead of sprinting through the remaining stops.
        await delay(estimateMs);
      }
      if (bail()) return;
      advance(spot);
    };
    const step = (): void => {
      if (cancelled || i >= beats.length) {
        finish();
        return;
      }
      // A manual dismiss ends the walk early and leaves the canvas at rest (spot cleared).
      if (tourDismissed.current) {
        finish();
        turn.setSpot(null);
        return;
      }
      const idx = i;
      const beat = beats[i++];
      const line = beat.set && 'caption' in beat.set ? beat.set.caption : undefined;
      const spot = beat.set && 'spot' in beat.set ? beat.set.spot : undefined;
      // Show the shown caption, but VOICE the spoken twin for this stop when the model gave one
      // (so a figure or term in the line is said the way a person would), falling back to the caption.
      const spokenLine = spokenLineOf(beat);
      if (spokenWalk) {
        void runSpokenStop(beat, idx, spot, line, spokenLine);
      } else {
        // The silent derived walk has no audio to track — its fixed dwell is the pacing.
        applyStop(spot, line, idx);
        timer = setTimeout(step, beat.ms ?? 0);
      }
    };
    // Mute ENDS a running walk — the reader asked for the written answer, not a paced one. The
    // remaining stops' pen marks still land at once (they're answer content, not pacing); their
    // margin notes don't, since the gutter was never reserved for a walk that arrived voiced.
    flushWalkRef.current = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      releaseActiveDiagram();
      cancelSpeech();
      if (annotationsEnabledRef.current) {
        const plan = revealInkPlan({
          stops,
          from: i,
          spokenWalk,
          withNotes: false,
          teach: teachSurface,
          marksById: tourMarksById,
        });
        for (const c of plan) {
          ink(c.spot, c.line, c.mark, c.generous, c.delayMs, c.badgeMs, c.stepNumber, c.noteText);
        }
      }
      finish();
      turn.setSpot(null);
    };
    // Hold the walk until everything it is about to point at is actually there: the settled
    // blocks' family chunks (an augment can add a family the streaming preload never saw), the
    // grid's async content (fonts/images/tiles — bounded, late pixels just pop in as before),
    // and, for a voiced turn, the opener's audio reaching the speakers. Without this the walk
    // used to start over a half-built canvas — a silent gap, then the spotlight "randomly"
    // going again. Every wait is bounded (BARRIER_MAX_MS worst case, honest "Preparing…" cue
    // past the anti-flash delay); the warm path resolves in two animation frames.
    const beginWalk = async (): Promise<void> => {
      cueTimer = setTimeout(() => {
        if (!cancelled) setWalkPreparing(true);
      }, PREPARE_CUE_DELAY_MS);
      const gridHost = scrollRef.current;
      await awaitWalkReady({
        loadFams: () => loadFamilies(familiesFor(spec.blocks)),
        settle: gridHost
          ? () =>
              ensureFigureReady(gridHost, {
                timeoutMs: SETTLE_TIMEOUT_MS,
                perImageMs: SETTLE_IMG_MS,
              })
          : undefined,
        firstLine: burstLineRef.current,
        // Muted and captions-only turns must never wait on audio that will not come; an
        // unsettled probe (first turn of a session) is still worth the bounded wait.
        wantVoice: !mutedRef.current && kokoroKnownAvailable() !== false,
      });
      if (cueTimer) clearTimeout(cueTimer);
      setWalkPreparing(false);
      if (bail()) return;
      step();
    };
    void beginWalk();
    return () => {
      cancelled = true;
      flushWalkRef.current = null;
      walkActive.current = false;
      if (timer) clearTimeout(timer);
      if (cueTimer) clearTimeout(cueTimer);
      setWalkPreparing(false);
      releaseActiveDiagram();
    };
    // Runs once per turn; setSpot is stable and spec/narration change with the turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.turn]);

  // Glide the spotlit block to vertical center whenever the spotlight moves. A short
  // delay lets the .spotlit class + layout settle before we measure (same as the demo).
  // The card can also legitimately not exist yet — its family chunk still mounting on a slow
  // machine — so a miss retries on the same cadence (bounded) instead of silently skipping
  // the glide and leaving the narrated card off-screen. In Focus/Canvas view the grid isn't
  // the scroller, so the retries just run out quietly — same no-op as before, now time-capped.
  useEffect(() => {
    const spot = turn.spot;
    const spec = turn.spec;
    if (!spec || !spot) return;
    let tries = 0;
    let id = 0;
    const attempt = (): void => {
      const cont = scrollRef.current;
      if (!cont) return;
      const el = cont.querySelector('.spotlit');
      // The Study choreographs its own camera: the spotlit card is ALWAYS at the desk's front
      // slot, so centering it just drags the beat bar below the fold on every stop.
      if (el?.closest('.study-stage')) return;
      if (!el) {
        // ~1.1s of retries — past that the card isn't coming (wrong view, dropped block).
        if (++tries < 12) id = window.setTimeout(attempt, 90);
        return;
      }
      const cRect = cont.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      let delta = eRect.top - cRect.top - (cont.clientHeight - eRect.height) / 2;
      // A "connect" stop points at a DIFFERENT card — bias the scroll toward both cards'
      // midpoint so the arrow's far end has a chance of landing on screen, rather than always
      // dead-centering just the near one and leaving the connector pointing off-page.
      const connectMark = tourMarksById.get(spot)?.find((m) => m.kind === 'connect');
      const toSpotId =
        connectMark && typeof connectMark.onIndex === 'number'
          ? spec.blocks[connectMark.onIndex]?.id
          : undefined;
      const toEl = toSpotId ? cont.querySelector(`[data-spot-id="${CSS.escape(toSpotId)}"]`) : null;
      if (toEl) {
        const toRect = toEl.getBoundingClientRect();
        const spanTop = Math.min(eRect.top, toRect.top);
        const spanBottom = Math.max(eRect.top + eRect.height, toRect.top + toRect.height);
        const biasDelta = (spanTop + spanBottom) / 2 - cRect.top - cont.clientHeight / 2;
        // Capped so a far-off target only nudges the scroll, never scrolls the block Mavéa is
        // actually narrating mostly out of frame.
        const cap = cont.clientHeight * 0.35;
        delta = Math.max(delta - cap, Math.min(delta + cap, biasDelta));
      }
      cont.scrollTo({ top: Math.max(0, cont.scrollTop + delta), behavior: 'smooth' });
    };
    id = window.setTimeout(attempt, 90);
    return () => window.clearTimeout(id);
  }, [turn.spot, turn.spec, tourMarksById]);

  // Dismiss the guided spotlight: end the walk early and clear the dimmed state so the
  // whole canvas is interactive again. Safe to call when nothing is spotlit (no-op).
  const dismissSpotlight = useCallback(() => {
    if (!turn.spot) return;
    tourDismissed.current = true;
    turn.setSpot(null);
  }, [turn]);

  // "Show everything now" — the one-gesture way out of a paced reveal. If a guided walk is running,
  // flush it: stop the speech, drop the remaining pen marks at once, and release the spotlight so
  // the whole canvas is there instantly (the same primitive a mute mid-walk uses). Outside a walk it
  // just stops any lone narration and clears a lingering spotlight. Wired to Escape and to the
  // Speaking pill so the user can always skip straight to the full answer.
  const showAll = useCallback(() => {
    const flush = flushWalkRef.current;
    if (flush) {
      flush();
    } else {
      cancelSpeech();
      dismissSpotlight();
    }
  }, [dismissSpotlight]);

  // Restoring (or replacing) a canvas remounts every card in one commit. Mavéa's annotation portals
  // are createPortal'd INTO those cards, so if a portal is still pointed at a card React unmounts in
  // that same commit, `removeChildFromContainer` throws ("node to be removed is not a child") and the
  // RootBoundary blanks the whole answer. Worse, the aborted commit never runs TopicCanvas's
  // block-family load effect, so the restored answer renders as an empty grid (the exact "UIs are
  // gone on resume" bug). `restoreCanvas` tears the ink layer down in ITS OWN commit — flushSync,
  // while the old cards are still mounted, so the portals detach cleanly — THEN swaps the canvas.
  const [inkSuppressed, setInkSuppressed] = useState(false);
  // True while restoreCanvas is awaiting family chunks — on a slow link that wait is seconds,
  // and the tap that started it ("Pick up where you left off", a library open) needs to be
  // acknowledged within a frame, not after the chunks land.
  const [restoring, setRestoring] = useState(false);
  const restoreCanvas = useCallback(
    async (...args: Parameters<typeof turn.restore>) => {
      flushSync(() => setInkSuppressed(true));
      setRestoring(true);
      // A restored canvas has no streaming stage to preload its per-family block chunks the way a live
      // answer does (see useLiveTurn's preloadBlockFamilies calls). TopicCanvas gates the WHOLE grid on
      // `useBlockFamilies` — all-or-nothing — and on a restore that gate would otherwise sit on an empty
      // placeholder grid indefinitely (the "UIs are gone on resume" bug: the blocks are all there, just
      // never revealed). Load the chunks up front so `familiesReady` is already true on the first paint.
      try {
        await loadFamilies(familiesFor(args[0].blocks));
      } catch {
        // A failed chunk is fine — the grid's own effect + per-block BlockBoundary still cover it.
      } finally {
        setRestoring(false);
      }
      turn.restore(...args);
    },
    [turn],
  );
  // A NEW TURN replaces the canvas exactly the way a restore does, and needed the same guard.
  //
  // restoreCanvas has torn the ink down in its own commit since the "UIs are gone on resume" bug; a
  // live turn had nothing. So the previous answer's marks were still portaled into its cards when the
  // new answer's grid replaced them in one commit, removeChildFromContainer threw, and the
  // RootBoundary blanked the answer — taking the turn's own provider call down with it. Seen three
  // times on live turns while testing.
  //
  // Keyed on `busy` rather than wrapped around all six turn.run call sites: the swap happens when the
  // new spec lands, long after busy goes true, so the ink is already gone by then — and one effect
  // cannot be forgotten at a seventh call site.
  useEffect(() => {
    if (turn.busy) setInkSuppressed(true);
  }, [turn.busy]);
  // Re-arm the ink once the new canvas has mounted (turn.turn bumped): the restored answer sits at
  // rest with no marks, so this just releases the guard so the next live walk can draw again.
  useEffect(() => {
    setInkSuppressed(false);
  }, [turn.turn]);

  // Esc shows the whole answer at once — end a running walk (speech + spotlight) and drop the
  // remaining marks, so the canvas never traps the user in a paced, dimmed view.
  useEffect(() => {
    if (!turn.spot) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') showAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn.spot, showAll]);

  // History / replay: open the timeline overlay onto a chosen turn frame, or null when
  // closed. A new turn closes it so the live canvas comes back to the front.
  const [replayAt, setReplayAt] = useState<number | null>(null);
  useEffect(() => setReplayAt(null), [turn.turn]);
  // A new turn also closes the evidence panel (it belongs to the answer that opened it).
  useEffect(() => setProofOpen(false), [turn.turn]);
  // Pinned elements belong to the answer they came from — a new turn replaces that canvas, so
  // clear them (submit already clears on send; this covers chip/prefetch-driven turns too).
  useEffect(() => setPinned([]), [turn.turn]);
  // Mobile: a new answer should take the stage — fold the conversation sheet back down.
  useEffect(() => setChatOpen(false), [turn.turn]);

  // Which saved Library entry (if any) the canvas on screen was resumed from — so "Build a
  // dashboard" defaults to THAT chat instead of always picking the most recent live session
  // (see ExtractionPreview's `initialSourceId`). A subsequent fresh ask replaces the canvas
  // with new, unsaved content, so it should fall back to the live session again; restoring
  // that same entry bumps turn.turn too, so the reset effect below skips once via the ref.
  const [activeEntryId, setActiveEntryIdRaw] = useState<string | null>(null);
  const skipActiveEntryResetRef = useRef(false);
  const activateEntry = useCallback((id: string) => {
    skipActiveEntryResetRef.current = true;
    setActiveEntryIdRaw(id);
  }, []);
  useEffect(() => {
    if (skipActiveEntryResetRef.current) {
      skipActiveEntryResetRef.current = false;
      return;
    }
    setActiveEntryIdRaw(null);
  }, [turn.turn]);

  // The confidence to show in the evidence panel — the lead insight's, if any.
  const leadConf = (() => {
    const lead = turn.spec?.blocks.find((b) => b.type === 'insight');
    return lead && lead.type === 'insight' ? lead.props.conf : undefined;
  })();

  // The Mark highlighter's brain. A stroke pins the text it grabbed (shown in place); the turn fires
  // only when the user asks — taps Ask here (onCommit) or types a question (the submit path folds the
  // pins in). The marked parts' real blocks ride the existing selectedBlocks grounding rail, merged
  // with any pinned blocks.
  const userInk = useInkIntent({
    resetKey: turn.turn,
    onCommit: (committed) => {
      const spec = turn.viewSpec ?? turn.spec;
      const { intents: live, blocks: inkBlocks } = resolveInkTargets(committed, spec?.blocks ?? []);
      if (!live.length) return;
      const merged = dedupeById([...pinned, ...inkBlocks]);
      setPinned([]);
      void turn.run(
        inkPromptText(live),
        undefined,
        merged.length ? merged : undefined,
        undefined,
        live,
      );
    },
  });

  // The tour's scripted highlighter: circle the card's stat, then spotlight it — the exact human
  // gesture, minus a hand. No model; reuses the live ink resolver. The loop aims at the card's
  // biggest numeric line (its stat), not the card's geometric middle, which can fall on the
  // whitespace between lines and read as a miss ("nothing to grab there").
  scriptedMarkRef.current = () => {
    const stage = stageRef.current;
    const target = stage?.querySelector('[data-spot-id]') as HTMLElement | null;
    if (!stage || !target) return;
    // The viewport may be scrolled well past the first card by now (the ask chapter types into
    // the composer at the bottom) — bring the card on screen FIRST, then stroke where it lands;
    // measuring before the scroll would draw the mark into empty off-screen space.
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => scriptedMarkStroke(stage, target), 560);
  };
  const scriptedMarkStroke = (stage: HTMLElement, target: HTMLElement): void => {
    const svg = stage.querySelector('.ink-user-overlay') as SVGElement | null;
    if (!svg) return;
    // Size every candidate ONCE, then sort on the recorded number: reading getComputedStyle from
    // inside the comparator flushes style O(n log n) times on a card the walkthrough is about to
    // animate over.
    const sized = Array.from(target.querySelectorAll<HTMLElement>('*'))
      .filter(
        (el) => el.children.length === 0 && el.offsetHeight > 0 && /\d/.test(el.textContent ?? ''),
      )
      .map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
    const value = sized.sort((a, b) => b.size - a.size)[0]?.el;
    const rect = (value ?? target).getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const pts = markCircleLoop(rect, svgRect);
    userInk.onStroke(pts, { stage, svgRect });
    const id = target.getAttribute('data-spot-id');
    if (id) turn.setSpot(id);
  };
  clearInkRef.current = () => userInk.clear();

  const submit = useCallback(
    // `force` bypasses turn.run's busy guard: a spoken question that arrives mid-turn must abort
    // whatever was still generating rather than being silently dropped because that turn hasn't
    // settled yet. That covers both a barge-in over audible speech and the busy-but-silent window
    // (thinking, or a muted answer), where nothing flags the utterance as an interruption. Every
    // other caller (typed composer, chips) omits it — those are already gated on
    // `disabled={turn.busy}` at the UI level, so they never get here busy.
    (text: string, force = false) => {
      const t = text.trim();
      // Watch Me Think: the main composer doubles as the typed-thought input — a submitted line
      // banks into the live map instead of starting a turn. No second text box needed.
      if (watchThinkingRef.current && t) {
        setValue('');
        // Typing IS thinking. The mic's silence fallback would otherwise resolve the map mid-flow —
        // eight quiet seconds while someone types their third thought, and the shape settles around
        // the two it had. Any typed thought cancels that pending settle, exactly as speaking does.
        if (settleTimerRef.current !== null) {
          window.clearTimeout(settleTimerRef.current);
          settleTimerRef.current = null;
        }
        mindShapeRambleRef.current = [...mindShapeRambleRef.current, t];
        mindShape.onTranscript(mindShapeRambleRef.current.join(' '));
        return;
      }
      // A pasted diff isn't a question — route it straight to Ripple (the code/ship companion)
      // rather than trying to answer raw patch text. Gated on a real diff signal (a git header or a
      // hunk header) so ordinary prose is never hijacked. Read-only; the diff is parsed on-device.
      if (t && (/^diff --git /m.test(t) || /^@@ .* @@/m.test(t))) {
        const floor = buildShipFromDiff(parseUnifiedDiff(t));
        if (floor.changes.length > 0) {
          setValue('');
          setRipple(floor);
          const mc = toModelConfig(cfg);
          if (mc) {
            void enrichShipModel(floor, t, mc).then((enriched) =>
              setRipple((cur) => (cur ? enriched : cur)),
            );
          }
          return;
        }
      }
      // A turn is valid with words, a staged file, OR pending ink marks (a mark alone is a real ask).
      if (!t && attached.length === 0 && userInk.intents.length === 0) return;
      // Ask whether the turn would actually start BEFORE clearing anything. `turn.run` refuses
      // silently, and everything below has already emptied the composer by the time it does — so a
      // refusal used to read as "my question vanished and nothing happened", which is exactly what
      // makes someone type it again. Keep what they wrote, and say why.
      // `force` is the barge-in path: it bypasses the busy guard inside run(), so it must bypass
      // the same one here — but nothing bypasses `blocked`, which run() refuses either way.
      const refusal = turn.refuseReason(t, attached.length > 0 || userInk.intents.length > 0);
      if (refusal && !(force && refusal === 'busy')) {
        setVoiceNotice(TURN_REFUSAL_NOTICE[refusal]);
        return;
      }
      setHeard(null);
      setLastAsk(t || null);
      setValue('');
      const files = attached;
      // Remember whether this turn carried files so the evidence panel can be honest about
      // what (if anything) grounded the answer.
      setTurnHadFiles(files.length > 0);
      setAttached([]);
      setAttachError(null);
      // Fold any pending ink marks into this turn: drop stale targets, then merge the marked parts'
      // blocks with the pinned ones onto the single selectedBlocks rail (real props in context).
      const spec = turn.viewSpec ?? turn.spec;
      const { intents: liveInk, blocks: inkBlocks } = resolveInkTargets(
        userInk.intents,
        spec?.blocks ?? [],
      );
      const merged = dedupeById([...pinned, ...inkBlocks]);
      setPinned([]);
      userInk.clear();
      void turn.run(
        t || inkPromptText(liveInk),
        files.length ? files : undefined,
        merged.length ? merged : undefined,
        undefined,
        liveInk.length ? liveInk : undefined,
        undefined,
        undefined,
        force ? { force: true } : undefined,
      );
    },
    // The attachment setters come from useAttachments; they're stable useState dispatchers, listed
    // here only to satisfy exhaustive-deps now that they cross the hook boundary.
    [
      turn,
      attached,
      pinned,
      userInk,
      mindShape,
      cfg,
      setHeard,
      setAttached,
      setAttachError,
      setTurnHadFiles,
    ],
  );

  // Hand-off from the landing's hero composer. If the user has finished setup on this device, a
  // typed question lands them straight in a real live session — no extra tap (conversationStarted
  // was seeded true above to skip the wizard flash). Otherwise the question is staged into the
  // setup wizard's composer (the `seed` prop) and the setup page shows. Runs once on mount; the
  // ref is consumed on the auto-start path so a re-run can't re-fire the turn.
  useEffect(() => {
    if (seedQuery.current && isSetupDone()) {
      const seed = seedQuery.current;
      seedQuery.current = '';
      submit(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Topic Courses: which course/lesson is the active turn (null when this session isn't in a
  // course). Drives the CourseRail chrome above the answer hero and its Prev/Next/checkpoint
  // handlers below; the syllabus + progress themselves stay in course/store.ts's local store —
  // this is just "which one is on screen right now".
  const [activeCourse, setActiveCourse] = useState<TopicCourse | null>(null);
  const [lessonIdx, setLessonIdx] = useState(0);
  const [courseProgress, setCourseProgress] = useState<CourseProgress | null>(null);
  // The course+lesson (and the frame count just before the turn started) a real lesson turn IN
  // FLIGHT should cache its finished frame under once it settles — see the effect below. Cleared
  // the moment that happens (or the turn fails, so a stale marker can never mis-cache a later,
  // unrelated frame).
  const pendingLessonCacheRef = useRef<{
    courseId: string;
    lessonId: string;
    framesBefore: number;
  } | null>(null);

  // Open a lesson: replay it for free if it was already generated and cached (zero model calls,
  // via useLiveTurn.showFrame), otherwise run a real lesson turn shaped by lessonSpine's per-lesson
  // directive. Shared by the mount-time hand-off from #/courses and the rail's Prev/Next.
  const openCourseLesson = useCallback(
    (course: TopicCourse, idx: number) => {
      const lesson = course.lessons[idx];
      if (!lesson) return;
      const progress = getCourseProgress(course.id);
      setActiveCourse(course);
      setLessonIdx(idx);
      setCourseProgress(progress);
      setCurrentLesson(course.id, idx);
      setConversationStarted(true);
      const displayLabel = `Lesson ${idx + 1}: ${lesson.title}`;
      const cached = getCachedLessonFrame(course.id, lesson.id);
      if (cached) {
        setLastAsk(displayLabel);
        turn.showFrame(cached, displayLabel);
        return;
      }
      const spine = buildLessonSpine(course, idx, progress, getMastery(course.topic));
      pendingLessonCacheRef.current = {
        courseId: course.id,
        lessonId: lesson.id,
        framesBefore: turn.frames.length,
      };
      setLastAsk(displayLabel);
      void turn.run(
        `Teach this lesson: "${lesson.title}" — ${lesson.goal}`,
        undefined,
        undefined,
        undefined,
        undefined,
        displayLabel,
        undefined,
        { lesson: spine },
      );
    },
    [turn],
  );

  // The walkthrough's "master a subject" chapter: seed a real five-lesson course (idempotent) and
  // open Lesson 1 in place — the same activeCourse path openCourseLesson takes on a cache hit, so
  // the genuine CourseRail rises over the lesson's baked canvas. Two deliberate differences from
  // openCourseLesson keep it tour-safe: the canvas is revealed SILENT (narration/tour stripped, like
  // the canvas/focusWalk seeds) and with interrupt:false, so the chapter's coach line is the only
  // voice and never gets cut when the lesson mounts.
  openTourCourseRef.current = () => {
    const course = ensureTourCourse();
    if (!course) return;
    const lesson = course.lessons[0];
    setActiveCourse(course);
    setLessonIdx(0);
    setCourseProgress(getCourseProgress(course.id));
    setCurrentLesson(course.id, 0);
    setConversationStarted(true);
    const frame = getCachedLessonFrame(course.id, lesson.id);
    if (frame) {
      const label = `Lesson 1: ${lesson.title}`;
      setLastAsk(label);
      turn.showFrame({ ...frame, narration: '', tour: [] }, label, { interrupt: false });
    }
  };

  // The one-shot hand-off from #/courses ("Start course" / "Continue"): open the stashed lesson
  // once on mount. Silently no-ops when the course was removed between the hand-off and this
  // mount (e.g. deleted in another tab) or setup isn't finished yet — the courses home is still
  // one click away either way.
  useEffect(() => {
    const seed = courseSeed.current;
    if (!seed) return;
    courseSeed.current = undefined;
    if (!isSetupDone()) return;
    const course = getCourse(seed.courseId);
    if (!course) return;
    const idx = Math.min(Math.max(seed.lessonIdx, 0), course.lessons.length - 1);
    openCourseLesson(course, idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A real lesson turn just settled: cache its finished canvas (frames grew) so the next visit to
  // this lesson replays for free instead of spending another model call. Skipped on a cache hit
  // (openCourseLesson never arms the marker for one) and on a failed turn (frames didn't grow, so
  // the marker is dropped without caching the unrelated prior frame).
  useEffect(() => {
    const pending = pendingLessonCacheRef.current;
    if (!pending || turn.busy) return;
    pendingLessonCacheRef.current = null;
    if (turn.frames.length <= pending.framesBefore) return;
    cacheLessonFrame(pending.courseId, pending.lessonId, turn.frames[turn.frames.length - 1]);
  }, [turn.frames, turn.busy]);

  // The checkpoint panel grades itself locally (zero model calls) and hands back the result —
  // persist it and refresh the progress the rail reads.
  const recordLessonCheckpoint = useCallback(
    (result: CheckpointResult) => {
      if (!activeCourse) return;
      const lesson = activeCourse.lessons[lessonIdx];
      if (!lesson) return;
      recordCheckpoint(activeCourse.id, lesson.id, result);
      setCourseProgress(getCourseProgress(activeCourse.id));
    },
    [activeCourse, lessonIdx],
  );

  // A checkpoint can also be graded through the lesson's own quiz blocks (course/mastery.ts joins
  // quiz answers to the lesson's checkpoint list and calls recordCheckpoint itself) — refresh the
  // rail's progress on any course-store write so "done" shows up without waiting for a remount.
  useEffect(() => {
    if (typeof window === 'undefined' || !activeCourse) return;
    const onChange = (): void => setCourseProgress(getCourseProgress(activeCourse.id));
    window.addEventListener(COURSE_EVENT, onChange);
    return () => window.removeEventListener(COURSE_EVENT, onChange);
  }, [activeCourse]);

  // Cards suggested from a quiz-graded checkpoint's misses (deterministic — front is the checkpoint
  // question, back its own real answer, zero model calls). Offered through the same flash-pill
  // affordance as every other card suggestion; nothing reaches the deck until "Add".
  const [checkpointSuggest, setCheckpointSuggest] = useState<MasteryCheckpointDetail | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onCheckpoint = (e: Event): void => {
      const detail = (e as CustomEvent<MasteryCheckpointDetail>).detail;
      if (detail?.missedCards.length) setCheckpointSuggest(detail);
    };
    window.addEventListener(MASTERY_CHECKPOINT_EVENT, onCheckpoint);
    return () => window.removeEventListener(MASTERY_CHECKPOINT_EVENT, onCheckpoint);
  }, []);

  const acceptCheckpointCards = useCallback(
    (detail: MasteryCheckpointDetail): void => {
      // One addCards call per missed card so each keeps its own question as provenance (SrsSource is
      // shared per call, not per item) — addCards' own deck⊕front dedup makes this safe to repeat on
      // every retake, so a re-taken checkpoint never doubles up the deck.
      const added = detail.missedCards.flatMap((card) =>
        addCards([card], {
          deck: detail.courseTitle,
          tags: [detail.lessonTitle, 'checkpoint'],
          source: { question: card.front, topic: detail.topic, ts: detail.at },
          origin: 'auto',
        }),
      );
      setCheckpointSuggest(null);
      showCardsPill(added);
    },
    [showCardsPill],
  );

  // The set of pinned ids, passed to the canvas so pinned blocks render as selected.
  const pinnedIds = useMemo(() => new Set(pinned.map((b) => b.id as string)), [pinned]);

  // "Edit its mind": one chip fixed → one short correction turn. The model re-renders what
  // the fix changes instead of the user re-explaining the whole ask.
  const fixUnderstanding = useCallback(
    (before: string, after: string) => {
      setLastAsk(`Correction: ${after}`);
      void turn.run(
        `Correction — you understood "${before}", but it's actually "${after}". Keep the rest of your understanding and update the answer wherever this changes it.`,
        undefined,
        undefined,
        undefined,
        undefined,
        `Correction: ${after}`,
      );
    },
    [turn],
  );

  // Blocks fuse: drag one block onto another (optionally with pinned cards included) →
  // a turn grounded in all the blocks' real props. The relationship the model states comes
  // from the data it is handed — never invented client-side.
  const fuseBlocks = useCallback(
    (blocks: Block[]) => {
      const labels = blocks.map(blockLabel);
      const ask =
        blocks.length === 2
          ? `Fuse these two: what is the real relationship between "${labels[0]}" and "${labels[1]}"? Lead with the single most useful connection, and be explicit about correlation versus cause.`
          : `Fuse these ${blocks.length}: what are the most important connections and patterns across ${labels.map((l) => `"${l}"`).join(', ')}? Lead with the strongest insight, then note any correlations, trade-offs, or cause-and-effect you can support from the data.`;
      setLastAsk(`Fuse: ${labels.join(' × ')}`);
      setPinned([]);
      void turn.run(ask, undefined, blocks, undefined, undefined, `Fuse: ${labels.join(' × ')}`);
    },
    [turn],
  );

  // Toggle a block's pin from its on-canvas "ask about this" affordance, then pull focus to the
  // composer so the user can type or tap a quick chip without hunting for the input. Using it
  // also retires the coach hint.
  const togglePin = useCallback(
    (b: Block) => {
      if (!b.id) return;
      setPinned((cur) =>
        cur.some((p) => p.id === b.id) ? cur.filter((p) => p.id !== b.id) : [...cur, b],
      );
      setComposerFocus((n) => n + 1);
      dismissAskHint();
    },
    [dismissAskHint],
  );

  // One-tap follow-ups offered while elements are pinned — phrased for one vs. several selections.
  // They route straight through submit(), carrying the pinned blocks like any free-form ask.
  const pinnedChips =
    pinned.length > 1
      ? ['How do these relate?', 'Compare them', 'Summarize these']
      : ['Explain this', 'Why it matters', 'Go deeper'];

  // Whether the connected model can actually see a file. Images/PDFs only reach a
  // vision-capable provider as real parts; without it, attaching is disabled (the model
  // would only get a text note — surfaced honestly in the tooltip rather than silently).
  const visionCaps = getAdapter(cfg.provider).capabilities.vision;

  // Share-to-Mavéa: paste or drop a link / screenshot ANYWHERE on the surface and it becomes
  // a fact-check intake — a shared link prefills the claim-check ask; an image stages as an
  // attachment with the same ask. Text fields are left completely alone (normal paste).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (inTextField(e.target)) return;
      const items = e.clipboardData;
      if (!items) return;
      const files = [...items.files].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void onFiles(files);
        setValue(SCREENSHOT_CHECK_ASK);
        setComposerFocus((n) => n + 1);
        return;
      }
      const text = items.getData('text/plain');
      if (text && looksLikeShare(text)) {
        e.preventDefault();
        setValue(claimCheckAsk(sharedUrl(text)!));
        setComposerFocus((n) => n + 1);
      }
    };
    // Self-expiring: dragover fires continuously while a file hovers the window, so treat a gap
    // longer than a couple of frames as "left" rather than tracking dragenter/dragleave (which
    // fire per-element and are fiddly to get right across nested drop targets).
    let dragTimer: ReturnType<typeof setTimeout> | null = null;
    const onDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.some((t) => t === 'Files' || t === 'text/uri-list')) return;
      e.preventDefault();
      setDragActive(true);
      if (dragTimer) clearTimeout(dragTimer);
      dragTimer = setTimeout(() => setDragActive(false), 200);
    };
    const onDrop = (e: DragEvent): void => {
      setDragActive(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      if (inTextField(e.target)) {
        // Still prevent the browser's own default for a real file (opening it in the tab and
        // abandoning the session) even though the field itself is left alone otherwise.
        if (dt.files.length) e.preventDefault();
        return;
      }
      const allFiles = [...dt.files];
      const images = allFiles.filter((f) => f.type.startsWith('image/'));
      const docs = allFiles.filter((f) => !f.type.startsWith('image/'));
      const url = allFiles.length
        ? null
        : sharedUrl(dt.getData('text/uri-list') || dt.getData('text/plain') || '');
      if (!allFiles.length && !url) return;
      e.preventDefault();
      if (images.length) {
        void onFiles(images);
        setValue(SCREENSHOT_CHECK_ASK);
      } else if (docs.length) {
        // A dropped PDF/Office/data file attaches exactly like the paperclip pick — the attach
        // strip's own "Explode" button takes it from there (or onFiles surfaces why it can't).
        void onFiles(docs);
      } else if (url) {
        setValue(claimCheckAsk(url));
      }
      setComposerFocus((n) => n + 1);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      if (dragTimer) clearTimeout(dragTimer);
    };
  }, [onFiles]);

  // Present mode: hold the Focus stage while it lasts (the prior view returns on exit),
  // go fullscreen best-effort, and let Esc end the show. The mic stays however it was.
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  // Entering and leaving the show. The view to hand back is captured ONCE here rather than read at
  // cleanup, because by then the presented view is the current one — and it is captured in this
  // effect rather than the surface effect below so that switching surfaces mid-show cannot be
  // mistaken for an exit (which would drop fullscreen and remember the wrong view).
  const restoreViewRef = useRef<ViewMode>('everything');
  useEffect(() => {
    if (!presenting) return;
    restoreViewRef.current = viewModeRef.current;
    void document.documentElement.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPresenting(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      setViewMode(restoreViewRef.current);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [presenting, setViewMode]);

  // The deck covers the canvas, so it parks the answer in Focus underneath while it runs.
  useEffect(() => {
    if (!presenting) return;
    setViewMode('focus');
  }, [presenting, setViewMode]);

  // Frames born while presenting are questions from the room — remember which, so the
  // rail can say so.
  const prevFrameLen = useRef(0);
  useEffect(() => {
    const len = turn.frames.length;
    if (len > prevFrameLen.current && presentingRef.current) {
      const idx = len - 1;
      setRoomFrames((cur) => new Set(cur).add(idx));
    }
    prevFrameLen.current = len;
  }, [turn.frames.length]);

  // Voice input is local in every mode: Silero detects speech boundaries and whisper.cpp
  // transcribes the captured PCM. Tap/Hold stop after one utterance; Always on rearms.
  const voice = useVoiceController({
    mode: 'vad',
    onBargeIn: () => {
      // VAD detected the user speaking mid-playback — cut everything paced immediately so the
      // interruption feels instant: not just the TTS line, but the reveal walk it was pacing
      // (showAll flushes the walk — remaining pen marks land at once, spotlight releases — and
      // cancels the speech inside; outside a walk it's exactly the old cancel). A walk left
      // running would keep stepping spotlights over the user's own question.
      showAll();
      bargedInRef.current = true;
    },
    onResult: (r) => {
      const text = r.transcript.trim();
      // Captured before the ref is cleared below, so it survives to the submit() call at the
      // bottom of this handler — a real follow-up after a barge-in must force its way past the
      // interrupted turn's busy guard (that turn is aborted, not waited on) instead of being
      // silently dropped the way an ordinary submission would be while busy.
      const wasBargeIn = bargedInRef.current;

      if (r.lowConfidence && text) {
        bargedInRef.current = false;
        setHeard(null);
        setValue(text);
        setVoiceNotice(LOW_CONFIDENCE_VOICE_MSG);
        setComposerFocus((n) => n + 1);
        // Done thinking may have been pressed while this final transcript was resolving. Preserve
        // the uncertain words as a draft, but still honor the explicit completion action instead
        // of leaving Watch stuck open with a pending flag that can never bank this utterance.
        if (finishWatchPendingRef.current && watchThinkingRef.current) {
          finishWatchPendingRef.current = false;
          voiceRef.current?.stop();
          if (mindShapeRambleRef.current.length > 0) {
            settleWatchThinkingNow();
          } else {
            watchThinkingRef.current = false;
            setWatchThinking(false);
          }
        }
        return;
      }

      // Barge-in (always-on only): TTS was already cancelled by onBargeIn the moment the
      // VAD detected speech. Here we decide what to do with the transcript:
      // — filler / "keep going" → re-speak the narration from the top.
      // — real follow-up        → submit the new question.
      // Empty transcript (VAD heard noise but Whisper got nothing) → re-speak too.
      if (bargedInRef.current) {
        bargedInRef.current = false;
        const narration = narrationRef.current;
        if (!text || isContinuePhrase(text)) {
          if (narration) speak(narration);
          return;
        }
        // Real question — fall through and submit it below.
      }

      if (!text) return;
      setHeard(text);
      // "Watch Me Think": bank each completed utterance into the growing transcript and feed it to
      // the live map. Clear the partial so the interim effect doesn't re-append this same utterance
      // (it's now part of the ramble) and double-count it.
      if (watchThinkingRef.current) {
        mindShapeRambleRef.current = [...mindShapeRambleRef.current, text];
        setHeard(null);
        const ramble = mindShapeRambleRef.current.join(' ');
        mindShape.onTranscript(ramble);
        if (finishWatchPendingRef.current) {
          finishWatchPendingRef.current = false;
          settleWatchThinkingNow();
        }
        return;
      }
      // Think-out-loud: while "just listening", utterances bank into the ramble instead of
      // answering — until the wake phrase asks for the sort.
      if (justListenRef.current) {
        // This utterance is consumed here (banked, sorted, or ignored) — clear the partial, or the
        // composer stays swapped for the "heard" readout and the user can't type at all.
        setHeard(null);
        if (isThoughtsTrigger(text)) {
          setJustListen(false);
          const ramble = rambleRef.current;
          rambleRef.current = [];
          setRambleCount(0);
          if (ramble.length) {
            const minutes = Math.round((Date.now() - rambleStartRef.current) / 60_000);
            setLastAsk('Your thinking, sorted');
            void turn.run(
              sortAsk(ramble, minutes),
              undefined,
              undefined,
              undefined,
              undefined,
              'Your thinking, sorted',
            );
          }
        } else if (bankable(text)) {
          rambleRef.current = [...rambleRef.current, text];
          setRambleCount((c) => c + 1);
        }
        return;
      }
      // The Blank Space: while gathering, route the reply into the armed hole rather than starting
      // a new turn — unless it's clearly a new question (then it falls through and submits).
      if (
        routeBlankVoice(
          {
            phase: phaseRef.current,
            activeKey: activeBlankRef.current,
            blanks: blanksRef.current,
            fill: turn.fill,
          },
          text,
        )
      ) {
        // Same as the branches above: the words went into the hole, so the partial must go —
        // otherwise the composer input stays hidden behind the "heard" readout.
        setHeard(null);
        return;
      }
      // `busyRef` forces the same abort-and-restart path a barge-in takes: a turn that's still
      // generating (but not audibly speaking) would otherwise swallow this question outright.
      submit(text, wasBargeIn || busyRef.current);
    },
    onStateChange: (e) => {
      voicePhaseRef.current = e.phase;
      setVoicePhase(e.phase);
      setListening(e.phase === 'listening');
      // Only an event that CARRIES the provisional flag may change it: the mic emits plain
      // `listening` events for other reasons mid-utterance, and treating those as "speech
      // resumed" would flap the cue. Any other phase ends the guess outright.
      if (e.phase !== 'listening') setSpeechEnding(false);
      else if (e.speechEnding !== undefined) setSpeechEnding(e.speechEnding);
      // A barge-in whose utterance transcribed to nothing never reaches onResult (VadVoice drops an
      // empty result), which would leave bargedInRef stuck true and mis-route the NEXT real utterance
      // through the barge path (re-speaking stale narration or force-submitting). Clear it on idle —
      // onResult already cleared it first on a normal barge, so this is a harmless no-op there.
      if (e.phase === 'idle') bargedInRef.current = false;
      if (e.phase === 'listening') {
        // The mic is genuinely open — any earlier failure notice is stale.
        setVoiceNotice(null);
        // The user is talking again — cancel a pending settle so a mid-thought pause never resolves
        // the map out from under them.
        if (settleTimerRef.current !== null) {
          window.clearTimeout(settleTimerRef.current);
          settleTimerRef.current = null;
        }
      } else if (
        e.phase === 'idle' &&
        watchThinkingRef.current &&
        mindShapeRef.current.phase === 'listening'
      ) {
        if (finishWatchPendingRef.current) {
          finishWatchPendingRef.current = false;
          settleWatchThinkingNow();
          return;
        }
        // The VAD just ended an utterance (~1.6s of silence) while Watch Me Think is live. If the
        // quiet holds to eight seconds total, settle as a fallback. Done thinking below is the
        // deterministic path for loud rooms and users who do not want to wait.
        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null;
          voiceRef.current?.stop();
          settleWatchThinkingNow();
        }, SETTLE_SILENCE_MS);
      }
      // Surface controller errors that were previously invisible (the controller settles back
      // to idle, so without this the mic just… does nothing). 'no-speech' and 'aborted' are
      // normal turn endings, not failures — they stay quiet.
      if (e.error === 'not-allowed') setVoiceNotice(MIC_DENIED_MSG);
      else if (e.error === 'unsupported') setVoiceNotice(MIC_UNSUPPORTED_MSG);
      else if (e.error === 'audio') setVoiceNotice(MIC_AUDIO_MSG);
      else if (e.error === 'transcription') setVoiceNotice(MIC_TRANSCRIPTION_MSG);
    },
  });
  const sttOk = voice.capabilities.stt;
  voiceRef.current = voice;

  const finishWatchThinking = useCallback((): void => {
    if (!watchThinkingRef.current) return;
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (listening || voicePhaseRef.current === 'transcribing') {
      finishWatchPendingRef.current = true;
      // Done thinking pauses the Watch session after this utterance even if it borrowed Always on.
      // exitWatchThinking restores a genuine Always-on preference when the user leaves the map.
      if (listening) voice.start({ inCanvas: !!turn.spec, continuous: false });
      voice.forceStop();
      return;
    }
    voice.stop();
    if (mindShapeRambleRef.current.length === 0) {
      watchThinkingRef.current = false;
      setWatchThinking(false);
      return;
    }
    settleWatchThinkingNow();
  }, [listening, settleWatchThinkingNow, voice, turn.spec]);

  // Leave "Watch Me Think" back to the normal conversation: stop the mic and drop the live map
  // (the watchThinking effect below resets the mindshape + clears the ramble), so the answer
  // canvas underneath returns. Wired to a visible pill in the overlay and to the Escape key —
  // previously the only way out was a page refresh.
  const exitWatchThinking = useCallback((): void => {
    // Release the Watch capture now. The borrowed-mode restoration effect below re-arms a genuine
    // unpaused Always-on session, or returns a previously paused/Tap session to its exact state.
    if (listening) voice.stop();
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setHeard(null);
    finishWatchPendingRef.current = false;
    setWatchThinking(false);
  }, [listening, voice]);

  // Is a dismissable overlay layered ON TOP of the mindshape? A settled map's own "kept this shape"
  // panel can open Share or Present (or the user can hit the command palette) WITHOUT leaving Watch
  // Me Think, so the map stays "behind" them. Escape there must close only that overlay — never tear
  // down the curated map. The guard is the codebase's single notion of "an overlay is holding
  // attention", plus Present.
  const overlayLayered =
    presenting ||
    anyOverlayOpen({
      paletteOpen,
      shareOpen,
      exportOpen,
      dashOpen,
      showSettings,
      proofOpen,
      showHow,
      replayAt,
      recapOpen,
      atlasOpen,
      delegateOpen,
      srsOpen,
      zoomLevel,
      mindViewOpen: mindView.open,
    });

  // Esc leaves Watch Me Think — the overlay must never trap the user. The listener is fully
  // detached while another overlay is layered on top (above), so a single Escape can't both close
  // that overlay AND exit Watch Me Think (which would reset the kept map — data loss).
  useEffect(() => {
    if (!watchThinking || mindShape.phase === 'idle' || overlayLayered) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') exitWatchThinking();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [watchThinking, mindShape.phase, overlayLayered, exitWatchThinking]);

  // ---- Hold My Thought: catch what the user never finished saying. ----

  // Whisper mode: stamp the root so the quiet-hours palette applies, and speak at ember
  // volume. Both restore on the way out (leaving Live un-dims the demo).
  useEffect(() => {
    const root = document.documentElement;
    if (whisper) root.dataset.whisper = '';
    else delete root.dataset.whisper;
    setVoiceGain(whisper ? WHISPER_GAIN : 1);
    return () => {
      delete root.dataset.whisper;
      setVoiceGain(1);
    };
  }, [whisper]);

  // Entering just-listen mode stamps the ramble clock; leaving it clears any leftovers.
  useEffect(() => {
    if (justListen) {
      rambleStartRef.current = Date.now();
    } else {
      rambleRef.current = [];
      setRambleCount(0);
    }
  }, [justListen]);

  // Feed the full accumulated + in-progress transcript to the mindshape loop on every
  // interim update. mindShapeRambleRef holds completed utterances; `heard` is the current
  // partial utterance rolling in from the STT engine.
  useEffect(() => {
    if (watchThinking && listening && heard) {
      // Only the words that have fully landed — never the in-progress trailing word (STT still has
      // "India" as "Ind" mid-utterance), or the live map tags it as "IND". The completed utterances in
      // the ramble are already whole; the partial `heard` is the one that needs guarding.
      const partial = completeWordsOnly(heard);
      const full =
        mindShapeRambleRef.current.length > 0
          ? [...mindShapeRambleRef.current, partial].join(' ').trim()
          : partial;
      if (full) mindShape.onTranscript(full);
    }
  }, [heard, listening, watchThinking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving "Watch Me Think" mode: if there's accumulated content and the canvas hasn't
  // When watchThinking is turned off externally (e.g. "Just listen" toggle or action button),
  // cancel any in-flight mindshape work and clear the ramble buffer.
  useEffect(() => {
    if (!watchThinking) {
      mindShapeRambleRef.current = [];
      mindShape.reset();
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    }
  }, [watchThinking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Never leave a settle timer pending past unmount.
  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    },
    [],
  );

  // Track the echo gate to whether Mavéa is actually audible. `speak()` arms it before the audio
  // starts; this releases it the moment the line drains, so the user's next utterance is heard as
  // a question rather than as a barge-in. It runs in EVERY mic mode, not just always-on: Tap and
  // Hold arm the same gate, and leaving it armed made every later tap utterance take the barge
  // path — a filler word there re-spoke the whole previous answer. Driven by the TTS speaking
  // subscription rather than a 200ms poll, so no timer runs while the session is quiet.
  useEffect(() => {
    const sync = (): void => voice.setMaveaSpeaking(isSpeaking() && !mutedRef.current);
    sync();
    return subscribeSpeaking(sync);
  }, [voice]);

  // ---- always-on: keep the mic continuously open EXCEPT while you're typing. ----
  // Silero VAD detects turn boundaries internally and our echo gate (setMaveaSpeaking) drops Mavéa's
  // own TTS, so the mic stays live across the whole conversation rather than being stopped per turn.
  // The one time it must close is while the composer holds text — the VAD would otherwise capture
  // you talking-to-yourself mid-compose. Gating the effect on `composerHasText` is the single source
  // of truth for that handoff: start typing → the effect tears down and stops the mic; submit or
  // clear empties the composer → it re-runs and re-arms. That fixes the bug where typing once
  // permanently killed always-on listening, and it works BOTH directions (type→voice and voice→type)
  // including the Watch-Me-Think typed-thought path, which also clears the composer. (Earlier the
  // restart hinged on a turn status that never returned to 'idle', re-submitting Mavéa's own answer.)
  const composerHasText = value.trim().length > 0;
  useEffect(() => {
    if (!micShouldBeOpen({ alwaysOn: alwaysOn && !alwaysPaused, sttOk, composerHasText })) return;
    let cancelled = false;
    // Let the VAD/WASM settle, then open the mic once.
    const t = setTimeout(() => {
      if (!cancelled) void voice.start({ inCanvas: !!turn.spec, continuous: true });
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
      voice.stop();
    };
    // turn.spec is read once at start for the start context; we intentionally don't re-run on every
    // canvas change (that would needlessly restart the mic mid-conversation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alwaysOn, alwaysPaused, sttOk, voice, composerHasText]);

  // A backgrounded tab (or a sleeping device) can suspend VAD's own capture AudioContext without
  // ever telling us — nothing above reacts to that, so the mic could go quietly dead while the
  // UI still claims to be listening. Release it explicitly on hide and verify/restart on return.
  useAlwaysOnVisibility(
    { alwaysOn: alwaysOn && !alwaysPaused, sttOk, composerHasText, listening },
    {
      start: () => voice.start({ inCanvas: !!turn.spec, continuous: true }),
      stop: voice.stop,
    },
  );

  const onMic = useCallback(() => {
    if (!sttOk) {
      // The local capture path is unavailable.
      setVoiceNotice(MIC_UNSUPPORTED_MSG);
      setComposerFocus((n) => n + 1);
      return;
    }
    if (alwaysOn) {
      if (listening) {
        voice.forceStop();
      } else if (alwaysPaused) {
        setAlwaysPaused(false);
        showAll();
        voice.start({ inCanvas: !!turn.spec, continuous: true });
      } else if (voicePhaseRef.current === 'transcribing') {
        setAlwaysPaused(true);
        voice.forceStop();
      } else {
        setAlwaysPaused(true);
        voice.stop();
      }
    } else if (listening) {
      // A second tap is an explicit completion action, never a discard.
      voice.forceStop();
    } else {
      // Hush Mavéa before opening the mic — otherwise the recognizer can transcribe Mavéa's own
      // playback as if it were the user (a feedback loop), and the interruption doesn't feel real.
      showAll();
      voice.start({ inCanvas: !!turn.spec });
    }
  }, [sttOk, alwaysOn, alwaysPaused, listening, voice, turn.spec, showAll]);

  // Speak-then-show choreography: on EVERY turn the face comes to centre and speaks its opening
  // line for a short beat — "Mavéa appears and says a sentence," the way the scripted demo does —
  // then flies to the corner so the canvas takes the stage. This is what keeps the face and its
  // spoken words together (a centred caption under a centred face) instead of a corner orb talking
  // while the text sits off in the rail. A follow-up briefly re-centres to speak before the new
  // canvas reveals; the spotlight tour then narrates the rest from the corner as before.
  const [introHold, setIntroHold] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const clearHoldTimer = (): void => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
    if (turn.status === 'thinking') {
      // The turn is starting — centre the face for its opening line.
      setIntroHold(true);
      clearHoldTimer();
      return;
    }
    if (turn.status === 'idle') {
      setIntroHold(false);
      clearHoldTimer();
      return;
    }
    // Content on stage ends the hold NOW. Once anything is on the canvas — the prior answer on
    // a follow-up, or this turn's first streamed block — a centered face + scrim would dim real
    // cards mid-reveal, which reads as the answer being torn down and rebuilt (the reported
    // "shows the UIs, hides them, builds again" flash). The centered beat is for an EMPTY stage.
    if (introHold && turn.spec) {
      setIntroHold(false);
      clearHoldTimer();
      return;
    }
    // Once the opener starts (speaking, or showing if narration never streamed), hold the
    // centered face ~1.1s, then release it to the corner so the canvas can breathe.
    if (introHold && holdTimerRef.current === null) {
      holdTimerRef.current = window.setTimeout(() => {
        setIntroHold(false);
        holdTimerRef.current = null;
      }, 1100);
    }
  }, [turn.status, turn.spec, introHold]);
  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    },
    [],
  );
  // Occasional, event-driven asides — Mavéa stepping into the conversation on a real moment (a clip
  // shared, a fact remembered, a new topic). Zero model cost; only fires when the surface is at
  // rest and on a strict cadence. `interjecting` re-centres the face the same way the cold-open does.
  const interject = useInterjections({
    speak,
    cancelSpeak: cancelSpeech,
    isSpeaking,
    muted,
    turnCount: turn.frames.length,
    gates: {
      // Live settles at 'showing' (a finished turn), not 'idle' — so that's "at rest" here. The
      // hook still waits for speech to finish (so it won't cut across the spoken tour).
      atRest: turn.status === 'showing' || turn.status === 'idle',
      busy: turn.busy,
      listening,
      introHold,
      hasCanvas: !!turn.spec,
      modalOpen:
        paletteOpen ||
        shareOpen ||
        exportOpen ||
        dashOpen ||
        showSettings ||
        proofOpen ||
        showHow ||
        replayAt !== null ||
        recapOpen ||
        delegateOpen ||
        srsOpen ||
        atlasOpen ||
        prismDocs !== null ||
        synthesis !== null ||
        mindView.open ||
        zoomLevel !== null,
    },
  });
  const interjecting = interject.interjecting;

  // Presence mapping from the turn's status (+ live mic override + self-initiated asides), with the
  // answer's honest emotion so the face warms on good news / steadies on a caution (presence/expression).
  // The first unambiguously positive verdict of the session earns the full celebration — once.
  // After that, good news is the everyday happy face, so the moment keeps its weight.
  // Keyed to the answer's spec (not a boolean) so re-renders of the same answer keep
  // celebrating and only the *next* positive answer falls back to the everyday happy face.
  const celebratedRef = useRef<unknown>(null);
  const pres = useMemo(() => {
    let emotion = emotionForSpec(turn.spec);
    if (
      emotion === 'warm' &&
      celebrationWorthy(turn.spec) &&
      (celebratedRef.current === null || celebratedRef.current === turn.spec)
    ) {
      celebratedRef.current = turn.spec;
      emotion = 'celebrate';
    }
    return livePresence(turn.status, listening, interjecting, emotion, muted, transcribing);
  }, [turn.status, listening, interjecting, turn.spec, muted, transcribing]);
  const presenceStyle = useMemo(
    () =>
      automaticPresenceStyle({
        status: turn.status,
        listening,
        interjecting,
        spec: turn.viewSpec ?? turn.spec,
      }),
    [turn.status, listening, interjecting, turn.viewSpec, turn.spec],
  );
  useEffect(() => {
    applyPresenceStyle(document, presenceStyle);
    return () => clearPresenceStyle(document);
  }, [presenceStyle]);

  // Anchor the resting face to the brand: measure the brand-dot slot relative to the presence
  // layer's centre and store it as a transform delta the .corner rule reads, so it lands on the dot
  // in any layout / at any width. Re-measured on resize and right before the face docks.
  const measureHome = useCallback(() => {
    const app = appRef.current;
    // The resting face lives at the TOP of the surface — it docks onto the topbar's brand
    // dot and becomes the wordmark's mark, keeping the bottom dock purely a composer.
    const dot = brandDotRef.current;
    const layer = layerRef.current;
    if (!app || !dot || !layer) return;
    const d = dot.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    if (!d.width || !l.width) return;
    app.style.setProperty(
      '--home-x',
      `${Math.round(d.left + d.width / 2 - (l.left + l.width / 2))}px`,
    );
    app.style.setProperty(
      '--home-y',
      `${Math.round(d.top + d.height / 2 - (l.top + l.height / 2))}px`,
    );
    app.style.setProperty('--home-scale', ((Math.max(d.width, 12) * 1.3) / 150).toFixed(3));
  }, []);

  useLayoutEffect(() => {
    measureHome();
    window.addEventListener('resize', measureHome);
    return () => window.removeEventListener('resize', measureHome);
  }, [measureHome]);
  // Collapsing the rail shifts the whole stage — and the brand dot the resting face docks onto —
  // so the measured home offset must be recomputed (synchronously, before paint) or the face lands
  // off the wordmark. The brand dot and the layer are not centred the same way, so the delta changes.
  useLayoutEffect(() => {
    measureHome();
  }, [railCollapsed, measureHome]);

  const settled = !!turn.spec && !(introHold || interjecting);
  const inCorner = settled;
  // The output capsule (status strip + composer) stays mounted for the WHOLE conversation, not just
  // while an answer is on screen. A fresh ask briefly clears turn.spec AND raises introHold (the
  // centred-face opener beat) for ~1.1s; gating the dock on either made it collapse to the plain
  // intro pill and then jump taller when the reply spoke. Keyed purely on conversationStarted, the
  // dock height holds steady from the first ask onward — only the pristine intro (before any
  // question) shows the plain pill.
  const dockCapsule = conversationStarted;
  // A deliberate centre-stage moment: the first turn in flight (nothing on screen yet), the
  // cold-open hold, or an aside. The face takes the middle of the screen — conversation-size,
  // scrim behind, the streamed words right beneath it via .center-caption — instead of the
  // top-pinned idlehome perch, which left the face and its own words half a screen apart.
  const centerStage = conversationStarted && (!turn.spec || introHold || interjecting);
  // Show the setup wizard when no canvas exists and the user hasn't started talking yet.
  const inWizard = !turn.spec && !conversationStarted;

  // Morning brief: an OPT-IN proactive greeting on the first open of the day. It used to fire for
  // everyone, but as the first turn of a conversation it read as a confusing "Morning brief" that
  // bled into the session the user actually started, so it's now off unless `cfg.morningBrief` is on.
  // Still skipped on a restored session (the user is continuing, not starting fresh).
  useEffect(() => {
    if (!cfg.morningBrief || briefFired || inWizard || turn.busy || turn.restored) return;
    // Through the store's guarded read, not a bare localStorage touch: where storage is walled off
    // (private mode, an embedded frame) the ACCESS itself throws, and a throw from an effect body
    // takes the whole Live surface to the error boundary over a greeting nobody asked for.
    if (!briefNeeded(hasSavedSession())) return;
    markBriefShown();
    setBriefFired(true);
    const topics = turn.frames
      .slice(-3)
      .map((f) => f.question)
      .filter(Boolean);
    void turn.run(
      buildBriefPrompt(topics),
      undefined,
      undefined,
      undefined,
      undefined,
      'Morning brief',
    );
  }, [cfg.morningBrief, inWizard, briefFired, turn.busy, turn.restored]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a canvas arrives (home → canvas transition), snap --scroll-dock back to 0 so the
  // brand-dot and orb restore instantly, and re-measure the dock target before the fly.
  useEffect(() => {
    if (inCorner && appRef.current) {
      appRef.current.style.setProperty('--scroll-dock', '0');
      measureHome();
    }
  }, [inCorner, measureHome]);
  // The narration already appears in the transcript, so we don't echo it as a floating bubble.
  // A centred line is only surfaced when the face is at centre with nowhere else to read it: the
  // cold-open opener, and a self-initiated aside (an interjection is never in the transcript).
  const caption = interjecting ? interject.line : turn.narration;
  const showCaption =
    !inCorner &&
    !!caption &&
    (interjecting || turn.status === 'speaking' || turn.status === 'showing');
  // A soft focus glow behind the face ONLY while it is actively SPEAKING a centered line (the
  // cold-open opener or an aside). Keying on `speaking` — not merely "not idle" — means a turn that
  // is still thinking, or one that hangs or fails (e.g. a keep-fresh refresh fired on tab-return
  // with no model budget), NEVER dims the screen: the glow appears only for the brief, deliberate
  // moment Mavéa is talking, then clears with the voice. `centerStage` keeps it off the home hub and
  // off a docked-face canvas.
  const showScrim = centerStage && turn.status === 'speaking';

  // Saving a fact is shown, never SPOKEN — the quiet "Memory updated" pill (TurnActivityChips)
  // is the whole signal, so a routine save never interrupts the conversation with a voice line.

  // Session threading: embed each turn once (question + narration + title) with the already-warmed
  // on-device embedder so the rail groups by MEANING, not shared words — "renting a car" stays with
  // "planning a trip," a real pivot to "diabetes" opens a new chapter. Vectors are cached by frame.at,
  // pruned to the live frames (the map can't grow across a long session), and every path is fail-open:
  // embedText resolves null instantly on a cold/slow/weak device, so grouping falls back to today's
  // mode boundary. Never blocks a turn and never writes to the reducer. A turn that couldn't embed yet
  // (embedder still warming) stays "missing" and is retried when the next turn changes `frames`.
  const threadVectorsRef = useRef<Map<number, Float32Array>>(new Map());
  const [threadVecVersion, setThreadVecVersion] = useState(0);
  useEffect(() => {
    const cache = threadVectorsRef.current;
    const liveAts = new Set(turn.frames.map((f) => f.at));
    let changed = false;
    for (const at of [...cache.keys()]) {
      if (!liveAts.has(at)) {
        cache.delete(at);
        changed = true;
      }
    }
    const missing = turn.frames.filter((f) => !cache.has(f.at));
    let cancelled = false;
    void (async () => {
      for (const f of missing) {
        const vec = await embedText(`${f.question} ${f.narration} ${f.spec?.title ?? ''}`.trim());
        if (cancelled) return;
        if (vec) {
          cache.set(f.at, vec);
          changed = true;
        }
      }
      if (changed) setThreadVecVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [turn.frames]);

  // Time-native navigation: fold the frames into chapters/moments for the scrubber + Overview.
  // `currentIndex` is the frame on screen (a jumped-to past moment, or the live head). Viewing the
  // live head (or none) is "live"; an earlier frame disables Ask and shows a return affordance.
  const chapters = useMemo(() => {
    void threadVecVersion; // bumps when the vector cache changes → re-derive with the fresh vectors
    return deriveChapters(
      turn.frames,
      turn.frames.map((f) => threadVectorsRef.current.get(f.at) ?? null),
    );
  }, [turn.frames, threadVecVersion]);
  const liveIndex = turn.frames.length - 1;
  const currentIndex = turn.viewIndex ?? liveIndex;
  // A composed-thread view ("See this thread together") overrides the canvas without touching frames.
  // While it's up, the surface is NOT live — Ask affordances hide and a "Return to live" cue shows.
  const previewing = turn.viewOverride != null;
  const viewingLive = !previewing && (turn.viewIndex == null || turn.viewIndex === liveIndex);
  // The chapter behind the CURRENT composed-thread view, recovered from composeThread's own
  // "thread-<chapter id>" spec id — `currentChapter` below can't be reused here because it keys
  // off `currentIndex`, which composeThread deliberately clears (viewIndex: null) while previewing.
  // Drives the export modal's pre-selection: opening Share right after "See this thread together"
  // should pick up exactly the thread that was just composed, not just the single latest answer.
  const previewedChapter = turn.viewOverride
    ? chapters.find((ch) => turn.viewOverride?.id === 'thread-' + ch.id)
    : undefined;
  // The thread the on-screen moment belongs to — drives the hero tint (so hero and rail read as one
  // thread) and the answer footer's "See all N moments" chip (compose the whole thread). Both are
  // gated on a session actually having ≥2 threads, so a focused single-topic session looks unchanged.
  const currentChapter = chapters.find((ch) =>
    ch.moments.some((m) => m.frameIndex === currentIndex),
  );
  const heroTint = chapters.length >= 2 ? currentChapter?.color : undefined;
  // The "New topic" sweep fires once when the LIVE head genuinely pivots: it opens a new thread (it's
  // the sole moment of the last chapter, and there's a prior chapter), its vector has resolved (so the
  // split is the semantic decision, never a late flash from the fail-open path), and the canvas itself
  // replaced (mode 'replace') so the shimmer never contradicts a canvas that kept its blocks.
  const headFrame = turn.frames[liveIndex];
  const lastChapter = chapters[chapters.length - 1];
  const headOpensNewThread =
    chapters.length >= 2 &&
    lastChapter?.moments.length === 1 &&
    lastChapter.moments[0].frameIndex === liveIndex;
  const topicPivot =
    viewingLive &&
    !turn.busy &&
    headOpensNewThread &&
    headFrame?.mode === 'replace' &&
    !!headFrame &&
    threadVectorsRef.current.has(headFrame.at);
  const [topicSweepKey, setTopicSweepKey] = useState<number | null>(null);
  const lastSweptIndexRef = useRef(-1);
  useEffect(() => {
    if (topicPivot && lastSweptIndexRef.current !== liveIndex) {
      lastSweptIndexRef.current = liveIndex;
      setTopicSweepKey(liveIndex);
    }
  }, [topicPivot, liveIndex]);
  // "See this thread together": fold a chapter's turns into one canvas as a non-destructive view.
  // Composes the chapter's frames' blocks (deduped + capped) and shows them via previewSpec; the
  // "Return to live" cue clears it. Frames/history are never touched.
  const onSeeTogether = useCallback(
    (ch: Chapter) => {
      const frames = ch.moments
        .map((m) => turn.frames[m.frameIndex])
        .filter((f): f is (typeof turn.frames)[number] => !!f);
      const spec = composeThread(frames, {
        title: ch.title,
        tint: ch.color,
        id: 'thread-' + ch.id,
      });
      if (spec) {
        turn.previewSpec(spec);
        scrollRef.current?.scrollTo({ top: 0 });
      }
    },
    [turn],
  );
  // Related follow-up questions for the current answer, shown as the "Continue exploring" section
  // at the end of the canvas. Hidden while viewing a past moment or when blocks are pinned (the
  // pin dock shows its own quick follow-ups above the composer instead).
  const followups =
    viewingLive && pinned.length === 0 ? ((turn.viewSpec ?? turn.spec)?.suggests ?? []) : [];
  // The answer hero above the canvas: the moment's ask + spoken line (the display twin), with
  // provenance. A jumped-to frame shows ITS moment; the live head shows the streaming line.
  const shownSpec = turn.viewSpec ?? turn.spec;
  // A composed-thread view has no single ask/spoken line — its hero is the thread's title, so the
  // board reads as "the whole trip thread" rather than echoing one turn's question.
  const hero: HeroContent | null = previewing
    ? shownSpec
      ? { question: null, narration: shownSpec.title || 'This thread' }
      : null
    : heroSource({
        spec: shownSpec,
        frames: turn.frames,
        viewIndex: turn.viewIndex,
        narration: turn.narration,
        lastAsk,
      });
  const heroInferred = useMemo(() => inferredClaims(shownSpec), [shownSpec]);
  // Measured time-to-first-word for the topbar's model pill (never a vanity number).
  const latencyLabel = formatLatency(useTurnLatency(turn.status));
  // The working state's labeled skeletons: before anything streams, a plan derived from the
  // ask itself; once blocks stream (status 'showing' while still busy), one trailing card
  // labeled with the REAL type of the block being built. Never an unlabeled spinner.
  const skeletonCards = useMemo(() => {
    if (!turn.busy) return [];
    if (turn.status === 'showing') return [pendingCard(turn.pendingShape)];
    return skeletonPlan(lastAsk ?? '', turn.history);
  }, [turn.busy, turn.status, turn.pendingShape, lastAsk, turn.history]);
  // The speaking state: the voice is audibly playing, and the line it's reading. Tour stops
  // update spokenNow as they fire; the opener falls back to the turn's narration.
  const speakingNow = useSpeaking();
  // The per-stop synthesis window (queued, not yet audible, longer than the anti-flash beat) —
  // the voice strip must call this "Preparing", never a pulsing "Speaking" over silence.
  const voicePreparing = useVoicePreparing();
  const turnAudioVersion = useSyncExternalStore(
    subscribeTurnAudio,
    getTurnAudioVersion,
    getTurnAudioVersion,
  );
  const [spokenNow, setSpokenNow] = useState<string | null>(null);
  useEffect(() => setSpokenNow(null), [turn.turn]);
  useEffect(() => setNoteGutterTurn(false), [turn.turn]);
  // The voice-strip's status pill switches orb/label between "Speaking" and idle. The signal is
  // event-driven (the speech queue publishes it), but it genuinely drops between lines — a tour's
  // stop-to-stop gap reads as not-speaking — so this sticky flag holds the "Speaking" state
  // through a short gap and the orb doesn't flicker to idle and back between lines. (Same 600ms
  // linger the old floating SpeakingDock used.)
  // The linger lives OUTSIDE React (turnstate/useSpeaking), like the preparing hold beside it: the
  // raw signal flips twice per spoken line, and holding it in component state re-rendered this
  // file — the largest in the app — on every flip the held value never reflected. Muting drops the
  // pill at once rather than lingering, because muted means there is no voice to hold on for.
  const speakingSticky = useSpeakingHeld() && !muted;
  // Mute ENDS a running walk: the reader asked for the written answer instead of a paced one, so
  // the spotlight releases and the remaining pen marks land at once (flushWalkRef is set by the
  // walk effect while it runs). Outside a walk this does nothing — mute stays a pure output-gain
  // flip everywhere else in this file.
  useEffect(() => {
    if (muted) flushWalkRef.current?.();
  }, [muted]);
  const [overviewOpen, setOverviewOpen] = useState(false);
  useEffect(() => setOverviewOpen(false), [turn.turn]);
  // The session recap — derived purely from the frames/chapters on hand, openable once
  // there's more than a single moment to fold.
  useEffect(() => setRecapOpen(false), [turn.turn]);
  const recapModel = useMemo(() => buildRecap(turn.frames, chapters), [turn.frames, chapters]);
  // How many cards a study session would serve right now — 0 unless the user chose spaced study,
  // so the badge and its blurb simply don't exist for someone keeping a plain pile of cards.
  const srsDue = useStudyableCount();
  const studyStyle = useStudyStyle();

  // ── Feature discovery: ⌘K palette + topbar menu, both from one action map ─────
  // The ⌘K/Ctrl-K hotkey + open/close helpers now live in useCommandPalette (above), shared with
  // the landing — so the toggle isn't hand-rolled twice.
  // Play a feature's key-free mini-demo from the palette's "Watch". Already in tour mode (the tour's
  // own palette chapter) → jump to it in-session; otherwise reload into a solo tour chapter — the
  // proven replayTour idiom. Confirm-free is safe: tour mode never persists, and the real session is
  // saved per turn and resumes on exit. Never reload out from under an answer that's still streaming.
  const playFeatureDemo = useCallback(
    (chapterId: string) => {
      if (tourMode.current) {
        tourDriveRef.current.playExtra(chapterId);
        return;
      }
      if (turn.busy) return;
      launchSoloChapter(chapterId);
    },
    [turn.busy],
  );
  // Land the user straight in a listening surface from a cold start — flip always-on (its effect
  // starts the mic) and arm the chosen mode. If the browser can't do speech, say so instead.
  // alwaysOnBeforeListenRef remembers what the user's real Tap/Always-on preference was before we
  // borrowed it, so leaving the listening surface (below) restores that instead of leaving a Tap
  // user's mic silently on forever — this is a persisted setting (ALWAYS_ON_STORAGE_KEY), not
  // session-local, so an unrestored flip would outlive the tab.
  const enterListening = useCallback(
    (mode: 'think' | 'listen') => {
      if (!sttOk) {
        setVoiceNotice(MIC_UNSUPPORTED_MSG);
        return;
      }
      showAll();
      if (alwaysOnBeforeListenRef.current === null) {
        alwaysOnBeforeListenRef.current = { enabled: alwaysOn, paused: alwaysPaused };
      }
      setAlwaysPaused(false);
      setAlwaysOn(true);
      if (mode === 'think') {
        setJustListen(false);
        justListenRef.current = false;
        setWatchThinking(true);
        watchThinkingRef.current = true;
      } else {
        setWatchThinking(false);
        watchThinkingRef.current = false;
        setJustListen(true);
        justListenRef.current = true;
      }
    },
    [sttOk, alwaysOn, alwaysPaused, showAll],
  );
  // Once both borrowed listening surfaces are closed, put the mic back exactly how it was found.
  // Re-arm explicitly: a genuine Always-on preference remains `true` throughout Watch, so merely
  // setting the same React state again would not rerun the ordinary mic-gate effect.
  useEffect(() => {
    if (watchThinking || justListen) return;
    const before = alwaysOnBeforeListenRef.current;
    if (before === null) return;
    alwaysOnBeforeListenRef.current = null;
    // A listening surface entered from the hub is a BORROW — and if it produced nothing (no answer,
    // nothing generating), the session never really started. Hand the hub back rather than leaving
    // the reader on the stage meant for a turn in flight, which with no turn draws nothing at all:
    // neither hub nor answer, and missing the menus that key off having one. Only this path resets
    // it, so pressing "Start talking" — a deliberate move to the live surface — still stays there.
    if (!turn.spec && !turn.busy) setConversationStarted(false);
    setAlwaysPaused(before.paused);
    setAlwaysOn(before.enabled);
    if (before.enabled && !before.paused && sttOk && !value.trim()) {
      voice.start({ inCanvas: !!turn.spec, continuous: true });
    } else {
      voice.stop();
    }
  }, [watchThinking, justListen, sttOk, value, voice, turn.spec, turn.busy]);

  // ── The living answer, as a VIEW ────────────────────────────────────────────────────────────
  // 'world' is a view of the current answer, peer to Focus and the spatial Canvas and driven by the
  // same view-mode store — so the header switcher, the palette and the world card all arrive
  // through one door. The card lives in the block registry, which knows nothing about live/, so its
  // request comes through the openWorld module registry rather than a prop chain.
  //
  // Entering is ALSO where the world gets built: a turn only OFFERS one (that costs nothing), and
  // the single model call behind it runs here, on the reader's explicit intent — see
  // useLiveTurn.generateWorld. Once built it is written back onto the card, so a second entry, a
  // scroll-back and a replay all render it for free.
  const [worldPick, setWorldPick] = useState<string | null>(null);
  const [worldFailed, setWorldFailed] = useState(false);
  const [worldAttempt, setWorldAttempt] = useState(0);
  // Resolved against the canvas being LOOKED AT every render: a turn that evolves the world keeps
  // the view open on the updated spec, and a turn that replaces the canvas leaves nothing to show —
  // which is what sends the reader back out below, rather than leaving a stale world on screen.
  //
  // `viewSpec`, not the live head: an answer a reader has scrolled back to carries its own world,
  // and reading the newest canvas instead meant only ever the LATEST answer offered one — every
  // earlier world in the session became unreachable the moment the next question was asked.
  const worldBlocks = useMemo(() => {
    const onCanvas = ((turn.viewSpec ?? turn.spec)?.blocks ?? []).filter(
      (b): b is Extract<Block, { type: 'world' }> => b.type === 'world',
    );
    // The reader's own world always wins; the seeded one only stands in when there is none.
    if (onCanvas.length > 0) return onCanvas;
    return seededWorld ? [seededWorld] : [];
  }, [turn.viewSpec, turn.spec, seededWorld]);
  // The world the view shows: the one whose card was tapped, else this answer's own. A pick that no
  // longer resolves simply falls back, so a renumbered canvas needs no reset of its own.
  const worldBlock = useMemo(
    () => worldBlocks.find((b) => b.id === worldPick) ?? worldBlocks[0],
    [worldBlocks, worldPick],
  );
  worldBlocksRef.current = worldBlocks;
  const worldOffered = worldBlock !== undefined;
  const inWorldView = viewMode === 'world' && worldOffered;
  const enterWorld = useCallback(
    (blockId?: string) => {
      if (blockId) setWorldPick(blockId);
      setWorldFailed(false);
      setViewMode('world');
    },
    [setViewMode],
  );
  // Back to the reader's OWN standing choice, never a blind 'everything' — a Focus reader who looks
  // at a world must land back in Focus.
  enterWorldRef.current = enterWorld;
  const leaveWorldView = useCallback(() => setViewMode(savedViewMode()), [setViewMode]);
  useEffect(() => registerWorldOpener(enterWorld), [enterWorld]);
  // A view mode with nothing to show is a blank screen. This is the one fallback that covers both
  // ways in: a canvas that moved on under an open world, and a 'world' mode arriving from anywhere
  // it was never meant to survive.
  useEffect(() => {
    if (viewMode === 'world' && !worldOffered) leaveWorldView();
  }, [viewMode, worldOffered, leaveWorldView]);
  // The build itself: only for a card that is still an offer, and once per entry (generateWorld is
  // identity-stable, and re-entering a built card returns what the card already carries).
  const openWorldId = inWorldView ? (worldBlock.id ?? null) : null;
  const worldUnbuilt = inWorldView && worldBlock.props.world === undefined;
  const { generateWorld } = turn;
  useEffect(() => {
    if (!openWorldId || !worldUnbuilt) return;
    let live = true;
    setWorldFailed(false);
    void generateWorld(openWorldId).then((world) => {
      if (live && !world) setWorldFailed(true);
    });
    return () => {
      live = false;
    };
  }, [openWorldId, worldUnbuilt, worldAttempt, generateWorld]);
  // Breaking one cause down, bound to the card the reader has open. Identity-stable off the block
  // id: the overlay hands this to the memoized stage, so a callback that changed every render
  // would re-render every card on the world on every camera frame.
  const { expandWorld } = turn;
  const expandWorldNode = useCallback(
    (nodeId: string, showing: WorldSpec) =>
      openWorldId ? expandWorld(openWorldId, nodeId, showing) : Promise.resolve(null),
    [openWorldId, expandWorld],
  );

  // The registry resolved to live actions + availability. One map so the palette and the menu
  // can never disagree about what exists. Behavioral/automatic features (whisper, ghost, focus)
  // teach via a soft notice rather than forcing a manual trigger.
  const featureActions: Record<
    string,
    { available: boolean; reason?: string; run: () => void; preload?: () => Promise<void> }
  > = {
    atlas: {
      available: atlasCount > 0,
      reason: 'Fills in as you discuss things',
      run: () => setAtlasOpen(true),
      preload: atlasViewLoad.preload,
    },
    'pdf-world': {
      available: attached.some(isExplodable),
      reason: 'Attach a PDF, Office doc, or data file (CSV, text, JSON) to split it into a map',
      run: () => {
        // Explode every attached document together — a few compare in Prism, a pile fuses into the
        // Synthesis World (openExplode routes by count).
        const docs = attached.filter(isExplodable);
        if (docs.length > 0) {
          openExplode(docs);
          return;
        }
        // Invoked from the palette / Explore menu with nothing to split yet: don't no-op. Point the
        // user at the paperclip — focus the composer, pulse the attach button, and surface the hint
        // in the attach strip (it shows on a non-null attachError even with no files attached).
        setComposerFocus((n) => n + 1);
        setAttachPulse((n) => n + 1);
        setAttachError(
          'Attach a PDF, Office doc, or data file (CSV, text, JSON) to split it into a map of claims.',
        );
      },
      preload: prismOverlayLoad.preload,
    },
    synthesis: {
      available: true,
      // The explicit-intent version of the attach-strip's own Synthesis button: fuse the attached
      // pile if there are ≥2, else open the upload-first standalone surface so it's never a no-op.
      run: () => {
        const docs = attached.filter(isExplodable);
        if (docs.length >= 2) setSynthesis(docs);
        else window.location.hash = '#/synthesis';
      },
      preload: () =>
        attached.filter(isExplodable).length >= 2
          ? synthesisOverlayLoad.preload()
          : warmRoute('#/synthesis'),
    },
    ripple: {
      available: true,
      // Opens the worked-example change today; a connected repo / pasted diff will take precedence
      // once real ingestion lands. Never a no-op — there's always the example to explore.
      run: () => setRipple(SEED_SHIP),
      preload: rippleOverlayLoad.preload,
    },
    review: { available: true, run: () => setSrsOpen(true), preload: srsReviewLoad.preload },
    flashcards: {
      available: true,
      run: () => {
        window.location.hash = '#/flashcards';
      },
      preload: () => warmRoute('#/flashcards'),
    },
    courses: {
      available: true,
      run: () => {
        window.location.hash = '#/courses';
      },
      preload: () => warmRoute('#/courses'),
    },
    dashboards: {
      available: true,
      run: () => {
        window.location.hash = '#/dashboards';
      },
      preload: () => warmRoute('#/dashboards'),
    },
    gallery: {
      available: true,
      run: () => {
        window.location.hash = '#/gallery';
      },
      preload: () => warmRoute('#/gallery'),
    },
    recap: {
      available: !!recapModel,
      reason: "Once we've covered something",
      run: () => setRecapOpen(true),
      preload: recapLoad.preload,
    },
    present: {
      available: !!turn.spec,
      reason: 'Once there is an answer',
      run: () => openPresentation(),
      preload: presentationDeckLoad.preload,
    },
    track: {
      available: !!turn.spec,
      reason: 'Once there is a conversation to track',
      run: () => setDashOpen(true),
      preload: extractionPreviewLoad.preload,
    },
    share: {
      available: turn.frames.length > 0,
      reason: 'Once there is something to share',
      // Video Studio is distinct from document export: Conversation is the default and Reel remains
      // its editorial sibling inside the same lazy surface.
      run: () => setShareOpen(true),
      preload: shareModalLoad.preload,
    },
    export: {
      available: turn.frames.length > 0,
      reason: 'Once there is an answer to export',
      run: () => setExportOpen(true),
      preload: exportModalLoad.preload,
    },
    study: {
      available: !!turn.spec,
      reason: 'Once there is an answer',
      run: () => setViewMode('study'),
    },
    focus: {
      available: !!turn.spec,
      reason: 'Once there is an answer',
      // Actually enter focus mode — a palette entry should DO the thing, not narrate where it is.
      run: () => setViewMode('focus'),
    },
    board: {
      available: !!turn.spec,
      reason: 'Once there is an answer',
      // Spread the current answer's cards onto the spatial board — the same mode the footer chip and
      // the tour's canvas chapter show.
      run: () => setViewMode('canvas'),
    },
    'living-answer': {
      available: worldOffered,
      reason: 'Once an answer has causes to trace',
      // The same door the header chip and the world card use — entering is also what builds it.
      run: () => enterWorld(),
      preload: worldOverlayLoad.preload,
    },
    ink: {
      available: !!turn.spec,
      reason: 'Once there is an answer to mark',
      run: () => setInkArmed(true),
    },
    blanks: {
      available: true,
      // "The Blank Space" is model-authored mid-answer — there's nothing to trigger on demand, so the
      // honest action is a soft explainer (never a button that visibly does nothing).
      run: () =>
        setVoiceNotice(
          'When a number in an answer is truly yours to give, Mavéa leaves a glowing hole for it — type, say, or drop a card in, and it finishes the answer around your value.',
        ),
    },
    'watch-me-think': {
      available: sttOk,
      reason: sttOk ? undefined : MIC_UNSUPPORTED_MSG,
      run: () => enterListening('think'),
    },
    'just-listen': {
      available: sttOk,
      reason: sttOk ? undefined : MIC_UNSUPPORTED_MSG,
      run: () => enterListening('listen'),
    },
    whisper: {
      available: true,
      // Whisper is automatic (it softens the voice during quiet hours), so the useful action is
      // to open the setting that controls it — Quiet hours, under You → More options — not to
      // narrate at the user. Land directly on that tab/section rather than wherever Settings was
      // last left open, so the click actually goes somewhere connected to what it promised.
      run: () => {
        setSettingsTab('you');
        setShowAdvancedYou(true);
        setShowSettings(true);
      },
      preload: liveSettingsLoad.preload,
    },
    ghost: {
      available: sttOk && cfg.quality !== 'fast',
      // Ghost drafts surface during Just Listen — entering that mode is how you actually use it.
      // But they're gated off on the 'fast' quality dial (speculation is a spend the user opted
      // out of), so clicking this on Fast would silently behave exactly like Just Listen with no
      // explanation. Surface that instead of pretending the click did something distinct.
      reason: !sttOk
        ? MIC_UNSUPPORTED_MSG
        : cfg.quality === 'fast'
          ? "Needs Balanced quality or higher — you're on Fast"
          : undefined,
      run: () => enterListening('listen'),
    },
    delegate: {
      available: true,
      run: () => setDelegateOpen(true),
      preload: delegatePanelLoad.preload,
    },
    memory: {
      available: true,
      // Memory is a thing you inspect, not a thing you trigger: land on the You tab, where the
      // concepts list and the forget/export controls live.
      run: () => {
        setSettingsTab('you');
        setShowSettings(true);
      },
      preload: liveSettingsLoad.preload,
    },
    library: {
      available: libraryEntries.length > 0,
      reason: 'Fills in as you save conversations',
      run: () => setPastOpen(true),
      preload: libraryOverlayLoad.preload,
    },
    deepzoom: {
      available: true,
      // Carry the current question across as a SEED, not an auto-run: Deep Zoom opens with the
      // topic pre-filled so the reader chooses to telescope it OR ask about something else, rather
      // than silently zooming whatever they last asked about.
      run: () => {
        const q = lastAsk ?? '';
        window.location.hash = q ? `#/deepzoom?seed=${encodeURIComponent(q)}` : '#/deepzoom';
      },
      preload: () => warmRoute('#/deepzoom'),
    },
    'zoom-deck': {
      available: !!recapModel,
      reason: 'Opens once there are a few answers to pull back from',
      run: () => setZoomLevel('chapters'),
      preload: zoomDeckLoad.preload,
    },
    'morning-brief': {
      available: true,
      // Automatic when it's on, so the useful action is the switch that controls it (You → More
      // options), the same way Whisper resolves to its own setting.
      run: () => {
        setSettingsTab('you');
        setShowAdvancedYou(true);
        setShowSettings(true);
      },
      preload: liveSettingsLoad.preload,
    },
    settings: {
      available: true,
      run: () => {
        setSettingsTab(undefined);
        setShowSettings(true);
      },
      preload: liveSettingsLoad.preload,
    },
    how: { available: true, run: () => setShowHow(true), preload: howItWorksLoad.preload },
  };
  // Expose the latest actions to the tour's generic showcase op (see featureActionsRef above).
  featureActionsRef.current = featureActions;

  const paletteItems: PaletteItem[] = FEATURES.filter((f) => f.surface !== 'demo').map((f) => {
    const a = featureActions[f.id] ?? { available: true, run: () => undefined };
    // A feature that names a walkthrough chapter gets a "See how" mini-demo on its row. "How Mavéa
    // works" IS the full tour, so its "See how" replays the whole thing rather than one chapter.
    const watch =
      f.id === 'how'
        ? replayTour
        : f.tourChapter
          ? () => playFeatureDemo(f.tourChapter as string)
          : undefined;
    return {
      feature: f,
      available: a.available,
      reason: a.reason,
      run: a.run,
      preload: a.preload,
      watch,
    };
  });

  // Leaving the wizard for the conversation surface. `conversationStarted` is what swaps the
  // stage and un-hides the dock, so an action that lands the reader in a listening mode or an
  // overlay has to flip it FIRST — otherwise the mic arms behind a wizard that is still up.
  const leaveWizard = useCallback(() => setConversationStarted(true), []);
  // The Go hub's own file picker: the wizard hides the composer's paperclip, so the Prism card
  // opens this instead. Staging a document is what makes Prism available in the first place.
  const wizardFileRef = useRef<HTMLInputElement>(null);

  // The Go hub's "ways to begin". Built from paletteItems so availability, the "why not yet"
  // reason and the preload are the SAME resolution the ⌘K palette uses — the registry is meant to
  // be the one place a capability is declared, and a second hand-written list here would undo
  // that. Actions that need the live surface run through `leaveWizard`, because the wizard is
  // still on screen at this point and several of them (the listening modes especially) would
  // otherwise arm into a dock that CSS is hiding.
  const startWithItems: StartWithItem[] = START_WITH_IDS.map((id) =>
    paletteItems.find((it) => it.feature.id === id),
  )
    .filter((it): it is PaletteItem => !!it)
    .map((it) => {
      // Prism before anything is staged. Its palette action points at the paperclip — the exact
      // control the wizard hides — so here the card opens a file picker itself. That makes it
      // genuinely AVAILABLE (clicking always does something), and it has to say so: rendered as
      // unavailable it read as an instruction with no way to follow it, which is precisely how
      // "how do I attach a document on a new conversation?" happens.
      if (it.feature.id === 'pdf-world') {
        // Nothing staged: the card IS the picker, since its palette action points at the paperclip
        // — the one control the wizard hides. Something staged: it names that document and opens
        // it. See prismRow for why the naming is the fix, not a flourish.
        const staged = attached.filter(isExplodable);
        const row = prismRow(staged);
        return {
          feature: it.feature,
          available: true,
          blurb: row.blurb,
          preload: it.preload,
          run: row.opensPicker ? () => wizardFileRef.current?.click() : () => openExplode(staged),
        };
      }
      return {
        feature: it.feature,
        available: it.available,
        reason: it.reason,
        preload: it.preload,
        run: () => {
          // Only the listening modes need the wizard out of the way — see NEEDS_LIVE_SURFACE.
          if (NEEDS_LIVE_SURFACE.has(it.feature.id)) leaveWizard();
          it.run();
        },
      };
    });

  // The topbar's feature menus, grouped by intent. Each is a stable category; an item only
  // appears once it's actionable in the current context (a contextual `show`), and a whole
  // menu vanishes when it has nothing to offer yet (handled by TopbarMenu).
  const createMenu: TopbarMenuItem[] = [
    {
      label: 'New',
      blurb: 'Start a fresh session',
      onClick: () => {
        turn.reset();
        interject.reset();
        setConversationStarted(false);
        setTurnHadFiles(false);
        clearSession();
      },
      show: !!turn.spec,
    },
    {
      label: 'Dashboard',
      blurb: 'Open your living dashboards',
      onClick: featureActions.dashboards.run,
      preload: featureActions.dashboards.preload,
      show: !!turn.spec,
    },
  ];
  const practiceMenu: TopbarMenuItem[] = [
    {
      label: 'Rehearse',
      blurb: 'Practice a hard conversation — take the seat, or send your Mavéa',
      onClick: featureActions.delegate.run,
      preload: featureActions.delegate.preload,
      show: true,
    },
    {
      label: 'Study',
      blurb:
        srsDue > 0
          ? `${srsDue} card${srsDue === 1 ? '' : 's'} ready`
          : studyStyle === 'spaced'
            ? 'Go through what you have saved'
            : 'Flip through your cards',
      onClick: featureActions.review.run,
      preload: featureActions.review.preload,
      show: true,
    },
    {
      label: 'Manage flashcards',
      blurb: 'See, organize, and edit your study deck',
      onClick: featureActions.flashcards.run,
      preload: featureActions.flashcards.preload,
      show: true,
    },
    {
      label: 'Courses',
      blurb: 'Turn a topic into a structured syllabus — a lesson at a time, at your pace',
      onClick: featureActions.courses.run,
      preload: featureActions.courses.preload,
      show: true,
    },
    {
      label: 'Recap',
      blurb: 'What we covered — the session so far',
      onClick: featureActions.recap.run,
      preload: featureActions.recap.preload,
      show: !!recapModel,
    },
  ];
  const shareMenu: TopbarMenuItem[] = [
    {
      label: 'Present',
      blurb: 'Fill the room — the chrome falls away, the mic stays live',
      onClick: featureActions.present.run,
      preload: featureActions.present.preload,
      show: !!turn.spec,
    },
    {
      label: 'Export',
      blurb: 'Choose a template and export a polished PDF',
      onClick: featureActions.export.run,
      preload: featureActions.export.preload,
      show: turn.frames.length > 0,
    },
    {
      label: 'Video',
      blurb: 'Share a moment, a topic, or the whole conversation',
      onClick: featureActions.share.run,
      preload: featureActions.share.preload,
      show: turn.frames.length > 0,
    },
  ];
  const exploreMenu: TopbarMenuItem[] = [
    {
      // First, not last: the palette is the index of Explore's registered features, so a "where do I
      // find X" scan should hit it immediately (it's also the persistent Search button's twin).
      label: 'Search all features',
      blurb: `Browse Mavéa’s feature index · ${PALETTE_SHORTCUT}`,
      onClick: openPalette,
      preload: commandPaletteLoad.preload,
      show: true,
    },
    {
      label: 'Atlas',
      blurb: 'Kept conversations and topics, as a place',
      onClick: featureActions.atlas.run,
      preload: featureActions.atlas.preload,
      show: atlasCount > 0,
    },
    {
      label: 'Watch me think',
      blurb: 'A live map of your thinking',
      onClick: featureActions['watch-me-think'].run,
      show: featureActions['watch-me-think'].available,
    },
    {
      label: 'Prism',
      // Mirrors the registry blurb; the action splits the attached doc(s) — or, with none attached,
      // points you at the paperclip rather than doing nothing.
      blurb: featureActions['pdf-world'].available
        ? 'Split your document into a map of its claims'
        : 'Attach a PDF, Office doc, or data file — then split it into claims',
      onClick: featureActions['pdf-world'].run,
      preload: featureActions['pdf-world'].preload,
      show: true,
    },
    {
      label: 'Ripple',
      blurb: 'Model a code change’s impact, risks, and a proposed ship order',
      onClick: featureActions.ripple.run,
      preload: featureActions.ripple.preload,
      show: true,
    },
    {
      label: 'Dashboards',
      blurb:
        dashCount > 0
          ? `${dashCount} dashboard${dashCount === 1 ? '' : 's'} set to refresh while Mavéa is open`
          : 'Create a dashboard that refreshes on schedule while Mavéa is open',
      onClick: featureActions.dashboards.run,
      preload: featureActions.dashboards.preload,
      show: true,
    },
    {
      label: 'Deep Zoom',
      blurb: lastAsk
        ? `Zoom from field to mechanism — "${lastAsk.slice(0, 50)}${lastAsk.length > 50 ? '…' : ''}"`
        : 'Telescope any topic from big picture to finest detail',
      onClick: () => {
        const q = lastAsk ?? '';
        window.location.hash = q ? `#/deepzoom?seed=${encodeURIComponent(q)}` : '#/deepzoom';
      },
      show: true,
    },
  ];

  // Pinch out on the canvas itself → open the zoom deck at chapter altitude. Inside the
  // deck the same gesture keeps zooming (the deck owns it from there). No recap → no deck.
  const openZoom = useCallback(
    (dir: 'out' | 'in') => {
      if (dir === 'out' && recapModel) setZoomLevel('chapters');
    },
    [recapModel],
  );
  useZoomGesture(scrollRef, openZoom);

  // ---- scrub-the-voice: record the turn's spoken track + the canvas states it passed. ----
  // The PCM tap lives for the surface's lifetime; the recorder gates itself per turn.
  useEffect(() => {
    setStreamTap(recorderTap);
    return () => setStreamTap(null);
  }, []);
  // Whether the recording has already been closed for the turn it was opened for — endTurnAudio
  // bumps the recorder version the settle effect below watches, so without this it would re-arm
  // its close timer forever. Starts closed: nothing is recorded until a turn opens the recorder.
  const turnAudioClosed = useRef(true);
  // A new turn restarts the recording and drops the previous scrub state.
  useEffect(() => {
    if (turn.busy) {
      beginTurnAudio();
      turnAudioClosed.current = false;
      setTurnAudio(null);
      resetScrub();
    }
  }, [turn.busy, turn.turn, resetScrub]);
  // Replaying an older answer narrates it through this very tap, so the replayed lines would
  // append themselves to the live turn's track — and the retain below would then write that
  // corrupted track over the head turn's snapshot. Deafen the tap for as long as the overlay is
  // up. Suspended, not closed: this turn's own tour still has lines to land.
  useEffect(() => {
    setTapSuspended(replayAt !== null);
    return () => setTapSuspended(false);
  }, [replayAt]);
  // Jumping to a different moment (a past chat, or back to live) starts it at rest, so a scrub
  // position from the previous view doesn't carry over to an unrelated track.
  useEffect(() => resetScrub(), [turn.viewIndex, resetScrub]);
  // Stamp how many blocks the canvas holds against the audio clock — the un-build map.
  const liveBlockCount = turn.spec?.blocks.length ?? 0;
  useEffect(() => {
    if (liveBlockCount > 0) markBlocks(liveBlockCount);
  }, [liveBlockCount]);
  // Snapshot the spoken track as it builds — fires while speaking (live waveform) and once more on
  // settle (complete track). The recorder version-counter drives this on every chunk. On settle we
  // also retain the finished track against this turn's frame, so the scrubber works after you move
  // on to later answers (the recorder itself only keeps the current turn).
  useEffect(() => {
    if (turn.busy) return;
    if (turn.spec) {
      const snap = snapshotTurnAudio();
      if (snap) {
        setTurnAudio(snap);
        const idx = turn.frames.length - 1;
        const frame = turn.frames[idx];
        if (frame) audioStore.set(turnFrameId(frame), snap);
      }
    }
    // The answer has settled; once the voice has stayed quiet past the tour's own holds it has
    // stopped talking for good, so close the recording. Anything spoken after this — a voice
    // audition in Settings, a Watch-Me-Think line — belongs to no turn, and left open it would
    // append itself to the very track this effect just retained.
    if (speakingNow || turnAudioClosed.current) return;
    const closeTimer = window.setTimeout(() => {
      turnAudioClosed.current = true;
      endTurnAudio();
    }, TURN_VOICE_QUIET_MS);
    return () => window.clearTimeout(closeTimer);
  }, [speakingNow, turn.busy, turn.spec, turnAudioVersion, turn.frames, audioStore]);
  // The voice track for whatever moment is on screen: the live head's, or a past frame's retained
  // one (null when that chat has aged out of the bounded store).
  const viewedAudio = useMemo(
    () =>
      viewingLive
        ? turnAudio
        : turn.viewIndex != null && turn.frames[turn.viewIndex]
          ? audioStore.get(turnFrameId(turn.frames[turn.viewIndex]))
          : null,
    [viewingLive, turnAudio, turn.viewIndex, turn.frames, audioStore],
  );
  // The canvas, rebuilt to the scrub moment: what the voice had SAID by then (tour stops matched to
  // spoken spans), floored by what had genuinely streamed in by that audio time. The hero/title
  // stay — only the evidence un-builds. Works on the live head AND any retained past frame.
  const scrubSpec = useMemo(() => {
    // Only an active drag-to-rewind un-builds the canvas; plain playback keeps it whole.
    if (!scrubBuild || scrubT === null || !viewedAudio) return null;
    const spec = viewingLive ? turn.spec : turn.viewSpec;
    if (!spec) return null;
    const tour = viewingLive
      ? turn.tour
      : turn.viewIndex != null
        ? (turn.frames[turn.viewIndex]?.tour ?? [])
        : [];
    const n = unbuiltCount(viewedAudio, scrubT, tour, spec.blocks.length);
    return { ...spec, blocks: spec.blocks.slice(0, n) };
  }, [
    scrubBuild,
    scrubT,
    viewedAudio,
    viewingLive,
    turn.spec,
    turn.viewSpec,
    turn.tour,
    turn.viewIndex,
    turn.frames,
  ]);
  // No chat-log transcript: past answers are re-readable by jumping frames — the session rail
  // and scrubber restore each moment's canvas plus its ask + spoken line in the answer hero.

  // A FAILED turn (provider error): an explicit, recoverable error state — visibly NOT an
  // answer. Plain-language cause + Retry (re-runs the same question) + a settings shortcut.
  const errorPanel = turn.error ? (
    <div className="live-error" role="alert">
      <div className="live-error-head">
        <Icon.alert />
        <span>Couldn’t answer</span>
      </div>
      <p className="live-error-msg">{turn.error.message}</p>
      <div className="live-error-actions">
        <button
          type="button"
          className="live-error-btn primary"
          onClick={() => {
            // Re-run the real prompt (raw instruction for a synthetic turn), not the label shown —
            // with the files, pinned blocks, and ink marks the ask carried, so a retry re-sends
            // the SAME question rather than a stripped-down version of it.
            const err = turn.error;
            if (err)
              void turn.run(
                err.retry,
                err.attachments,
                err.selectedBlocks,
                undefined,
                err.inkIntents,
                err.question,
              );
          }}
          disabled={turn.busy}
        >
          Retry
        </button>
        <button type="button" className="live-error-btn" onClick={() => setShowSettings(true)}>
          Open settings
        </button>
      </div>
    </div>
  ) : null;

  // Watch Me Think — the full-stage emergent mindshape overlay. Defined once and rendered inside
  // whichever `.stage` is mounted (canvas OR presence) so it overlays the rail-offset stage area,
  // not the rail. It must appear whenever thinking-aloud is active — including a fresh session with
  // no answer canvas yet — so the default voice experience is never invisible. z-index stays at 2
  // during listening (dock/scrubber chrome stays on top and usable); CSS raises it only when settled.
  // `mindActive` is the single source of truth for "the takeover is on screen" — it gates the
  // overlay, the body class, and the suppression of the answer canvas's ink underneath.
  // Note `watchThinking` alone, NOT "…and the map has atoms": pressing Watch me think used to
  // leave you on the answer canvas with only a changed button to show for it, and the surface
  // appeared later, on the first thought — which reads as a broken button, not a mode. The empty
  // map is the honest first frame: the face, listening, waiting for something to place.
  const mindActive = watchThinking;
  // The dock's real height, watched: the map has to end above it, and nothing else on the page
  // reports that number reliably (see the style comment on .ms-stage-fill below).
  const [dockReserve, setDockReserve] = useState(160);
  useEffect(() => {
    if (!mindActive) return;
    const dock = document.querySelector<HTMLElement>('.live-dock');
    if (!dock) return;
    const apply = (): void => setDockReserve(Math.round(dock.getBoundingClientRect().height) + 8);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(dock);
    return () => ro.disconnect();
  }, [mindActive]);
  const mindOverlay = mindActive ? (
    <div
      className="ms-stage-fill"
      data-phase={mindShape.phase}
      // Measured, not inherited. --dock-h is set from the dock's offsetHeight by its own observer
      // and can lag what is on screen (read 131px against a 168px dock while a notice was up), and
      // the dock paints an opaque surface across its whole height — so a reserve short by 37px
      // doesn't crop the map, it hides whatever the map drew there. The settled action bar was
      // being painted over, half a row of buttons at a time.
      style={{ ['--ms-bottom-reserve' as string]: `${dockReserve}px` } as CSSProperties}
    >
      {/* Always-present way back to the conversation — the overlay must never trap the user. */}
      <button
        type="button"
        className="ms-exit"
        onClick={exitWatchThinking}
        title="Back to the conversation (Esc)"
      >
        <Icon.chevL />
        Back to conversation
      </button>
      <MindShapeCanvas
        mindShape={mindShape}
        onSettled={() => {
          // Routed through `speak()` (not the raw voice module) so this respects mute like
          // every other spoken line — it also arms the echo gate before speaking, same as
          // `speak()` elsewhere, so always-on VAD can't mistake Mavéa's own words for the user's.
          speak('I think this is the shape of it.');
        }}
        onConfirmUnsaid={() => mindShape.confirmUnsaid()}
        onDismissUnsaid={() => mindShape.dismissUnsaid()}
        onAction={(action, detail) => {
          if (action === 'add-more') {
            // "I forgot a few things" — keep the map and go back to listening so new
            // speech merges into the existing atoms. Re-arm the mic if it had stopped.
            setHeard(null);
            mindShape.resume();
            if (!listening && sttOk) {
              voice.start({
                inCanvas: !!turn.spec,
                continuous: alwaysOn && !alwaysPaused,
              });
            }
          } else if (action === 'not-quite') {
            // Scrap it: wipe the map and the banked thoughts, back to a blank listen.
            mindShapeRambleRef.current = [];
            mindShape.resume(false);
            setHeard(null);
            if (!listening && sttOk) {
              voice.start({
                inCanvas: !!turn.spec,
                continuous: alwaysOn && !alwaysPaused,
              });
            }
          } else if (action === 'share') {
            // From the "kept this shape" panel — open the share flow on what's on screen.
            setShareOpen(true);
          } else if (action === 'present') {
            // From "kept this shape" — go straight into Present mode for the current canvas.
            openPresentation();
          } else if (
            action === 'answer' ||
            action === 'plan' ||
            action === 'commit-plan' ||
            action === 'tell-apart'
          ) {
            // Fuse the curated map into one rich ask and run it as a normal turn → a full visual
            // canvas. 'commit-plan' asks for a concrete path; 'tell-apart' scopes the ask to one
            // tension ("help me tell these two reasons apart"); 'answer'/'plan' weigh the whole map.
            const settled = mindShape.spec;
            const mode = action === 'commit-plan' || action === 'plan' ? 'plan' : 'answer';
            let prompt = settled ? mindShapeToPrompt(settled, mode) : (heard ?? '');
            if (action === 'tell-apart' && detail?.tension) {
              // Lead with the specific conflict so the answer separates the two reasons, then ground
              // it in the rest of the map.
              prompt =
                `I keep coming back to “${detail.tension.a}” but I also said “${detail.tension.b}.” ` +
                `Help me tell these two reasons apart — are they the same thing or not?\n\n` +
                prompt;
            }
            // A brain-dump fired on top of a RESTORED canvas — one the user only reloaded back
            // into, or re-opened from the Library, but hasn't actively continued this session —
            // must answer the map ALONE: run it as a fresh standalone turn so the unrelated past
            // topic can't pollute the answer, and so it starts its own saved conversation (its own
            // timeline, mind-map rail icon, and resume point). A genuine in-session follow-up keeps
            // continuity, since `restored` clears the moment any real turn runs. Read before run()
            // flips it.
            const standalone = turn.restored;
            // Close the mic first so the listener can't bank a stray thought (or fire a second turn)
            // the instant the map collapses into the answer. In always-on, DON'T stop it directly —
            // that would strand it closed for the session (the mic-gate effect owns it and won't
            // re-arm); the turn's busy-guard, the watch-thinking exit, and the echo gate cover the
            // brief collapse window instead.
            if (listening && !alwaysOn) voice.stop();
            setHeard(null);
            mindShape.reset();
            setWatchThinking(false);
            if (prompt) {
              const label =
                action === 'tell-apart'
                  ? 'Telling them apart'
                  : settled?.center || (mode === 'plan' ? 'A plan' : 'An answer');
              setLastAsk(label);
              // Keep the map with the answer it became, so it can be re-opened read-only.
              void turn.run(
                prompt,
                undefined,
                undefined,
                undefined,
                undefined,
                label,
                settled ?? undefined,
                standalone ? { freshStart: true } : undefined,
              );
            }
          }
        }}
        liveTranscript={heard || undefined}
        // Count distinct thoughts across everything said so far (one utterance can hold
        // several), not the number of VAD segments banked.
        thoughtCount={countThoughts([mindShapeRambleRef.current.join(' '), heard ?? ''].join(' '))}
      />
    </div>
  ) : null;

  const watchThinkingActionLabel = !watchThinking
    ? 'Watch me think'
    : mindShape.phase === 'settled' || mindShape.phase === 'pausing'
      ? 'Add thought'
      : 'Done thinking';

  return (
    <div
      className={
        'mavea-app with-rail live-voice canvas-flat' +
        (inCorner ? ' face-homed' : '') +
        (inWizard ? ' in-wizard' : '') +
        (presenting ? ' presenting' : '') +
        (railCollapsed ? ' rail-collapsed' : '') +
        (mindActive ? ' watch-thinking' : '')
      }
      // Names the exported PDF's generated header ("Mavéa — <title>", see print.css) — the live
      // answer's title, so a printed canvas isn't headed by a bare "Mavéa —".
      data-title={turn.spec?.title ?? ''}
      {...(presenting ? { 'data-preso': persona } : {})}
      ref={appRef}
    >
      {tourMode.current && <TourOverlay driver={tourDrive} />}
      {tourMode.current && tourDrive.done && (
        <TourEndCard
          onStart={endTourToApp}
          onReplay={replayTour}
          onPlayExtra={tourDrive.playExtra}
          hasStoredSession={hasStoredSession}
        />
      )}
      {demoPersona.current &&
        (() => {
          const member = castMember(demoPersona.current);
          return member ? (
            <DemoOverlay driver={demoDrive} member={member} onExit={endTourToApp} />
          ) : null;
        })()}
      {presentationPreparing && (
        <div className="preso-preparing" role="status" aria-live="polite" aria-busy="true">
          <span className="async-pending-spinner" aria-hidden="true" />
          Preparing presentation…
        </div>
      )}
      {presenting && (
        <>
          {/* Persona style picker — top-left, ghost until hovered */}
          <div
            className="preso-style-picker"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setPersonaMenuOpen(false);
              }
            }}
          >
            <button
              type="button"
              className={'preso-style-btn' + (personaMenuOpen ? ' is-open' : '')}
              onClick={() => setPersonaMenuOpen((o) => !o)}
              aria-expanded={personaMenuOpen}
              aria-haspopup="listbox"
            >
              <span
                className="preso-swatch-sm"
                style={{
                  background: PERSONAS.find((p) => p.id === persona)?.accent ?? 'var(--presence)',
                }}
              />
              Style
            </button>
            {personaMenuOpen && (
              <div className="preso-menu" role="listbox" aria-label="Presentation style">
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={persona === p.id}
                    className={'preso-row' + (persona === p.id ? ' is-active' : '')}
                    onClick={() => {
                      setPersona(p.id);
                      persistPersona(p.id);
                      setPersonaMenuOpen(false);
                    }}
                  >
                    <span className="preso-swatch" style={{ background: p.accent }} />
                    <span className="preso-name">{p.label}</span>
                    <span className="preso-desc">{p.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Exit pill — top-right */}
          <button
            type="button"
            className="present-exit"
            onClick={() => setPresenting(false)}
            title="End the presentation (Esc)"
          >
            End show · Esc
          </button>
          {/* The deck itself — a real cover/agenda/visual/closing slide spine derived from the
              live answer (real-data-only), covering the canvas beneath. */}
          <LazyOverlay>
            <PresentationDeck
              spec={turn.viewSpec ?? turn.spec}
              question={hero?.question ?? null}
              narration={hero?.narration ?? turn.narration}
              skinId={persona}
              autoAdvanceMs={tourMode.current || demoPersona.current ? 2600 : undefined}
              onExit={() => setPresenting(false)}
            />
          </LazyOverlay>
        </>
      )}
      {/* presence — centre stage while talking, corner once a canvas is up */}
      <div
        className={
          'presence-layer' +
          (inCorner ? ' corner' : centerStage ? '' : ' idlehome') +
          // While a spoken caption is shown, the centred face lifts into the upper-middle (CSS) so
          // the caption below it has room above the composer/scrubber instead of being crushed.
          (showCaption ? ' has-caption' : '') +
          (memorySaved ? ' is-mem-save' : '')
        }
        ref={layerRef}
      >
        <div className="presence-positioner" ref={voiceSinkRef}>
          {/* The answer "seed": a soft ripple releases from the orb as each turn's answer arrives —
              the seed the canvas blooms out of. It rides the positioner (the sanctioned transform
              lever), so it emanates from wherever the face is — centre while thinking, corner once
              docked — and never touches .presence. Keyed per turn so it fires exactly once. */}
          {conversationStarted && (
            <div key={turn.turn} className="presence-seed" aria-hidden="true" />
          )}
          <Presence state={pres.state} emotion={pres.emotion} gaze={pres.gaze} muted={muted} />
        </div>
      </div>
      <div className={'presence-scrim' + (showScrim ? ' show' : '')} />
      {showCaption && (
        <div className="center-caption" role="status" aria-live="polite">
          {caption}
        </div>
      )}

      {/* No "Thinking…" pill: the centered face now carries loading (the radiating ring) so
          it's clear Mavéa received the question and is working. External/billable actions still
          surface chips, since those need explicit transparency — and once the search resolves,
          the chips name the actual sources being read. */}
      <TurnActivityChips activity={turn.activity} sources={turn.busy ? turn.liveSources : []} />

      {/* topbar */}
      <div className="topbar">
        <button
          className="brand brand-link"
          type="button"
          onClick={goDemo}
          title="Back to the demo"
          aria-label="Back to the demo"
        >
          <span className="brand-dot jelly-mark" ref={brandDotRef}></span>
          <span className="brand-name">Mavéa</span>
          {/* Only show the workspace title once an answer exists — on the welcome the
              "Live" badge already says it, so a default "Live" here just duplicated it. */}
          {turn.spec && (
            <>
              <span className="brand-sep"></span>
              <span className="workspace-name">
                {turn.error ? 'Couldn’t answer' : turn.spec.title}
              </span>
            </>
          )}
        </button>
        <span className="live-badge" title={`Live · ${info.label}`} aria-label="Live mode">
          <span className="live-dot"></span>
          Live
        </span>
        <div className="topbar-spacer"></div>
        {/* Feature menus — verbs grouped by intent so the bar reads like a real menu bar
            (Create · Practice · Share · Explore) rather than a row of loose buttons + a "⋯".
            Each menu hides itself until it has something actionable in this context. */}
        <TopbarMenu label="Create" items={createMenu} />
        <TopbarMenu label="Practice" items={practiceMenu} badge={srsDue} />
        <TopbarMenu label="Share" items={shareMenu} />
        <TopbarMenu label="Explore" items={exploreMenu} />
        {/* The persistent handle on the ⌘K feature palette — reads as the fifth menu, and (unlike
            the four menus) survives the phone-width collapse so the palette stays reachable by touch. */}
        <TopbarSearchButton onOpen={openPalette} preload={commandPaletteLoad.preload} />
        {/* Divider between the feature menus and the controls */}
        <span className="topbar-divider" aria-hidden="true" />
        {/* Model, mic mode, and voice/captions all moved down into the dock's persistent voice
            strip (above the composer) — this bar is the feature/toolbar shelf (Create/Practice/
            Share/Explore + app-level prefs), not per-turn/per-reply settings. Settings whose
            effect you see and hear live where that effect happens, not up here. */}
        <TemplatePicker />
      </div>

      {/* session rail — the conversation as chaptered moments (the spoken answer lives on the
          stage now). On small screens it collapses into a bottom sheet behind a toggle. */}
      <SessionRail
        chapters={chapters}
        frames={turn.frames}
        currentIndex={currentIndex}
        onJump={turn.jumpTo}
        onReplay={turn.frames.length > 0 ? () => setReplayAt(turn.frames.length - 1) : undefined}
        onOverview={turn.frames.length > 0 ? () => setOverviewOpen(true) : undefined}
        resumed={turn.restored}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((o) => !o)}
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((o) => !o)}
        onOpenPast={libraryEntries.length > 0 ? () => setPastOpen(true) : undefined}
        onStudy={() => setSrsOpen(true)}
        roomIndices={roomFrames}
        bookmarks={bookmarks}
        onToggleBookmark={toggleBookmark}
        onViewMindMap={(i) => {
          const f = turn.frames[i];
          if (f?.mind) setMindView({ open: true, spec: f.mind });
        }}
        onSeeTogether={onSeeTogether}
      />

      {/* bottom dock — the composer's fixed home */}
      <DockBar
        holdEnabled={sttOk && micMode === 'hold'}
        // The inline "Hold ⌥ to talk" hint duplicated the mic's own MicModePopover (its "Hold"
        // row shows the same thing) and cluttered the input row the Design canvas kept clean —
        // key customization still lives in full in LiveSettings, nothing lost by hiding it here.
        showHint={false}
        pttKey={cfg.pttKey}
        pttSide={cfg.pttSide}
        onHoldStart={() => {
          showAll();
          voice.start({ inCanvas: !!turn.spec });
        }}
        onHoldEnd={() => voice.forceStop()}
        onChangePttKey={(key) => setLiveConfigV2({ pttKey: key })}
        onChangePttSide={(side) => setLiveConfigV2({ pttSide: side })}
      >
        {(whisper || (alwaysOn && sttOk)) && (
          <div className="dock-modes" role="group" aria-label="Listening modes">
            {whisper && <span className="whisper-badge">won't wake anyone</span>}
            {alwaysOn && sttOk && (
              <button
                type="button"
                className={'listen-mode-chip' + (justListen ? ' on' : '')}
                aria-pressed={justListen}
                onClick={() => {
                  setJustListen((v) => !v);
                  if (watchThinking) {
                    watchThinkingRef.current = false;
                    setWatchThinking(false);
                  }
                }}
                // The discard warning rides the accessible name too — a screen-reader user must
                // hear it before the click, not read it in a tooltip they never see.
                title={listenTitle}
                aria-label={listenTitle}
              >
                {justListen ? `Just listening · ${rambleCount} banked` : 'Just listen'}
              </button>
            )}
            {justListen && rambleCount > 0 && (
              <button
                type="button"
                className="listen-mode-chip"
                onClick={() => {
                  setJustListen(false);
                  const ramble = rambleRef.current;
                  rambleRef.current = [];
                  setRambleCount(0);
                  if (ramble.length) {
                    const minutes = Math.round((Date.now() - rambleStartRef.current) / 60_000);
                    setLastAsk('Your thinking, sorted');
                    void turn.run(
                      sortAsk(ramble, minutes),
                      undefined,
                      undefined,
                      undefined,
                      undefined,
                      'Your thinking, sorted',
                    );
                  }
                }}
              >
                Thoughts?
              </button>
            )}
          </div>
        )}
        {sttOk && <FeatureUseNotice kind="voice-data" from="live" />}
        {voiceNotice && (
          <div className="voice-notice" role="status">
            {voiceNotice === LOW_CONFIDENCE_VOICE_MSG ? <Icon.spark /> : <Icon.micOff />}
            <span>{voiceNotice}</span>
            <button
              type="button"
              className="voice-notice-x"
              aria-label="Dismiss voice notice"
              onClick={() => setVoiceNotice(null)}
            >
              <Icon.x />
            </button>
          </div>
        )}
        {(attached.length > 0 || attachError) && (
          <div className="attach-strip" role="list" aria-label="Attached files">
            {attached.map((a, i) => (
              <span key={i} className="attach-chip" role="listitem">
                {isImage(a) ? (
                  <img className="attach-thumb" src={`data:${a.mime};base64,${a.data}`} alt="" />
                ) : (
                  <Icon.paperclip />
                )}
                <span className="attach-name">{attachmentLabel(a)}</span>
                {/* PDFs need a document-reading model (vision); Word/PowerPoint/Excel and plain-text
                    /data files (CSV, TXT, Markdown, JSON, code) are extracted client-side as text, so
                    they explode on any model. */}
                {((isPdf(a) && visionCaps) || isOffice(a) || isText(a)) && (
                  <button
                    type="button"
                    className="attach-explode"
                    aria-label={`Explode ${a.name} into a map of its claims`}
                    title="Explode into a map of grounded claims"
                    onClick={() => setPrismDocs([a])}
                  >
                    ⊹ Explode
                  </button>
                )}
                <button
                  type="button"
                  className="attach-remove"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => removeAttachment(i)}
                >
                  <Icon.x />
                </button>
              </span>
            ))}
            {(() => {
              // Explodable here = Office + text/data files (any model) + PDFs when the model reads docs.
              const docs = attached.filter(
                (a) => isOffice(a) || isText(a) || (isPdf(a) && visionCaps),
              );
              if (docs.length <= 1) return null;
              const compareBtn = (
                <button
                  key="compare"
                  type="button"
                  className="attach-explode attach-compare"
                  aria-label={`Compare ${docs.length} documents — map their claims and find where they agree and contradict`}
                  title="Explode all documents together and compare them"
                  onClick={() => setPrismDocs(docs)}
                >
                  ⊹ Compare {docs.length} documents
                </button>
              );
              const synthBtn = (
                <button
                  key="synth"
                  type="button"
                  className="attach-explode attach-compare"
                  aria-label={`Synthesize ${docs.length} sources — fuse them into one map of themes, contradictions, and gaps`}
                  title="Fuse all sources into one navigable Synthesis World"
                  onClick={() => setSynthesis(docs)}
                >
                  ⊹ Synthesize {docs.length} sources
                </button>
              );
              // 2 → compare; 3 → offer both; 4+ → synthesize.
              if (docs.length >= SYNTHESIS_AUTO_SOURCES) return synthBtn;
              if (docs.length >= SYNTHESIS_MIN_SOURCES)
                return (
                  <>
                    {compareBtn}
                    {synthBtn}
                  </>
                );
              return compareBtn;
            })()}
            {attachError && (
              <span className="attach-error" role="status">
                {attachError}
              </span>
            )}
          </div>
        )}
        {attached.length > 0 && <FeatureUseNotice kind="upload" from="live" />}
        {turn.spec && (
          <InkBar
            armed={inkArmed}
            pins={userInk.pins}
            miss={userInk.miss}
            onUndo={userInk.undo}
            onSend={userInk.send}
          />
        )}
        {pinned.length > 0 && (
          <div className="pin-dock">
            <div className="pin-strip" role="list" aria-label="Elements you're asking about">
              {pinned.map((b) => (
                <span key={b.id} className="pin-chip" role="listitem">
                  <Icon.chat />
                  <span className="pin-name">{blockLabel(b)}</span>
                  <button
                    type="button"
                    className="pin-remove"
                    aria-label={`Unpin ${blockLabel(b)}`}
                    onClick={() => togglePin(b)}
                  >
                    <Icon.x />
                  </button>
                </span>
              ))}
            </div>
            <div className="pin-suggests" role="list" aria-label="Quick follow-ups">
              {pinned.length >= 2 && (
                <button
                  type="button"
                  className="live-chip pin-fuse-chip"
                  disabled={turn.busy}
                  title={`Combine these ${pinned.length} cards into a single new answer — useful when you want Mavéa to find the pattern, trade-off, or story that runs across all of them at once`}
                  onClick={() => fuseBlocks(pinned)}
                >
                  Fuse {pinned.length} into one
                </button>
              )}
              {pinnedChips.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="live-chip"
                  onClick={() => submit(c)}
                  disabled={turn.busy}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* The unified capsule (Design canvas "1a"): one bordered/shadowed card holding TWO rows
            — Mavéa's-output status strip on top (a divider below it), your input row beneath —
            so nothing floats loose. The capsule is present for the whole conversation (dockCapsule),
            so composing a follow-up never collapses it back to the plain intro pill; before the first
            ask the composer is a plain pill, so the wrapper is a display:contents passthrough that
            doesn't touch layout. */}
        <div className={dockCapsule ? 'voice-capsule' : 'composer-passthrough'}>
          {dockCapsule && (
            <div className="voice-strip">
              {/* The transcript always shows the current answer's line — the subtitle stays put
                  whether Mavéa is voicing it or muted (a muted turn lands silently, but the line is
                  still worth reading, and the row's width is already reserved). The pulsing
                  "Speaking" pill earns its place ONLY while she's actually voicing; the settings on
                  the right (voice, model) stay anchored regardless. Clicking the pill interrupts. */}
              {speakingSticky && !voicePreparing ? (
                <button
                  type="button"
                  className="vc-status"
                  onClick={showAll}
                  title="Tap to stop and show the whole answer at once"
                  aria-label="Stop speaking and show the whole answer"
                >
                  <span className="vc-orb" aria-hidden="true">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  <span className="vc-status-label">Speaking</span>
                </button>
              ) : walkPreparing && !muted ? (
                /* The pre-walk barrier is holding (cold voice, chunks still landing) — an honest
                   "getting ready" beat in the same pill, so the pause before the walk never
                   reads as a dead canvas. Never says "Speaking": nothing is audible yet. */
                <div className="vc-status vc-preparing" role="status" aria-busy="true">
                  <span className="vc-orb" aria-hidden="true">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  <span className="vc-status-label">Preparing voice…</span>
                </div>
              ) : voicePreparing && !muted ? (
                /* A stop's line is still synthesizing (seconds of engaged-but-silent queue on a
                   slow machine). The barrier's pill above already taught the words once this
                   turn; repeating text at every stop would nag, so this recurring beat is the
                   same held orb with no label — quiet, honest, still announced to a screen
                   reader. */
                <div
                  className="vc-status vc-preparing vc-quiet"
                  role="status"
                  aria-busy="true"
                  aria-label="Preparing voice"
                >
                  <span className="vc-orb" aria-hidden="true">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                </div>
              ) : null}
              <div className="vc-transcript" aria-hidden="true">
                {spokenNow ?? turn.narration ?? ''}
              </div>
              {/* Her voice: an explicit labeled switch, never a bare icon that could read as the
                  mic (which is untouched). */}
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                title={
                  muted
                    ? "Unmute Mavéa's voice — your microphone is unaffected"
                    : "Mute Mavéa's voice — muted answers land written out at once, with notes and pen marks standing in for the walk. Your microphone is unaffected."
                }
                aria-pressed={!muted}
                className={'voice-switch' + (muted ? ' is-muted' : '')}
              >
                {muted ? <Icon.speakerOff /> : <Icon.speaker />}
                <span className="voice-switch-label">Mavéa's voice</span>
                <span className="voice-switch-track" aria-hidden="true">
                  <span className="voice-switch-thumb"></span>
                </span>
              </button>
              {/* How fast she speaks — set it before or during an answer; the next clause adopts it,
                  and the replay scrubber reads the same value. */}
              <VoiceSpeedChip />
              {/* Standard/Simple, without leaving the conversation for Settings. */}
              <ExplainLevelChip />
              {/* Which model answers — dot + name + caret, no latency (dropped for compactness;
                  it lives in the picker / this chip's tooltip). */}
              <button
                className="live-model-chip"
                onClick={() => setShowSettings((s) => !s)}
                title={
                  demoPersona.current
                    ? 'The model that generated this curated prerecorded example'
                    : latencyLabel
                      ? `Model settings · last reply ${latencyLabel}`
                      : 'Model settings'
                }
              >
                <span className="chip-dot" aria-hidden="true" />
                {/* During a demo replay the chip names the model that produced these baked
                    answers (shard provenance) — showing the visitor's own configured model
                    would claim it generated content it never saw. */}
                <span className="chip-model">
                  {demoPersona.current ? (demoDrive.model ?? '—') : connected}
                </span>
                <span className="chip-caret" aria-hidden="true" />
              </button>
            </div>
          )}
          <CommandComposer
            value={value}
            onChange={(v) => {
              // Typing closes the always-on mic and clearing/submitting re-arms it — handled by the
              // always-on effect (gated on the composer being non-empty), the single source of truth
              // for that handoff. So no voice.stop() here; that one-way stop is what used to strand the
              // mic closed after a typed turn.
              setValue(v);
            }}
            onSend={submit}
            listening={listening}
            heard={heard}
            onMic={onMic}
            micMode={micMode}
            micArmed={alwaysOn && !alwaysPaused}
            micPaused={alwaysOn && alwaysPaused}
            micProcessing={voicePhase === 'transcribing'}
            placeholder={
              watchThinking
                ? 'Talk, or type a thought — it lands on the map…'
                : pinned.length
                  ? pinned.length > 1
                    ? 'Ask about the selected elements…'
                    : 'Ask about the selected element…'
                  : 'Talk, or type — anything.'
            }
            focusSignal={composerFocus}
            disabled={turn.busy}
            onFiles={onFiles}
            // Never hard-disable the button for lack of vision: Office docs and plain-text/data
            // files (CSV, TXT, Markdown, JSON…) explode into a claim map on ANY model — they're
            // extracted client-side, no vision needed — so gating the whole control on visionCaps
            // used to block that for every non-vision provider. Images/PDFs still degrade
            // gracefully to a text note on a non-vision model (parts.ts).
            attachPulse={attachPulse}
            attachTitle={
              visionCaps
                ? 'Attach an image or PDF'
                : `Attach a doc or data file to explode — ${connected} can't read images/PDFs directly`
            }
            onMicDown={() => {
              if (!sttOk) return; // the click handler (onMic) surfaces the unsupported notice
              // Hush Mavéa the moment a hold starts, same as the tap toggle — a held mic is just
              // as much an interruption as a tapped one.
              showAll();
              voice.start({ inCanvas: !!turn.spec });
            }}
            onForceStop={() => voice.forceStop()}
            onMicCancel={() => voice.stop()}
            // Mark (draw-to-ask) lives with the input controls, shown only once there's an answer
            // to mark — so a resting canvas isn't cluttered by an orphaned bar.
            tools={
              <>
                {turn.spec && <MarkToggle armed={inkArmed} onToggle={setInkArmed} />}
                <button
                  type="button"
                  className={'composer-watch' + (watchThinking ? ' on' : '')}
                  aria-pressed={watchThinking}
                  aria-label={watchThinkingActionLabel}
                  onClick={() => {
                    if (!watchThinking) enterListening('think');
                    else if (mindShape.phase === 'settled' || mindShape.phase === 'pausing') {
                      setHeard(null);
                      mindShape.resume();
                      if (!listening && sttOk) {
                        voice.start({ inCanvas: !!turn.spec, continuous: true });
                      }
                    } else {
                      finishWatchThinking();
                    }
                  }}
                  title={
                    !watchThinking
                      ? 'Build a live map while you think aloud'
                      : mindShape.phase === 'settled' || mindShape.phase === 'pausing'
                        ? 'Add another thought'
                        : 'Finish now without waiting for silence'
                  }
                >
                  <Icon.spark />
                  <span>{watchThinkingActionLabel}</span>
                </button>
              </>
            }
            // Mic mode (Tap/Always-on): a setting you pick once and rarely revisit doesn't earn a
            // standing row next to the mic — it lives behind a small chevron on the mic button
            // itself instead (Design canvas: both treatments converged on this after a floating
            // hint mid-bar read as stray text).
            micExtra={
              sttOk ? (
                <MicModePopover
                  mode={micMode}
                  pttKey={cfg.pttKey}
                  pttSide={cfg.pttSide}
                  onChange={(next) => {
                    // An explicit pick here IS the user's real preference now — even mid-session,
                    // even if a listening surface borrowed always-on to get here. Don't let that
                    // surface's exit revert this choice out from under them.
                    alwaysOnBeforeListenRef.current = null;
                    setAlwaysPaused(false);
                    setAlwaysOn(next === 'always');
                    // Persist the pick here too: picking Always-on while a surface had already
                    // borrowed it changes no React state, so the effect above would never fire and
                    // the choice would live only until the next reload.
                    persistAlwaysOn(next === 'always');
                    setMicHoldPreferred(next === 'hold');
                    if (next === 'always' && alwaysOn && !listening && !value.trim()) {
                      voice.start({ inCanvas: !!turn.spec, continuous: true });
                    } else if (next !== 'always' && listening) {
                      voice.stop();
                    }
                  }}
                />
              ) : undefined
            }
          />
        </div>
      </DockBar>

      {/* turn states: the live transcript while the mic is open, and the speak ribbon whose
          phrases light up as the docked face talks (centered moments keep the caption). */}
      {(listening || transcribing) && !watchThinking && (
        <ListeningCard
          transcript={heard}
          mode={micMode}
          transcribing={transcribing}
          note={
            justListen
              ? `Just listening · ${Math.max(1, Math.round((Date.now() - rambleStartRef.current) / 60_000))}m — say "thoughts?" when you want me`
              : undefined
          }
        />
      )}
      {listening && !watchThinking && <GhostRow ghosts={ghosts} />}

      {/* The persistent voice-scrubber strip was removed — it was a near-empty bar most of the
          time (only earning its space in long multi-turn sessions) and added dead vertical bulk
          above the dock. Replay + the whole-conversation Overview now live in the session rail
          (onReplay / onOverview); the per-answer VoiceScrubber during replay is unaffected. */}

      {/* main: the canvas once we have a spec, otherwise the welcome + settings */}
      {turn.spec ? (
        <div className="canvas-stage stage" data-active="1" ref={stageRef}>
          {topicSweepKey != null && (
            <TopicSweep
              key={topicSweepKey}
              tint={lastChapter?.color}
              onDone={() => setTopicSweepKey(null)}
            />
          )}
          {/* While a spotlight is active the canvas is dimmed; clicking the dimmed area
              (anywhere not inside the spotlit card) releases it, so the user is never
              trapped. A click that lands on the spotlit card itself is left alone. Escape does
              the same (see the dismissSpotlight key listener above) — this is the app's main
              content region, so it can't be marked presentational, and no ARIA role fits "real
              content that also happens to dismiss an overlay on outside click." */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div
            className="canvas-scroll"
            ref={scrollRef}
            onClick={
              turn.spot
                ? (e) => {
                    if (!(e.target as HTMLElement).closest('.spotlit')) dismissSpotlight();
                  }
                : undefined
            }
          >
            <div className="topic-wrap">
              {/* Lives INSIDE the scrolled content (not the fixed stage) so strokes and
                  confirm-highlights scroll along with the text they were drawn over instead of
                  staying pinned to the viewport while the answer moves underneath. Pointer events
                  still capture on the whole stage via rootRef — this only changes where the
                  (pointer-events:none) drawing surface itself sits. */}
              <UserInkLayer
                armed={inkArmed}
                rootRef={stageRef}
                onStroke={userInk.onStroke}
                onTap={userInk.onTap}
                strokes={userInk.strokes}
                highlights={userInk.highlights}
              />
              {errorPanel}
              {!viewingLive && (
                <div className="viewing-past" role="status">
                  {previewing ? <Icon.table /> : <Icon.clock />}
                  <span>
                    {previewing ? 'Viewing this thread together' : 'Viewing an earlier moment'}
                  </span>
                  <button
                    type="button"
                    className="viewing-past-back"
                    onClick={() => (previewing ? turn.previewSpec(null) : turn.jumpTo(liveIndex))}
                  >
                    Return to live
                  </button>
                </div>
              )}
              {!askHintSeen && pinned.length === 0 && (
                <div className="ask-hint" role="note">
                  <Icon.chat />
                  <span>
                    Tap <strong>Ask</strong> on any element to ask Mavéa about it.
                  </span>
                  <button
                    type="button"
                    className="ask-hint-x"
                    aria-label="Dismiss tip"
                    onClick={dismissAskHint}
                  >
                    <Icon.x />
                  </button>
                </div>
              )}
              {activeCourse && (
                <LazyOverlay>
                  <CourseRail
                    // Keyed by course+lesson so a mid-checkpoint CheckpointPanel/`checking` state
                    // never survives into the next lesson's own checkpoint questions — Prev/Next is
                    // intentionally never disabled while checking, so this remount is what makes
                    // that soft gating safe instead of corrupting the next recordCheckpoint call.
                    key={`${activeCourse.id}:${lessonIdx}`}
                    course={activeCourse}
                    lessonIdx={lessonIdx}
                    progress={courseProgress ?? getCourseProgress(activeCourse.id)}
                    onPrev={() => openCourseLesson(activeCourse, lessonIdx - 1)}
                    onNext={() => openCourseLesson(activeCourse, lessonIdx + 1)}
                    onCheckpoint={recordLessonCheckpoint}
                    busy={turn.busy}
                  />
                </LazyOverlay>
              )}
              {/* In a course lesson the CourseRail above already frames the lesson ("Lesson N of M"
                  + objectives), so the Live answer hero underneath — the "YOU — Lesson N" echo and
                  the "N claims inferred" line — is redundant and made the lesson read as a Live
                  Q&A stapled onto the course ("combines live with the course"). Drop it there; the
                  lesson is just the rail + its canvas. */}
              {hero && !activeCourse && (
                <AnswerHero
                  question={hero.question}
                  narration={hero.narration}
                  sources={shownSpec?.sources}
                  inferred={heroInferred}
                  tint={heroTint}
                />
              )}
              {/* Restoring a saved answer awaits its family chunks before the swap (see
                  restoreCanvas) — acknowledge the tap immediately instead of sitting dead. */}
              {restoring && <PendingShell label="Opening saved answer…" overlay />}
              <Suspense
                fallback={
                  /* The canvas chunk itself is still downloading (cold session restore on a slow
                     link) — hold the space with the same skeleton cards the family gate shows,
                     so the wait reads as "cards coming" rather than a blank band. */
                  <div
                    className="canvas-loading"
                    role="status"
                    aria-busy="true"
                    aria-label="Loading canvas"
                  >
                    <div className="skel-grid">
                      <CanvasSkeleton blocks={CANVAS_LOADING_SHAPE} />
                    </div>
                  </div>
                }
              >
                <TopicCanvas
                  key={
                    previewing
                      ? 'thread-' + (turn.viewOverride?.id ?? '')
                      : viewingLive
                        ? 'live-' + turn.replaceEpoch
                        : 'view-' + turn.viewIndex
                  }
                  data={scrubSpec ?? turn.viewSpec ?? turn.spec}
                  spot={viewingLive ? turn.spot : null}
                  built={{}}
                  onProve={() => setProofOpen(true)}
                  onAskBlock={togglePin}
                  onAddToDashboard={(b) =>
                    setPinBlock({ block: b, question: hero?.question ?? undefined })
                  }
                  selectedBlockIds={pinnedIds}
                  onNarrate={narrateBlock}
                  narratingId={narratingId}
                  muted={muted}
                  studyAsides={studyAsides}
                  viewMode={viewMode}
                  onViewMode={setViewMode}
                  presenting={presenting}
                  // The margin-note gutters (one per side): latched once per turn at walk
                  // start — only turns that ARRIVED muted with a spoken tour reserve them, and
                  // they hold for the whole turn. Mute flips after that change sound, never
                  // layout (mid-walk mute keeps its notes in the pen log + Focus trail instead).
                  // Live head only — a scrubbed past frame shows no rail.
                  noteGutter={
                    viewingLive && cfg.annotationsEnabled && noteRailFits && noteGutterTurn
                  }
                  walkNotes={viewingLive ? walkNotes : undefined}
                  voiceLine={spokenNow ?? null}
                  speaking={speakingSticky && !voicePreparing}
                  lead={turn.narration ?? undefined}
                  studyIntro={tourMode.current ? 'skip' : 'full'}
                  blankFill={
                    // The Blank Space wiring — only the live head (never a scrubbed/past frame).
                    viewingLive
                      ? {
                          values: turn.filled,
                          activeKey: turn.activeBlank,
                          fill: turn.fill,
                          unfill: turn.unfill,
                          activate: turn.setActiveBlank,
                          complete: turn.complete,
                          busy: turn.busy,
                        }
                      : undefined
                  }
                  bend={
                    // The slider belongs to the LIVE canvas only — never a scrub rebuild or an
                    // older frame being viewed, where its block id may not even exist.
                    viewingLive && scrubT === null ? turn.spec?.bend : undefined
                  }
                  onAddToFlashcard={addToFlashcard}
                  flashedIds={flashedIds}
                  belowHeaderSlot={
                    hero && viewedAudio ? (
                      <VoiceScrubber audio={viewedAudio} t={scrubT} onSeek={onScrub} />
                    ) : undefined
                  }
                  /* The world's entrance sits BESIDE "View as canvas" because it is that button's
                     peer: Canvas puts this answer's cards in space, World opens why the answer is
                     true. Absent — not dimmed — on the many answers that have no world: a control
                     the reader can never use on most questions teaches them to stop looking, and
                     its appearing is itself the signal that this answer has causes worth tracing. */
                  viewSlot={
                    // Not gated on `viewingLive`: a world belongs to the answer that earned it, and
                    // it is already built and stored on that answer's own block — so scrolling back
                    // to an earlier question must offer its world again, not only the newest one's.
                    worldOffered ? (
                      <button
                        type="button"
                        className="canvas-open world-open"
                        title={WORLD_VIEW_HINT}
                        aria-label={WORLD_VIEW_LABEL}
                        onClick={() => enterWorld()}
                      >
                        <Icon.globe className="ic" aria-hidden />
                        {WORLD_VIEW_LABEL}
                      </button>
                    ) : undefined
                  }
                  headerSlot={
                    viewingLive ? (
                      <>
                        {/* Anchor wrapper — the popover floats below this div via position:absolute. */}
                        <div className="pen-anchor" ref={penAnchorRef}>
                          <PenPill
                            enabled={cfg.annotationsEnabled}
                            open={trackVisible}
                            inkCount={drawnEntries.length}
                            onClick={() => setTrackVisible((v) => !v)}
                          />
                          {trackVisible && (
                            <div className="pen-popover">
                              <GestureTrack
                                entries={drawnEntries}
                                turnStartMs={turnStartMsRef.current}
                                annotationsEnabled={cfg.annotationsEnabled}
                                hiddenSpots={hiddenSpots}
                                onToggle={togglePen}
                                onKeep={() => setTrackVisible(false)}
                                onClear={() => {
                                  setInked([]);
                                  setDrawnInk(new Set());
                                  setHiddenSpots(new Set());
                                  setTrackVisible(false);
                                }}
                                onClip={() => setShareOpen(true)}
                                onJumpTo={jumpToSpot}
                                onToggleSpot={toggleSpot}
                              />
                            </div>
                          )}
                        </div>
                      </>
                    ) : undefined
                  }
                />
              </Suspense>
              {/* Mavéa's orange marks unmount during a Watch Me Think takeover so the prior
                  answer's ink can't bleed over the mindshape (they redraw on return). `inkSuppressed`
                  does the same for one commit around a canvas restore/replace — see restoreCanvas. */}
              {viewingLive && !mindActive && !inkSuppressed && (
                <AnnotationLayer
                  spots={inkSpots}
                  revision={canvasRevision}
                  onPlaced={notePlaced}
                  liveSpot={turn.spot}
                />
              )}
              {turn.busy && viewingLive && (
                // Same centered column as the answer canvas, so the working state lines up with the
                // cards above instead of orphaning a skeleton/cue against the far edge.
                <div className="working-col">
                  <WorkingSkeletons cards={skeletonCards} />
                  {/* The unmistakable "still streaming" cue: keyed straight to busy (no mount
                      delay), so a partial canvas never reads as finished. Says "Thinking…" while a
                      reasoning model is still reasoning, so a long pre-answer phase never looks stuck. */}
                  <ComposingStatus thinking={turn.reasoning} />
                </div>
              )}
              {viewingLive && !turn.busy && (
                <LazyOverlay>
                  <UnderstoodPanel chips={turn.understood} onFix={fixUnderstanding} />
                </LazyOverlay>
              )}
              <AnswerFooter
                spec={turn.viewSpec ?? turn.spec}
                followups={followups}
                question={lastAsk ?? undefined}
                onAsk={submit}
                onTrack={() => setDashOpen(true)}
                onDeepZoom={
                  lastAsk
                    ? () => {
                        window.location.hash = `#/deepzoom?seed=${encodeURIComponent(lastAsk)}`;
                      }
                    : undefined
                }
                onCanvas={() => setViewMode('canvas')}
                // "See all N moments": compose the current answer's whole topic thread onto one
                // canvas. Offered only when this answer sits in a ≥2-moment thread and we're not
                // already viewing a composed thread. Shares the rail's onSeeTogether handler.
                onSeeAll={
                  !previewing && currentChapter && currentChapter.moments.length >= 2
                    ? () => onSeeTogether(currentChapter)
                    : undefined
                }
                threadCount={currentChapter?.moments.length}
                busy={turn.busy}
              />
            </div>
          </div>
        </div>
      ) : inWizard ? (
        <>
          <SetupWizard
            seed={seedQuery.current || undefined}
            speak={speak}
            goDemo={goDemo}
            onStart={(text) => {
              setConversationStarted(true);
              submit(text);
            }}
            onStartTalking={() => {
              setConversationStarted(true);
              if (!sttOk) {
                // No local microphone capture: land on the conversation surface with an honest notice
                // and the composer focused, instead of a silent dead end inside the wizard.
                setVoiceNotice(MIC_UNSUPPORTED_MSG);
                setComposerFocus((n) => n + 1);
                return;
              }
              void voice.start({ inCanvas: false });
            }}
            onSeeHow={() => setShowHow(true)}
            paletteSlot={
              <TopbarSearchButton onOpen={openPalette} preload={commandPaletteLoad.preload} />
            }
            launcherSlot={
              <>
                <StartWith
                  items={startWithItems}
                  onSeeHow={(f) => f.tourChapter && playFeatureDemo(f.tourChapter)}
                />
                {/* The Prism card's picker. The composer's paperclip is hidden here, and the
                    root-level drop target stages a file into an attach strip nobody can see — so
                    this is how a document gets in before there is a conversation.
                    Choosing a file OPENS the map: picking "Prism" and then a document is one
                    intention, and making the reader press the card a second time afterwards (with
                    nothing on screen saying to) is the kind of step that reads as the app having
                    ignored them. */}
                <input
                  ref={wizardFileRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = ''; // re-picking the same file must fire again
                    if (!files.length) return;
                    void onFiles(files).then((staged) => {
                      const docs = staged.filter(isExplodable);
                      if (docs.length) openExplode(docs);
                    });
                  }}
                />
                {/* What is staged, and how to change it. The real attach strip lives in the dock
                    the wizard hides, so a document picked here was invisible from the moment Prism
                    closed — and the launcher would then keep re-opening it with nothing on screen
                    saying why, or how to choose a different one. */}
                {attached.length > 0 && (
                  <div className="start-with-staged">
                    <ul className="start-with-files">
                      {attached.map((a, idx) => (
                        <li key={`${a.name}-${idx}`}>
                          <span className="start-with-file">{attachmentLabel(a)}</span>
                          <button
                            type="button"
                            className="start-with-drop"
                            onClick={() => removeAttachment(idx)}
                            aria-label={`Remove ${a.name}`}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="start-with-another"
                      onClick={() => wizardFileRef.current?.click()}
                    >
                      Choose a different file
                    </button>
                  </div>
                )}
                {/* The same strip is where a rejection ("too large", "not a supported type") has to
                    surface, or a refused file was a picker that opened and then simply nothing. */}
                {attachError && (
                  <p className="start-with-error" role="alert">
                    {attachError}
                  </p>
                )}
              </>
            }
            studySlot={<ReadyShelf onStudy={() => setSrsOpen(true)} />}
            librarySlot={
              libraryEntries.length > 0 ? (
                <LazyOverlay>
                  <Library
                    entries={libraryEntries}
                    onResume={(e) => {
                      setConversationStarted(true);
                      // A restored canvas carries no attachments from this session.
                      setTurnHadFiles(false);
                      setLastAsk(e.question ?? null);
                      activateEntry(e.id);
                      restoreCanvas(e.spec, e.question);
                    }}
                    onRemove={removeEntry}
                    heading="Pick up where you left off"
                    sub="Your conversations stay on this device — tap one to step back in."
                  />
                </LazyOverlay>
              ) : undefined
            }
          />
        </>
      ) : (
        /* conversationStarted=true and turn.spec still null: a turn is in-flight (or the very
           first turn failed). The orb and dock convey progress; a failed first turn shows the
           error state here so it's never mistaken for Mavéa still working. */
        <div className="presence-stage stage" data-active="1">
          {errorPanel && <div className="live-error-stage">{errorPanel}</div>}
          {turn.busy && (
            <div className="skel-stage">
              <WorkingSkeletons cards={skeletonCards} />
            </div>
          )}
        </div>
      )}

      {/* The Watch Me Think takeover mounts ONCE at the app root, never inside a stage: the
          spotlight walk PANS the canvas stage with a transform, and an overlay mounted inside
          inherits that pan — the map then covers a shifted rectangle with the old answer
          bleeding around it. Out here `inset: 0` means the whole app, in every branch (canvas,
          wizard, fresh session), which is also what the full-page takeover wants. */}
      {mindOverlay}

      {/* The world view, mounted at the app root for the same reason the map is: it is a full-page
          takeover, and a stage-mounted overlay would inherit the spotlight walk's pan. */}
      {inWorldView && (
        <LazyOverlay label="Living answer">
          <WorldOverlay
            spec={worldBlock.props.world ?? null}
            question={worldBlock.props.title}
            failed={worldFailed}
            onRetry={() => setWorldAttempt((n) => n + 1)}
            onClose={leaveWorldView}
            view={worldBlock.props.view}
            onExpandNode={expandWorldNode}
            autoWalk={seededWorldWalks && worldBlock.id === 'tour-world'}
            speakLine={speak}
          />
        </LazyOverlay>
      )}

      {/* Dragging a file over the surface — the only sign a document drop attaches at all,
          otherwise that capability is invisible until you stumble on the paperclip. */}
      {dragActive && (
        <div className="drop-hint" role="status" aria-live="polite">
          <Icon.paperclip />
          <span>Drop to attach — Mavéa reads PDFs, Office docs, and data files</span>
        </div>
      )}

      {/* "See how it works" — an on-demand, clearly-labeled example walkthrough */}
      {showHow && (
        <LazyOverlay>
          <HowItWorks onClose={() => setShowHow(false)} speak={speak} onFullTour={replayTour} />
        </LazyOverlay>
      )}
      {paletteOpen && (
        <LazyOverlay>
          <CommandPalette
            items={paletteItems}
            surface="live"
            onClose={closePalette}
            // The tour's palette chapter spotlights this panel — a stray Escape mustn't close it.
            pinned={tourMode.current && tourDrive.chapter?.id === 'palette'}
          />
        </LazyOverlay>
      )}

      {/* settings overlay (from the model chip) */}
      {showSettings && (
        <div
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 80,
            zIndex: 50,
          }}
        >
          <LazyOverlay>
            <LiveSettings
              onClose={() => setShowSettings(false)}
              initialTab={settingsTab}
              initialAdvancedYouOpen={showAdvancedYou}
            />
          </LazyOverlay>
        </div>
      )}

      {/* history + replay: scroll back through every turn and replay any moment
          (entry point lives in the rail header so the composer can't occlude it) */}
      {replayAt !== null && (
        <LazyOverlay>
          <ReplayOverlay
            frames={turn.frames}
            initialIndex={replayAt}
            speak={speak}
            cancelSpeak={cancelSpeech}
            onClose={() => setReplayAt(null)}
          />
        </LazyOverlay>
      )}
      {shareOpen && (
        <LazyOverlay>
          <ShareModal
            frames={turn.frames}
            retainedAudio={(frame) => audioStore.get(turnFrameId(frame))}
            onClose={() => setShareOpen(false)}
            onShared={() => interject.enqueue('clipShared')}
          />
        </LazyOverlay>
      )}
      {exportOpen && exportAnswers.length > 0 && (
        <LazyOverlay>
          <ExportModal
            answers={exportAnswers}
            defaultIndex={
              previewedChapter
                ? previewedChapter.moments[previewedChapter.moments.length - 1].frameIndex
                : exportAnswers.length - 1
            }
            defaultIndices={previewedChapter?.moments.map((m) => m.frameIndex)}
            onClose={() => setExportOpen(false)}
            guided={tourMode.current && tourDrive.chapter?.action.kind === 'export'}
          />
        </LazyOverlay>
      )}
      {dashOpen && (
        <LazyOverlay>
          <ExtractionPreview
            onClose={() => setDashOpen(false)}
            initialSourceId={activeEntryId ? 'lib-' + activeEntryId : undefined}
          />
        </LazyOverlay>
      )}
      {tourDashId && (
        // The walkthrough's finished dashboard — the real DashboardDetail over the real store,
        // in the same full-screen chrome the Canvas takeover uses.
        <div className="cv-takeover" role="dialog" aria-modal="true" aria-label="Living dashboard">
          <header className="cv-takeover-head">
            <div className="cv-takeover-id">
              <span className="cv-takeover-glyph" aria-hidden="true">
                ◎
              </span>
              <div className="cv-takeover-titles">
                <span className="cv-takeover-eyebrow">Living dashboard</span>
                <span className="cv-takeover-title">Investment growth · $10k at 7%</span>
              </div>
            </div>
            <button type="button" className="cv-takeover-close" onClick={() => setTourDashId(null)}>
              <span aria-hidden="true">←</span> Back to answer
            </button>
          </header>
          <div className="tour-dash-body">
            {/* Settings is a real hash-routed view outside the tour (#/dashboards/:id/settings);
                its own back/gear links stay real hrefs, which would yank the whole surface off
                #/live mid-tour, so the tour flips this LOCAL flag instead of following either. */}
            <LazyOverlay>
              {tourDashSettings ? (
                <DashboardSettings id={tourDashId} />
              ) : (
                <DashboardDetail id={tourDashId} />
              )}
            </LazyOverlay>
          </div>
        </div>
      )}
      {pinBlock && (
        <LazyOverlay>
          <PinToDashboard
            block={pinBlock.block}
            question={pinBlock.question}
            conversationTitle={turn.spec?.title}
            onClose={() => setPinBlock(null)}
            onAdded={(id, title) => setPinAdded({ id, title })}
          />
        </LazyOverlay>
      )}
      {pinAdded && (
        <DashPill
          dashboardId={pinAdded.id}
          dashboardTitle={pinAdded.title}
          onDismiss={() => setPinAdded(null)}
        />
      )}
      {turn.spec && (
        <LiveEvidence
          open={proofOpen}
          onClose={() => setProofOpen(false)}
          claim={turn.spec.title}
          conf={leadConf}
          sources={turn.spec.sources ?? []}
          hadFiles={turnHadFiles}
          blocks={turn.spec.blocks}
        />
      )}
      {/* Re-open, read-only, the Watch-Me-Think map a chat grew from (from the session rail). */}
      {mindView.open && (
        <LazyOverlay>
          <MindMapViewerDrawer
            open
            spec={mindView.spec}
            onClose={() => setMindView((v) => ({ ...v, open: false }))}
          />
        </LazyOverlay>
      )}
      {/* Past conversations — the saved-canvas library, reachable mid-session from the rail footer. */}
      {pastOpen && (
        <LazyOverlay>
          <LibraryOverlay
            entries={libraryEntries}
            onResume={(e) => {
              setConversationStarted(true);
              // A restored canvas carries no attachments from this session.
              setTurnHadFiles(false);
              setLastAsk(e.question ?? null);
              activateEntry(e.id);
              restoreCanvas(e.spec, e.question);
              setPastOpen(false);
            }}
            onRemove={removeEntry}
            onClose={() => setPastOpen(false)}
          />
        </LazyOverlay>
      )}
      {overviewOpen && (
        <Overview
          chapters={chapters}
          currentIndex={currentIndex}
          onJump={jumpToFrameSpot}
          onClose={() => setOverviewOpen(false)}
        />
      )}
      {zoomLevel && recapModel && (
        <LazyOverlay>
          <ZoomDeck
            model={recapModel}
            level={zoomLevel}
            onLevel={setZoomLevel}
            onJump={(i) => {
              turn.jumpTo(i);
              setZoomLevel(null);
            }}
            onClose={() => setZoomLevel(null)}
          />
        </LazyOverlay>
      )}
      {delegateOpen && (
        <LazyOverlay>
          <DelegatePanel
            cfg={toModelConfig(cfg)}
            memoryNodes={getMemoryNodes()}
            speak={speak}
            onDebrief={(ask) => {
              // Back to the real conversation with the debrief opener staged in the composer.
              setDelegateOpen(false);
              setValue(ask);
            }}
            onClose={() => setDelegateOpen(false)}
            onPrepTurn={(instruction, label) => {
              setDelegateOpen(false);
              setLastAsk(label);
              void turn.run(instruction, undefined, undefined, undefined, undefined, label);
            }}
          />
        </LazyOverlay>
      )}
      {recapOpen && recapModel && (
        <LazyOverlay>
          <Recap
            model={recapModel}
            onJump={(i) => {
              turn.jumpTo(i);
              setRecapOpen(false);
            }}
            onShare={
              turn.frames.length > 0
                ? () => {
                    setRecapOpen(false);
                    setShareOpen(true);
                  }
                : undefined
            }
            onClose={() => setRecapOpen(false)}
          />
        </LazyOverlay>
      )}
      {atlasOpen && (
        <LazyOverlay>
          <AtlasView
            records={getAtlas()}
            chapters={chapters}
            onLand={(rec) => {
              setAtlasOpen(false);
              const entry = matchLibraryEntry(rec, libraryEntries);
              setConversationStarted(true);
              setTurnHadFiles(false);
              if (entry) {
                // The Library still holds this canvas — land straight back in it.
                setLastAsk(entry.question ?? null);
                activateEntry(entry.id);
                restoreCanvas(entry.spec, entry.question);
              } else {
                // Evicted long ago: honestly re-ask the original question instead of
                // pretending we still have that answer.
                setLastAsk(rec.question);
                void turn.run(rec.question);
              }
            }}
            onGoDeeper={(question) => {
              setAtlasOpen(false);
              setConversationStarted(true);
              setTurnHadFiles(false);
              setLastAsk(question);
              void turn.run(question);
            }}
            autoTour={tourMode.current}
            onClose={() => setAtlasOpen(false)}
          />
        </LazyOverlay>
      )}
      {prismDocs && (
        <LazyOverlay>
          <PrismOverlay
            pdf={prismDocs}
            cfg={toModelConfig(cfg)}
            search={{
              enabled: cfg.searchMode !== 'off',
              providerId: cfg.searchProvider,
              apiKey: cfg.searchKeys[cfg.searchProvider],
            }}
            onClose={() => setPrismDocs(null)}
          />
        </LazyOverlay>
      )}
      {tourPrismDoc && (
        // The first-run tour's Prism: a baked analysis of a real public document, replayed key-free
        // through the full explode lifecycle (ignite → bloom → settle → briefing over the real
        // pages). Keyed by id so flipping docs re-mounts the overlay and replays the burst.
        <LazyOverlay>
          <TourPrism
            key={tourPrismDoc.id}
            doc={tourPrismDoc}
            cfg={toModelConfig(cfg)}
            onClose={() => setTourPrismDoc(null)}
          />
        </LazyOverlay>
      )}
      {synthesis && (
        <LazyOverlay>
          <SynthesisOverlay
            sources={synthesis}
            cfg={toModelConfig(cfg)}
            search={{
              enabled: cfg.searchMode !== 'off',
              providerId: cfg.searchProvider,
              apiKey: cfg.searchKeys[cfg.searchProvider],
            }}
            onClose={() => setSynthesis(null)}
          />
        </LazyOverlay>
      )}
      {ripple && (
        <LazyOverlay>
          <RippleOverlay
            model={ripple}
            cfg={toModelConfig(cfg)}
            speak={speak}
            showcase={tourMode.current}
            onClose={() => setRipple(null)}
          />
        </LazyOverlay>
      )}
      {srsOpen && (
        <LazyOverlay>
          <SrsReview onClose={() => setSrsOpen(false)} />
        </LazyOverlay>
      )}
      {flashAdd && (
        <LazyOverlay>
          <CardEditor
            mode="add"
            initial={flashAdd.initial}
            deck={flashAdd.deck}
            origin="block"
            source={flashAdd.source}
            heading={`Flashcards from ${blockLabel(flashAdd.block)}`}
            enrich={flashAdd.enrich}
            decks={listDecks()}
            onSaved={(added) => {
              if (added.length && flashAdd.block.id) {
                const id = flashAdd.block.id;
                setFlashedIds((s) => new Set(s).add(id));
              }
              showCardsPill(added);
            }}
            onClose={() => setFlashAdd(null)}
          />
        </LazyOverlay>
      )}
      {checkpointSuggest && (
        <div className="cards-pill" role="status" aria-live="polite">
          <Icon.layers />
          <span className="cards-pill-text">
            {checkpointSuggest.missedCards.length} card
            {checkpointSuggest.missedCards.length !== 1 ? 's' : ''} from this checkpoint
          </span>
          <button
            type="button"
            className="cards-pill-btn"
            onClick={() => setCheckpointSuggest(null)}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="cards-pill-btn cards-pill-primary"
            onClick={() => acceptCheckpointCards(checkpointSuggest)}
          >
            Add
          </button>
        </div>
      )}
      {!checkpointSuggest && styleAsk && (
        <div className="cards-pill is-ask" role="status" aria-live="polite">
          <div className="cards-pill-head">
            <Icon.layers />
            <span className="cards-pill-text">
              {styleAsk.count} card{styleAsk.count !== 1 ? 's' : ''} saved to “{styleAsk.deck}”
            </span>
          </div>
          <div className="cards-pill-ask">
            <span className="cards-pill-q">Want Mavéa to help you remember these?</span>
            <span className="cards-pill-sub">
              They&rsquo;ll come back for a quick practice every so often.
            </span>
            <div className="cards-pill-choices">
              <button
                type="button"
                className="cards-pill-btn"
                onClick={() => settleStyleAsk('collection')}
              >
                No thanks
              </button>
              <button
                type="button"
                className="cards-pill-btn cards-pill-primary"
                onClick={() => settleStyleAsk('spaced')}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
      {!checkpointSuggest && !styleAsk && cardsPill && (
        <div className="cards-pill" role="status" aria-live="polite">
          <Icon.layers />
          <span className="cards-pill-text">
            {cardsPill.count} card{cardsPill.count !== 1 ? 's' : ''} added
          </span>
          <button
            type="button"
            className="cards-pill-btn"
            onClick={() => {
              removeCards(cardsPill.ids);
              setCardsPill(null);
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className="cards-pill-btn cards-pill-primary"
            onClick={() => {
              window.location.hash = '#/flashcards';
              setCardsPill(null);
            }}
          >
            View
          </button>
        </div>
      )}
    </div>
  );
}
