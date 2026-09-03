// RippleOverlay.tsx — the immersive Ripple surface. A change drops in and you watch it ripple
// outward. Structurally a sibling of Prism's PrismOverlay (scrim + panel + draggable drill-ins),
// but its backdrop is the system impact map and its left rail is the chapters of a change's story:
// Mavéa's read, the workspace, the impact map, the cascade, the migration, the safe rollout order,
// onboarding, the hotspots, the suggestions, and the gate.
//
// Every section — the read, the workspace, the impact map, the cascade, the migration, safe
// rollout, onboarding, hotspots, suggestions, and the gate — renders a real, grounded view driven
// by one ShipModel. Nothing here is invented.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { ModelConfig } from '../../types/mavea';
import { providerInfo } from '../providers/info';
import { proseForSpeech } from '../../lib/spokenText';
import type {
  Altitude,
  CourseCapstone,
  CourseLesson,
  LessonDetail,
  QuizQuestion,
  ShipCourse as CourseModel,
  ShipModel,
  ShipNode,
} from './model';
import { ImpactMap } from './ImpactMap';
import { parseUnifiedDiff, looksLikeDiff } from './ingest/parseDiff';
import { useFocusTrap } from '../useFocusTrap';
import { buildShipFromDiff } from './ingest/buildShip';
import { buildShipFromPaths } from './ingest/buildRepo';
import { mergeEnrichment } from './ingest/companionSchema';
import { planFor } from './ingest/tier';
import { cacheGet, cachePut, rippleCacheKey } from './cache';
import { getCourseMeta, setCourseMeta } from './courseStore';
import { attachIncident } from './ingest/incident';
import type { GitHubDiffResult } from './ingest/githubBrowser';
import { setGithubToken, clearGithubToken, hasGithubToken } from './ingest/githubToken';
import { parseGitHubInput } from './ingest/parseGitHubUrl';
import { listTracked, untrack, type TrackedItem } from './tracked';
import type { RepoAskContext } from './ask/repoAsk';
import { ShipVerdict } from './sections/ShipVerdict';
import './ripple.css';
import { AsyncSurface } from '../../components/AsyncSurface';
import { cachedImport } from '../../lib/cachedImport';
import { createPreloadableLazy, preloadIntentProps } from '../../lib/preloadableLazy';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';

type RippleGeneration = typeof import('./ingest/generate');
const loadRippleGeneration = cachedImport(
  (): Promise<RippleGeneration> => import('./ingest/generate'),
);
const enrichShipModel = (...args: Parameters<RippleGeneration['enrichShipModel']>) =>
  loadRippleGeneration().then((module) => module.enrichShipModel(...args));
const enrichIncident = (...args: Parameters<RippleGeneration['enrichIncident']>) =>
  loadRippleGeneration().then((module) => module.enrichIncident(...args));
const enrichOrientation = (...args: Parameters<RippleGeneration['enrichOrientation']>) =>
  loadRippleGeneration().then((module) => module.enrichOrientation(...args));
const enrichCourses = (...args: Parameters<RippleGeneration['enrichCourses']>) =>
  loadRippleGeneration().then((module) => module.enrichCourses(...args));
const enrichCourseClosing = (...args: Parameters<RippleGeneration['enrichCourseClosing']>) =>
  loadRippleGeneration().then((module) => module.enrichCourseClosing(...args));
const enrichLesson = (...args: Parameters<RippleGeneration['enrichLesson']>) =>
  loadRippleGeneration().then((module) => module.enrichLesson(...args));
const gatherLessonCode = (...args: Parameters<RippleGeneration['gatherLessonCode']>) =>
  loadRippleGeneration().then((module) => module.gatherLessonCode(...args));

type GitHubBrowser = typeof import('./ingest/githubBrowser');
const loadGitHubBrowser = cachedImport(
  (): Promise<GitHubBrowser> => import('./ingest/githubBrowser'),
);
const fetchPrDiff = (...args: Parameters<GitHubBrowser['fetchPrDiff']>) =>
  loadGitHubBrowser().then((module) => module.fetchPrDiff(...args));
const compareRefs = (...args: Parameters<GitHubBrowser['compareRefs']>) =>
  loadGitHubBrowser().then((module) => module.compareRefs(...args));
const fetchRepoTree = (...args: Parameters<GitHubBrowser['fetchRepoTree']>) =>
  loadGitHubBrowser().then((module) => module.fetchRepoTree(...args));

type OwnersModule = typeof import('./ingest/owners');
const loadOwners = cachedImport((): Promise<OwnersModule> => import('./ingest/owners'));
const resolveOwners = (...args: Parameters<OwnersModule['resolveOwners']>) =>
  loadOwners().then((module) => module.resolveOwners(...args));

type CodeContextModule = typeof import('./ingest/codeContext');
const loadCodeContext = cachedImport(
  (): Promise<CodeContextModule> => import('./ingest/codeContext'),
);
const gatherCodeContext = (...args: Parameters<CodeContextModule['gatherCodeContext']>) =>
  loadCodeContext().then((module) => module.gatherCodeContext(...args));
const repoFromLabel = (label?: string): string | undefined =>
  label ? /^([\w.-]+\/[\w.-]+)/.exec(label.trim())?.[1] : undefined;

const readSection = createPreloadableLazy(() =>
  import('./sections/ShipRead').then((m) => ({ default: m.ShipRead })),
);
const incidentSection = createPreloadableLazy(() =>
  import('./sections/ShipIncident').then((m) => ({ default: m.ShipIncident })),
);
const workspaceSection = createPreloadableLazy(() =>
  import('./sections/ShipWorkspace').then((m) => ({ default: m.ShipWorkspace })),
);
const cascadeSection = createPreloadableLazy(() =>
  import('./sections/ShipCascade').then((m) => ({ default: m.ShipCascade })),
);
const migrationSection = createPreloadableLazy(() =>
  import('./sections/ShipMigration').then((m) => ({ default: m.ShipMigration })),
);
const rolloutSection = createPreloadableLazy(() =>
  import('./sections/ShipRollout').then((m) => ({ default: m.ShipRollout })),
);
const courseSection = createPreloadableLazy(() =>
  import('./sections/ShipCourse').then((m) => ({ default: m.ShipCourse })),
);
const onboardingSection = createPreloadableLazy(() =>
  import('./sections/ShipOnboarding').then((m) => ({ default: m.ShipOnboarding })),
);
const hotspotsSection = createPreloadableLazy(() =>
  import('./sections/ShipHotspots').then((m) => ({ default: m.ShipHotspots })),
);
const suggestionsSection = createPreloadableLazy(() =>
  import('./sections/ShipSuggestions').then((m) => ({ default: m.ShipSuggestions })),
);
const gateSection = createPreloadableLazy(() =>
  import('./sections/ShipGate').then((m) => ({ default: m.ShipGate })),
);
const askController = createPreloadableLazy(() =>
  import('./ask/RippleAskController').then((m) => ({ default: m.RippleAskController })),
);
const RippleAskController = askController.Component;

const ShipRead = readSection.Component;
const ShipIncident = incidentSection.Component;
const ShipWorkspace = workspaceSection.Component;
const ShipCascade = cascadeSection.Component;
const ShipMigration = migrationSection.Component;
const ShipRollout = rolloutSection.Component;
const ShipCourse = courseSection.Component;
const ShipOnboarding = onboardingSection.Component;
const ShipHotspots = hotspotsSection.Component;
const ShipSuggestions = suggestionsSection.Component;
const ShipGate = gateSection.Component;

const lessonKey = (courseTitle: string, lessonTitle: string): string =>
  `${courseTitle}::${lessonTitle}`;

/** Best-effort localStorage (private mode / SSR safe) for small UI prefs like a dismissed hint. */
function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / disabled storage — a UI pref is best-effort, never fatal */
  }
}

/** The altitude ladder — one artifact that meets a new grad and a principal alike. */
const ALTITUDES: { id: Altitude; label: string }[] = [
  { id: 'newgrad', label: 'New grad' },
  { id: 'working', label: 'Working' },
  { id: 'principal', label: 'Principal' },
];

/** Providers capable of a deep read. With nothing connected, Ripple falls back to Gemini for
 *  the analysis — the floor still serves every visitor. */
const CAPABLE_PROVIDERS = new Set(['anthropic', 'openai', 'gemini', 'grok', 'openrouter']);

export interface RippleOverlayProps {
  /** The grounded picture of consequence to render (a worked example today, a real diff/repo later). */
  model: ShipModel;
  /** The model that answers "ask the PR" questions; null → those affordances stay quiet. */
  cfg?: ModelConfig | null;
  /** Speak a line (the orb narrates the walkthrough). Optional so the overlay works without voice. */
  speak?: (text: string) => void;
  /** True when the first-run tour is presenting the worked example — the GitHub intake never
   *  auto-opens on top of it (the demo IS the point; intake stays one click away). */
  showcase?: boolean;
  onClose: () => void;
}

type SectionId =
  | 'verdict'
  | 'read'
  | 'incident'
  | 'workspace'
  | 'impact'
  | 'cascade'
  | 'migration'
  | 'rollout'
  | 'course'
  | 'onboarding'
  | 'hotspots'
  | 'suggestions'
  | 'gate';

