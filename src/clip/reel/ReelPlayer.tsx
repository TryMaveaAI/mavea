// Plays a ReelScript: it owns the persistent chrome (wordmark, palette name, segmented progress and
// the floating orb) and swaps the active finish on a real-time timeline. Looping in the modal preview;
// a single deterministic pass when a clip is being captured (it calls onDone at the end so the
// recorder can stop). Finishes animate via CSS, so the offscreen rasterizer captures motion
// frame-by-frame. The outer `.reel` carries the chosen aspect, so capture rasterizes it 1:1.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './reel.css';
import type { ReelScript, ReelSlide } from './reelScript';
import { finishSurface, finishBleed } from './templates/registry';
import { SlideView } from './templates/SlideView';
import { FitScale } from './FitScale';
import { ReelJelly } from './ReelJelly';
import { ReelUnitsVersion } from './reelUnits';

/** Entrance transitions cycled across beats for a more cinematic, less cut-to-cut feel. */
const TRANSITIONS = ['up', 'left', 'zoom', 'wipe', 'fade'] as const;

/** Classify the board's measured shape into one of the three share formats. */
function aspectOf(w: number, h: number): '9:16' | '1:1' | '16:9' {
  const r = w / h;
  if (r < 0.8) return '9:16';
  if (r < 1.3) return '1:1';
  return '16:9';
}

/**
 * Set the aspect-stable design units (`--ru` vertical, `--rw` horizontal) and `data-aspect` on the
 * board, keyed off its SMALLER edge so type stays legible and cards never balloon when the board is
 * short-and-wide. In 9:16 these resolve to exactly `1cqh`/`1cqw` (the CSS defaults), so that format is
 * pixel-identical; the px values are what make 1:1 and 16:9 — and the rasterized export — correct.
 * Returns whether the units actually changed, so callers can bump `ReelUnitsVersion` only when
 * FitScale genuinely has something new to re-measure against (not on every incidental observer tick).
 */
function applyBoardMetrics(board: HTMLDivElement): boolean {
  const w = board.clientWidth;
  const h = board.clientHeight;
  if (!w || !h) return false;
  const rw = Math.min(w, h) / 100; // 9:16 → w/100 === 1cqw
  const ru = (rw * 16) / 9; // 9:16 → h/100 === 1cqh; ratio to --rw is invariant across formats
  const aspect = aspectOf(w, h);
  const nextRw = `${rw}px`;
  const changed =
    board.style.getPropertyValue('--rw') !== nextRw || board.dataset.aspect !== aspect;
  board.style.setProperty('--ru', `${ru}px`);
  board.style.setProperty('--rw', nextRw);
  board.dataset.aspect = aspect;
  return changed;
}

const isContent = (s: ReelSlide): boolean => s.template !== 'title' && s.template !== 'outro';
const isOutro = (s: ReelSlide): boolean => s.template === 'outro';
const isTitle = (s: ReelSlide): boolean => s.template === 'title';

/** How many content beats occur before slide `idx` — i.e. are already fully behind us. A bookend
 *  (a section title, or the final outro) reports this same count; only an actual content slide is
 *  ever "active", so a later section's title correctly shows the earlier beats as played without
 *  animating one of the segments (see `activeContentIndex`). */
function contentPlayedBefore(slides: ReelSlide[], idx: number): number {
  let c = 0;
  for (let i = 0; i < idx && i < slides.length; i++) if (isContent(slides[i])) c++;
  return c;
}

/** The content index CURRENTLY animating — only set while `idx` itself is a content slide, so every
 *  bookend (any title slide, the outro) freezes the strip instead of "claiming" the next segment. */
function activeContentIndex(slides: ReelSlide[], idx: number): number {
  const cur = slides[idx];
  return cur && isContent(cur) ? contentPlayedBefore(slides, idx) : -1;
}

