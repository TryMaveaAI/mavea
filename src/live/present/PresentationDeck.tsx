// PresentationDeck — a real, projection-grade slide deck for Present mode, unified with the export.
//
// The answer is composed into the same deck the export produces (composeDeck), and each slide is
// rendered through the shared SlideStage in the chosen skin — so presenting full-screen looks
// identical to the exported PDF. Around that sit the room-grade controls: ←/→/Space navigation with
// a directional cross-slide transition, jump-to-ends, a progress rail, a polite live announcement,
// a presenter overlay (timer + percent + speaker notes + next-slide peek, toggled with S), a
// numeric jump buffer, blackout/whiteout, a per-deck fullscreen toggle, a lazily-mounted overview
// grid, a keyboard-shortcut help overlay, and touch-swipe navigation. Escape closes whichever of
// those panels is topmost before it ever reaches the surface's own "end the show" handler — see
// the keyboard effect below for the capture-phase mechanics that make that ordering reliable.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { ConversationSpec } from '../../data/conversation';
import { composeDeck, SlideStage } from '../../slides';
import type { Slide } from '../../slides/model/Slide';
import { slideText } from '../../slides/model/notes';
import { SLIDE_SKINS } from '../../slides/skins/registry';
import type { SlideSkin } from '../../slides/skins/types';
import type { PersonaId } from './personas';
import { isHidden } from '../../lib/pageVisibility';

interface Props {
  spec: ConversationSpec | null;
  question: string | null;
  narration: string;
  /** The chosen presentation style (one of the ten skins). */
  skinId: PersonaId;
  /** When set, the deck auto-advances one slide every N ms and stops on the last (the first-run
   *  tour drives the deck hands-free). Omitted for a real presenter, who advances manually. */
  autoAdvanceMs?: number;
  onExit: () => void;
}

/** Above this many slides, the dot rail would overflow (and, being centered in a fixed-position
 *  bar, collide with the counter/notes button pinned at its edges) — see the render-time guard
 *  below for the full reasoning. Sized to still leave breathing room at a narrow (~360px) viewport,
 *  the tightest width Present's controls need to hold up at.
 */
const MAX_DOTS = 10;

/** Fixed column count for the overview grid — kept in lockstep with the CSS grid-template-columns
 *  below so roving Up/Down can do simple index arithmetic instead of measuring the laid-out DOM. */
const OVERVIEW_COLS = 5;

/** How long the digit jump buffer survives with no further keystrokes before it resets itself. */
const JUMP_BUFFER_IDLE_MS = 1500;

/** A touch/pen drag shorter than this, or one that isn't clearly horizontal, is a scroll or a
 *  tap — not a swipe. */
const SWIPE_MIN_PX = 60;
const SWIPE_AXIS_RATIO = 1.5;

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Keys typed into a real field (or a future editable surface within Present mode) are left
 *  alone — none of the deck's single-key shortcuts should fire while someone is typing. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

/** The keyboard map shown in the help overlay — the single source of truth for that panel. */
const KEY_HELP: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: '→ / Space / Page Down', action: 'Next slide' },
  { keys: '← / Page Up', action: 'Previous slide' },
  { keys: 'Home / End', action: 'First / last slide' },
  { keys: '0–9, then Enter', action: 'Jump to a slide number' },
  { keys: 'B', action: 'Blackout the screen' },
  { keys: 'W', action: 'Whiteout the screen' },
  { keys: 'F', action: 'Toggle fullscreen' },
  { keys: 'O or G', action: 'Overview — every slide at once' },
  { keys: 'S', action: 'Presenter notes' },
  { keys: 'R', action: 'Reset the timer' },
  { keys: 'X', action: 'Skip this slide for this run (restore it from the overview)' },
  { keys: '?', action: 'This help' },
  { keys: 'Esc', action: 'Close the topmost panel — or end the show' },
];

