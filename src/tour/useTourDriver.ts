// useTourDriver — the CHAPTER player for the first-run feature walkthrough. Each chapter teaches
// one thing on the REAL Live surface: it speaks a coach line (or stays silent with captions),
// spotlights a real control, and can trigger a real feature (Focus, Present, Share, ⌘K, the pen)
// or show a real baked answer. It's fully navigable — play/pause, step back/forward, jump to any
// chapter, replay — because every chapter is self-contained: entering one first RESETS any feature
// a prior chapter opened (so skipping around never leaves a modal stuck), then applies its own.
// No model, no key.
import { useCallback, useEffect, useRef, useState } from 'react';
import { TOUR, TOUR_EXTRAS, chapterById, tourFrame, type TourChapter } from './tourPlan';
import { loadTourCorpus } from './corpus';
import { buildBlanksDemo } from './blanksDemo';
import { syncTourUrl } from './tourEntry';
import { unlockAudio } from '../voice/voiceEnergy';
import {
  makeStepTimers,
  whenUnlocked as gatedByUnlock,
  scheduleTypewriter,
  startQuietGate,
} from './driverKit';
import type { TurnFrame } from '../live/history';
import type { ViewMode } from '../canvas/focus/useFocusMode';
import type { SpokenLine } from '../voice/tts';
import { naturalGuidedCopy } from './guidedCopy';