function preloadSection(id: SectionId): Promise<void> {
  const loaders: Partial<Record<SectionId, () => Promise<void>>> = {
    read: readSection.preload,
    incident: incidentSection.preload,
    workspace: workspaceSection.preload,
    cascade: cascadeSection.preload,
    migration: migrationSection.preload,
    rollout: rolloutSection.preload,
    course: courseSection.preload,
    onboarding: onboardingSection.preload,
    hotspots: hotspotsSection.preload,
    suggestions: suggestionsSection.preload,
    gate: gateSection.preload,
  };
  return loaders[id]?.() ?? Promise.resolve();
}

/** Ripple serves two developer jobs; the input decides which leads. A section belongs to one or both. */
type JobId = 'understand' | 'ship';
const JOB_LABEL: Record<JobId, string> = {
  understand: 'Understand',
  ship: 'Ship the change',
};

/** What's cached under the curriculum OUTLINE key: the courses AND the commit they were built at, so
 *  a cache hit still carries enough to detect that the code has since moved (never to auto-rebuild —
 *  that's a model call the reader chooses to spend). `commitSha` is absent when it was never resolved
 *  (a PR/diff analysis has no repo-wide commit). */
interface CachedOutline {
  courses: CourseModel[];
  commitSha?: string;
}

/** Extra state the rail's `applies` needs beyond the model — whether each on-demand group is mid-build,
 *  and whether a connected repo is available to build courses/orientation from. */
interface SectionCtx {
  orientation: SectionStatus;
  courses: SectionStatus;
  hasRepo: boolean;
}

interface SectionDef {
  id: SectionId;
  label: string;
  /** A one-line intent, shown under the title while the rich view is still being built. */
  intent: string;
  /** Which developer job(s) this section serves — drives the two-cluster rail. */
  jobs: JobId[];
  /** Hide the rail entry when there's nothing for it (honest — no empty chapters). */
  applies: (m: ShipModel, ctx: SectionCtx) => boolean;
}

/** Sections enrich in three INDEPENDENT groups, each loaded only when its section is opened: the
 *  verdict bundle (the floor + the streamed read), the orientation (Map & request life), and the
 *  courses (the heavy curriculum). Splitting them means opening "Map" never pays for the curriculum,
 *  and the curriculum never blocks anything until you actually open it. */
type EnrichGroup = 'verdict' | 'orientation' | 'courses';
/** `floor` = deterministic only, `enriching` = the model is sharpening it, `done`/`error` = settled. */
type SectionStatus = 'floor' | 'enriching' | 'done' | 'error';
const groupFor = (id: SectionId): EnrichGroup =>
  id === 'course' ? 'courses' : id === 'onboarding' ? 'orientation' : 'verdict';

const SECTIONS: SectionDef[] = [
  {
    id: 'verdict',
    label: 'Overview',
    intent: 'The verdict, the one thing to check, and the change rippling out.',
    jobs: ['ship'],
    // The verdict is about shipping a change — for a repo explore there's no change to judge.
    applies: (m) => m.changes.length > 0,
  },
  {
    id: 'read',
    label: 'Mavéa’s read',
    intent: 'The whole change in two sentences, risks pulled to the top.',
    jobs: ['ship', 'understand'],
    applies: (m) => !!m.pr.summary || m.changes.length > 0,
  },
  {
    id: 'course',
    label: 'Courses',
    intent: 'A leveled curriculum built from THIS code — beginner → expert, with checkpoints.',
    jobs: ['understand'],
    // Show whenever courses exist, are being built, or can be built (a connected repo).
    applies: (m, ctx) => !!m.courses?.length || ctx.courses === 'enriching' || ctx.hasRepo,
  },
  {
    id: 'onboarding',
    label: 'Map & request life',
    intent: 'The modules, who owns what, and a request’s life through the code.',
    jobs: ['understand'],
    applies: (m, ctx) => m.modules.length > 0 || ctx.hasRepo,
  },
  {
    id: 'incident',
    label: 'Incident',
    intent: 'A live alert, traced back to its likely cause — the rollback and who to wake.',
    jobs: ['ship', 'understand'],
    applies: (m) => !!m.incident,
  },
  {
    id: 'workspace',
    label: 'Workspace',
    intent: 'Pick a change — its diff, intent, and cause & effect assemble.',
    jobs: ['ship'],
    applies: (m) => m.changes.length > 0,
  },
  {
    id: 'impact',
    label: 'Impact map',
    intent: 'Everything this change touches, and what those changes hit downstream.',
    jobs: ['ship', 'understand'],
    applies: (m) => m.nodes.length > 0,
  },
  {
    id: 'cascade',
    label: 'The cascade',
    intent: 'How one line becomes a P0 — hop by hop, before anyone gets paged.',
    jobs: ['ship'],
    applies: (m) => m.cascades.length > 0,
  },
  {
    id: 'migration',
    label: 'The migration',
    intent: 'The cost of a schema change isn’t in the SQL — it’s in the table size.',
    jobs: ['ship'],
    applies: (m) => !!m.migration,
  },
  {
    id: 'rollout',
    label: 'Safe rollout',
    intent: 'One safe order — so you ship with your eyes open.',
    jobs: ['ship'],
    applies: (m) => m.rollout.length > 0,
  },
  {
    id: 'hotspots',
    label: 'The story',
    intent: 'Why a line exists, what it broke, and who to ask.',
    jobs: ['understand'],
    applies: (m) => m.hotspots.length > 0,
  },
  {
    id: 'suggestions',
    label: 'Suggestions',
    intent: 'The “did you think about X?” a staff engineer would raise — grounded, and rare.',
    jobs: ['ship'],
    applies: (m) => m.suggestions.length > 0,
  },
  {
    id: 'gate',
    label: 'The gate',
    intent: 'A picture for you, a pre-merge check for the agents.',
    jobs: ['ship'],
    // The gate is about shipping a change — not relevant when exploring a repo with no diff.
    applies: (m) => m.changes.length > 0,
  },
];