interface OverviewGridProps {
  /** EVERY deck slide, skipped ones included — the overview is the one place to restore them. */
  slides: Slide[];
  skipped: ReadonlySet<string>;
  skin: SlideSkin;
  /** Roving selection in PRESENTED indices (skipped cells are never selected). */
  selected: number;
  /** Deck index → presented index, or -1 while that slide is skipped. */
  presentedIndex: (deckIndex: number) => number;
  onJump: (presentedIndex: number) => void;
  onToggleSkip: (id: string) => void;
  onClose: () => void;
}

/** All slides at once, for picking a destination at a glance rather than stepping one at a time —
 *  and for crossing slides out of this run (or back in). Mounted only while open (the caller
 *  conditionally renders this) — a long deck's worth of live SlideStage instances is real render
 *  cost that normal presenting should never pay for. */
function OverviewGrid({
  slides,
  skipped,
  skin,
  selected,
  presentedIndex,
  onJump,
  onToggleSkip,
  onClose,
}: OverviewGridProps): ReactElement {
  return (
    <div className="preso-overview" role="listbox" aria-label="All slides">
      <button
        type="button"
        className="preso-overview-close"
        onClick={onClose}
        aria-label="Close overview"
      >
        ×
      </button>
      {skipped.size > 0 && (
        <div className="preso-overview-skipnote">
          {skipped.size} slide{skipped.size === 1 ? '' : 's'} skipped this run
        </div>
      )}
      <div className="preso-overview-grid">
        {slides.map((s, n) => {
          const p = presentedIndex(n);
          const isSkipped = p < 0;
          return (
            <div
              key={s.id}
              className={
                'preso-overview-cell' +
                (!isSkipped && p === selected ? ' is-selected' : '') +
                (isSkipped ? ' is-skipped' : '')
              }
            >
              <button
                type="button"
                role="option"
                aria-selected={!isSkipped && p === selected}
                className="preso-overview-open"
                // A skipped slide isn't in the show, so its cell can't jump — clicking it
                // restores it instead, which is also the intuitive "undo" gesture.
                aria-label={
                  isSkipped ? `Slide ${n + 1}, skipped — restore it` : `Go to slide ${n + 1}`
                }
                onClick={() => (isSkipped ? onToggleSkip(s.id) : onJump(p))}
              >
                <span className="preso-overview-thumb">
                  <SlideStage slide={s} skin={skin} ctx={{ index: n, total: slides.length }} />
                </span>
                <span className="preso-overview-num">{n + 1}</span>
              </button>
              <button
                type="button"
                className="preso-overview-skip"
                aria-label={isSkipped ? `Restore slide ${n + 1}` : `Skip slide ${n + 1} this run`}
                title={isSkipped ? 'Restore' : 'Skip for this run'}
                onClick={() => onToggleSkip(s.id)}
              >
                {isSkipped ? '↩' : '×'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A simple, readable list of the whole keyboard map. */
function HelpOverlay({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <div className="preso-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <button type="button" className="preso-help-close" onClick={onClose} aria-label="Close help">
        ×
      </button>
      <h2 className="preso-help-title">Keyboard shortcuts</h2>
      <dl className="preso-help-list">
        {KEY_HELP.map((row) => (
          <div className="preso-help-row" key={row.keys}>
            <dt>{row.keys}</dt>
            <dd>{row.action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A full-stage blackout/whiteout curtain — dismissed by a click, matching the keyboard paths
 *  wired in the deck's own key handler. */
function Curtain({
  mode,
  onDismiss,
}: {
  mode: 'black' | 'white';
  onDismiss: () => void;
}): ReactElement {
  return (
    <div
      className={`preso-curtain preso-curtain-${mode}`}
      role="presentation"
      onClick={onDismiss}
    />
  );
}

export function PresentationDeck({
  spec,
  question,
  narration,
  skinId,
  autoAdvanceMs,
  onExit,
}: Props): ReactElement {
  const [generatedAt] = useState(() => Date.now());
  const deck = useMemo(() => composeDeck(spec ? [spec] : [], generatedAt), [spec, generatedAt]);
  const allSlides = deck.slides;
  // Slides the presenter crossed out for this run — held by id (stable per deck) and filtered
  // out before any navigation math, so the show, footer count, and auto-advance all agree.
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(new Set());
  const slides = useMemo(
    () => allSlides.filter((s) => !skippedIds.has(s.id)),
    [allSlides, skippedIds],
  );
  const toggleSkip = useCallback(
    (id: string) => {
      setSkippedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        // The show keeps at least one slide — the last survivor can't be crossed out.
        else if (allSlides.filter((s) => !prev.has(s.id)).length > 1) next.add(id);
        return next;
      });
    },
    [allSlides],
  );
  const skin = SLIDE_SKINS[skinId];
  const [i, setI] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blackout, setBlackout] = useState<'black' | 'white' | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewSel, setOverviewSel] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [jumpBuffer, setJumpBuffer] = useState('');
  const deckRef = useRef<HTMLDivElement | null>(null);
  const jumpTimerRef = useRef<number | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const count = slides.length;
  const clamp = useCallback((n: number) => Math.max(0, Math.min(count - 1, n)), [count]);
  const next = useCallback(() => setI((n) => clamp(n + 1)), [clamp]);
  const prev = useCallback(() => setI((n) => clamp(n - 1)), [clamp]);
  const resetTimer = useCallback(() => setElapsed(0), []);

  const toggleFullscreen = useCallback(() => {
    const el = deckRef.current;
    if (!el) return;
    // Mirrors LiveApp's own best-effort fullscreen calls — this one is scoped to the deck root
    // (not the whole document) so it also works from the slidelab Present preview, which never
    // auto-fullscreens the page.
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // The digit jump buffer resets itself after a beat of inactivity — cleared on unmount too, so a
  // pending timeout never fires setState after the deck is gone.
  useEffect(() => {
    return () => {
      if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
    };
  }, []);

  const appendJumpDigit = useCallback((d: string) => {
    setJumpBuffer((b) => b + d);
    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = window.setTimeout(() => setJumpBuffer(''), JUMP_BUFFER_IDLE_MS);
  }, []);

  const commitJumpBuffer = useCallback(() => {
    if (jumpTimerRef.current !== null) {
      window.clearTimeout(jumpTimerRef.current);
      jumpTimerRef.current = null;
    }
    if (jumpBuffer) setI(clamp(Number(jumpBuffer) - 1));
    setJumpBuffer('');
  }, [jumpBuffer, clamp]);

  // A presentation timer, ticking once the deck opens (cleared on unmount). Skips a tick while
  // the tab is backgrounded — a throttled background interval otherwise catches up in one jump
  // once it's visible again, so the clock would silently lose (or double-count) real seconds.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (isHidden()) return;
      setElapsed((e) => e + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Hands-free auto-advance (the first-run tour and the recorded demo replays): step one slide
  // every autoAdvanceMs and hold on the last, so the run plays the whole deck without a presenter
  // — a "presents itself" beat that never left the cover slide isn't showing anything. Paused while hidden —
  // otherwise a backgrounded tab's throttled timer can fire several times in a burst on return,
  // skipping past slides the tour narration never actually reached.
  useEffect(() => {
    if (!autoAdvanceMs) return;
    const id = window.setInterval(() => {
      if (isHidden()) return;
      setI((n) => (n >= count - 1 ? n : clamp(n + 1)));
    }, autoAdvanceMs);
    return () => window.clearInterval(id);
  }, [autoAdvanceMs, count, clamp]);

  // Take focus the moment the show opens. Every shortcut below is ignored when the keydown lands
  // on a text field (`isEditableTarget`), and every route IN — the ⌘K palette, the Share menu —
  // leaves focus sitting in the composer. So the deck opened with its whole keyboard dead: arrows
  // did nothing, Escape did not end the show, and pressing `o` for the overview typed a letter into
  // the conversation behind it.
  useEffect(() => {
    deckRef.current?.focus({ preventScroll: true });
  }, []);

  // Keyboard map. Registered on the CAPTURE phase, not the default bubble phase — a real keydown
  // dispatches on the focused element and bubbles up through document to window, visiting window
  // TWICE (once descending as a capture listener, once ascending as a bubble listener). Capture
  // therefore always runs before LiveApp's own bubble-phase Escape listener, deterministically,
  // regardless of which effect happened to attach first. That ordering is what lets Escape close
  // an inner panel (help → overview → blackout/white → notes) without also ending the show: when
  // an inner panel consumes the key we call both preventDefault and stopPropagation so the event
  // never reaches LiveApp's listener; when nothing is open we do neither, so Escape falls through
  // to onExit here AND to LiveApp exactly as it always has.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;

      if (e.key === 'Escape') {
        if (helpOpen) {
          e.preventDefault();
          e.stopPropagation();
          setHelpOpen(false);
        } else if (overviewOpen) {
          e.preventDefault();
          e.stopPropagation();
          setOverviewOpen(false);
        } else if (blackout) {
          e.preventDefault();
          e.stopPropagation();
          setBlackout(null);
        } else if (notesOpen) {
          e.preventDefault();
          e.stopPropagation();
          setNotesOpen(false);
        } else {
          onExit();
        }
        return;
      }

      // The help overlay is a static read — while it's up, only the keys that close it do anything.
      if (helpOpen) {
        if (e.key === '?') {
          e.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      // Overview grid: arrows rove the selection instead of navigating the live deck, and Enter
      // jumps to the highlighted slide and closes it. Anything else (b/w/f/?/…) falls through
      // below, so those panels can still be opened on top of the overview.
      if (overviewOpen) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setOverviewSel((n) => Math.min(count - 1, n + 1));
          return;
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setOverviewSel((n) => Math.max(0, n - 1));
          return;
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setOverviewSel((n) => Math.min(count - 1, n + OVERVIEW_COLS));
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setOverviewSel((n) => Math.max(0, n - OVERVIEW_COLS));
          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setI(overviewSel);
          setOverviewOpen(false);
          return;
        }
      }

      // Any key other than a digit or Enter abandons a pending jump buffer rather than leaving it
      // to fire later, on some unrelated later Enter, at a stale target the person never typed now.
      if (jumpBuffer && !/^[0-9]$/.test(e.key) && e.key !== 'Enter') {
        if (jumpTimerRef.current !== null) {
          window.clearTimeout(jumpTimerRef.current);
          jumpTimerRef.current = null;
        }
        setJumpBuffer('');
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setBlackout(null);
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setBlackout(null);
        prev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setBlackout(null);
        setI(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setBlackout(null);
        setI(count - 1);
      } else if (e.key === 's' || e.key === 'S') {
        setNotesOpen((o) => !o);
      } else if (e.key === 'b' || e.key === 'B') {
        setBlackout((c) => (c === 'black' ? null : 'black'));
      } else if (e.key === 'w' || e.key === 'W') {
        setBlackout((c) => (c === 'white' ? null : 'white'));
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'o' || e.key === 'O' || e.key === 'g' || e.key === 'G') {
        if (overviewOpen) {
          setOverviewOpen(false);
        } else {
          setOverviewSel(clamp(i));
          setOverviewOpen(true);
        }
      } else if (e.key === '?') {
        setHelpOpen((o) => !o);
      } else if (e.key === 'x' || e.key === 'X') {
        // Cross the current slide out of this run mid-show; the deck steps on naturally since
        // the presented list re-derives. Restoring happens from the overview grid.
        const current = slides[clamp(i)];
        if (current) toggleSkip(current.id);
      } else if (e.key === 'r' || e.key === 'R') {
        resetTimer();
      } else if (e.key === 'Enter') {
        if (jumpBuffer) {
          e.preventDefault();
          commitJumpBuffer();
        }
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        appendJumpDigit(e.key);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [
    next,
    prev,
    count,
    clamp,
    i,
    onExit,
    helpOpen,
    overviewOpen,
    overviewSel,
    blackout,
    notesOpen,
    jumpBuffer,
    toggleFullscreen,
    resetTimer,
    appendJumpDigit,
    commitJumpBuffer,
    slides,
    toggleSkip,
  ]);

  const idx = clamp(i);
  const slide = slides[idx];
  // Transition direction: compared against the index from the previous commit (held in a ref until
  // the post-commit effect advances it), so the keyed wrapper enters from the correct side.
  const prevIdxRef = useRef(idx);
  const dir: 'next' | 'prev' = idx >= prevIdxRef.current ? 'next' : 'prev';
  // The outgoing slide stays mounted as a static layer under the incoming animation for the length
  // of the cross-fade — without it the keyed wrapper unmounts instantly and a light-paper slide
  // flashes the dark theatre between steps, which reads as a blink instead of a transition.
  const [ghostIdx, setGhostIdx] = useState<number | null>(null);
  useEffect(() => {
    if (prevIdxRef.current === idx) return;
    setGhostIdx(prevIdxRef.current);
    prevIdxRef.current = idx;
    const t = window.setTimeout(() => setGhostIdx(null), 380);
    return () => window.clearTimeout(t);
  }, [idx]);

  const speakerNotes =
    slide?.notes ?? (slide?.kind === 'cover' ? narration || question || '' : slideText(slide));
  const nextSlide = slides[idx + 1];
  const nextLabel = nextSlide ? slideText(nextSlide) : '— end —';
  const pct = count ? Math.round(((idx + 1) / count) * 100) : 0;

  // Touch/pen swipe on the stage itself — the click zones at the edges stay the coarse mouse
  // affordance, this is the finger-drag path. A mouse drag never lands here (pointerType 'mouse'
  // is ignored), and a pointerdown that started on an interactive element inside the slide (a
  // block's own button) is left alone rather than hijacked into a navigation gesture.
  const onStagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onStagePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
      setBlackout(null);
      if (dx < 0) next();
      else prev();
    },
    [next, prev],
  );

  // The blackout/whiteout curtain hijacks the polite live region it announces through — the
  // person needs to hear "screen blacked out", not the slide title underneath it.
  const srMessage = blackout
    ? blackout === 'black'
      ? 'Screen blacked out.'
      : 'Screen whited out.'
    : count
      ? `Slide ${idx + 1} of ${count}: ${slideText(slide) || slide?.kind || ''}`
      : '';

  return (
    <div
      className="preso-deck"
      role="region"
      aria-label="Presentation"
      // Focusable only programmatically (see the mount effect above) — it must be able to HOLD
      // focus so the shortcuts work, without joining the tab order ahead of the deck's own controls.
      tabIndex={-1}
      style={{ background: '#0a0c11' }}
      ref={deckRef}
    >
      {/* Polite announcement so a screen reader hears each slide change without reading the canvas —
          also the one place blackout/whiteout speaks, since the visual slide text is hidden. */}
      <div className="preso-sr" aria-live="polite" aria-atomic="true">
        {srMessage}
      </div>

      <div
        className="preso-stage"
        onPointerDown={onStagePointerDown}
        onPointerUp={onStagePointerUp}
      >
        <div
          className="preso-skinframe"
          style={{
            // Largest 16:9 box that fits inside .preso-stage's padded, centred cell (5vh/9vh · 6vw).
            aspectRatio: '16 / 9',
            width: 'min(86vw, calc(84vh * 16 / 9))',
            margin: 'auto',
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            // A hair of edge so dark skins read crisply against the dark theatre (invisible on light).
            border: '1px solid rgba(255,255,255,.08)',
            boxShadow: '0 30px 90px rgba(0,0,0,.55)',
          }}
        >
          {ghostIdx !== null && ghostIdx !== idx && slides[ghostIdx] && (
            <div className="preso-slide-ghost" aria-hidden>
              <SlideStage
                slide={slides[ghostIdx]}
                skin={skin}
                ctx={{ index: ghostIdx, total: count }}
              />
            </div>
          )}
          {slide && (
            <div key={idx} className={`preso-slide-anim preso-dir-${dir}`}>
              <SlideStage slide={slide} skin={skin} ctx={{ index: idx, total: count }} />
            </div>
          )}
        </div>
      </div>

      {/* Click zones for advancing without the keyboard (e.g. a presentation remote / touch). */}
      <button
        type="button"
        className="preso-zone preso-zone-prev"
        onClick={prev}
        aria-label="Previous slide"
        disabled={i === 0}
      />
      <button
        type="button"
        className="preso-zone preso-zone-next"
        onClick={next}
        aria-label="Next slide"
        disabled={i >= count - 1}
      />

      {/* Progress rail */}
      <div className="preso-rail">
        {jumpBuffer && (
          <span className="preso-jumpchip" role="status">
            <span aria-hidden>→</span> {jumpBuffer}
          </span>
        )}
        <span className="preso-count">
          {idx + 1} / {count}
        </span>
        <button
          type="button"
          className="preso-jump"
          onClick={() => setI(0)}
          aria-label="First slide"
          disabled={idx === 0}
        >
          ⤒
        </button>
        {/* One dot per slide reads fine for a short deck, but a real multi-turn conversation
            easily composes into 20-30+ slides — individually rendering that many would overflow
            the rail (and, being centered in a `position: fixed` bar, run under the absolutely
            positioned counter/notes button at its edges). Past the cap, the "N / total" counter
            already carries the same information, so the dots simply step aside rather than
            cramming or clipping. */}
        {count <= MAX_DOTS && (
          <div className="preso-dots" role="presentation">
            {slides.map((_, n) => (
              <button
                key={n}
                type="button"
                className={'preso-dot' + (n === idx ? ' is-active' : '')}
                onClick={() => setI(n)}
                aria-label={`Go to slide ${n + 1}`}
                aria-current={n === idx}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className="preso-jump"
          onClick={() => setI(count - 1)}
          aria-label="Last slide"
          disabled={idx >= count - 1}
        >
          ⤓
        </button>
        <button
          type="button"
          className={'preso-notes-btn' + (notesOpen ? ' is-on' : '')}
          onClick={() => setNotesOpen((o) => !o)}
          aria-pressed={notesOpen}
          title="Presenter notes (S)"
        >
          Notes
        </button>
      </div>

      {/* Presenter overlay — the single-display speaker-view fallback. */}
      {notesOpen && (
        <aside className="preso-presenter" aria-label="Presenter notes">
          <div className="preso-presenter-head">
            <button
              type="button"
              className="preso-timer"
              onClick={resetTimer}
              title="Reset timer (R)"
            >
              {clock(elapsed)}
            </button>
            <span className="preso-presenter-pct">{pct}%</span>
            <button
              type="button"
              className="preso-presenter-close"
              onClick={() => setNotesOpen(false)}
              aria-label="Hide presenter notes"
            >
              ×
            </button>
          </div>
          <div className="preso-presenter-progress" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="preso-presenter-slide">
            {idx + 1}. {slideText(slide) || slide?.kind}
          </p>
          <p className="preso-presenter-notes">{speakerNotes || 'No notes for this slide.'}</p>
          <div className="preso-presenter-next">
            <span className="preso-presenter-next-label">Next</span>
            {nextSlide ? (
              <div className="preso-presenter-thumb">
                <SlideStage slide={nextSlide} skin={skin} ctx={{ index: idx + 1, total: count }} />
              </div>
            ) : null}
            <span className="preso-presenter-next-text">{nextLabel}</span>
          </div>
        </aside>
      )}

      {blackout && <Curtain mode={blackout} onDismiss={() => setBlackout(null)} />}

      {/* Overview thumbnails are real SlideStage instances — only mounted while actually open, so
          a long deck never pays their render cost while just presenting normally. */}
      {overviewOpen && (
        <OverviewGrid
          slides={allSlides}
          skipped={skippedIds}
          skin={skin}
          selected={overviewSel}
          presentedIndex={(n) =>
            skippedIds.has(allSlides[n].id)
              ? -1
              : allSlides.slice(0, n).filter((s) => !skippedIds.has(s.id)).length
          }
          onJump={(n) => {
            setI(n);
            setOverviewOpen(false);
          }}
          onToggleSkip={toggleSkip}
          onClose={() => setOverviewOpen(false)}
        />
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