/** Everything the driver needs from LiveApp to drive the real surface (passed in as live closures). */
export interface TourOps {
  isBusy: () => boolean;
  /** Whether Mavéa's voice is currently mid-sentence — the auto-advance waits for it to finish so a
   *  chapter never cuts off its own thought. */
  isSpeaking: () => boolean;
  hasCanvas: () => boolean;
  showFrame: (frame: TurnFrame, question: string) => void;
  typeInto: (value: string) => void;
  /** Speak a coach line. May hand back the line's lifecycle handle (LiveApp's wrapped seam
   *  returns one so its own walk can sync to audio); the drivers here ignore it. */
  speak: (text: string) => SpokenLine | void;
  cancelSpeech: () => void;
  setMuted: (muted: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setInkArmed: (armed: boolean) => void;
  /** Spotlight one card by id (drives the Focus hero + the Canvas fly-to). */
  setSpot: (id: string | null) => void;
  /** Draw a scripted highlighter mark across the first canvas card, then spotlight it. */
  scriptedMark: () => void;
  /** Draw one step of the walkthrough with Mavéa's real answer-annotation Pen. */
  drawPenTourStep: (step: 'result' | 'reason') => void;
  /** Draw one real, generous Mavéa Pen stroke across the current answer's first card. */
  drawPenOnFirstBlock: () => void;
  /** Open the walkthrough's curated living dashboard (a real store entry, full-screen). */
  openDashboards: () => void;
  /** Flip the dashboard takeover from the board itself to its Settings panel — the real
   *  refresh-cadence control that backs up "keeps itself up to date". */
  dashboardShowSettings: () => void;
  /** Open the real Model settings so the walkthrough can show all five providers and BYOK field. */
  openModelSettings: () => void;
  /** Open the export-to-document overlay (the ten print templates). */
  openExport: () => void;
  /** Remix the share reel — the director recuts with a new seed. */
  shareRemix: () => void;
  /** Pick a reel palette chip by its label (Aurora, Ember, …). */
  sharePalette: (label: string) => void;
  /** Flip the export studio's format (its own segmented buttons). */
  exportSetFormat: (f: 'presentation' | 'document') => void;
  /** Pick the i-th template swatch in the export studio's gallery. */
  exportPickTemplate: (i: number) => void;
  /** Collapse/expand the conversation rail. */
  toggleRail: () => void;
  /** Drag the answer's bend-it slider to a new value — the whole answer recomputes live. */
  bendIt: () => void;
  /** Turn the first canvas card into a flashcard (the capture flow). */
  openFlashcards: () => void;
  /** Seed a real five-lesson course into the course store and open Lesson 1 in place — the genuine
   *  CourseRail ("Lesson 1 of 5") over its baked canvas, replayed with no model call. */
  openTourCourse: () => void;
  setPresenting: (on: boolean) => void;
  setShareOpen: (on: boolean) => void;
  setPaletteOpen: (on: boolean) => void;
  /** Visually press the Keep-going chip with this label (the tap the chapter then acts on). */
  pressKeepGoing: (label: string) => void;
  /** Pin the answer's first card via its Ask affordance — the real point-and-ask gesture. */
  pinFirstBlock: () => void;
  /** Pin the answer's first `count` cards together, so one follow-up can ground on all of them —
   *  the multi-select Ask gesture. */
  pinFirstBlocks: (count: number) => void;
  /** Open Watch Me Think (the live thinking-map), ready for banked thoughts. */
  startWatchThinking: () => void;
  /** Bank one completed thought into the live map — the same path the composer submit takes. */
  bankThought: (text: string) => void;
  /** Seed a few explored topics into the Atlas store (if sparse) and open it, so it's populated. */
  openAtlas: () => void;
  /** Open the baked Prism analysis of the i-th tour document (the chapter flips across doc types). */
  openPrism: (index: number) => void;
  /** Seed (where needed) + open a feature on the real surface, so every feature has a "See how"
   *  walkthrough — not just the ones with a bespoke chapter. Keyed by the registry feature id. */
  showcaseFeature: (featureId: string) => void;
  fireMemoryGlow: () => void;
  /** Stop the live surface's own reveal-tour narration/spotlight walk (so an answer chapter's
   *  narration doesn't bleed into the next chapter when navigating). */
  stopRevealWalk: () => void;
  /** Close EVERY in-Live overlay/mode — called on each chapter entry so skipping around never
   *  leaves a modal, panel, or listening mode stuck open. */
  closeAllOverlays: () => void;
}

export interface TourDriver {
  active: boolean;
  /** Nothing performs until Start is clicked. That click also unlocks browser audio. */
  started: boolean;
  index: number;
  total: number;
  chapter: TourChapter | null;
  coach: string;
  spotlight?: string;
  playing: boolean;
  /** The visitor's explicit sound preference for the guided experience. */
  muted: boolean;
  done: boolean;
  /** True when a single chapter is playing on its own (a deep-linked extra, a forced-solo core
   *  chapter, or an end-card "More to explore" mini-demo) — the transport hides the dots/prev/next
   *  and the chapter returns to the end card when it finishes rather than advancing. */
  solo: boolean;
  start: () => void;
  next: () => void;
  prev: () => void;
  jumpTo: (i: number) => void;
  toggle: () => void;
  toggleMute: () => void;
  replay: () => void;
  skip: () => void;
  /** Play one extra chapter solo, in-session (from the end card's grid) — no reload; when it
   *  finishes the driver returns to the end card. */
  playExtra: (id: string) => void;
}

/** Delay (ms) before the montage's first flip — long enough that the PREVIOUS chapter's exit (its
 *  view snapping back to flat, via resetTriggers) has a beat to land before the topic changes too,
 *  rather than both happening in the same tick and reading as one confusing flash. */
const MONTAGE_LEAD_IN_MS = 450;
/** Floor on a montage's per-frame hold — a topic needs a moment to actually register, not just
 *  flicker past, however many frames are packed into the chapter's duration. */
const MONTAGE_MIN_FRAME_MS = 1600;

/** The montage's per-frame reveal delays (ms from chapter entry): a lead-in beat, then evenly
 *  spaced flips paced to fill the chapter's own duration. Exported for its own unit test. */
export function montageSchedule(frameCount: number, durationMs: number): number[] {
  if (frameCount <= 0) return [];
  const each = Math.max(
    MONTAGE_MIN_FRAME_MS,
    Math.floor((durationMs - MONTAGE_LEAD_IN_MS - 400) / frameCount),
  );
  return Array.from({ length: frameCount }, (_, i) => MONTAGE_LEAD_IN_MS + i * each);
}

/** How long the "focusWalk" chapter holds on the normal, unblurred canvas before Focus mode dims
 *  everything but the spotlit card — the viewer needs to actually see the "everything" the chapter
 *  is about to transform, not have it dim out from under them the instant the chapter starts. */
const FOCUS_HOLD_MS = 1500;
/** A settle beat after Focus mode itself takes over, before the card-by-card walk begins. */
const FOCUS_WALK_SETTLE_MS = 350;
const FOCUS_WALK_MIN_CARD_MS = 900;

/** The focusWalk chapter's schedule: when Focus mode itself kicks in, and the per-card spotlight
 *  delays (ms from chapter entry) after it settles. Exported for its own unit test. */
export function focusWalkSchedule(
  cardCount: number,
  durationMs: number,
): { focusAt: number; spotlightAt: number[] } {
  const walkStart = FOCUS_HOLD_MS + FOCUS_WALK_SETTLE_MS;
  if (cardCount <= 0) return { focusAt: FOCUS_HOLD_MS, spotlightAt: [] };
  const each = Math.max(FOCUS_WALK_MIN_CARD_MS, Math.floor((durationMs - walkStart) / cardCount));
  return {
    focusAt: FOCUS_HOLD_MS,
    spotlightAt: Array.from({ length: cardCount }, (_, i) => walkStart + i * each),
  };
}

// The 'listen' chapter's scripted ramble — each line trips a different local-extractor heuristic
// (an option, a person, a fear, a constraint, an open loop) so the map visibly builds atom by atom.
const THINK_RAMBLE = [
  'I keep thinking about moving to Austin.',
  'My sister already lives there.',
  "But I'm worried about starting over.",
  'And my lease runs until March.',
  'Is it even the right time?',
] as const;

/** Is this id one of the EXTRAS (a chapter that lives only as a solo mini-demo)? */
function isExtra(id: string | null | undefined): boolean {
  return !!id && TOUR_EXTRAS.some((c) => c.id === id);
}
/** Is this id one of the CORE chapters (the ones the full first-run tour plays)? */
function isCore(id: string | null | undefined): boolean {
  return !!id && TOUR.some((c) => c.id === id);
}

export function useTourDriver(opts: {
  active: boolean;
  /** Open on this chapter id (a landing deep-link); unknown ids fall back to the top. An EXTRA id
   *  always plays solo; a CORE id plays solo only when `solo` is set, else it continues the tour. */
  startChapter?: string | null;
  /** Force a core-chapter deep-link to play solo (an extra always does). */
  solo?: boolean;
  ops: TourOps;
}): TourDriver {
  const { active } = opts;
  // A solo playlist is a single chapter that plays on its own and, when finished, returns to the
  // end card instead of advancing. Set from a deep-link (an extra, or a `&solo=1` core chapter) and
  // from the end card's "More to explore" grid (playExtra). null → the normal full-tour sequence.
  const [soloId, setSoloId] = useState<string | null>(() => {
    const id = opts.startChapter;
    if (isExtra(id)) return id ?? null;
    if (isCore(id) && opts.solo) return id ?? null;
    return null;
  });
  const [index, setIndex] = useState(() => {
    const id = opts.startChapter;
    // A solo playlist has exactly one entry, so it always starts at 0.
    if (isExtra(id) || (isCore(id) && opts.solo)) return 0;
    const i = id ? TOUR.findIndex((c) => c.id === id) : -1;
    return i >= 0 ? i : 0;
  });
  const [started, setStarted] = useState(false);
  // Manual pacing is the calm, predictable default. Autoplay is an explicit choice.
  const [playing, setPlaying] = useState(false);
  const [userMuted, setUserMuted] = useState(false);
  const userMutedRef = useRef(userMuted);
  userMutedRef.current = userMuted;
  const [done, setDone] = useState(false);
  // Bumped to force the apply-effect to re-run even when the index is unchanged (replay / re-enter).
  const [token, setToken] = useState(0);
  const opsRef = useRef(opts.ops);
  opsRef.current = opts.ops;

  // The playlist the transport walks: one chapter when solo, else the full core tour. Held in a ref
  // too so the transport callbacks read the current length without re-creating on every soloId flip.
  const soloChapter = soloId ? chapterById(soloId) : undefined;
  const seq: readonly TourChapter[] = soloChapter ? [soloChapter] : TOUR;
  const seqRef = useRef(seq);
  seqRef.current = seq;

  const total = seq.length;
  const chapter = active ? (seq[index] ?? null) : null;

  // The baked corpus rides in its own lazy chunk (see corpus/index.ts) so the Live mount stays
  // lean. Kick the fetch off as soon as the tour is live — the welcome card renders corpus-free,
  // so the chunk normally lands while the visitor reads it — and hold the apply/advance effects
  // until it has: a deep link that auto-plays would otherwise apply chapters against an empty
  // corpus and silently skip every baked frame.
  const [corpusReady, setCorpusReady] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadTourCorpus().then(() => {
      if (alive) setCorpusReady(true);
    });
    return () => {
      alive = false;
    };
  }, [active]);

  /** Revert anything a chapter might have opened, so navigating away is always clean. Idempotent. */
  const resetTriggers = useCallback(() => {
    const o = opsRef.current;
    o.closeAllOverlays();
    o.stopRevealWalk();
    o.cancelSpeech();
  }, []);

  // APPLY the current chapter's side effects, once per entry. Not keyed on `playing`, so
  // pause/resume never re-triggers a feature or re-speaks a line. The playlist is read
  // through seqRef (always current) — soloId in the deps is what re-applies when it flips.
  useEffect(() => {
    if (!active || !started || done || !corpusReady) return;
    const ch = seqRef.current[index];
    if (!ch) return;
    // Keep the URL resumable: a landing hand-off only ever stashes a one-shot sessionStorage
    // flag, so without this a reload mid-tour finds it already consumed and drops the visitor
    // straight onto the setup wizard. The `&solo=1` half keeps a mid-demo reload playing solo
    // rather than resuming the full tour on that chapter.
    syncTourUrl(ch.id, !!soloId);
    const o = opsRef.current;
    const step = makeStepTimers();
    const after = step.after;
    // Cold-entry voice gate (see driverKit.whenUnlocked): a fresh ?tour=1 deep link or a
    // reload — which syncTourUrl means can land on ANY chapter, including one whose voice is
    // a showFrame narration rather than the coach line — has no user gesture yet, so every
    // spoken entry point below shares this same gate. Transport clicks (goto/toggle) confirm
    // the unlock synchronously, so it only ever waits on that cold entry.
    const whenUnlocked = (fn: () => void): void => gatedByUnlock(after, fn);
    const speakWhenUnlocked = (line: string): void => whenUnlocked(() => o.speak(line));
    // Put a canvas on screen WITHOUT its voice — no narration AND no model-authored tour, since a
    // baked tour would have the reveal walk speak its per-stop lines right over the chapter's coach
    // line. A view-change chapter (canvas/focus), a montage flip, or a just-need-a-canvas seed is
    // visual; only the 'answer' chapter keeps the full narration + spoken walk (there it IS the voice).
    const showSilent = (f: { frame: TurnFrame; question: string }): void =>
      o.showFrame({ ...f.frame, narration: '', tour: [] }, f.question);

    // 1) Clean slate: close any feature a previous chapter opened.
    resetTriggers();

    // 2) Ensure an answer canvas exists for chapters that operate on one (robust to jumping in).
    if (ch.needsCanvas && !o.hasCanvas()) {
      const seed = tourFrame('money');
      if (seed) showSilent(seed);
    }

    // 3) Sound: silent chapters mute (captions carry it); the rest speak.
    o.setMuted(userMutedRef.current || ch.mode === 'silent');

    // 4) The action.
    const a = ch.action;
    if (a.kind === 'answer') {
      const f = tourFrame(a.convoId, a.ask);
      if (f) {
        // Type the ask into the composer, then reveal the real answer visually. The chapter coach
        // is the single spoken line so the caption and voice always say exactly the same thing.
        const q = f.question;
        const visual = {
          ...f.frame,
          narration: '',
          spoken: '',
          tour: f.frame.tour.slice(0, 4).map((stop) => ({
            ...stop,
            say: '',
            saySpoken: '',
          })),
        };
        const typed = scheduleTypewriter(after, o.typeInto, q);
        // Gate the reveal on audio unlock, exactly like the coach line (speakWhenUnlocked): on a
        // cold ?tour=1 deep link the audio context isn't unlocked yet, and a bare showFrame would
        // flash the answer before its narration can play. whenUnlocked defers it until unlock.
        after(typed + 360, () => whenUnlocked(() => o.showFrame(visual, f.question)));
      }
    } else if (a.kind === 'chip') {
      // Self-contained regardless of what the previous chapter left on screen (the bend chapter's
      // demo now runs on a different worked example) — reseed the base answer this chip actually
      // lives on before tapping it, the same guarantee `needsCanvas` gives other chapters.
      const base = tourFrame('money');
      if (base) showSilent(base);
      // Don't just point at the chips — tap one. The chip presses itself, then its REAL baked
      // follow-up answer plays (with its own voice), so "Mavéa takes it further" actually happens.
      after(1400, () => o.pressKeepGoing(a.label));
      after(2000, () => {
        const f = tourFrame(a.convoId, a.label);
        if (f) o.showFrame(f.frame, f.question);
      });
    } else if (a.kind === 'montage') {
      // The montage is a visual flip-book — each frame shows SILENTLY (three narrations fired 3s
      // apart just talk over each other); the chapter's coach line is the only voice. See
      // montageSchedule for why the first flip waits a beat rather than firing immediately.
      const frames = a.convoIds.map((id) => tourFrame(id)).filter(Boolean) as NonNullable<
        ReturnType<typeof tourFrame>
      >[];
      const schedule = montageSchedule(frames.length, ch.durationMs);
      frames.forEach((f, i) => after(schedule[i], () => showSilent(f)));
    } else if (a.kind === 'ask') {
      // Perform the gesture, not just the pointer: pin the first card via its Ask affordance (the
      // pin chip + card ring appear for real), then type the follow-up a person would ask.
      after(1300, () => o.pinFirstBlock());
      scheduleTypewriter(after, o.typeInto, 'Why does it grow faster after year 20?', 1700);
    } else if (a.kind === 'askMulti') {
      // A direct jump must still show the exact two-card grounding gesture this scene promises.
      const f = tourFrame('money');
      if (f) showSilent(f);
      after(1300, () => o.pinFirstBlocks(2));
      scheduleTypewriter(
        after,
        o.typeInto,
        'How do these two parts explain the final total?',
        2600,
      );
    } else if (a.kind === 'bend') {
      // A dedicated worked example when one is given (rent/buy — a dial with real, relatable
      // stakes) rather than always reusing whatever the previous chapter happened to leave up.
      if (a.convoId) {
        const f = tourFrame(a.convoId);
        if (f) showSilent(f);
      }
      // Drag the dial for real: the slider glides up and every derived number recomputes live.
      after(1400, () => o.bendIt());
    } else if (a.kind === 'rail') {
      // Tuck the conversation rail away, hold a beat, bring it back — chrome you can trust.
      after(1300, () => o.toggleRail());
      after(2600, () => o.toggleRail());
    } else if (a.kind === 'export') {
      // The modal owns its guided sequence so the clock starts after its lazy chunk has mounted.
      // This call opens the real studio; ExportModal then shows presentation and document views.
      after(500, () => o.openExport());
    } else if (a.kind === 'mark') {
      // Arm the pen, then physically draw a highlighter mark across the first card and spotlight it.
      after(400, () => o.setInkArmed(true));
      after(900, () => o.scriptedMark());
    } else if (a.kind === 'penDemo') {
      // This is Mavéa's answer-annotation Pen, not the user's Highlight tool. Reseed the worked
      // answer so a direct jump is deterministic, then visibly draw two real, persistent strokes.
      const f = tourFrame('money');
      if (f) showSilent(f);
      after(1200, () => o.drawPenTourStep('result'));
      after(3900, () => o.drawPenTourStep('reason'));
      // Let the complete marked-up answer breathe before autoplay is allowed to move on.
      after(7200, () => o.setSpot(null));
    } else if (a.kind === 'focus') {
      after(500, () => o.setViewMode('focus'));
    } else if (a.kind === 'canvas') {
      const f = tourFrame(a.convoId);
      if (f) showSilent(f);
      // Flip into the spatial Canvas once the frame is on screen (a data.id change resets the view).
      after(1500, () => o.setViewMode('canvas'));
      // Then FLY it: after the takeover's entrance + fit settle, glide the camera card to card —
      // the flight between cards is the whole point of the spatial view. The old 1.3s hops made
      // scene 5 feel like a flash; these slower holds let each destination register. Release at the
      // end so the chapter closes on the full board, not zoomed into the last card.
      const ids = (f?.frame.spec.blocks ?? [])
        .map((b) => b.id)
        .filter((id): id is string => !!id)
        .slice(0, 3);
      ids.forEach((id, i) => after(2700 + i * 1900, () => o.setSpot(id)));
      after(2700 + ids.length * 1900, () => o.setSpot(null));
    } else if (a.kind === 'focusWalk') {
      const f = tourFrame(a.convoId);
      if (f) showSilent(f);
      // See focusWalkSchedule for why Focus mode itself waits (the hold) before the card-by-card
      // walk starts.
      const ids = (f?.frame.spec.blocks ?? []).map((b) => b.id).filter((id): id is string => !!id);
      const { focusAt, spotlightAt } = focusWalkSchedule(ids.length, ch.durationMs);
      after(focusAt, () => o.setViewMode('focus'));
      ids.forEach((id, i) => after(spotlightAt[i], () => o.setSpot(id)));
    } else if (a.kind === 'listen') {
      // Watch Me Think, for real: open the live map, then "think out loud" — each scripted thought
      // types into the real composer and banks into the map, so atoms bloom as the rambling goes.
      // The lines are written to trip the on-device extractor (options, fears, constraints, loops),
      // so the map draws with no model and no key — exactly what a first ramble feels like.
      after(400, () => o.startWatchThinking());
      let at = 800;
      for (const line of THINK_RAMBLE) {
        at = scheduleTypewriter(after, o.typeInto, line, at) + 300;
        after(at, () => {
          o.typeInto('');
          o.bankThought(line);
        });
        at += 800;
      }
    } else if (a.kind === 'flashcards') {
      after(700, () => o.openFlashcards());
    } else if (a.kind === 'course') {
      // Seed + open a real course lesson: the CourseRail ("Lesson 1 of 5" + objectives + Prev/Next)
      // rises over the lesson's baked canvas. The reveal is silent (the op strips narration) so the
      // chapter's coach line stays the only voice — the same treatment canvas/focusWalk give a seed.
      after(500, () => o.openTourCourse());
    } else if (a.kind === 'dashboard') {
      // Show the board first, then flip to its Settings panel — the real refresh-cadence control
      // that backs up the coach line's claim ("keeps itself up to date") with an actual setting,
      // not just the passive dashboard view.
      after(500, () => o.openDashboards());
      after(2600, () => o.dashboardShowSettings());
    } else if (a.kind === 'connect') {
      // Show the real connection UI without selecting a provider or typing into the key field.
      // A walkthrough must teach the path without mutating or fabricating the visitor's config.
      after(400, () => o.openModelSettings());
    } else if (a.kind === 'present') {
      after(500, () => o.setPresenting(true));
    } else if (a.kind === 'share') {
      after(500, () => o.setShareOpen(true));
      // Let the first cut play, then REMIX — a genuinely different recut of the same session —
      // and warm the palette so the reel's range shows, not just one look.
      after(3100, () => o.shareRemix());
      after(4900, () => o.sharePalette('Ember'));
    } else if (a.kind === 'palette') {
      after(500, () => o.setPaletteOpen(true));
    } else if (a.kind === 'atlas') {
      after(500, () => o.openAtlas());
    } else if (a.kind === 'prism') {
      // One document, told fully: the ignition burst, the bloom, the settled map, then the
      // briefing flying claim to claim over the real PDF page. (A second flip to a data file read
      // as a glitch — the PDF is the story.)
      after(400, () => o.openPrism(0));
    } else if (a.kind === 'memory') {
      after(700, () => o.fireMemoryGlow());
    } else if (a.kind === 'showcase') {
      // Session-context features (recap, chapter view) summarize a conversation, so seed a few turns
      // silently first — otherwise they'd open on an empty session. Everything else just opens.
      if (a.featureId === 'recap' || a.featureId === 'zoom-deck') {
        ['money', 'space', 'travel'].forEach((id, i) => {
          const f = tourFrame(id);
          if (f) after(i * 200, () => showSilent(f));
        });
        after(1400, () => o.showcaseFeature(a.featureId));
      } else {
        // Generic: open the feature on the real surface (the host owns the per-feature open).
        after(500, () => o.showcaseFeature(a.featureId));
      }
    } else if (a.kind === 'blanksDemo') {
      // Key-free Blank Space: show the hand-authored answer WITH holes (glowing, awaiting), then
      // reveal its completed twin — the numbers filled in, the runway math finished.
      const scaffold = tourFrame('money')?.frame.spec;
      if (scaffold) {
        const { holes, filled } = buildBlanksDemo(scaffold);
        showSilent({ frame: holes, question: holes.question });
        // Hold on the holes long enough to read them before the answer completes itself.
        after(5200, () => o.showFrame(filled, filled.question));
      }
    }
    // 'mic' / 'ask' / 'none' teach via the coach line + spotlight only.

    // 5) The coach voice. A short delay lets the mute state settle before we speak.
    if (ch.mode !== 'silent' && !userMutedRef.current) {
      after(160, () => speakWhenUnlocked(naturalGuidedCopy(ch.coach)));
    }

    return step.cancel;
    // `seq` is derived from soloId, so soloId in the deps re-applies when the playlist flips
    // (entering/leaving a solo mini-demo).
  }, [index, token, active, started, done, corpusReady, soloId, resetTriggers]);

  // AUTO-ADVANCE — separate so play/pause only starts/stops the clock, never re-applies. The
  // quiet gate (driverKit.startQuietGate) holds for at least the chapter's durationMs, then
  // waits for Mavéa to finish everything the chapter set in motion before moving on. The 2x
  // tour speed comes from the halved durations and shorter coach lines, not from trimming the
  // gate's safety margin.
  useEffect(() => {
    // Held on corpusReady like the apply effect: the advance clock must not tick down a chapter
    // whose frames haven't even been applied yet.
    if (!active || !started || done || !playing || !corpusReady) return;
    const ch = seqRef.current[index];
    if (!ch) return;
    const o = opsRef.current;
    return startQuietGate({
      minHoldMs: ch.durationMs,
      isQuiet: () => !o.isSpeaking() && !o.isBusy(),
      advance: () => {
        if (index + 1 >= total) {
          resetTriggers();
          setDone(true);
        } else {
          setIndex(index + 1);
        }
      },
    });
  }, [index, token, active, started, done, playing, corpusReady, total, soloId, resetTriggers]);

  // Clean up on unmount so no feature is left open.
  useEffect(() => () => resetTriggers(), [resetTriggers]);

  const start = useCallback(() => {
    unlockAudio();
    setStarted(true);
    setPlaying(true);
    setDone(false);
  }, []);

  const goto = useCallback((i: number, opts?: { keepPlaying?: boolean }) => {
    // Every transport action is a user gesture — the only moment the browser lets us resume the
    // AudioContext. Do it here so the tour's voice actually plays from the next chapter on.
    unlockAudio();
    setDone(false);
    // Going BACK (or dot-jumping) means the user wants to study a chapter — pause, or the
    // auto-advance clock races their clicks and the tour appears to jump to random chapters
    // seconds after they navigated. Next keeps the flow rolling; Play resumes anytime.
    if (!opts?.keepPlaying) setPlaying(false);
    // Clamp against the CURRENT playlist (solo = one chapter, else the full core tour), read from
    // the ref so this callback never has to be recreated when soloId flips.
    setIndex(Math.max(0, Math.min(seqRef.current.length - 1, i)));
    setToken((t) => t + 1);
  }, []);
  const next = useCallback(() => {
    if (index + 1 >= total) {
      resetTriggers();
      setDone(true);
    } else goto(index + 1, { keepPlaying: true });
  }, [index, total, goto, resetTriggers]);
  const prev = useCallback(() => goto(index - 1), [index, goto]);
  const jumpTo = useCallback((i: number) => goto(i), [goto]);
  const replay = useCallback(() => {
    resetTriggers();
    // Replay always means the FULL tour, even from a solo mini-demo's end card.
    setSoloId(null);
    setStarted(true);
    goto(0);
    setPlaying(true);
  }, [goto, resetTriggers]);
  // Play one extra chapter on its own, in-session, from the end card's "More to explore" grid. No
  // reload (the tour session is disposable): flip to its solo playlist, rewind to its single entry,
  // and let it run — when its quiet gate fires, `advance` sees index+1 ≥ 1 and returns to the end
  // card rather than moving on.
  const playExtra = useCallback((id: string) => {
    if (!isExtra(id)) return;
    unlockAudio();
    setSoloId(id);
    setStarted(true);
    setDone(false);
    setPlaying(true);
    setIndex(0);
    setToken((t) => t + 1);
  }, []);
  const toggle = useCallback(() => {
    unlockAudio();
    if (!started) {
      start();
      return;
    }
    if (done) {
      replay();
      return;
    }
    setPlaying((p) => !p);
  }, [done, replay, start, started]);
  const toggleMute = useCallback(() => {
    unlockAudio();
    const next = !userMutedRef.current;
    userMutedRef.current = next;
    setUserMuted(next);
    const current = seqRef.current[index];
    const chapterStaysSilent = current?.mode === 'silent';
    const o = opsRef.current;
    o.setMuted(next || chapterStaysSilent);
    if (next) {
      o.cancelSpeech();
    } else if (started && !done && current && !chapterStaysSilent) {
      o.speak(naturalGuidedCopy(current.coach));
    }
  }, [done, index, started]);
  const skip = useCallback(() => {
    resetTriggers();
    setDone(true);
  }, [resetTriggers]);

  return {
    active,
    started,
    index,
    total,
    chapter,
    coach: naturalGuidedCopy(chapter?.coach ?? ''),
    spotlight: chapter?.spotlight,
    playing,
    muted: userMuted,
    done,
    solo: !!soloId,
    start,
    next,
    prev,
    jumpTo,
    toggle,
    toggleMute,
    replay,
    skip,
    playExtra,
  };
}