export interface ReelPlayerProps {
  script: ReelScript;
  /** On-screen ms per slide; defaults to each slide's durationMs. The audio renderer co-times these. */
  timings?: number[];
  loop?: boolean;
  /** Fires once when a single (non-loop) pass finishes — the recorder stops here. */
  onDone?: () => void;
  /** The outer `.reel` element, for the offscreen rasterizer. */
  frameRef?: (el: HTMLDivElement | null) => void;
  /** Bump to (re)start playback from the first slide (e.g. to begin a capture pass). */
  playKey?: number;
  /** When false the timeline is held on the first slide — lets capture start it in lock-step with audio. */
  playing?: boolean;
  /** Slide to start on (used so Remix opens straight on a changed content beat, not the fixed intro). */
  initialIndex?: number;
  /** Fires each time a looping preview restarts — lets the modal resync the preview narration. */
  onCycle?: () => void;
  /** When true, the progress segments are clickable to jump to a content beat (preview scrubbing). */
  interactive?: boolean;
  /** Controlled pause state — when provided (not undefined), freeze/resume is driven by this prop
   *  instead of fully-internal state, so an on-screen pause button and the space-bar shortcut share
   *  one source of truth. Omit it (as the gallery does) for today's uncontrolled behavior. */
  paused?: boolean;
  /** Required alongside `paused` in controlled mode — called with the flipped value whenever
   *  something inside wants to toggle (currently just the space bar). */
  onPausedChange?: (paused: boolean) => void;
}

