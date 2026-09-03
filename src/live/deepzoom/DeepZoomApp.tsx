// DeepZoomApp.tsx — Powers-of-Ten semantic zoom surface (#/deepzoom).
//
// Tree model: 1 API call generates all 10 trunk levels upfront. Selecting a different
// chip at any level and clicking "zoom into X" forks: 1 more API call generates 10 new
// levels from that subtopic. Zooming back restores the original path. Zero wasted calls.
//
// The surface reads as one continuous descent: a single scale-ladder navigator on the
// left tracks all ten (or more) stops of the journey, while the reading stage dollies
// through each level over an ambient field that migrates hue as you go deeper.
//
// URL: #/deepzoom?q=how+does+my+body+make+energy
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { homeTarget } from '../../lib/homeTarget';
import { applyTheme, readTheme, writeTheme, type Theme } from '../../lib/theme';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import type { ModelConfig } from '../../types/mavea';
import { generateTrunk, generateBranch } from './generate';
import { ProviderGenerationBlockedError } from '../providers/spendPolicy';
import { DEEPZOOM_DEMO_TREE } from './demoTree';
import { buildDefaultPath, planZoomIn, scaleColor, scaleStops } from './nav';
import type { ZoomLevel, ZoomNode, ZoomTree } from './types';
import { stashCourseTopic } from '../course/courseSeed';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';
import './deepzoom.css';

// Length of the level-to-level dolly, in ms. Mirrors --dz-move in the stylesheet;
// used only to schedule teardown of the outgoing layer.
const MOVE_MS = 560;

/** Read one query param out of the current `#/deepzoom?…` hash (trimmed). SSR-safe. */
function hashParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get(name)?.trim() ?? '';
}

// ── icons ───────────────────────────────────────────────────────────────
function ZoomIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="6.5" cy="6.5" r="4" />
      <line x1="10" y1="10" x2="14" y2="14" />
    </svg>
  );
}

function SunIcon(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <circle cx="10" cy="10" r="3.6" />
      <path
        strokeLinecap="round"
        d="M10 2.4v1.8M10 15.8v1.8M17.6 10h-1.8M4.2 10H2.4M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3M15.4 15.4l-1.3-1.3M5.9 5.9L4.6 4.6"
      />
    </svg>
  );
}

function MoonIcon(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path strokeLinejoin="round" d="M16.5 11.4A6.6 6.6 0 1 1 8.6 3.5a5.2 5.2 0 0 0 7.9 7.9Z" />
    </svg>
  );
}

function CourseIcon(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5 8 2l6.5 3-6.5 3-6.5-3Z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6.6v3.2c0 .9 1.8 2.2 4 2.2s4-1.3 4-2.2V6.6"
      />
    </svg>
  );
}