// `cfg` is the connected model. Ripple works fully without it (the deterministic floor); when it's
// present, a pasted/fetched diff is enriched with the model's read — strictly a read of the diff.
export function RippleOverlay({
  model,
  cfg,
  speak,
  showcase,
  onClose,
}: RippleOverlayProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  // Narration is OFF by default — the orb only speaks the walkthrough when the user turns it on.
  // (Quiet by default; the spoken lines were more noise than help when just clicking around.)
  const [narrate, setNarrate] = useState(false);
  const [active, setActive] = useState<SectionId>('verdict');
  const [altitude, setAltitude] = useState<Altitude>('working');
  // The model currently shown. Starts as whatever opened the overlay (the worked example today);
  // pasting a real diff swaps it in place without reopening.
  const [shown, setShown] = useState(model);
  const floorRef = useRef<ShipModel>(model);

  // Floor-first + progressive reveal: the deterministic floor (verdict, impact map, changes, gate)
  // paints instantly, then the model's read STREAMS in and onboarding/courses load lazily. We track a
  // per-group status instead of one full-screen spinner, so the screen is always useful and only the
  // part still sharpening shows a subtle cue. A newer analysis supersedes an in-flight VERDICT read via
  // enrichRun; the lazy loaders below supersede through their own AbortControllers instead.
  const [groupStatus, setGroupStatus] = useState<Record<EnrichGroup, SectionStatus>>({
    verdict: 'floor',
    orientation: 'floor',
    courses: 'floor',
  });
  const enrichRun = useRef(0);
  const enrichAbort = useRef<AbortController | null>(null); // the verdict run
  const orientationAbort = useRef<AbortController | null>(null); // the lazy "Map & request life" run
  const coursesAbort = useRef<AbortController | null>(null); // the lazy curriculum run
  const incidentAbort = useRef<AbortController | null>(null); // the incident-trace run
  // Has each on-demand group been started this session? Reset per analysis; on close+reopen the
  // overlay remounts, these reset, and everything regenerates fresh (never served stale).
  const orientationKicked = useRef(false);
  const coursesKicked = useRef(false);
  // What the lazy loaders need to read the repo (set when a connected change/repo is analysed).
  const repoRef = useRef<string | undefined>(undefined);
  const refRef = useRef<string | undefined>(undefined);
  // The concrete commit `refRef` resolved to, when known (only `exploreRepo`'s tree fetch resolves
  // one today) — a stable identity to detect drift against a course's stored build commit. undefined
  // when unknown (a PR/diff analysis never resolves a repo-wide commit), which honestly disables the
  // "code moved" staleness check rather than guessing.
  const commitShaRef = useRef<string | undefined>(undefined);
  // The last diff text handed to the verdict read, so "try again" can re-run it without asking the
  // user to re-paste. Cleared/replaced by every fresh analysis; unrelated to the deterministic floor.
  const lastDiffRef = useRef<{ text: string; repo?: string } | null>(null);
  // The verdict read failed outright (no key, a refusal, a network error) — the grounded floor is
  // still on screen; this just makes the failure honest instead of silent. Dismissible so it doesn't
  // nag once the reader has seen it; reset the instant a new attempt starts.
  const [verdictErrDismissed, setVerdictErrDismissed] = useState(false);

  // Ask — the grounded "explain anything about this repo/PR" rail. Its corpus is whatever's already
  // in memory (the file tree from a repo explore, deep lesson bodies once written, a session-scoped
  // file cache retrieval fills in) plus the retained diff text; see ask/repoAsk.ts. The rail always
  // opens — even with no model connected it's honest about not being able to answer (matching the
  // course/lesson degrade-gracefully pattern) rather than hiding the affordance outright.
  const [askOpen, setAskOpen] = useState(false);
  const [askSession, setAskSession] = useState(0);
  const [askSeed, setAskSeed] = useState<{ text: string; nonce: number } | null>(null);
  const treePathsRef = useRef<readonly string[]>([]);
  const fileCacheRef = useRef<Map<string, string>>(new Map());
  const lessonDetailsRef = useRef<Map<string, LessonDetail>>(new Map());
  const openAsk = useCallback((question: string) => {
    setAskSeed((s) => ({ text: question, nonce: (s?.nonce ?? 0) + 1 }));
    setAskOpen(true);
  }, []);
  const askCtx: RepoAskContext | null = useMemo(() => {
    if (!cfg) return null;
    return {
      model: shown,
      cfg,
      altitude,
      diffText: lastDiffRef.current?.text,
      repo: repoRef.current,
      gitRef: refRef.current,
      treePaths: treePathsRef.current,
      lessonDetails: lessonDetailsRef.current,
      fileCache: fileCacheRef.current,
    };
    // repoRef/refRef/treePathsRef change only alongside a `shown` update (every intake path sets
    // both together), and fileCacheRef/lessonDetailsRef are mutated in place — their identity never
    // changes, so a stale memo still reads live data through the same Map reference. (Ref reads
    // aren't tracked dependencies, so no exhaustive-deps suppression is needed here.)
  }, [cfg, shown, altitude]);
  // Reset the whole ask surface (thread + retrieval cache) whenever a fresh analysis lands — a new
  // repo/diff shouldn't answer from a stale session's fetched files or lesson bodies.
  const resetAsk = useCallback(() => {
    setAskSession((session) => session + 1);
    treePathsRef.current = [];
    fileCacheRef.current.clear();
    lessonDetailsRef.current.clear();
  }, []);

  const abortEnrich = useCallback(() => {
    enrichAbort.current?.abort();
    orientationAbort.current?.abort();
    coursesAbort.current?.abort();
    incidentAbort.current?.abort();
  }, []);
  useEffect(() => abortEnrich, [abortEnrich]);
  // A generation token bumped the instant a top-level intake action (a pasted diff, a GitHub fetch,
  // an incident alert, a repo explore) is ready to write `shown`. A GitHub fetch or repo-tree read has
  // no local cancel — closing/reopening the intake doesn't stop it — so a slow one can still be in
  // flight after a faster action already took over the view; this lets that late arrival recognize
  // it's stale and bail instead of clobbering what the user is now looking at.
  const actionSeq = useRef(0);

  // When the overlay is (re)opened with a new model (e.g. the worked example, or a tracked item), show
  // it as-is — it's already whatever it is, so nothing is "enriching".
  useEffect(() => {
    setShown(model);
    floorRef.current = model;
    repoRef.current = undefined;
    orientationKicked.current = true;
    coursesKicked.current = true;
    setGroupStatus({
      verdict: 'done',
      orientation: model.modules.length ? 'done' : 'floor',
      courses: model.courses?.length ? 'done' : 'floor',
    });
  }, [model]);

  // Front door: the FIRST time Ripple opens, show the rich worked example plainly. EVERY time after,
  // open the GitHub intake on top of it — GitHub is the front door, and the worked example stays one
  // click away (close the intake, or hit "Run on your own code →"). Only applies to the example launch.
  const didInitIntake = useRef(false);
  useEffect(() => {
    if (didInitIntake.current) return;
    didInitIntake.current = true;
    if (!model.provenance.example || showcase) return;
    if (safeLocalGet('ripple.seenWorkedExample') === '1') {
      setIntakeMode('github');
      setPasteOpen(true);
    } else {
      safeLocalSet('ripple.seenWorkedExample', '1');
    }
  }, [model.provenance.example, showcase]);

  // Ripple's analysis wants a CAPABLE model to write a deep read. If a Live model is connected,
  // use it; otherwise fall back to Gemini's own Live default (taken from the registry so it can't
  // drift) — the dev proxy injects the key, so an empty apiKey here is fine and the key never
  // reaches the browser.
  const analysisCfg = useMemo<ModelConfig>(() => {
    if (cfg && CAPABLE_PROVIDERS.has(cfg.provider)) return cfg;
    return { provider: 'gemini', model: providerInfo('gemini').defaultModel, apiKey: '' };
  }, [cfg]);

  // Size the work to the model WITHOUT ever changing it (token caps, course count, code-context gate,
  // thinking level). A slow/cheap model gets a lean, fast read instead of a minute-long stall.
  const plan = useMemo(() => planFor(analysisCfg), [analysisCfg]);

  // A quiet, one-time nudge: only when the connected model is slow AND the user hasn't dismissed it.
  // We never auto-switch; this just lets them know a flash/lite model would feel instant.
  const [hintDismissed, setHintDismissed] = useState(
    () => safeLocalGet('ripple.hint.fastModel.dismissed') === '1',
  );
  const [analyzed, setAnalyzed] = useState(false); // an analysis has run this session (gates the hint)
  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    safeLocalSet('ripple.hint.fastModel.dismissed', '1');
  }, []);

  // The verdict read itself — shared by a fresh analysis and a "try again" after a failure. `built`
  // is the immutable, deterministic floor it enriches FROM (never mutated by a failed attempt).
  const runVerdictEnrich = useCallback(
    (built: ShipModel, text: string, repo?: string) => {
      const runId = ++enrichRun.current;
      enrichAbort.current?.abort();
      const ac = new AbortController();
      enrichAbort.current = ac;
      setVerdictErrDismissed(false);
      setGroupStatus((s) => ({ ...s, verdict: 'enriching' }));
      void (async () => {
        // With a connected repo (and a tier that affords it), read the real code first — the changed
        // files and the ACTUAL callers across the repo (fetched in parallel) — so the model grounds
        // its cascade/blast in those.
        const codeContext =
          repo && plan.fetchCodeContext
            ? await gatherCodeContext(built, repo, undefined, ac.signal).catch(() => '')
            : '';
        if (ac.signal.aborted || enrichRun.current !== runId) return;
        // Stream the read in: each completed field merges onto the immutable floor as it lands, so the
        // verdict sharpens in place instead of appearing all at once.
        const final = await enrichShipModel(built, text, analysisCfg, {
          signal: ac.signal,
          codeContext: codeContext || undefined,
          maxTokens: plan.enrichMaxTokens,
          thinkingLevel: plan.thinkingLevel,
          onPartial: (enr) => {
            if (enrichRun.current === runId)
              setShown(mergeEnrichment(built, enr, analysisCfg.model));
          },
        });
        if (enrichRun.current !== runId) return;
        if (final) {
          setShown(final);
          floorRef.current = final;
          setGroupStatus((s) => ({ ...s, verdict: 'done' }));
        } else {
          // A genuine failure (no key, a refusal, a dropped connection) — never show a stale partial
          // merge as if it were a real read. Fall back cleanly to the grounded floor and say so.
          setShown(built);
          floorRef.current = built;
          setGroupStatus((s) => ({ ...s, verdict: 'error' }));
        }
      })();
    },
    [analysisCfg, plan],
  );

  const analyzeDiff = useCallback(
    (text: string, label?: string, repo?: string): number => {
      const built = buildShipFromDiff(parseUnifiedDiff(text), label);
      if (built.changes.length === 0) return 0;
      actionSeq.current++;
      // Floor-first: the deterministic picture (verdict, impact map, changes, gate) paints instantly.
      abortEnrich();
      floorRef.current = built;
      repoRef.current = repo;
      refRef.current = built.pr.branch || undefined;
      // A diff analysis never resolves a repo-wide commit — leave staleness detection honestly off.
      commitShaRef.current = undefined;
      lastDiffRef.current = { text, repo };
      // Orientation + courses load lazily, only when their section is opened. Reset per analysis.
      orientationKicked.current = false;
      coursesKicked.current = false;
      resetAsk();
      setShown(built);
      setActive('verdict');
      setAnalyzed(true);
      setGroupStatus({ verdict: 'enriching', orientation: 'floor', courses: 'floor' });
      runVerdictEnrich(built, text, repo);
      return built.changes.length;
    },
    [abortEnrich, runVerdictEnrich, resetAsk],
  );

  // "Try again" after a failed verdict read — re-runs the same diff through the same pipeline
  // without asking the reader to re-paste anything.
  const retryVerdict = useCallback(() => {
    const last = lastDiffRef.current;
    if (!last) return;
    runVerdictEnrich(floorRef.current, last.text, last.repo);
  }, [runVerdictEnrich]);

  // The areas onboarding/courses build from: the floor's areas (a repo explore) or, for a PR, the
  // areas derived from the changed files.
  const onboardingModules = useCallback((repo: string) => {
    const floor = floorRef.current;
    return floor.modules.length
      ? floor.modules
      : buildShipFromPaths(
          floor.changes.map((c) => c.file),
          repo,
          false,
        ).modules;
  }, []);

  // Lazy "Map & request life" — the LIGHTER Understand read (area purposes, a request's life, owners).
  // Runs only when that section is opened (or on a repo-explore landing), never blocking anything else.
  // Once per session; the floor areas show instantly while this sharpens them.
  const ensureOrientation = useCallback(
    (force = false) => {
      const repo = repoRef.current;
      if (!repo || (orientationKicked.current && !force)) return;
      orientationKicked.current = true;
      orientationAbort.current?.abort();
      const ac = new AbortController();
      orientationAbort.current = ac;
      setGroupStatus((s) => ({ ...s, orientation: 'enriching' }));
      void (async () => {
        const base = { ...floorRef.current, modules: onboardingModules(repo) };
        const oriented = await enrichOrientation(base, repo, refRef.current, analysisCfg, {
          signal: ac.signal,
          maxTokens: plan.enrichMaxTokens,
          thinkingLevel: plan.thinkingLevel,
        }).catch(() => null);
        // This run's OWN AbortController is the staleness guard — a fresh analysis aborts it, and a
        // re-run aborts the one before. (The shared enrich counter is the verdict read's; a "try
        // again" there bumps it and would otherwise strand this section on "enriching" forever.)
        if (ac.signal.aborted) return;
        // Real, read-only owners onto the oriented areas/nodes (best-effort; degrades to no owners).
        const out = oriented
          ? await resolveOwners(oriented, repo, refRef.current, ac.signal).catch(() => oriented)
          : { ...floorRef.current, modules: onboardingModules(repo) };
        if (ac.signal.aborted) return;
        setShown((cur) => ({
          ...cur,
          modules: out.modules,
          nodes: out.nodes,
          onboarding: out.onboarding,
        }));
        setGroupStatus((s) => ({ ...s, orientation: oriented ? 'done' : 'error' }));
      })();
    },
    [analysisCfg, plan, onboardingModules],
  );

  // Lazy curriculum — the HEAVIEST call. Runs ONLY when the Courses section is opened (never on
  // landing). Once per session; Regenerate forces a rebuild.
  const ensureCourses = useCallback(
    (force = false, focus?: string) => {
      const repo = repoRef.current;
      if (!repo || (coursesKicked.current && !force)) return;
      coursesKicked.current = true;
      coursesAbort.current?.abort();
      const ac = new AbortController();
      coursesAbort.current = ac;
      // Bound the outline so a hanging model fails cleanly (the grounded floor keeps showing) instead
      // of leaving the Courses view stuck "enriching" forever. The light outline is fast in the common
      // case; this only catches a stalled provider.
      const timer = setTimeout(() => ac.abort(), 90_000);
      setGroupStatus((s) => ({ ...s, courses: 'enriching' }));
      void (async () => {
        try {
          // Cache the OUTLINE (content-addressed by repo+ref+model) so reopening never re-spends tokens
          // on the same syllabus; Regenerate (`force`) bypasses the read to rebuild fresh. The stored
          // value carries the commit it was built at, so a later visit can tell the code moved without
          // another model call — just to detect that, never to auto-rebuild (that costs tokens the
          // reader should choose to spend).
          const okey = rippleCacheKey(
            `courses|${repo}|${refRef.current ?? ''}|${focus ?? ''}`,
            analysisCfg.model,
          );
          const cached = force ? null : await cacheGet<CachedOutline>(okey);
          // This run's OWN AbortController is the staleness guard — see ensureOrientation.
          if (ac.signal.aborted) return;
          const base = { ...floorRef.current, modules: onboardingModules(repo) };
          const courses =
            cached?.courses ??
            (await enrichCourses(base, repo, refRef.current, analysisCfg, {
              signal: ac.signal,
              count: plan.courseCount,
              maxTokens: plan.coursesMaxTokens,
              thinkingLevel: plan.thinkingLevel,
              focus,
            }).catch(() => undefined));
          if (ac.signal.aborted) return;
          if (courses?.length) {
            setShown((cur) => ({ ...cur, courses }));
            setGroupStatus((s) => ({ ...s, courses: 'done' }));
            const commitSha = cached ? cached.commitSha : commitShaRef.current;
            if (!cached) void cachePut(okey, { courses, commitSha: commitShaRef.current });
            // Record what this curriculum is built from — a fresh build AND a cache hit both count as
            // "currently on screen", so either way the meta reflects it.
            setCourseMeta(repo, {
              commitSha: commitSha ?? '',
              ref: refRef.current ?? '',
              model: analysisCfg.model,
              builtAt: Date.now(),
              courseTitles: courses.map((c) => c.title),
            });
          } else {
            setGroupStatus((s) => ({ ...s, courses: 'error' }));
          }
        } finally {
          // Cleared on EVERY exit — an early bail (or a throw) used to leave the 90s watchdog pending,
          // holding this run's whole closure alive long after it was done.
          clearTimeout(timer);
        }
      })();
    },
    [analysisCfg, plan, onboardingModules],
  );

  // Rebuild the curriculum from the latest code (the "Regenerate" affordance).
  const regenerate = useCallback(() => ensureCourses(true), [ensureCourses]);
  // Which area the course is focused on (undefined = whole repo). Picking one rebuilds the outline
  // centered on that subsystem — the "smart focus" for large repos where a whole-repo skim is too thin.
  const [courseFocus, setCourseFocus] = useState<string | undefined>(undefined);
  const pickCourseFocus = useCallback(
    (area?: string) => {
      setCourseFocus(area);
      coursesKicked.current = false;
      ensureCourses(true, area);
    },
    [ensureCourses],
  );

  // "Since your last visit": diff the exact range between the commit a course was BUILT at and the
  // one just resolved, so the course view can show what moved without spending a model call to find
  // out (compareRefs is a read-only GitHub connector call, not a generation). Read-only, like every
  // other GitHub connector Ripple calls.
  const compareSinceBuilt = useCallback(
    (oldSha: string, newSha: string): Promise<GitHubDiffResult> => {
      const repo = repoRef.current;
      if (!repo) return Promise.resolve({ ok: false, detail: 'No connected repo.' });
      return compareRefs(oldSha, newSha, repo);
    },
    [],
  );

  // Load ONE lesson's deep, in-depth body on demand (reading its real code), cached so reopening the
  // same lesson never re-spends tokens. `force` rebuilds it fresh. Returns null if it can't be built.
  const loadLessonDetail = useCallback(
    async (
      course: CourseModel,
      lesson: CourseLesson,
      force = false,
      altitude?: Altitude,
    ): Promise<LessonDetail | null> => {
      const repo = repoRef.current;
      if (!repo) return null;
      // These file reads cost no model call, so always gather fresh rather than trust a possibly-
      // stale `ref` — the content hash addresses the cache key, so a lesson whose real files changed
      // misses cleanly and regenerates ONLY ITSELF, never the branch name standing in for identity.
      const { codeContext, contentHash } = await gatherLessonCode(lesson, refRef.current, repo);
      const lkey = rippleCacheKey(
        `lesson|${repo}|${course.title}|${lesson.title}|${altitude ?? 'working'}|${contentHash}`,
        analysisCfg.model,
      );
      if (!force) {
        const cached = await cacheGet<LessonDetail>(lkey);
        if (cached) {
          // Feeds the ask rail's corpus — a lesson already read (cache hit or fresh) becomes free
          // context the moment a question reaches for it, instead of the rail re-deriving it.
          lessonDetailsRef.current.set(lessonKey(course.title, lesson.title), cached);
          return cached;
        }
      }
      const detail = await enrichLesson(course, lesson, codeContext, analysisCfg, {
        maxTokens: plan.lessonMaxTokens,
        thinkingLevel: plan.thinkingLevel,
        altitude,
      }).catch(() => null);
      if (detail) {
        void cachePut(lkey, detail);
        lessonDetailsRef.current.set(lessonKey(course.title, lesson.title), detail);
      }
      return detail;
    },
    [analysisCfg, plan],
  );

  // Load ONE course's closing check (its end-of-week quiz + capstone) on demand — the token-heavy part,
  // built only when the reader opens that course, cached so reopening never re-spends tokens. `force`
  // rebuilds it fresh. Returns undefined if it can't be built (the course just shows without a closing).
  const loadCourseClosing = useCallback(
    async (
      course: CourseModel,
      force = false,
    ): Promise<{ quiz?: QuizQuestion[]; capstone?: CourseCapstone } | undefined> => {
      const repo = repoRef.current;
      if (!repo) return undefined;
      const ckey = rippleCacheKey(
        `closing|${repo}|${course.title}|${refRef.current ?? ''}`,
        analysisCfg.model,
      );
      if (!force) {
        const cached = await cacheGet<{ quiz?: QuizQuestion[]; capstone?: CourseCapstone }>(ckey);
        if (cached) return cached;
      }
      // Bound a slow/hanging model so the closing fails cleanly ("Try again") instead of spinning
      // forever — the light outline already makes the common case fast; this covers the pathological one.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 90_000);
      const closing = await enrichCourseClosing(course, analysisCfg, {
        signal: ac.signal,
        maxTokens: plan.closingMaxTokens,
        thinkingLevel: plan.thinkingLevel,
      })
        .catch(() => undefined)
        .finally(() => clearTimeout(timer));
      if (closing) void cachePut(ckey, closing);
      return closing;
    },
    [analysisCfg, plan],
  );

  // Navigate to a section — and kick off its lazy loader the moment it's opened.
  const goTo = useCallback(
    (id: SectionId) => {
      setActive(id);
      const g = groupFor(id);
      if (g === 'courses') ensureCourses();
      else if (g === 'orientation') ensureOrientation();
    },
    [ensureCourses, ensureOrientation],
  );

  // The paste-a-diff intake — the no-account path to running Ripple on real code.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteErr, setPasteErr] = useState('');
  const runDiff = useCallback(() => {
    const text = pasteText.trim();
    if (!looksLikeDiff(text)) {
      setPasteErr(
        'That doesn’t look like a unified diff — paste the output of `git diff` (or a .diff / .patch file).',
      );
      return;
    }
    if (analyzeDiff(text) === 0) {
      setPasteErr('No changed files found in that diff.');
      return;
    }
    setPasteOpen(false);
    setPasteText('');
    setPasteErr('');
  }, [pasteText, analyzeDiff]);

  // GitHub intake (read-only): fetch a PR's or a branch-range's diff DIRECTLY from api.github.com,
  // then run it through the same pipeline. Ripple only ever READS — no merge/comment/approve path.
  type IntakeMode = 'github' | 'paste' | 'incident' | 'tracked';
  // From GitHub is the single supported intake (user-directed): point Ripple at a real PR/branch/repo.
  // The other modes' code is kept below but no longer surfaced as tabs. No gateway needed — public
  // repos read keyless, and a private repo reads with the user's own token (pasted into the intake,
  // kept encrypted on this device).
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('github');
  // Seed from storage so the Tracked tab (shown only when non-empty) appears on open if there are
  // already tracked items — not just after the tab is first clicked.
  const [tracked, setTracked] = useState<TrackedItem[]>(() => listTracked());
  // There is no "☆ Track" affordance while the tracked list has no way back onto the screen — saving
  // into a list nothing can reopen is a dead end. The list itself (tracked.ts, the rows below) stays
  // for when a reopen affordance lands.
  const openIntake = useCallback((mode: IntakeMode) => {
    setTracked(listTracked());
    setIntakeMode(mode);
    // Start each intake clean — don't carry over the last input/error (otherwise a re-open appends to
    // the previous link). Reflect whether a token is saved WITHOUT surfacing it (never auto-filled).
    setGhInput('');
    setGhErr('');
    setGhToken('');
    setGhTokenSaved(hasGithubToken());
    setPasteOpen(true);
  }, []);

  // Incident mode (reverse): paste a live alert; Ripple traces it back to the likely cause. If a
  // change is already open, the alert attaches to it (so the trace is grounded in that change).
  const [alertText, setAlertText] = useState('');
  const [alertErr, setAlertErr] = useState('');
  const runAlert = useCallback(() => {
    const text = alertText.trim();
    if (!text) {
      setAlertErr('Paste the alert, error, or log line that fired.');
      return;
    }
    actionSeq.current++;
    const base = shown.changes.length > 0 && !shown.provenance.example ? shown : undefined;
    const model = attachIncident(text, base);
    setShown(model);
    setActive('incident');
    setPasteOpen(false);
    setAlertText('');
    setAlertErr('');
    if (analysisCfg) {
      incidentAbort.current?.abort();
      const ac = new AbortController();
      incidentAbort.current = ac;
      void enrichIncident(model, text, analysisCfg, ac.signal).then((m) =>
        setShown((cur) => (cur.incident === model.incident ? m : cur)),
      );
    }
  }, [alertText, shown, analysisCfg]);
  const [ghInput, setGhInput] = useState(''); // the single smart input (a PR/repo/compare URL or shorthand)
  const [ghRepo, setGhRepo] = useState('');
  const [ghPr, setGhPr] = useState('');
  const [ghBase, setGhBase] = useState('');
  const [ghHead, setGhHead] = useState('');
  const [ghRef, setGhRef] = useState('');
  const [ghPath, setGhPath] = useState('');
  const [ghErr, setGhErr] = useState('');
  const [ghBusy, setGhBusy] = useState(false);
  // The optional GitHub token (private repos only). `ghToken` is the input value — never seeded from
  // storage; `ghTokenSaved` reflects only WHETHER one is stored on this device, not its value.
  const [ghToken, setGhToken] = useState('');
  const [ghTokenSaved, setGhTokenSaved] = useState(false);
  // Aborts the in-flight GitHub read on a superseding read or on unmount, so no fetch outlives its
  // caller. (analyzeDiff still bumps actionSeq to discard any stale reply that lands first.)
  const ghAbort = useRef<AbortController | null>(null);
  useEffect(() => () => ghAbort.current?.abort(), []);

  const fromGitHub = useCallback(
    async (fetcher: (signal: AbortSignal) => Promise<GitHubDiffResult>) => {
      const seq = actionSeq.current;
      ghAbort.current?.abort();
      const ac = new AbortController();
      ghAbort.current = ac;
      setGhBusy(true);
      setGhErr('');
      const res = await fetcher(ac.signal);
      // Superseded while in flight (aborted by a newer read, or a paste/alert already claimed the
      // view) — don't let a stale reply overwrite what's on screen now.
      if (ac.signal.aborted || seq !== actionSeq.current) return;
      setGhBusy(false);
      if (!res.ok || !res.diff) {
        setGhErr(res.detail);
        return;
      }
      // Hand analyzeDiff the repo (parsed from the label) — it reads the real code + callers.
      if (analyzeDiff(res.diff, res.label, repoFromLabel(res.label)) === 0) {
        setGhErr('That diff had no changed files to analyze.');
        return;
      }
      setPasteOpen(false);
    },
    [analyzeDiff],
  );
  const loadPr = useCallback(() => {
    const num = ghPr.trim();
    if (!num) {
      setGhErr('Enter a pull-request number.');
      return;
    }
    void fromGitHub((signal) => fetchPrDiff(num, ghRepo.trim() || undefined, signal));
  }, [ghPr, ghRepo, fromGitHub]);
  const compareGh = useCallback(() => {
    const base = ghBase.trim();
    const head = ghHead.trim();
    if (!base || !head) {
      setGhErr('Enter a base and a head ref to compare.');
      return;
    }
    void fromGitHub((signal) => compareRefs(base, head, ghRepo.trim() || undefined, signal));
  }, [ghBase, ghHead, ghRepo, fromGitHub]);

  // Store (encrypted, via keyVault) or clear the optional GitHub token. Clearing the input on save
  // keeps the secret out of the DOM; the reader picks it up on the next fetch.
  const saveGhToken = useCallback(() => {
    const value = ghToken.trim();
    if (!value) return;
    void setGithubToken(value).then((saved) => {
      setGhTokenSaved(saved);
      setGhToken('');
      if (saved) setGhErr('');
    });
  }, [ghToken]);
  const removeGhToken = useCallback(() => {
    void clearGithubToken().then(() => {
      setGhTokenSaved(false);
      setGhToken('');
    });
  }, []);

  // Explore a whole repo (or a folder) with no change — the onboarding view. Read-only. Args default
  // to the advanced fields, so the smart URL input can drive it directly with parsed values.
  const exploreRepo = useCallback(
    async (repoArg?: string, refArg?: string, pathArg?: string) => {
      const repoParam = (repoArg ?? ghRepo).trim() || undefined;
      const refParam = (refArg ?? ghRef).trim() || undefined;
      const pathParam = (pathArg ?? ghPath).trim();
      const seq = actionSeq.current;
      ghAbort.current?.abort();
      const ac = new AbortController();
      ghAbort.current = ac;
      setGhBusy(true);
      setGhErr('');
      const res = await fetchRepoTree(refParam, repoParam, ac.signal);
      // Superseded while the tree was in flight (aborted by a newer read, or a paste/alert already
      // landed) — don't let this late reply clobber the fresher view.
      if (ac.signal.aborted || seq !== actionSeq.current) return;
      setGhBusy(false);
      if (!res.ok || !res.paths) {
        setGhErr(res.detail);
        return;
      }
      const prefix = pathParam.replace(/^\/+|\/+$/g, '');
      const paths = prefix
        ? res.paths.filter((p) => p === prefix || p.startsWith(prefix + '/'))
        : res.paths;
      if (paths.length === 0) {
        setGhErr(`No files under “${prefix}”.`);
        return;
      }
      const label = prefix ? `${res.label ?? 'repo'}/${prefix}` : (res.label ?? 'repo');
      const floor = buildShipFromPaths(paths, label, res.truncated);
      const repo = repoFromLabel(res.label);
      const ref = refParam;

      // Floor-first: the file tree (areas) paints INSTANTLY. We land on "Map & request life" — the
      // light orientation enriches it on demand, and the heavy curriculum waits until Courses is opened
      // (so a big repo never stalls on the curriculum the way it used to). EXCEPT when this repo
      // already has a generated course on this device: that's a returning reader picking up where
      // they left off, so land straight on Courses (a cache hit — no extra model spend) instead of
      // making them detour through the map again.
      const alreadyHasCourse = repo ? !!getCourseMeta(repo) : false;
      actionSeq.current++;
      abortEnrich();
      ++enrichRun.current; // supersede any in-flight run
      floorRef.current = floor;
      repoRef.current = repo;
      refRef.current = ref;
      // The exact commit `ref` resolved to (only the tree fetch resolves one) — the identity a later
      // visit compares its stored course build against to notice the code moved.
      commitShaRef.current = res.sha;
      // A repo explore has no diff — clear a lingering one from an earlier diff analysis so the ask
      // rail never grounds a citation in a change that isn't what's now on screen.
      lastDiffRef.current = null;
      orientationKicked.current = false;
      coursesKicked.current = false;
      resetAsk();
      // The full tree the ask rail's local keyword retrieval ranks over — the same slice the floor
      // was built from. Set AFTER resetAsk (which clears it) so this explore's tree survives.
      treePathsRef.current = paths;
      setShown(floor);
      setActive(alreadyHasCourse ? 'course' : 'onboarding');
      setAnalyzed(true);
      setPasteOpen(false);
      setGroupStatus({ verdict: 'done', orientation: 'floor', courses: 'floor' });
      if (repo) {
        ensureOrientation(); // the lighter read for the landing; courses stay lazy otherwise
        if (alreadyHasCourse) ensureCourses();
      }
    },
    [ghRef, ghRepo, ghPath, abortEnrich, ensureOrientation, ensureCourses, resetAsk],
  );

  // The smart input: parse whatever was pasted (a PR/repo/compare/tree URL or a shorthand) and route
  // it to the right read-only connector — no need to pick the mode by hand.
  const runSmart = useCallback(() => {
    // No server-side "connected default" repo in the browser path — a bare `#123` resolves against
    // whatever the user typed in the advanced Repository field, if anything.
    const target = parseGitHubInput(ghInput, ghRepo.trim() || undefined);
    if (target.kind === 'invalid') {
      setGhErr(target.reason);
      return;
    }
    setGhErr('');
    if (target.kind === 'pr') {
      void fromGitHub((signal) => fetchPrDiff(target.prNumber, target.repo, signal));
    } else if (target.kind === 'compare') {
      void fromGitHub((signal) => compareRefs(target.base, target.head, target.repo, signal));
    } else {
      // 'tree' | 'repo' → explore (the Understand view)
      const ref = target.kind === 'tree' ? target.ref : undefined;
      const path = target.kind === 'tree' ? target.path : undefined;
      void exploreRepo(target.repo, ref, path);
    }
  }, [ghInput, ghRepo, fromGitHub, exploreRepo]);

  // The input decides the job: a change → Ship; a repo with none → Understand. The rail shows the
  // active job's sections first (its cluster carries the shared ones too), then the other job's
  // exclusive sections — so nothing is duplicated and the relevant work leads.
  const job: JobId = shown.changes.length > 0 ? 'ship' : 'understand';
  const railClusters = useMemo(() => {
    const ctx: SectionCtx = {
      orientation: groupStatus.orientation,
      courses: groupStatus.courses,
      hasRepo: !!repoRef.current,
    };
    const visible = SECTIONS.filter((s) => s.applies(shown, ctx));
    const other: JobId = job === 'ship' ? 'understand' : 'ship';
    const primary = visible.filter((s) => s.jobs.includes(job));
    const secondary = visible.filter((s) => !s.jobs.includes(job) && s.jobs.includes(other));
    return [
      { job, items: primary },
      { job: other, items: secondary },
    ].filter((c) => c.items.length > 0);
  }, [shown, groupStatus.orientation, groupStatus.courses, job]);
  // A flat list of every visible section id, for resolving the active section / stub fallback.
  const sections = useMemo(() => railClusters.flatMap((c) => c.items), [railClusters]);

  // Keep `active` valid: if the current section isn't available for this view, snap to the first one
  // (e.g. opening a repo-explore snapshot whose default 'verdict' doesn't apply with no changes).
  useEffect(() => {
    if (sections.length && !sections.some((s) => s.id === active)) {
      setActive(sections[0]!.id);
    }
  }, [sections, active]);

  // Grounded "ask about this": speaks the node's real contract/problem/fix (no invention) when
  // narration is on — a lightweight affordance, not a typed Q&A thread.
  // Grounded "ask about this": opens the Ask rail prefilled with a real question about the node —
  // this is the primary behavior and works with ZERO voice configured. Narration is purely additive
  // on top (it speaks the node's contract/problem/fix when the reader has opted in), never required.
  const onAsk = useCallback(
    (node: ShipNode) => {
      if (narrate && speak) {
        speak(
          proseForSpeech(
            `${node.label}. ${node.problem ?? node.contract ?? ''} ${node.fix ?? ''}`.trim(),
          ),
        );
      }
      openAsk(`Explain ${node.label}${node.contract ? ` — ${node.contract}` : ''}`);
    },
    [narrate, speak, openAsk],
  );

  // What the orb says when it opens a section — grounded in the real model (nothing invented), so
  // the walkthrough is voice-first. Concerned at a P0, calm at a clean section.
  const sayFor = useCallback(
    (id: SectionId): string => {
      const m = shown;
      switch (id) {
        case 'verdict':
          return m.pr.summary;
        case 'read':
          return m.pr.summary;
        case 'incident':
          return m.incident ? `${m.incident.symptom}. ${m.incident.rootCause}` : '';
        case 'workspace':
          return `Here are all ${m.changes.length} changes, grouped by subsystem. Pick one to see its diff and what it touches.`;
        case 'impact': {
          const breaks = m.nodes.filter((n) => n.status === 'breaks').length;
          return breaks
            ? `Everything this change touches. ${breaks} of these break — the coral lines are where.`
            : `Everything this change touches. Nothing breaks downstream.`;
        }
        case 'cascade': {
          const c = m.cascades[0];
          return c
            ? `Watch how one line becomes a ${c.incidentSeverity}: ${c.trigger}, and ${c.incident}.`
            : '';
        }
        case 'migration':
          return m.migration
            ? `The migration looks harmless, but on ${m.migration.rows} rows it costs ${m.migration.lockCost}.`
            : '';
        case 'rollout':
          return `Ship in this order and the change never breaks a caller mid-rollout.`;
        case 'course':
          return m.courses?.length
            ? `A guided curriculum — ${m.courses.length} ${m.courses.length === 1 ? 'course' : 'courses'} that take you from oriented to fearless, built from this code.`
            : `A leveled course, built from this code, so you can change it without fear.`;
        case 'onboarding':
          return `Understand the whole service — module by module, and a request's life through it.`;
        case 'hotspots':
          return `The story behind the lines worth knowing before you touch them.`;
        case 'suggestions':
          return `${m.suggestions.length} things worth your time. ${m.suppressedNits} shallow nits suppressed.`;
        case 'gate':
          return m.gate.rationale;
        default:
          return '';
      }
    },
    [shown],
  );

  // Escape dismisses the TOPMOST layer: the intake dialog, then the ask rail, then the overlay —
  // so it never yanks the whole surface out from under someone who just wanted to back out of a form.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (pasteOpen) {
        setPasteOpen(false);
        return;
      }
      if (askOpen) {
        setAskOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pasteOpen, askOpen]);

  // Traps Tab inside the dialog and restores focus to whatever opened it on close, so a
  // keyboard user doesn't get dropped into the page behind it. Escape is handled separately
  // above (a plain window listener, kept for parity with existing tests that dispatch the key
  // at window rather than on the dialog node).
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef);

  const pr = shown.pr;
  const isExample = shown.provenance.example;

  const renderSection = useCallback((): ReactElement => {
    switch (active) {
      case 'verdict':
        return (
          <ShipVerdict
            model={shown}
            altitude={altitude}
            onNavigate={(id) => goTo(id as SectionId)}
            onAsk={onAsk}
          />
        );
      case 'read':
        return <ShipRead model={shown} altitude={altitude} />;
      case 'incident':
        return <ShipIncident model={shown} altitude={altitude} />;
      case 'impact':
        return (
          <ImpactMap nodes={shown.nodes} edges={shown.edges} altitude={altitude} onAsk={onAsk} />
        );
      case 'workspace':
        return <ShipWorkspace model={shown} altitude={altitude} />;
      case 'cascade':
        return <ShipCascade model={shown} />;
      case 'migration':
        return <ShipMigration model={shown} altitude={altitude} />;
      case 'rollout':
        return <ShipRollout model={shown} altitude={altitude} />;
      case 'course':
        return (
          <ShipCourse
            model={shown}
            altitude={altitude}
            building={groupStatus.courses === 'enriching'}
            onRegenerate={repoRef.current ? regenerate : undefined}
            loadLessonDetail={repoRef.current ? loadLessonDetail : undefined}
            loadCourseClosing={repoRef.current ? loadCourseClosing : undefined}
            courseFocus={courseFocus}
            onCourseFocus={repoRef.current ? pickCourseFocus : undefined}
            speak={narrate ? speak : undefined}
            commitSha={repoRef.current ? commitShaRef.current : undefined}
            compareSinceBuilt={repoRef.current ? compareSinceBuilt : undefined}
            openFullAnalysis={repoRef.current ? analyzeDiff : undefined}
            onAskAboutLesson={openAsk}
          />
        );
      case 'onboarding':
        return <ShipOnboarding model={shown} altitude={altitude} />;
      case 'hotspots':
        return <ShipHotspots model={shown} altitude={altitude} />;
      case 'suggestions':
        return <ShipSuggestions model={shown} altitude={altitude} />;
      case 'gate':
        return <ShipGate model={shown} altitude={altitude} />;
      default: {
        // Exhaustiveness guard: every SectionId has a real case above, so this branch never runs.
        // If a new SectionId is ever added without a case here, `active` stops narrowing to
        // `never` and the line below fails to compile — a future unhandled section is a build
        // error, not a silent stub.
        const _exhaustive: never = active;
        throw new Error(`Ripple: no section renderer for "${_exhaustive}"`);
      }
    }
  }, [
    active,
    shown,
    altitude,
    onAsk,
    goTo,
    groupStatus.courses,
    regenerate,
    loadLessonDetail,
    loadCourseClosing,
    courseFocus,
    pickCourseFocus,
    compareSinceBuilt,
    analyzeDiff,
    narrate,
    speak,
    openAsk,
  ]);

  return (
    <div
      className="ripple-scrim"
      data-expanded={expanded ? 'true' : undefined}
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label="Close Ripple"
      onKeyDown={(e) => {
        // Only the scrim's OWN keys close it — a bubbled Enter/Space from an input or button inside
        // the panel is that control's, not a request to dismiss the overlay.
        if (e.target !== e.currentTarget) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onClose();
      }}
    >
      {/* Clicks inside the panel are swallowed so they don't bubble to the scrim above and close
          the dialog — a propagation guard, not a click affordance, so it has no keyboard twin. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <section
        className="ripple-panel"
        role="dialog"
        aria-label="Ripple"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── top bar ── */}
        <header className="ripple-head">
          <div className="ripple-id">
            <span className="ripple-word">Ripple</span>
            <span className="ripple-sep" aria-hidden="true" />
            <span className="ripple-repo">{pr.repo}</span>
            {pr.number && <span className="ripple-pr">{pr.number}</span>}
            {pr.branch && (
              <span className="ripple-branch">
                {pr.branch}
                {pr.base ? ` → ${pr.base}` : ''}
              </span>
            )}
          </div>
          <div className="ripple-head-right">
            {(pr.added != null || pr.removed != null) && (
              <span className="ripple-stat">
                {pr.added != null && (
                  <span className="ripple-add">+{pr.added.toLocaleString()}</span>
                )}{' '}
                {pr.removed != null && (
                  <span className="ripple-del">−{pr.removed.toLocaleString()}</span>
                )}
                {pr.files != null ? ` · ${pr.files} files` : ''}
              </span>
            )}
            {pr.p0Ways ? (
              <span className="ripple-p0" title="Ways this change could cause a P0">
                <span className="ripple-p0-dot" aria-hidden="true" />
                {pr.p0Ways} {pr.p0Ways === 1 ? 'way' : 'ways'} to cause a P0
              </span>
            ) : null}
            <button
              type="button"
              className={'ripple-ask-toggle' + (askOpen ? ' is-active' : '')}
              onClick={() => setAskOpen((v) => !v)}
              {...preloadIntentProps(askController.preload)}
              aria-pressed={askOpen}
              aria-label={askOpen ? 'Close the ask rail' : 'Ask about this repo or PR'}
              title={askOpen ? 'Hide ask' : 'Ask about this repo or PR'}
            >
              Ask
            </button>
            {speak && (
              <button
                type="button"
                className="ripple-iconbtn"
                onClick={() => setNarrate((v) => !v)}
                aria-pressed={narrate}
                aria-label={narrate ? 'Turn narration off' : 'Turn narration on'}
                title={narrate ? 'Narration on — the orb speaks the walkthrough' : 'Narration off'}
              >
                {narrate ? '🔊' : '🔇'}
              </button>
            )}
            <button
              type="button"
              className="ripple-iconbtn"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
              title={expanded ? 'Exit full screen' : 'Full screen'}
            >
              {expanded ? '⤡' : '⤢'}
            </button>
            <button
              type="button"
              className="ripple-iconbtn"
              onClick={onClose}
              aria-label="Close Ripple"
            >
              ✕
            </button>
          </div>
        </header>

        {plan.tier === 'slow-cheap' && analyzed && !hintDismissed && (
          <div className="ripple-hint" role="note">
            <span className="ripple-hint-text">
              Tip: a flash or lite model makes Ripple feel instant — your model still works, it’s
              just slower here.
            </span>
            <button
              type="button"
              className="ripple-hint-dismiss"
              onClick={dismissHint}
              aria-label="Dismiss tip"
            >
              Got it
            </button>
          </div>
        )}

        {(isExample || (shown.provenance.notes?.length ?? 0) > 0) && (
          <div className="ripple-example" data-real={isExample ? undefined : 'true'} role="note">
            <span className="ripple-example-dot" aria-hidden="true" />
            <span className="ripple-example-text">
              {isExample ? (
                <>
                  <strong>Worked example</strong> — a sample of a GitHub-connected analysis, not
                  your code. It shows only what GitHub gives us (diff, files, in-repo callers).
                </>
              ) : (
                <>
                  <strong>{shown.changes.length === 0 ? 'Exploring' : 'From your diff'}</strong> —{' '}
                  {shown.provenance.notes?.[0]}
                </>
              )}
            </span>
            <button
              type="button"
              className="ripple-example-cta"
              onClick={() => openIntake('github')}
            >
              {isExample ? 'Run on your own code →' : 'New'}
            </button>
          </div>
        )}

        {/* ── rail + main ── The deterministic floor paints instantly; the rail item and the section
            still being sharpened by the model carry a subtle cue — never a full-screen wall. ── */}
        <div className="ripple-body">
          <nav className="ripple-rail" aria-label="Sections">
            {railClusters.map((cluster) => (
              <div className="ripple-rail-group" key={cluster.job}>
                {/* Two jobs: only label the clusters when both are present, so a single-job view stays clean. */}
                {railClusters.length > 1 && (
                  <div className="ripple-rail-grouplabel">{JOB_LABEL[cluster.job]}</div>
                )}
                {cluster.items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="ripple-rail-item"
                    // Stable hook for the first-run tour's scripted rail navigation (see
                    // TourOps.rippleGoTo) — a real section id, not a screen position, so it
                    // survives the rail reflowing around whichever sections a given model applies.
                    data-ripple-section={s.id}
                    data-active={s.id === active ? 'true' : undefined}
                    data-enriching={
                      groupStatus[groupFor(s.id)] === 'enriching' ? 'true' : undefined
                    }
                    onClick={() => {
                      goTo(s.id);
                      if (narrate && speak) {
                        const line = sayFor(s.id);
                        if (line) speak(line);
                      }
                    }}
                    {...preloadIntentProps(() => preloadSection(s.id))}
                  >
                    <span className="ripple-rail-label">{s.label}</span>
                    {groupStatus[groupFor(s.id)] === 'enriching' && (
                      <span className="ripple-rail-spark" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            ))}
            <div className="ripple-rail-altitude">
              <div className="ripple-eyebrow">Explain for</div>
              <div className="ripple-alt" role="group" aria-label="Explanation altitude">
                {ALTITUDES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    data-active={altitude === a.id ? 'true' : undefined}
                    onClick={() => setAltitude(a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>
          <div className="ripple-main">
            {/* The course section owns its own richer building state (ShipCourse's skeleton), so
                the top cue is for the verdict/orientation groups — a labelled pill plus an
                indeterminate progress sweep, so "the model is sharpening this" reads as active
                work without a blocking spinner (the floor stays useful underneath). */}
            {groupStatus[groupFor(active)] === 'enriching' && groupFor(active) !== 'courses' && (
              <div className="ripple-sharpening-wrap">
                <div className="ripple-sharpening" role="status" aria-live="polite">
                  <span className="ripple-sharpening-dot" aria-hidden="true" />
                  {groupFor(active) === 'orientation'
                    ? 'Reading the repo to map it out…'
                    : 'Sharpening with the model’s read…'}
                </div>
                <div className="ripple-progress" aria-hidden="true" />
              </div>
            )}
            {/* The model's read genuinely failed (no key, a refusal, a dropped connection) — the
                grounded floor is still fully on screen above/below this; say so honestly instead
                of quietly passing the floor off as a real read, with a one-tap retry. */}
            {groupFor(active) === 'verdict' &&
              groupStatus.verdict === 'error' &&
              !verdictErrDismissed && (
                <div className="ripple-verdict-err" role="note">
                  <span className="ripple-verdict-err-text">
                    The model’s read didn’t land — showing the grounded floor. Connect a key in
                    Settings → Live, or try again.
                  </span>
                  <div className="ripple-verdict-err-actions">
                    <button
                      type="button"
                      className="ripple-verdict-err-retry"
                      onClick={retryVerdict}
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      className="ripple-verdict-err-dismiss"
                      onClick={() => setVerdictErrDismissed(true)}
                      aria-label="Dismiss"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            <AsyncSurface
              label={`${SECTIONS.find((section) => section.id === active)?.label ?? 'Ripple'} section`}
            >
              {renderSection()}
            </AsyncSurface>
          </div>
          {askOpen && (
            <AsyncSurface label="Ripple ask rail">
              <RippleAskController
                key={askSession}
                ctx={askCtx}
                onClose={() => setAskOpen(false)}
                altitude={altitude}
                seed={askSeed}
                repo={pr.repo || ''}
                gitRef={pr.branch || 'HEAD'}
                focusFile={shown.changes[0]?.file ?? shown.modules[0]?.entry}
              />
            </AsyncSurface>
          )}
        </div>

        {pasteOpen && (
          <div className="ripple-paste" role="dialog" aria-label="Run Ripple on a diff">
            <div className="ripple-paste-card">
              <div className="ripple-paste-head">
                <div>
                  <div className="ripple-paste-title">Run Ripple on your code</div>
                  <div className="ripple-paste-sub">
                    Read-only — Ripple analyzes a change and never writes, comments, or merges.
                  </div>
                </div>
                <button
                  type="button"
                  className="ripple-iconbtn"
                  onClick={() => setPasteOpen(false)}
                  aria-label="Cancel"
                >
                  ✕
                </button>
              </div>

              <FeatureUseNotice kind="code" from="live" />

              {/* From GitHub is the only surfaced intake (user-directed), so there's no tab row —
                  the modal opens straight onto the GitHub form. The other modes' render branches
                  remain below but are unreachable while `intakeMode` stays 'github'. */}
              {intakeMode === 'incident' ? (
                <>
                  <textarea
                    className="ripple-paste-input"
                    value={alertText}
                    onChange={(e) => {
                      setAlertText(e.target.value);
                      if (alertErr) setAlertErr('');
                    }}
                    placeholder={
                      'PagerDuty: [payments-api] P1 — 5xx rate 38% on /charge\nor paste the error / log line that fired'
                    }
                    spellCheck={false}
                  />
                  {alertErr && <div className="ripple-paste-err">{alertErr}</div>}
                  <div className="ripple-paste-actions">
                    <button type="button" className="ripple-paste-go" onClick={runAlert}>
                      Trace it back
                    </button>
                    <button
                      type="button"
                      className="ripple-paste-cancel"
                      onClick={() => setPasteOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="ripple-paste-hint">
                    Ripple traces the alert back to its likely cause — read-only. If a change is
                    open, the trace grounds in it. It never reverts, deploys, or pages anyone.
                  </div>
                </>
              ) : intakeMode === 'tracked' ? (
                <div className="ripple-tracked">
                  {tracked.length === 0 ? (
                    <div className="ripple-tracked-empty">
                      Nothing tracked yet. Open a change and hit <strong>☆ Track</strong> to keep an
                      eye on it — it’s saved on this device only.
                    </div>
                  ) : (
                    tracked.map((t) => (
                      <div key={t.id} className="ripple-tracked-row">
                        <button
                          type="button"
                          className="ripple-tracked-open"
                          onClick={() => {
                            setShown(t.model);
                            setActive('verdict');
                            setPasteOpen(false);
                          }}
                        >
                          <span className="ripple-tracked-label">{t.label}</span>
                          <span className="ripple-tracked-meta">
                            {t.source} · {t.model.changes.length || t.model.modules.length} items
                          </span>
                        </button>
                        <button
                          type="button"
                          className="ripple-iconbtn"
                          aria-label={`Untrack ${t.label}`}
                          onClick={() => {
                            untrack(t.id);
                            setTracked(listTracked());
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : intakeMode === 'paste' ? (
                <>
                  <textarea
                    className="ripple-paste-input"
                    value={pasteText}
                    onChange={(e) => {
                      setPasteText(e.target.value);
                      if (pasteErr) setPasteErr('');
                    }}
                    placeholder={
                      'diff --git a/auth/token.ts b/auth/token.ts\n@@ -42 +42 @@\n-validateToken(t: string)\n+validateToken(t: string, opts: VerifyOpts)'
                    }
                    spellCheck={false}
                  />
                  {pasteErr && <div className="ripple-paste-err">{pasteErr}</div>}
                  <div className="ripple-paste-actions">
                    <button type="button" className="ripple-paste-go" onClick={runDiff}>
                      Analyze diff
                    </button>
                    <button
                      type="button"
                      className="ripple-paste-cancel"
                      onClick={() => setPasteOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="ripple-paste-hint">
                    Parsed on your device first. The deterministic floor stays local; optional model
                    enrichment sends relevant diff and code context through this deployment to your
                    selected model.
                  </div>
                </>
              ) : (
                <div className="ripple-gh">
                  {/* The single smart input — paste any PR / repo / compare link, or a shorthand. */}
                  <label className="ripple-gh-field">
                    <span>
                      Paste a GitHub link
                      {ghRepo.trim() ? <em> — or a PR number for {ghRepo.trim()}</em> : null}
                    </span>
                    <input
                      value={ghInput}
                      onChange={(e) => {
                        setGhInput(e.target.value);
                        if (ghErr) setGhErr('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') runSmart();
                      }}
                      placeholder="github.com/owner/repo/pull/482 · owner/repo · a compare URL"
                      spellCheck={false}
                    />
                  </label>
                  <div className="ripple-paste-actions">
                    <button
                      type="button"
                      className="ripple-paste-go"
                      disabled={ghBusy}
                      onClick={runSmart}
                    >
                      {ghBusy ? 'Loading…' : 'Analyze'}
                    </button>
                    <button
                      type="button"
                      className="ripple-paste-cancel"
                      onClick={() => setPasteOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  {ghErr && <div className="ripple-paste-err">{ghErr}</div>}
                  <div className="ripple-paste-hint">
                    Read-only — Ripple reads the diff, files, and in-repo callers of a PR, branch,
                    or repo. It never comments, approves, or merges. Public repos need nothing.
                  </div>

                  {/* Optional GitHub token — only PRIVATE repos need it; public repos work keyless. */}
                  <div className="ripple-gh-token">
                    <div className="ripple-gh-row">
                      <label className="ripple-gh-field ripple-gh-grow">
                        <span>
                          GitHub token <em>— only for private repos</em>
                        </span>
                        <input
                          type="password"
                          value={ghToken}
                          onChange={(e) => setGhToken(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && ghToken.trim()) saveGhToken();
                          }}
                          placeholder={
                            ghTokenSaved
                              ? 'Saved on this device — paste a new token to replace it'
                              : 'github_pat_… or ghp_… (optional)'
                          }
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <button
                        type="button"
                        className="ripple-paste-go"
                        disabled={!ghToken.trim()}
                        onClick={saveGhToken}
                      >
                        Save
                      </button>
                      {ghTokenSaved && (
                        <button
                          type="button"
                          className="ripple-paste-cancel"
                          onClick={removeGhToken}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="ripple-paste-hint">
                      Stored encrypted in this browser and sent directly by the browser to
                      api.github.com for read requests. The token itself is not included in model
                      prompts. Use it only on a trusted device.
                    </div>
                    <div className="ripple-paste-hint">
                      Best: a <strong>fine-grained</strong> token with{' '}
                      <strong>Contents: read-only</strong>, scoped to the repos you want — one token
                      covers every repo it’s granted. A classic <code>repo</code>-scoped token
                      reaches all of your private repos.
                    </div>
                  </div>

                  <details className="ripple-gh-adv">
                    <summary>Advanced — exact PR #, compare refs, or a folder</summary>
                    <label className="ripple-gh-field">
                      <span>
                        Repository <em>— or paste a full GitHub link above</em>
                      </span>
                      <input
                        value={ghRepo}
                        onChange={(e) => setGhRepo(e.target.value)}
                        placeholder="owner/repo"
                        spellCheck={false}
                      />
                    </label>
                    <div className="ripple-gh-row">
                      <label className="ripple-gh-field ripple-gh-grow">
                        <span>Pull request #</span>
                        <input
                          value={ghPr}
                          onChange={(e) => {
                            setGhPr(e.target.value);
                            if (ghErr) setGhErr('');
                          }}
                          placeholder="4821"
                          spellCheck={false}
                        />
                      </label>
                      <button
                        type="button"
                        className="ripple-paste-go"
                        disabled={ghBusy}
                        onClick={loadPr}
                      >
                        {ghBusy ? 'Loading…' : 'Load PR'}
                      </button>
                    </div>
                    <div className="ripple-gh-or">or compare two refs (branch · tag · SHA)</div>
                    <div className="ripple-gh-row">
                      <label className="ripple-gh-field ripple-gh-grow">
                        <span>Base</span>
                        <input
                          value={ghBase}
                          onChange={(e) => setGhBase(e.target.value)}
                          placeholder="main"
                          spellCheck={false}
                        />
                      </label>
                      <label className="ripple-gh-field ripple-gh-grow">
                        <span>Head</span>
                        <input
                          value={ghHead}
                          onChange={(e) => setGhHead(e.target.value)}
                          placeholder="feat/short-lived-tokens"
                          spellCheck={false}
                        />
                      </label>
                      <button
                        type="button"
                        className="ripple-paste-go"
                        disabled={ghBusy}
                        onClick={compareGh}
                      >
                        {ghBusy ? 'Loading…' : 'Compare'}
                      </button>
                    </div>
                    <div className="ripple-gh-or">
                      or explore the whole repo (or a folder) — no change
                    </div>
                    <div className="ripple-gh-row">
                      <label className="ripple-gh-field ripple-gh-grow">
                        <span>
                          Ref <em>— branch / tag / SHA, defaults to HEAD</em>
                        </span>
                        <input
                          value={ghRef}
                          onChange={(e) => setGhRef(e.target.value)}
                          placeholder="main"
                          spellCheck={false}
                        />
                      </label>
                      <label className="ripple-gh-field ripple-gh-grow">
                        <span>
                          Folder <em>— optional path</em>
                        </span>
                        <input
                          value={ghPath}
                          onChange={(e) => setGhPath(e.target.value)}
                          placeholder="src/auth"
                          spellCheck={false}
                        />
                      </label>
                      <button
                        type="button"
                        className="ripple-paste-go"
                        disabled={ghBusy}
                        onClick={() => void exploreRepo()}
                      >
                        {ghBusy ? 'Loading…' : 'Explore'}
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