export function ReelPlayer({
  script,
  timings,
  loop = false,
  onDone,
  frameRef,
  playKey = 0,
  playing = true,
  initialIndex = 0,
  onCycle,
  interactive = false,
  paused: pausedProp,
  onPausedChange,
}: ReelPlayerProps) {
  const slides = script.slides;
  const durations = slides.map((s, i) => Math.max(800, Math.round(timings?.[i] ?? s.durationMs)));
  const start = Math.max(0, Math.min(initialIndex, slides.length - 1));
  const [idx, setIdx] = useState(start);
  const [cycle, setCycle] = useState(0);
  const controlledPause = pausedProp !== undefined;
  const [pausedState, setPausedState] = useState(false);
  const paused = controlledPause ? pausedProp! : pausedState;
  // Space bar (and, in a controlled ShareModal, a future on-screen button) both flip pause through
  // here — so keyboard and the controlled prop can never drift out of sync with each other.
  const togglePause = useCallback(() => {
    if (controlledPause) onPausedChange?.(!paused);
    else setPausedState((p) => !p);
  }, [controlledPause, paused, onPausedChange]);
  // Bumped every time applyBoardMetrics actually changes --ru/--rw — FitScale subscribes to this
  // (ReelUnitsVersion) to re-measure the instant real units land, rather than guessing via timers.
  const [unitsVersion, setUnitsVersion] = useState(0);
  const doneRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  // The outer `.reel` node. It carries the keyboard handler (arrows/space), so those shortcuts only
  // work while it — or a child — holds focus. We grab our own ref to it so the player can focus
  // ITSELF on mount when interactive (see below), instead of relying on a parent focus effect whose
  // timing against ref-callback churn and the modal focus-trap proved unreliable. `frameRef` (the
  // rasterizer's handle) is read through a ref so this callback stays stable and doesn't thrash the
  // DOM ref every render.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRefLatest = useRef(frameRef);
  frameRefLatest.current = frameRef;
  const setRoot = useCallback((el: HTMLDivElement | null): void => {
    rootRef.current = el;
    frameRefLatest.current?.(el);
  }, []);
  // Take keyboard focus the moment an interactive player mounts — and it remounts (via the caller's
  // React key) on every format switch, Remix, and timing sync, so ← → ↑ ↓ / space keep working
  // after those without a stray click. Non-interactive gallery tiles never grab focus.
  useEffect(() => {
    if (interactive) rootRef.current?.focus({ preventScroll: true });
  }, [interactive]);
  // Latest `paused`, readable from the advance effect's cleanup (a stale closure otherwise) — the
  // cleanup needs to know whether IT is the one pausing (bank the remaining time) or just a normal
  // slide change (nothing to bank).
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  // Time left on the CURRENT slide's advance timer, banked when space pauses it and consumed on
  // resume — so continuing a pause picks up where it left off instead of restarting the slide.
  const remainingRef = useRef<number | null>(null);
  const slideStartRef = useRef(0);

  // Set the design units + data-aspect in the ref callback — which runs during commit, BEFORE any
  // child useLayoutEffect — so FitScale measures against the correct, format-aware units on its very
  // first pass (an effect here would run after FitScale's child effect, leaving its first fit stale).
  const setBoard = useCallback((el: HTMLDivElement | null) => {
    boardRef.current = el;
    if (el && applyBoardMetrics(el)) setUnitsVersion((v) => v + 1);
  }, []);

  // Keep the units in step as the board resizes (tiny preview vs 1080px export, a format switch).
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const ro = new ResizeObserver(() => {
      if (applyBoardMetrics(board)) setUnitsVersion((v) => v + 1);
    });
    ro.observe(board);
    return () => ro.disconnect();
  }, []);

  // Restart whenever the caller asks (a fresh capture pass) or playback (re)starts.
  useEffect(() => {
    if (!playing) return;
    doneRef.current = false;
    setIdx(start);
    setCycle((c) => c + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, playing]);

  // Hold each slide for its duration, then advance / loop / finish. Pausing (space bar) freezes this
  // without losing the slide's place: the cleanup banks whatever time was left, and resuming starts a
  // fresh timeout for exactly that remainder rather than the slide's full duration. The timeout is
  // always cleared, so nothing fires after unmount or a restart. (timings are fixed for a given playKey.)
  useEffect(() => {
    if (!playing || paused || idx >= slides.length) return;
    const dur = remainingRef.current ?? durations[idx];
    remainingRef.current = null;
    slideStartRef.current = Date.now();
    const id = window.setTimeout(() => {
      if (idx + 1 < slides.length) setIdx(idx + 1);
      else if (loop) {
        setIdx(0);
        setCycle((c) => c + 1);
        onCycle?.();
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
    }, dur);
    return () => {
      window.clearTimeout(id);
      if (pausedRef.current)
        remainingRef.current = Math.max(0, dur - (Date.now() - slideStartRef.current));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, slides.length, loop, onDone, playKey, playing, paused]);

  // Any slide change — a natural advance, a seek, a fresh capture pass — starts clean: whatever was
  // banked for the PREVIOUS slide never leaks into this one (it would otherwise apply the wrong
  // remaining duration if the user paused, then jumped to a different beat).
  useEffect(() => {
    remainingRef.current = null;
  }, [idx]);

  if (!slides.length) return null;
  const slide = slides[Math.min(idx, slides.length - 1)];
  const playedCount = contentPlayedBefore(slides, idx);
  const activeContent = activeContentIndex(slides, idx);
  const segCount = slides.filter(isContent).length;
  // Jump straight to the n-th content beat (preview scrubbing, and the ← → keyboard step below): map
  // the content index back to a slide index and restart that beat's timeline + entrance.
  const seekToContent = (n: number): void => {
    let c = -1;
    for (let i = 0; i < slides.length; i++) {
      if (isContent(slides[i])) c++;
      if (c === n) {
        setIdx(i);
        setCycle((k) => k + 1);
        return;
      }
    }
  };
  // ← / →: step to the previous/next beat, reusing the same seek as the progress-bar tap targets.
  // From a bookend (a section title or the outro), "forward" enters the upcoming section's first
  // beat and "back" returns to the last one already played.
  const stepContent = (delta: number): void => {
    if (!segCount) return;
    const target = isContent(slide)
      ? activeContent + delta
      : delta > 0
        ? playedCount
        : playedCount - 1;
    seekToContent(Math.max(0, Math.min(segCount - 1, target)));
  };
  // ↑ / ↓: jump between topic sections — a no-op when the reel is the common single-topic case (only
  // one title slide to jump to).
  const titleIndices = slides.reduce<number[]>((acc, s, i) => {
    if (isTitle(s)) acc.push(i);
    return acc;
  }, []);
  const jumpSection = (delta: number): void => {
    if (titleIndices.length <= 1) return;
    const at = titleIndices.filter((i) => i <= idx).length - 1;
    const next = Math.max(0, Math.min(titleIndices.length - 1, at + delta));
    setIdx(titleIndices[next]);
    setCycle((k) => k + 1);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        stepContent(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        stepContent(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        jumpSection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        jumpSection(-1);
        break;
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        togglePause();
        break;
      default:
        break;
    }
  };
  // Some finishes (glow, cosmic, neon, wrapped…) are built for a dark backdrop; the player lays the
  // palette's dark wash behind them and flips the chrome to light so it stays legible.
  const dark = finishSurface(slide.template) === 'dark';
  // A full-bleed finish owns the frame: no chrome orb, and it gets the whole board (not the card band).
  const bleed = finishBleed(slide.template);
  // Vary the entrance per beat (and per seed, so Remix reshuffles the rhythm too); the intro fades in.
  const transition = idx === 0 ? 'fade' : TRANSITIONS[(idx + script.seed) % TRANSITIONS.length];

  return (
    <div
      className="reel"
      data-palette={script.palette}
      data-vibe={script.vibe}
      ref={setRoot}
      role={interactive ? 'application' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      aria-label={
        interactive
          ? 'Reel preview. Left and right arrows step between beats, up and down jump sections, space bar pauses.'
          : undefined
      }
    >
      <div
        className="reel-board"
        ref={setBoard}
        data-surface={dark ? 'dark' : 'light'}
        data-bleed={bleed ? 'true' : 'false'}
      >
        {dark && <div className="reel-darkwash" aria-hidden="true" />}
        <div className="reel-progress" data-interactive={interactive} aria-hidden={!interactive}>
          {Array.from({ length: segCount }, (_, s) => {
            const active = s === activeContent;
            const full = s < playedCount || isOutro(slide);
            const seg = (
              <span className="reel-seg" key="seg">
                <i
                  style={
                    active
                      ? {
                          width: 0,
                          animation: `reel-seg-fill ${durations[idx]}ms linear forwards`,
                          animationPlayState: paused ? 'paused' : 'running',
                        }
                      : { width: full ? '100%' : '0%' }
                  }
                />
              </span>
            );
            return interactive ? (
              <button
                type="button"
                className="reel-seg-hit"
                key={s}
                onClick={() => seekToContent(s)}
                aria-label={`Jump to beat ${s + 1}`}
              >
                {seg}
              </button>
            ) : (
              <span className="reel-seg-hit" key={s}>
                {seg}
              </span>
            );
          })}
        </div>

        <div className="reel-top">
          <span className="reel-wordmark">
            <span className="reel-dot" aria-hidden="true" />
            Mavéa
          </span>
          <span className="reel-palettename">{script.palette}</span>
        </div>

        {!bleed && (
          <div className="reel-jelly-pos" aria-hidden="true">
            <ReelJelly />
          </div>
        )}

        <div className="reel-stage">
          <div className="reel-trans" data-trans={transition} key={`${cycle}-${idx}`}>
            <ReelUnitsVersion.Provider value={unitsVersion}>
              <FitScale>
                <SlideView slide={slide} />
              </FitScale>
            </ReelUnitsVersion.Provider>
          </div>
        </div>

        <div className="reel-pause-badge" data-show={interactive && paused} aria-hidden="true">
          <div className="reel-pause-glyph">
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