// ── theme toggle ────────────────────────────────────────────────────────
function ThemeToggle(): ReactNode {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      applyTheme(next);
      writeTheme(next);
      return next;
    });
  }, []);
  return (
    <button
      type="button"
      className="dz-theme-toggle"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      title={theme === 'light' ? 'Dark theme' : 'Light theme'}
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

// ── top bar ─────────────────────────────────────────────────────────────
function TopBar({
  query,
  onMakeCourse,
  onNew,
}: {
  query?: string;
  /** Present only once a real topic is loaded (the session view) — stashes it and routes to
   *  #/courses, where the same generateCourse() flow a typed topic uses builds a syllabus from
   *  it. Omitted on the start/loading/error screens, which have no settled topic yet. */
  onMakeCourse?: () => void;
  /** Present in the session view: start a fresh Deep Zoom on a new topic without leaving for Live
   *  and back (which would just re-seed the same conversation topic). */
  onNew?: () => void;
}): ReactNode {
  // Back goes where you came from — Live if you have a session, the front door otherwise.
  const home = homeTarget();
  return (
    <header className="dz-topbar">
      <div className="dz-topbar-left">
        <button
          type="button"
          className="dz-back-btn"
          aria-label={`Back to ${home.label}`}
          title={`Back to ${home.label}`}
          onClick={() => {
            window.location.hash = home.href;
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3.5 5 8l4.5 4.5" />
          </svg>
        </button>
        <span className="dz-wordmark">
          Deep Zoom
          <span className="dz-wordmark-sub">powers of ten</span>
        </span>
        {query && <span className="dz-query">{query}</span>}
      </div>
      <div className="dz-topbar-right">
        {onNew && (
          <button
            type="button"
            className="dz-new-btn"
            onClick={onNew}
            aria-label="Start a new deep zoom"
            title="Start a new deep zoom on a different topic"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 3.5v9M3.5 8h9" />
            </svg>
            <span className="dz-new-btn-label">New</span>
          </button>
        )}
        {onMakeCourse && (
          <button
            type="button"
            className="dz-course-btn"
            onClick={onMakeCourse}
            aria-label="Turn this into a course"
            title="Turn this into a course"
          >
            <CourseIcon />
            <span className="dz-course-btn-label">Turn this into a course</span>
          </button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

// ── scale ladder (the single navigator) ─────────────────────────────────
function ScaleLadder({
  navNodes,
  current,
  onJump,
}: {
  navNodes: ZoomNode[];
  current: number;
  onJump: (i: number) => void;
}): ReactNode {
  const stops = scaleStops(navNodes, current);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Keep the active stop in view when the path is long enough to overflow. Guarded: scrollIntoView
  // isn't implemented everywhere (jsdom, very old browsers), and an unguarded call there throws
  // from inside this effect and takes the whole surface down — the scroll is a nicety, never worth
  // a crash.
  useEffect(() => {
    const el = trackRef.current?.querySelector<HTMLElement>('.dz-stop.is-current');
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [current, stops.length]);

  return (
    <nav className="dz-ladder" aria-label="Scale — jump to any level">
      <div className="dz-ladder-cap">
        <span>The descent</span>
        <span className="dz-ladder-count">
          {current + 1}
          <span className="dz-ladder-count-sep">/</span>
          {stops.length}
        </span>
      </div>
      <div className="dz-ladder-track" ref={trackRef}>
        {stops.map((stop) => (
          <button
            key={stop.id}
            type="button"
            className={`dz-stop is-${stop.state}`}
            style={{ '--stop-color': stop.color } as React.CSSProperties}
            aria-current={stop.state === 'current' ? 'true' : undefined}
            aria-label={`${stop.multiplier} · ${stop.label} · ${stop.title}`}
            onClick={() => onJump(stop.index)}
          >
            <span className="dz-stop-node" aria-hidden />
            <span className="dz-stop-mult">{stop.multiplier}</span>
            <span className="dz-stop-label">{stop.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ── one level of reading content ────────────────────────────────────────
interface LevelProps {
  node: ZoomNode;
  layer: 'current' | 'exiting';
  dir: 'in' | 'out';
  selectedIndex: number;
  generating: boolean;
  /** False when the selected chip leads nowhere this session can open — the canned walkthrough at
   *  a chip it was never authored for. The control says so instead of ignoring the press. */
  canZoom: boolean;
  onChipSelect: (i: number) => void;
  onZoomIn: () => void;
}

function Level({
  node,
  layer,
  dir,
  selectedIndex,
  generating,
  canZoom,
  onChipSelect,
  onZoomIn,
}: LevelProps): ReactNode {
  const { level, depth } = node;
  const color = scaleColor(depth);
  const interactive = layer === 'current';
  const selectedLabel = level.subtopics[selectedIndex] ?? level.subtopics[0];

  return (
    <article
      className={`dz-level is-${layer}`}
      data-dir={dir}
      style={{ '--dz-current': color } as React.CSSProperties}
      aria-hidden={!interactive}
      // The whole reading pane is replaced on every move, which drops keyboard focus to the top of
      // the document and tells a screen reader nothing. The stage catches focus here, and this is
      // the name it announces when it does.
      tabIndex={interactive ? -1 : undefined}
      role={interactive ? 'group' : undefined}
      aria-label={
        interactive ? `${level.multiplier} · ${level.scaleLabel} · ${level.title}` : undefined
      }
    >
      <div className="dz-scale-eyebrow">
        <span className="dz-scale-mult">{level.multiplier}</span>
        <span className="dz-scale-tick" />
        <span className="dz-scale-label">{level.scaleLabel}</span>
      </div>

      <h2 className="dz-title">{level.title}</h2>
      <p className="dz-body">{level.body}</p>

      <div className="dz-chips" role="group" aria-label="Zoom into a sub-area">
        {level.subtopics.map((topic, i) => (
          <button
            key={`${topic}-${i}`}
            type="button"
            tabIndex={interactive ? 0 : -1}
            className={'dz-chip' + (i === selectedIndex ? ' is-selected' : '')}
            aria-pressed={i === selectedIndex}
            onClick={() => interactive && onChipSelect(i)}
          >
            <span className="dz-chip-dot" aria-hidden />
            {topic}
          </button>
        ))}
      </div>

      {generating ? (
        <p className="dz-zoom is-loading">
          <span className="dz-zoom-spinner" aria-hidden />
          opening ten more levels…
        </p>
      ) : (
        <>
          <button
            type="button"
            tabIndex={interactive ? 0 : -1}
            className="dz-zoom"
            disabled={!canZoom}
            onClick={() => interactive && onZoomIn()}
          >
            <span className="dz-zoom-glyph" aria-hidden>
              <ZoomIcon />
            </span>
            Zoom into <strong>{selectedLabel}</strong>
          </button>
          {!canZoom && (
            <p className="dz-zoom-note">
              This sample descends one path. A live Deep Zoom forks into any sub-area.
            </p>
          )}
        </>
      )}
    </article>
  );
}

// ── session view ───────────────────────────────────────────────────────
interface SessionViewProps {
  tree: ZoomTree;
  generatingForId: number | null;
  query: string;
  allowBranchGeneration?: boolean;
  onBranchRequest: (
    parentId: number,
    subtopic: string,
    parentLevel: ZoomLevel,
    parentDepth: number,
  ) => void;
  /** Start a brand-new Deep Zoom — drop this tree and return to the start screen. */
  onNew: () => void;
}

function SessionView({
  tree,
  generatingForId,
  query,
  allowBranchGeneration = true,
  onBranchRequest,
  onNew,
}: SessionViewProps): ReactNode {
  // navPath starts as the full trunk; the overview (×1) is the natural entry point.
  const [navPath, setNavPath] = useState<number[]>(() => [...tree.trunkIds]);
  const [current, setCurrent] = useState(0);
  const [chipSels, setChipSels] = useState<number[]>(() =>
    tree.trunkIds.map((id) => {
      const n = tree.nodes.find((x) => x.id === id);
      return n?.level.selectedIndex ?? 0;
    }),
  );
  // The outgoing layer during a dolly: which index is leaving, and which way.
  const [motion, setMotion] = useState<{ from: number; dir: 'in' | 'out' } | null>(null);
  const currentRef = useRef(0);

  const navigate = useCallback((target: number, dir: 'in' | 'out') => {
    const from = currentRef.current;
    if (target === from) return;
    setMotion({ from, dir });
    currentRef.current = target;
    setCurrent(target);
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const from = currentRef.current;
      const clamped = Math.max(0, Math.min(navPath.length - 1, target));
      if (clamped === from) return;
      navigate(clamped, clamped > from ? 'in' : 'out');
    },
    [navPath.length, navigate],
  );

  // When a branch finishes generating, extend navPath with its default chain + dive in.
  const prevNodeCount = useRef(tree.nodes.length);
  useEffect(() => {
    if (tree.nodes.length === prevNodeCount.current) return;
    prevNodeCount.current = tree.nodes.length;
    if (navPath.length === 0) return;

    const frontierId = navPath[navPath.length - 1];
    const frontierNode = tree.nodes.find((n) => n.id === frontierId);
    if (!frontierNode) return;
    const chipIdx = chipSels[navPath.length - 1] ?? frontierNode.level.selectedIndex;
    const topic = frontierNode.level.subtopics[chipIdx];
    const child = tree.nodes.find((n) => n.parentId === frontierId && n.viaSubtopic === topic);
    if (!child || navPath.includes(child.id)) return;

    const chain = buildDefaultPath(tree.nodes, child);
    const target = navPath.length;
    setNavPath((p) => [...p, ...chain.map((n) => n.id)]);
    setChipSels((s) => [...s, ...chain.map((n) => n.level.selectedIndex)]);
    navigate(target, 'in');
  }, [tree.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodeById = useMemo(() => new Map(tree.nodes.map((n) => [n.id, n])), [tree.nodes]);
  const navNodes = navPath.map((id) => nodeById.get(id)).filter(Boolean) as ZoomNode[];

  const handleZoomIn = useCallback(
    (atIdx: number) => {
      const plan = planZoomIn(tree, navPath, chipSels, atIdx);
      if (!plan) return;
      if (plan.kind === 'navigate') {
        setNavPath(plan.navPath);
        setChipSels(plan.chipSels);
        navigate(plan.target, 'in');
        return;
      }
      // The canned walkthrough is finite and provider-free. At its frontier, remain on the final
      // authored level instead of silently turning a demo click or Space press into a model call.
      if (!allowBranchGeneration) return;
      // branch: drop any stale forward history, then request ten fresh levels.
      setNavPath(plan.navPath);
      setChipSels(plan.chipSels);
      if (generatingForId !== plan.parentId) {
        onBranchRequest(plan.parentId, plan.subtopic, plan.parentLevel, plan.parentDepth);
      }
    },
    [tree, navPath, chipSels, navigate, generatingForId, allowBranchGeneration, onBranchRequest],
  );

  // Keyboard: ← / ↑ zoom out, → / ↓ / Space zoom in (or fork at the frontier), Esc → overview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          // Space is a focused button's own activation key. Taking it globally meant the theme
          // toggle, the ladder stops and the chips all zoomed a level instead of doing their job.
          if (e.key === ' ' && el?.closest('button')) return;
          e.preventDefault();
          if (current < navPath.length - 1) goTo(current + 1);
          else handleZoomIn(current);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goTo(current - 1);
          break;
        case 'Escape':
          e.preventDefault();
          goTo(0);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, navPath.length, goTo, handleZoomIn]);

  // Retire the outgoing layer once the dolly has played.
  useEffect(() => {
    if (motion === null) return;
    const t = window.setTimeout(() => setMotion(null), MOVE_MS);
    return () => window.clearTimeout(t);
  }, [motion]);

  const selectChip = useCallback((idx: number, chipIdx: number) => {
    setChipSels((prev) => {
      const next = [...prev];
      next[idx] = chipIdx;
      return next;
    });
  }, []);

  const currentNode = navNodes[current];
  const color = scaleColor(currentNode?.depth ?? 0);
  const atFrontier = current === navPath.length - 1;
  const generatingHere = atFrontier && generatingForId === navPath[current];
  const dir = motion?.dir ?? 'in';
  const exitingNode = motion ? navNodes[motion.from] : undefined;

  // Will pressing the button move anything? Asked of the same planner the press runs, so the
  // control can never look live while `handleZoomIn` has already decided to do nothing — which is
  // what 20 of the walkthrough's 27 chips did, the frontier's default chip among them.
  const plan = planZoomIn(tree, navPath, chipSels, current);
  const canZoom = plan !== null && (plan.kind === 'navigate' || allowBranchGeneration);

  // Every move unmounts the level that was on screen, so a reader who zoomed from the control
  // inside it is left on <body> at the top of the document with nothing announced. Only when
  // focus was actually lost — a reader still standing on the ladder keeps their place there.
  const stageRef = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  useEffect(() => {
    if (!landed.current) {
      landed.current = true;
      return;
    }
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    stageRef.current
      ?.querySelector<HTMLElement>('.dz-level.is-current')
      ?.focus({ preventScroll: true });
  }, [current]);

  const makeCourse = useCallback(() => {
    stashCourseTopic(query);
    window.location.hash = '#/courses';
  }, [query]);

  return (
    <>
      <TopBar query={query} onMakeCourse={makeCourse} onNew={onNew} />
      <div className="dz-stage">
        <ScaleLadder navNodes={navNodes} current={current} onJump={goTo} />
        <div className="dz-reading" style={{ '--dz-current': color } as React.CSSProperties}>
          <div className="dz-field" aria-hidden />
          <div className="dz-levels" ref={stageRef}>
            {exitingNode && (
              <Level
                key={`x${motion?.from}`}
                node={exitingNode}
                layer="exiting"
                dir={dir}
                selectedIndex={chipSels[motion?.from ?? 0] ?? exitingNode.level.selectedIndex}
                generating={false}
                canZoom
                onChipSelect={() => {}}
                onZoomIn={() => {}}
              />
            )}
            {currentNode && (
              <Level
                key={`c${current}`}
                node={currentNode}
                layer="current"
                dir={dir}
                selectedIndex={chipSels[current] ?? currentNode.level.selectedIndex}
                generating={generatingHere}
                canZoom={canZoom}
                onChipSelect={(ci) => selectChip(current, ci)}
                onZoomIn={() => handleZoomIn(current)}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── example queries ────────────────────────────────────────────────────
const EXAMPLE_TOPICS = [
  'How does my body make energy?',
  'What is quantum entanglement?',
  'How does memory work?',
  'What is photosynthesis?',
  'How do vaccines work?',
  'What is machine learning?',
];

// ── start screen ───────────────────────────────────────────────────────
function StartScreen({
  onSubmit,
  seed,
}: {
  onSubmit: (q: string) => void;
  /** Carried over from a Live conversation: the field opens pre-filled with it (selected, so a
   *  keystroke replaces it) rather than auto-zooming — so the reader chooses THIS topic or another
   *  instead of Deep Zoom silently telescoping whatever they last asked about. */
  seed?: string;
}): ReactNode {
  const [val, setVal] = useState(seed ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus the composer on entry, imperatively — keeps the same "ready to type" landing as the
  // autoFocus prop would, without yanking screen-reader focus via the raw HTML attribute. When a
  // topic was carried in, select it so the reader can either zoom it (Enter) or type over it.
  useEffect(() => {
    inputRef.current?.focus();
    if (seed) inputRef.current?.select();
  }, [seed]);
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (val.trim()) onSubmit(val.trim());
  };
  return (
    <div className="dz-start">
      <TopBar />
      <div className="dz-start-body">
        <p className="dz-start-eyebrow">
          <span className="dz-start-eyebrow-dot" aria-hidden />
          ×1 → ×1,000,000,000
        </p>
        <h1 className="dz-start-title">
          Zoom into anything,
          <br />
          one power of ten at a time.
        </h1>
        <p className="dz-start-sub">
          Ten nested scales, from the broadest field down to the finest mechanism. Fork at any level
          to fall down a different path.
        </p>
        <FeatureUseNotice kind="learning" />
        {seed && (
          <p className="dz-start-carry" role="status">
            Carried over from your conversation — zoom into it, or ask about anything else.
          </p>
        )}
        <form className="dz-start-form" onSubmit={handleSubmit}>
          <div className="dz-start-composer">
            <ZoomIcon className="dz-start-composer-icon" />
            <input
              ref={inputRef}
              className="dz-start-input"
              type="text"
              placeholder="how does my body make energy?"
              value={val}
              aria-label="Topic to zoom into"
              onChange={(e) => setVal(e.target.value)}
            />
            <button type="submit" className="dz-start-btn" disabled={!val.trim()}>
              Zoom in
            </button>
          </div>
        </form>
        <div className="dz-start-chips">
          {EXAMPLE_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              className="dz-start-chip"
              onClick={() => onSubmit(topic)}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── loading screen ─────────────────────────────────────────────────────
function LoadingScreen({ query }: { query: string }): ReactNode {
  return (
    <div className="dz-loading-screen">
      <TopBar query={query} />
      <div className="dz-loading">
        <div className="dz-loading-lens" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="dz-loading-text">Building ten scales of “{query}”…</span>
      </div>
    </div>
  );
}

// ── error screen ───────────────────────────────────────────────────────
function ErrorScreen({
  message,
  needsModel,
  onRetry,
}: {
  message: string;
  /** The failure was the missing model, not the topic. Retrying a different topic cannot fix it,
   *  so the screen names what is actually missing and offers the one thing that works without it. */
  needsModel: boolean;
  onRetry: () => void;
}): ReactNode {
  return (
    <div className="dz-loading-screen">
      <TopBar />
      <div className="dz-error">
        <div className="dz-error-title">
          {needsModel ? 'Deep Zoom needs a model' : 'Couldn’t build the zoom'}
        </div>
        <div className="dz-error-body">
          {needsModel
            ? 'Every descent is written on the spot, so this one needs a model connected in Live. The sample below runs without one.'
            : message}
        </div>
        <div className="dz-error-actions">
          {needsModel && (
            <button
              type="button"
              className="dz-start-btn"
              onClick={() => {
                window.location.hash = '#/deepzoom?demo=1';
              }}
            >
              See a sample zoom
            </button>
          )}
          <button
            type="button"
            className={needsModel ? 'dz-error-alt' : 'dz-start-btn'}
            onClick={onRetry}
          >
            Try another topic
          </button>
        </div>
      </div>
    </div>
  );
}

// ── root ───────────────────────────────────────────────────────────────
export function DeepZoomApp(): ReactNode {
  useEffect(() => applyTheme(readTheme()), []);

  const [query, setQuery] = useState('');
  const [tree, setTree] = useState<ZoomTree | null>(null);
  const [loading, setLoading] = useState(false);
  // The message, plus whether the topic was ever the problem. "Try another topic" is the one action
  // that cannot help a reader with no model connected, and it used to be the only one offered.
  const [error, setError] = useState<{ message: string; needsModel: boolean } | null>(null);
  const [generatingForId, setGeneratingForId] = useState<number | null>(null);
  // A topic carried in from Live (?seed=) pre-fills the start screen WITHOUT auto-zooming, so the
  // reader chooses this topic or another. `?q=` still auto-runs (deep links, the walkthrough). Read
  // synchronously on first render (not in an effect) so the start screen's input is pre-filled on
  // its very first mount rather than a beat later.
  const [seed, setSeed] = useState(hashParam('seed'));

  const nextNodeId = useRef(0);
  const cfgRef = useRef<ModelConfig | null>(null);
  const queryRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    queryRef.current = q;
    nextNodeId.current = 0;
    setQuery(q);
    setTree(null);
    setError(null);
    setGeneratingForId(null);
    setLoading(true);
    try {
      const cfg = toModelConfig(getLiveConfigV2());
      cfgRef.current = cfg;

      // One call → all 10 trunk levels
      const { rangeStart, levels } = await generateTrunk(q, cfg, ac.signal);
      if (ac.signal.aborted) return;

      const nodes: ZoomNode[] = [];
      const trunkIds: number[] = [];
      let prevId: number | null = null;
      for (let i = 0; i < levels.length; i++) {
        const id = nextNodeId.current++;
        const prevNode = prevId !== null ? nodes.find((n) => n.id === prevId) : null;
        const viaSubtopic = prevNode
          ? (prevNode.level.subtopics[prevNode.level.selectedIndex] ?? null)
          : null;
        nodes.push({ id, parentId: prevId, viaSubtopic, level: levels[i], depth: i });
        trunkIds.push(id);
        prevId = id;
      }
      setTree({ query: q, rangeStart, nodes, trunkIds });
      setLoading(false);
    } catch (err) {
      // Only the current run owns the screen state. A run that was superseded (a newer ask aborted
      // it) must not flip loading off underneath the new run — that leaves query set, tree null and
      // loading false, i.e. a blank frame until the new run lands. `!aborted` ⟺ still the current run.
      if (!ac.signal.aborted) {
        setError({
          message: err instanceof Error ? err.message : 'Something went wrong.',
          needsModel:
            err instanceof ProviderGenerationBlockedError && err.reason === 'unconfigured',
        });
        setLoading(false);
      }
    }
  }, []);

  const handleBranchRequest = useCallback(
    async (parentId: number, subtopic: string, parentLevel: ZoomLevel, parentDepth: number) => {
      const cfg = cfgRef.current ?? toModelConfig(getLiveConfigV2());
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setGeneratingForId(parentId);
      try {
        // One call → 10 branch levels
        const levels = await generateBranch(
          queryRef.current,
          parentLevel,
          subtopic,
          parentDepth,
          cfg,
          ac.signal,
        );
        if (ac.signal.aborted) return;
        setTree((t) => {
          if (!t) return t;
          const newNodes = [...t.nodes];
          let prevId = parentId;
          for (let i = 0; i < levels.length; i++) {
            const id = nextNodeId.current++;
            const via = i === 0 ? subtopic : levels[i - 1].subtopics[levels[i - 1].selectedIndex];
            newNodes.push({
              id,
              parentId: prevId,
              viaSubtopic: via,
              level: levels[i],
              depth: parentDepth + 1 + i,
            });
            prevId = id;
          }
          return { ...t, nodes: newNodes };
        });
        setGeneratingForId(null);
      } catch {
        // A failed fork should never dead-end the journey — quietly drop back to the
        // frontier so the reader can pick a different chip or add a key.
        if (!ac.signal.aborted) setGeneratingForId(null);
      }
    },
    [],
  );

  // `?demo=1` (the walkthrough's "See how") loads a hand-authored telescope — the real thing, but
  // key-free: no generate() call, so a visitor with no model connected still sees Deep Zoom work.
  const showDemo = useCallback(() => {
    abortRef.current?.abort();
    setQuery(DEEPZOOM_DEMO_TREE.query);
    setTree(DEEPZOOM_DEMO_TREE);
    setError(null);
    setLoading(false);
  }, []);

  // Auto-run from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (params.get('demo') === '1') {
      showDemo();
      return;
    }
    const q = params.get('q')?.trim() ?? '';
    // A carried-over topic (?seed=) is read synchronously into `seed` above and only pre-fills the
    // start screen; only ?q= auto-runs.
    if (q) void run(q);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run when hash changes (e.g. from Live "Deep Zoom" button)
  useEffect(() => {
    const onChange = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#/deepzoom')) return;
      const params = new URLSearchParams(hash.split('?')[1] ?? '');
      if (params.get('demo') === '1') {
        if (query !== DEEPZOOM_DEMO_TREE.query) showDemo();
        return;
      }
      const q = params.get('q')?.trim() ?? '';
      if (q && q !== query) void run(q);
      // A fresh carried-over topic (Live "Deep Zoom" again) returns to the start screen pre-filled,
      // rather than silently re-zooming — mirrors the mount-time behaviour for an already-open app.
      else if (!q) {
        const s = params.get('seed')?.trim() ?? '';
        abortRef.current?.abort();
        setQuery('');
        setTree(null);
        setError(null);
        setSeed(s);
      }
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [query, run, showDemo]);

  // Start a fresh Deep Zoom: drop the current tree and return to the (empty) start screen. Clearing
  // the hash first means a stray ?q=/?seed= can't immediately re-seed or re-run underneath it.
  const startNew = useCallback(() => {
    abortRef.current?.abort();
    if (window.location.hash !== '#/deepzoom') window.location.hash = '#/deepzoom';
    setError(null);
    setSeed('');
    setQuery('');
    setTree(null);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setQuery('');
    setTree(null);
  }, []);

  const demoMode =
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('demo') === '1';

  return (
    <div className="deepzoom-app mavea-app">
      {!query && !loading && !tree && !error && (
        <StartScreen onSubmit={(q) => void run(q)} seed={seed} />
      )}
      {loading && <LoadingScreen query={query} />}
      {error && !loading && (
        <ErrorScreen message={error.message} needsModel={error.needsModel} onRetry={reset} />
      )}
      {tree && !loading && (
        <SessionView
          tree={tree}
          query={query}
          generatingForId={generatingForId}
          allowBranchGeneration={!demoMode}
          onBranchRequest={handleBranchRequest}
          onNew={startNew}
        />
      )}
    </div>
  );
}
