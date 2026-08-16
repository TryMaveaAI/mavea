// useLiveTurn.ts — the Live turn loop for the dedicated surface. Owns the rolling
// history, the rendered spec, and a small presence state machine, and drives ONE
// streamed generation per turn. Narration-first: as soon as the spoken sentence
// has streamed in, we speak it and the face shifts to 'speaking' — while the
// blocks are still arriving. When the spec resolves, the canvas reveals.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Block, ConversationSpec, WebSource, FillValue } from '../data/conversation';
import { blockLabel } from '../canvas/blockLabel';
import { preloadBlockFamilies } from '../canvas/blocks/loader';
import type { ModelConfig } from '../types/mavea';
// The turn engine (generateLive → adapters → schema → the component catalog) is the heaviest
// thing Live can pull in, and none of it is needed to MOUNT the surface — only to run a turn.
// It stays out of the static graph and loads on first use; prewarmLive fetches it on idle, so
// by the time a user finishes typing their first ask the chunk is normally already cached.
import type { LiveActivity, LiveCaps, LiveError, LiveResult } from './generateLive';
const turnEngine = () => import('./generateLive');
import type { TourMark } from '../engine/liveSchema';
import { likelyFollowUp, type Mode, type TurnSnapshot } from './lifecycle';
import { settleTurn } from './settleTurn';
import { mergeNodes } from './memory/store';
import { extractUserFacts } from './memory/extract';
import { memoryRelevant } from './memory/relevance';
import { classifySource, classifyCorrectionSource } from './memory/provenance';
import { correctionUpdate } from './memory/procedural';
import { saveCanvas } from './library/store';
import type { SavedSession } from './session/store';
import { createTurnFrameId, type TurnFrame } from './history';
import type { ChatMessage } from './providers/types';
import type { Attachment } from './attachments';
import { isSpeaking, type SpokenLine } from '../voice/tts';
import { bounded } from '../lib/bounded';
import { SHOWFRAME_REVEAL_CAP_MS } from './walkSync';
import type { InkIntent } from './annotate/inkIntent';
import type { MindShapeSpec } from './mindshape/types';
import { explodeWorld } from './world/explode';
import { expandWorldNode } from './world/expand';
import { turnCorpus } from './world/grounding';
import type { WorldSpec } from './world/types';
import { extractNarrationProgress, nextSpeakableChunk } from './streamParse';
import { collapseRepeatedValues, forDisplay } from '../lib/spokenText';
import { classifyAsk } from './select/complexity';
import { spokenBudget } from './effort';

/** Presence phase for one turn (maps to Presence data-state in the surface). */
export type LiveStatus = 'idle' | 'thinking' | 'speaking' | 'showing';

/** Whether the surface is gathering the user's input for "The Blank Space". Orthogonal to
 *  `status` (which is presence/loading): `awaiting_input` typically coincides with `showing` —
 *  a partial answer is up, its holes glowing, while we wait for the user to fill them. */
export type TurnPhase = 'normal' | 'awaiting_input';

/** Everything Retry needs to re-run a failed turn EXACTLY as it was asked: the friendly
 *  `question` to SHOW on the card, `retry` — the prompt to RE-RUN (the raw instruction for a
 *  synthetic turn, which must run, not be shown) — and the inputs the ask carried. Those inputs
 *  are cleared from the composer on submit, so without carrying them here an attachment-only ask
 *  retried as a question about a file that was no longer attached. */
export type FailedTurn = LiveError & {
  question: string;
  retry: string;
  attachments?: Attachment[];
  selectedBlocks?: Block[];
  inkIntents?: InkIntent[];
};

export interface LiveTurnState {
  history: ChatMessage[];
  spec: ConversationSpec | null;
  status: LiveStatus;
  /** Bumped per turn so the canvas re-keys and re-reveals. */
  turn: number;
  /** The current spoken line (shown as the caption). */
  narration: string;
  /** The model's constraint chips for the answer on screen ("edit its mind") — its own
   *  reading of the ask, correctable by the user. [] when the turn carried none. */
  understood: string[];
  busy: boolean;
  /** Coarse external activity for the transparency UI (e.g. 'searching' the web). */
  activity: LiveActivity;
  /** The block id currently spotlit (null = the whole canvas, at rest). */
  spot: string | null;
  /** What this turn did to the canvas: clear-and-rebuild, add to it, or update it. */
  mode: Mode;
  /** Bumped ONLY on replace, so the canvas remounts for a fresh set but reconciles
   *  (no remount) when a follow-up adds or refines. */
  replaceEpoch: number;
  /** A snapshot of the last turn, for the next turn's topic-shift decision. */
  prior: TurnSnapshot | null;
  /** Optional model-authored spotlight order (block indices) for this turn; [] = deterministic.
   *  `saySpoken` is the voice-ready twin of `say` (from inline [[shown|said]] annotations);
   *  `mark` is the stop's drawn gesture (kind + the exact on-block text it aims at). */
  tour: { index: number; say?: string; saySpoken?: string; mark?: TourMark; marks?: TourMark[] }[];
  /** Canvases wiped by a REPLACE, most-recent last — so the user can go back to an earlier
   *  set of visuals after the page is cleared. Capped to keep memory bounded. */
  past: ConversationSpec[];
  /** EVERY turn, captured as a frame (the canvas after it, its spoken line + tour), so the
   *  user can scroll the whole conversation and replay any moment — even augment/refine
   *  states and blocks a later turn cleared. Oldest first; capped. */
  frames: TurnFrame[];
  /** Which past frame the scrubber is viewing; null = the live head (the default). */
  viewIndex: number | null;
  /** A composed spec shown in place of any frame — the "See this thread together" view (one topic
   *  thread's turns folded onto one board). null = off. Non-destructive: it overrides only what the
   *  canvas renders, never frames/history, and any navigation or new turn clears it. */
  viewOverride: ConversationSpec | null;
  /** The last turn's FAILURE, when the provider call produced no answer. A failed turn never
   *  enters history, frames, or the library — it is an error state, not content. Cleared next turn. */
  error: FailedTurn | null;
  /** The primary DATA SHAPE of the block currently streaming in (resolved from its "type" key by
   *  the engine, which holds the catalog) — labels the in-progress skeleton with the real kind
   *  without this state ever reaching the catalog. Null between blocks and outside a streamed turn. */
  pendingShape: string | null;
  /** The model is emitting reasoning/"thinking" tokens before any answer content (some
   *  reasoning/OpenRouter models). Drives a live "Thinking…" cue so a long pre-answer reasoning
   *  phase never reads as a frozen "Composing…". Cleared the moment content starts or the turn settles. */
  reasoning: boolean;
  /** Sources known MID-turn (the search resolved; the model is reading them now), so the
   *  working state can name what's being read. Cleared when the turn settles — the final
   *  citations live on the spec. */
  liveSources: WebSource[];
  /** The canvas on screen came from the Library (no generation ran yet this session) — the
   *  rail says "Resumed" honestly. Cleared the moment a real turn starts. */
  restored: boolean;
  /** "The Blank Space": whether we're gathering the user's input for the answer on screen. */
  phase: TurnPhase;
  /** Values the user has filled into this answer's holes, keyed by Blank.key. Reset each turn. */
  filled: Record<string, FillValue>;
  /** The hole voice/tour is armed on (the current "stop"); null = none. */
  activeBlank: string | null;
}

/** How many wiped canvases to remember for the history viewer. */
const HISTORY_CAP = 12;
/** How many turn frames to keep for the timeline/replay (bounded so memory stays flat on a
 *  marathon conversation). */
const FRAMES_CAP = 40;
/** How many chat messages (≈2 per turn) to retain in the running history. Bounded like `frames`
 *  and `past` so a marathon session can't grow the array without limit. This sits well above every
 *  consumer — the model send already keeps only the last few turns, and session persistence caps
 *  its own copy — so trimming here changes nothing the user or the model sees. */
const MESSAGES_CAP = 40;
/** Max session-answer-cache entries — each holds a full result (tens–hundreds of KB), so cap it
 *  (FIFO eviction) to keep memory flat over a long session. */
const ANSWER_CACHE_MAX = 50;

/** How many follow-up chips to answer ahead of the tap. Every prefetch is a full turn billed to the
 *  user's key whether or not they tap it, and taps concentrate hard on the first couple of chips —
 *  so buy instant-feel where it lands and let the rest generate on tap. */
const CHIP_PREFETCH = 2;

/** The prefetch/answer caches are keyed on the question's TEXT, so a config signature must ride
 *  along with it — otherwise switching provider/model, or toggling search, mid-session could
 *  replay a stale cross-config answer for a re-asked (or prefetched) question instead of
 *  generating a fresh one under the config actually active now.
 *
 *  Every cap that changes the ANSWER belongs here, not just the connection ones: quality and
 *  explanation level steer depth and wording, and the memory / generative-blocks toggles change
 *  which blocks the turn may even use. Leaving them out meant flipping "explain simply" and
 *  re-asking the same question served the standard-level answer straight from cache. */
function configSignature(cfg: ModelConfig, caps: LiveCaps | undefined): string {
  const search = caps?.searchMode ?? (caps?.webSearch ? 'free' : 'off');
  const quality = caps?.quality ?? '';
  const explain = caps?.explainLevel ?? 'standard';
  const generative = caps?.generativeBlocks ? 1 : 0;
  const memory = caps?.memoryEnabled ? 1 : 0;
  const world = caps?.worldEnabled ? 1 : 0;
  return `${cfg.provider}::${cfg.model}::${search}::${quality}::${explain}::${generative}::${memory}::${world}`;
}

/** The living world currently on screen, if the canvas carries a BUILT one. Read straight off the
 *  rendered spec so a follow-up lands on exactly the world the user is looking at; the LAST world
 *  wins, since that is the one a thread which opened a second subject is actually talking about.
 *  A card nobody has opened yet has no world, so a follow-up about it is an ordinary turn. */
function currentWorld(spec: ConversationSpec | null): WorldSpec | undefined {
  const blocks = spec?.blocks ?? [];
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.type === 'world' && block.props.world) return block.props.world;
  }
  return undefined;
}

/** Write a built world back onto its card. Matched on the card's QUESTION as well as its id: block
 *  ids are renumbered across a merge, so a build that lands after the next turn must not attach
 *  itself to whatever card now sits in that slot. Returns the SAME spec when this canvas doesn't
 *  carry that card (or already has the world), so the reducer can tell a change from a no-op. */
function withWorld(
  spec: ConversationSpec,
  blockId: string,
  question: string,
  world: WorldSpec,
): ConversationSpec {
  const i = spec.blocks.findIndex((b) => b.id === blockId && b.type === 'world');
  if (i < 0) return spec;
  const block = spec.blocks[i];
  if (block.type !== 'world' || block.props.world || block.props.title !== question) return spec;
  const blocks = [...spec.blocks];
  blocks[i] = { ...block, props: { ...block.props, world } };
  return { ...spec, blocks };
}

export const INITIAL: LiveTurnState = {
  history: [],
  spec: null,
  status: 'idle',
  turn: 0,
  narration: '',
  understood: [],
  busy: false,
  activity: null,
  spot: null,
  mode: 'replace',
  replaceEpoch: 0,
  prior: null,
  tour: [],
  past: [],
  frames: [],
  viewIndex: null,
  viewOverride: null,
  error: null,
  pendingShape: null,
  reasoning: false,
  liveSources: [],
  restored: false,
  phase: 'normal',
  filled: {},
  activeBlank: null,
};

/** First hole in `blanks` whose key isn't yet in `filled` — the next stop for the tour/voice. */
function firstUnfilled(
  blanks: ConversationSpec['blanks'],
  filled: Record<string, FillValue>,
): string | null {
  return blanks?.find((b) => !(b.key in filled))?.key ?? null;
}

type Action =
  | { type: 'start'; fresh?: boolean }
  | { type: 'speak'; narration: string }
  | { type: 'activity'; activity: LiveActivity }
  | { type: 'stream'; spec: ConversationSpec }
  | {
      type: 'show';
      spec: ConversationSpec;
      narration: string;
      history: ChatMessage[];
      mode: Mode;
      spot: string | null;
      prior: TurnSnapshot;
      tour: {
        index: number;
        say?: string;
        saySpoken?: string;
        mark?: TourMark;
        marks?: TourMark[];
      }[];
      /** The canvas shown before this turn — pushed to history when this turn replaces. */
      priorSpec: ConversationSpec | null;
      /** True when this turn was revealed progressively (we already rendered under the
       *  current epoch), so the final settle must NOT remount the canvas. */
      streamed: boolean;
      /** This turn captured as a frame (rendered canvas + spoken line + tour), appended to
       *  the timeline for scroll-back + replay. */
      frame: TurnFrame;
      /** The model's constraint chips for this answer ("edit its mind"); [] when none. */
      understood: string[];
      /** A standalone "Watch Me Think" answer fired on top of a restored-but-not-continued
       *  session: start a FRESH frames timeline (this frame is turn 1) instead of appending to
       *  the restored conversation, so the answer becomes its own saved conversation. */
      freshTimeline?: boolean;
    }
  | { type: 'idle' }
  // The turn FAILED (provider error): show the error state, keep the prior canvas untouched.
  | { type: 'error'; error: FailedTurn }
  | { type: 'spot'; spot: string | null }
  // The streaming block's type (skeleton label) and the mid-turn search sources.
  | { type: 'pending'; pending: string | null }
  // The model is (or is no longer) emitting reasoning tokens before any answer content.
  | { type: 'thinking'; on: boolean }
  | { type: 'sources'; sources: WebSource[] }
  // Jump the canvas to a past frame (the scrubber); a new live turn snaps back to the head.
  | { type: 'jump'; index: number }
  | { type: 'preview'; spec: ConversationSpec | null }
  // Re-open a saved canvas from the Library: render it as a fresh (replace) canvas — no model call.
  | { type: 'restore'; spec: ConversationSpec; question: string; at: number }
  // A living answer was built (on the reader's open) — write it back onto its card.
  | { type: 'world'; blockId: string; question: string; world: WorldSpec }
  // "The Blank Space": user filled / cleared a hole, or the active stop moved.
  | { type: 'fill'; value: FillValue }
  | { type: 'unfill'; key: string }
  | { type: 'setActiveBlank'; key: string | null }
  | { type: 'reset' };

export function reducer(s: LiveTurnState, a: Action): LiveTurnState {
  switch (a.type) {
    case 'start':
      // A new turn returns to the live head (leave whatever past moment the scrubber was viewing).
      return {
        ...s,
        status: 'thinking',
        busy: true,
        narration: '',
        understood: [],
        activity: null,
        spot: null,
        viewIndex: null,
        viewOverride: null,
        error: null,
        pendingShape: null,
        reasoning: false,
        liveSources: [],
        restored: false,
        // A fresh standalone start (a Watch-Me-Think map fired on top of a restored session) drops
        // the restored canvas + prior snapshot now, so the unrelated past conversation never flashes
        // behind the thinking state. The frames/history TIMELINE is left intact until this turn
        // SUCCEEDS ('show' resets it) — so a failed turn still preserves the prior saved session.
        ...(a.fresh ? { spec: null, prior: null } : {}),
        // A brand-new ask abandons any half-filled Blank Space from the prior answer.
        phase: 'normal',
        filled: {},
        activeBlank: null,
      };
    case 'speak':
      return { ...s, status: 'speaking', narration: a.narration };
    case 'activity':
      return { ...s, activity: a.activity };
    case 'stream':
      // Progressive reveal: grow the canvas as blocks stream in, WITHOUT bumping the
      // turn (so the reveal tour doesn't fire yet) or the epoch (so it reconciles, not
      // remounts). The face is already speaking; the canvas now fills in alongside it.
      return { ...s, status: 'showing', spec: a.spec };
    case 'show':
      return {
        ...s,
        status: 'showing',
        spec: a.spec,
        narration: a.narration || s.narration,
        understood: a.understood,
        history: a.history.slice(-MESSAGES_CAP),
        turn: s.turn + 1,
        busy: false,
        mode: a.mode,
        prior: a.prior,
        tour: a.tour,
        // Keep the wiped canvas in history so the user can return to it — but a fresh standalone
        // start drops the restored conversation's wiped canvases too (this is a NEW conversation).
        past: a.freshTimeline
          ? []
          : a.mode === 'replace' && a.priorSpec
            ? [...s.past, a.priorSpec].slice(-HISTORY_CAP)
            : s.past,
        // Append THIS turn to the timeline (every mode), bounded — the scroll-back + replay log.
        // A fresh standalone start begins a NEW timeline: this frame is turn 1, so the answer is
        // its own saved conversation (its mind-map rail icon and Library entry land here, not on
        // the restored past conversation it was fired on top of).
        frames: a.freshTimeline ? [a.frame] : [...s.frames, a.frame].slice(-FRAMES_CAP),
        activity: null,
        // Remount the canvas only on a fresh set we did NOT already stream — a streamed
        // turn already rendered under the current epoch, and an add/refine reconciles.
        replaceEpoch: a.mode === 'replace' && !a.streamed ? s.replaceEpoch + 1 : s.replaceEpoch,
        // The surface already chose where to open the spotlight (lead block, or the
        // first newly-added block on an augment).
        spot: a.spot,
        // The fresh canvas is the live head — clear any scrubber jump or composed-thread view.
        viewIndex: null,
        viewOverride: null,
        // The turn settled: nothing is streaming, and citations now live on the spec.
        pendingShape: null,
        reasoning: false,
        liveSources: [],
        // The Blank Space: an answer that arrives with holes enters the gather phase, armed on
        // the first hole. A complete answer resets it. Filled values never carry across turns.
        phase: a.spec.awaiting && a.spec.blanks?.length ? 'awaiting_input' : 'normal',
        filled: {},
        activeBlank:
          a.spec.awaiting && a.spec.blanks?.length ? firstUnfilled(a.spec.blanks, {}) : null,
      };
    case 'idle':
      return { ...s, status: 'idle', busy: false, activity: null, reasoning: false };
    case 'error':
      // A failed turn settles to idle with the error surfaced. The prior canvas, history,
      // frames, and library are all left exactly as they were — a failure is not content.
      return {
        ...s,
        status: 'idle',
        busy: false,
        activity: null,
        error: a.error,
        pendingShape: null,
        reasoning: false,
        liveSources: [],
      };
    case 'spot':
      return { ...s, spot: a.spot };
    case 'pending':
      return { ...s, pendingShape: a.pending };
    case 'thinking':
      return { ...s, reasoning: a.on };
    case 'sources':
      return { ...s, liveSources: a.sources };
    case 'jump': {
      // Show a past frame's canvas in place; clear the spotlight so it sits at rest (the user is
      // navigating, not being re-toured), and drop any composed-thread view. Out-of-range is a no-op.
      if (!s.frames[a.index]) return s;
      return { ...s, viewIndex: a.index, viewOverride: null, spot: null };
    }
    case 'preview':
      // Show a composed spec in place of any frame (the "See this thread together" view), or clear it
      // (spec null → back to the live head). Non-destructive; leaves frames/history untouched.
      return { ...s, viewOverride: a.spec, viewIndex: null, spot: null };
    case 'restore': {
      // Open a saved canvas exactly like a fresh replace turn: bump turn + epoch so it remounts and
      // re-reveals (the spotlight tour fires), open the spotlight on the lead block, and seed the
      // prior snapshot + history so a follow-up question continues naturally. No generation runs.
      const spot = a.spec.blocks.find((b) => b.id)?.id ?? null;
      // The resumed canvas joins the timeline as its own moment, so it shows up in the rail and the
      // answer hero captions it correctly — without this it floated over the previous session's last
      // frame and the hero kept showing that stale ask. No spoken narration to store (none replays).
      const restoredFrame: TurnFrame = {
        id: createTurnFrameId(a.at),
        question: a.question,
        narration: '',
        mode: 'replace',
        tour: [],
        spec: a.spec,
        at: a.at,
      };
      return {
        ...s,
        restored: true,
        spec: a.spec,
        status: 'showing',
        turn: s.turn + 1,
        narration: '',
        understood: [],
        busy: false,
        activity: null,
        spot,
        viewIndex: null,
        viewOverride: null,
        mode: 'replace',
        replaceEpoch: s.replaceEpoch + 1,
        tour: [],
        error: null,
        frames: [...s.frames, restoredFrame].slice(-FRAMES_CAP),
        prior: {
          question: a.question,
          narration: '',
          title: a.spec.title,
          blockTypes: a.spec.blocks.map((b) => b.type),
        },
        history: [
          ...s.history,
          { role: 'user' as const, content: a.question },
          { role: 'assistant' as const, content: a.spec.title },
        ].slice(-MESSAGES_CAP),
      };
    }
    case 'world': {
      const spec = s.spec ? withWorld(s.spec, a.blockId, a.question, a.world) : s.spec;
      const frames = s.frames.map((f) => {
        const patched = withWorld(f.spec, a.blockId, a.question, a.world);
        return patched === f.spec ? f : { ...f, spec: patched };
      });
      // Nothing carried that card — a canvas that moved on keeps its identity.
      if (spec === s.spec && frames.every((f, i) => f === s.frames[i])) return s;
      return { ...s, spec, frames };
    }
    case 'fill': {
      const filled = { ...s.filled, [a.value.key]: a.value };
      return { ...s, filled, activeBlank: firstUnfilled(s.spec?.blanks, filled) };
    }
    case 'unfill': {
      const filled = { ...s.filled };
      delete filled[a.key];
      return { ...s, filled, activeBlank: a.key };
    }
    case 'setActiveBlank':
      return { ...s, activeBlank: a.key };
    case 'reset':
      return { ...INITIAL };
    default:
      return s;
  }
}

/**
 * Build the initial turn state from a persisted session (a page reload mid-conversation), so
 * the surface mounts straight INTO the conversation: transcript restored, the last turn's
 * canvas on screen, and the prior snapshot seeded so a follow-up merges naturally. Status is
 * 'idle' — Mavéa sits calm at the corner; nothing is re-spoken on a reload. The restored flag
 * makes the session rail say "Resumed" honestly (same semantics as a Library restore); it
 * clears the moment a real turn starts.
 */
export function hydrateFromSession(session: SavedSession): LiveTurnState {
  const last = session.frames[session.frames.length - 1];
  return {
    ...INITIAL,
    history: session.history,
    frames: session.frames,
    spec: last.spec,
    status: 'idle',
    mode: 'replace',
    restored: true,
    prior: {
      question: last.question,
      narration: last.narration,
      title: last.spec.title,
      blockTypes: last.spec.blocks.map((b) => b.type),
    },
  };
}

export interface UseLiveTurnArgs {
  /** Final authorization gate for billable/provider-backed turns. Scripted frames still work. */
  canRun?: () => boolean;
  /** Read the active model config at call time (so picker changes take effect next turn). */
  getConfig: () => ModelConfig;
  /** Read the active capabilities at call time (web search / image gen toggles). */
  getCaps?: () => LiveCaps;
  /** Speak a line (the surface wires this to TTS). The surface's wrapper may return the line's
   *  lifecycle handle — showFrame uses it to reveal the canvas when the narration actually
   *  becomes audible; the streaming sentence path ignores it. */
  speak?: (text: string) => SpokenLine | void;
  /** Cancel any in-flight speech before a new turn. */
  cancelSpeak?: () => void;
  /** Whether to save finished canvases to the local Library (opt-in). Read at call time so a
   *  mid-session toggle takes effect on the next turn. */
  getLibraryEnabled?: () => boolean;
  /** Start from a restored state (a reload mid-conversation) instead of empty. Read once on
   *  mount — see hydrateFromSession. */
  initial?: LiveTurnState;
}

export interface UseLiveTurn extends LiveTurnState {
  run: (
    text: string,
    attachments?: Attachment[],
    selectedBlocks?: Block[],
    filledBlanks?: Record<string, FillValue>,
    inkIntents?: InkIntent[],
    /** Human-friendly label shown in place of `text` in the transcript, sidebar, and
     *  scrubber for synthetic turns whose prompt is an instruction, not the user's words
     *  (the morning brief, a correction, a fuse/refresh). The model still receives `text`. */
    displayAs?: string,
    /** The settled "Watch Me Think" map this prompt was fused from, if any — stored on the
     *  resulting frame so the user can re-open a read-only view of it next to the answer. */
    fromMind?: MindShapeSpec,
    /** Run this turn as a STANDALONE conversation: ignore the restored/prior session's history,
     *  prior snapshot, and on-screen canvas, and begin a fresh frames timeline. Used when a
     *  self-contained "Watch Me Think" map is fired on top of a restored-but-not-yet-continued
     *  session, so an unrelated past conversation can't pollute the answer (and the answer starts
     *  its own saved conversation). A genuine in-session follow-up omits this and keeps continuity. */
    opts?: {
      freshStart?: boolean;
      /** Bypass the busy guard: abort whatever turn is still generating and start this one right
       *  now. Used by a barge-in's new question — the interrupted turn must not silently swallow
       *  it just because the prior generation hasn't settled yet (see `run`'s abort handling). */
      force?: boolean;
      /** Topic Courses: this turn is one lesson in a course — passed straight through to
       *  generateLive's GenerateLiveOpts.lesson (see course/lessonSpine.ts's buildLessonSpine). */
      lesson?: { directive: string; topic: string };
    },
  ) => Promise<void>;
  reset: () => void;
  /** Move the spotlight (the surface drives the reveal tour through this). */
  setSpot: (spot: string | null) => void;
  /** Re-open a saved canvas from the Library (no model call). */
  restore: (spec: ConversationSpec, question: string) => void;
  /** Jump the canvas to a past moment (the scrubber); out-of-range is a no-op. */
  jumpTo: (index: number) => void;
  /** Show a composed-thread spec on the canvas (the "See this thread together" view), or null to
   *  clear it and return to the live head. Non-destructive — never touches frames/history. */
  previewSpec: (spec: ConversationSpec | null) => void;
  /** "The Blank Space": commit a value into a hole / clear one / move the active stop. */
  fill: (value: FillValue) => void;
  unfill: (key: string) => void;
  setActiveBlank: (key: string | null) => void;
  /** Complete an awaiting answer: refine the SAME canvas with the filled values. Runs only on
   *  the user's explicit click — never automatically. Returns whether it actually started a
   *  refine (false when there's nothing to complete yet, or the turn is still busy) so a caller
   *  can tell a no-op from a real trigger instead of assuming the call always succeeds. */
  complete: () => boolean;
  /** Build the living answer a world card is offering — the ONE call it costs, made only when the
   *  reader opens it. Resolves with the world (already written back onto the card and every frame
   *  that carries it) or null when the build failed. A card that already carries a world, or a
   *  turn the legal gate refuses, calls nothing. */
  generateWorld: (blockId: string) => Promise<WorldSpec | null>;
  /** Break ONE cause of a standing world into its parts — a second, smaller call, made only when
   *  the reader presses for it. Resolves with the world plus that breakdown, or null when there is
   *  nothing honest to add (an atomic cause, a failed call, a node that already has one). The
   *  result is the surface's to hold: a breakdown is a closer look, not a change to the answer. */
  expandWorld: (blockId: string, nodeId: string) => Promise<WorldSpec | null>;
  /** Inject a PRE-BAKED turn (the first-run tour): render this frame exactly as a live answer —
   *  the face narrates, the canvas reveals, the spotlight walk plays — with NO model call. It
   *  drives the same `start → speak → show` reducer path a real turn does, so the surface can't
   *  tell the difference. `question` is the ask shown in the transcript/AnswerHero. */
  /** `silent` seeds the canvas without performing it — no voice, no spotlight walk, instant
   *  reveal — while the timeline still records the AUTHENTIC frame (narration + tour intact),
   *  so a video cut or replay of a jumped-to boot is never missing its narration. */
  showFrame: (
    frame: TurnFrame,
    question: string,
    opts?: { interrupt?: boolean; revealNow?: boolean; silent?: boolean },
  ) => void;
  /** The spec actually on screen — a jumped-to past frame, or the live head. */
  viewSpec: ConversationSpec | null;
}

export function useLiveTurn(args: UseLiveTurnArgs): UseLiveTurn {
  const { canRun, getConfig, getCaps, speak, cancelSpeak, getLibraryEnabled } = args;
  const [state, dispatch] = useReducer(reducer, args.initial ?? INITIAL);
  // The surface rebuilds these arrow props every render, so a callback that must stay
  // identity-stable (generateWorld, driven from an effect) reads them here instead of closing
  // over them.
  const argsRef = useRef(args);
  argsRef.current = args;

  // Refs so run() reads current values without re-binding the callback.
  const busyRef = useRef(false);
  busyRef.current = state.busy;
  const historyRef = useRef<ChatMessage[]>(state.history);
  historyRef.current = state.history;
  // Aborts an in-flight turn's search/generation on a new turn, reset, or unmount,
  // so a slow search never lands on a stale turn (and never leaks past unmount).
  const abortRef = useRef<AbortController | null>(null);
  // The pending `show` dispatch scheduled by showFrame's narrate-then-reveal beat. Tracked (like
  // abortRef) so a newer turn or chapter can cancel it — otherwise a stale frame from a chapter the
  // user already navigated away from lands moments later and overwrites whatever replaced it.
  // A cancel closure rather than a bare timer id: the reveal may be waiting on the narration's
  // audio actually starting, not just a timeout.
  const showFrameCancelRef = useRef<(() => void) | null>(null);
  // The rendered (persistent) canvas + last snapshot, so run() can merge against them.
  const specRef = useRef<ConversationSpec | null>(state.spec);
  specRef.current = state.spec;
  // The canvas the reader is LOOKING at, and every frame this session holds — read through refs so
  // the world callbacks below stay identity-stable (the surface drives them from effects and hands
  // them to a memoized stage).
  const viewSpecRef = useRef<ConversationSpec | null>(null);
  const framesRef = useRef<readonly TurnFrame[]>([]);
  framesRef.current = state.frames;
  const priorRef = useRef<TurnSnapshot | null>(state.prior);
  priorRef.current = state.prior;
  // The values filled into the current answer's holes, so complete() reads them at click time.
  const filledRef = useRef<Record<string, FillValue>>(state.filled);
  filledRef.current = state.filled;
  // Prefetch cache: background-generated answers for the chips shown after each turn.
  // Keyed by chip label (= the text run() would receive). Cleared on every new turn
  // so stale results from a prior canvas never land on an unrelated question.
  // Not stored in state — it's a transparent performance optimisation, invisible to the UI.
  const prefetchCacheRef = useRef<Map<string, LiveResult>>(new Map());
  // Session answer cache: dedupes identical re-asks within a session (no extra model call).
  // Keyed by "userText::historyLength" — captures both the question and conversation context.
  // Only populated on success; cleared on reset so stale sessions never leak.
  // Skipped when attachments or selected blocks are present (those change the effective input).
  const answerCacheRef = useRef<Map<string, LiveResult>>(new Map());
  // Controllers for in-flight prefetch calls so they can be aborted on new turn / reset.
  const prefetchAbortRef = useRef<AbortController[]>([]);
  // Every block type shown SO FAR this conversation. The next turn down-weights these in
  // selection and the prompt tells the model to prefer types it hasn't used yet — so each
  // answer reaches for fresh visuals instead of recycling the same handful. A ref (no re-render).
  const usedTypesRef = useRef<Set<string>>(new Set());
  const turnRef = useRef(state.turn);
  turnRef.current = state.turn;

  const run = useCallback(
    async (
      text: string,
      attachments?: Attachment[],
      selectedBlocks?: Block[],
      filledBlanks?: Record<string, FillValue>,
      inkIntents?: InkIntent[],
      displayAs?: string,
      fromMind?: MindShapeSpec,
      opts?: {
        freshStart?: boolean;
        force?: boolean;
        lesson?: { directive: string; topic: string };
      },
    ) => {
      // Recorded tours and demos may mount the real Live surface without accepting the product
      // terms. They can replay baked frames, but every route into a real model turn fails closed.
      if (canRun && !canRun()) return;
      const trimmed = text.trim();
      // A turn needs either words or a file — an attachment alone is a valid ask ("what's
      // this?" with just an image). Guard on both being empty rather than text alone. `force`
      // lets a barge-in's new question through even while the interrupted turn is still busy —
      // it aborts that turn (below) instead of silently dropping this one.
      if ((!trimmed && !attachments?.length) || (busyRef.current && !opts?.force)) return;
      // When a file is attached with no words, give the model a default ask so the whole
      // text-driven pipeline (shape detection, history, narration) has something to work with.
      const userText = trimmed || 'What can you tell me about the attached file?';
      // What the human sees as the "ask" everywhere it surfaces (hero, sidebar, scrubber,
      // saved session, retry). For an ordinary turn this IS the user's words; for a synthetic
      // turn it's a short friendly label so the raw instruction prompt never shows.
      const displayText = displayAs?.trim() || userText;
      // The inputs this ask carried, stamped onto every failure below so Retry re-runs the SAME
      // turn. The composer clears them on submit, so an error that stored only the text retried
      // an attachment-only ask with nothing attached.
      const asked = {
        question: displayText,
        retry: userText,
        attachments,
        selectedBlocks,
        inkIntents,
      };
      cancelSpeak?.();
      // Snapshot the canvas BEFORE this turn streams/replaces it — that's the one to keep
      // in history if this turn wipes the page. A fresh standalone start has no prior canvas.
      const priorSpec = opts?.freshStart ? null : specRef.current;
      // Cancel any prior in-flight turn before starting a new one, and any pre-baked frame
      // (showFrame) still waiting on its narrate-then-reveal beat — a real turn must win.
      abortRef.current?.abort();
      showFrameCancelRef.current?.();
      showFrameCancelRef.current = null;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      // Abort all in-flight prefetches — they used the prior turn's history and are now stale.
      for (const c of prefetchAbortRef.current) c.abort();
      prefetchAbortRef.current = [];
      // Pull a cached result if this prompt was prefetched after the last turn. Clear the
      // cache immediately so the next turn starts fresh regardless of what we find.
      // An attached file or a pinned on-screen element changes the input the prefetch cache never
      // saw (it was keyed on text alone), so such a turn always goes to the model fresh.
      // An attachment, a pinned element, or filled blanks all change the effective input the
      // prefetch/answer caches never saw — such a turn always goes to the model fresh.
      const uniqueInput = !!(
        attachments?.length ||
        selectedBlocks?.length ||
        (filledBlanks && Object.keys(filledBlanks).length) ||
        inkIntents?.length
      );
      // The config a cache HIT must match: a prefetch generated under yesterday's provider/model
      // (or with search off) must never stand in for today's config just because the text matches.
      const cfgSig = configSignature(getConfig(), getCaps?.());
      const cached = uniqueInput
        ? null
        : (prefetchCacheRef.current.get(`${userText}::${cfgSig}`) ?? null);
      prefetchCacheRef.current.clear();
      dispatch({ type: 'start', fresh: opts?.freshStart });

      // A fresh standalone start ignores the restored/prior conversation entirely: no prior
      // history goes to the model (so a self-contained map answers ITSELF, not a stale topic),
      // and no prior snapshot feeds the merge decision (it always replaces cleanly). Declared
      // here, before willStream, since the streaming decision below reads `prior`.
      const history = opts?.freshStart ? [] : historyRef.current;
      const prior = opts?.freshStart ? null : priorRef.current;

      // Decide UP FRONT whether to reveal progressively. We only stream a turn that
      // will REPLACE the canvas (a new topic, or the very first turn): then blocks can
      // grow in as they generate, with no prior canvas to merge against. A follow-up
      // that augments/refines waits for the final merge so it never jumps mid-stream.
      // The pre-turn read is likelyFollowUp, not resolveMode: only the question exists yet
      // (no narration/title to overlap against), and Jaccard against a full prior turn
      // dilutes a four-word follow-up to near zero — so "tell me more" would stream-wipe
      // the canvas it's asking about.
      const willStream = !likelyFollowUp(prior, userText);

      // Session answer cache: dedupes a re-ask of the exact same question at the same
      // conversation depth (zero extra model calls). Skipped for turns with attachments or
      // pinned blocks since those make the effective input unique. Folds in cfgSig too — a
      // provider/model switch (or a search toggle) between two identical re-asks must generate
      // fresh, not replay whatever the OTHER config answered.
      const answerKey = `${userText}::${history.length}::${cfgSig}`;
      const answerCached = uniqueInput ? null : (answerCacheRef.current.get(answerKey) ?? null);

      let result: LiveResult;
      // Whether this turn actually revealed progressively via a 'stream' dispatch — only ever
      // true when generateLive ran below; a cache hit jumps straight to the final result, so the
      // canvas never rendered anything under the current epoch and must not claim it did.
      let didStream = false;

      if (cached ?? answerCached) {
        // Cache hit (prefetch or session dedup): speak immediately, skip the network round-trip.
        const hit = (cached ?? answerCached)!;
        if (hit.narration) {
          dispatch({ type: 'speak', narration: hit.narration });
          // Show the normal narration as the caption; SPEAK the voice-ready twin when present.
          speak?.(hit.spoken || hit.narration);
        }
        result = hit;
      } else {
        let buf = '';
        let spokenLen = 0;
        let narrationStreamed = false;
        // The same conversational-length ceiling generateLive enforces on the FINAL narration
        // (capSpoken) — recomputed here from the same pure classifier so the streaming feed
        // respects it too. Without this, a model that ignores the requested spoken budget could
        // monologue with no ceiling: capSpoken only ever saw (and trimmed) the finished text, but
        // most turns are heard sentence-by-sentence on THIS path, well before that final trim runs.
        const spokenCap = spokenBudget(classifyAsk(userText));
        let spokenChars = 0;

        // The engine is a lazy chunk: a cold cache, an offline tab, or a deploy that rotated the
        // hashed filename mid-session all make this import REJECT. Unguarded, that rejection escapes
        // `run` — which every call site invokes as `void turn.run(…)` — so the turn dies silently,
        // the composer stays stuck in its loading state, and the failure surfaces only as an
        // unhandled promise rejection in the console. Fail the way a provider error fails instead.
        let engine: Awaited<ReturnType<typeof turnEngine>>;
        try {
          engine = await turnEngine();
        } catch {
          if (ctrl.signal.aborted) return;
          dispatch({
            type: 'error',
            error: {
              kind: 'network',
              message: "Mavéa couldn't finish loading. Check your connection and try again.",
              ...asked,
            },
          });
          return;
        }
        const { generateLive } = engine;
        result = await generateLive(
          userText,
          history,
          getConfig(),
          (chunk) => {
            // Narration-first, SENTENCE by sentence: speak each spoken-line sentence the instant it
            // forms — so the voice starts on the first sentence, not after the whole line (let alone
            // the whole canvas) has streamed. The Kokoro queue plays the sentences back in order.
            // A newer turn aborts this one's controller; once aborted, drop its callbacks so a slow
            // prior turn can't speak/render over the turn that replaced it.
            if (ctrl.signal.aborted) return;
            buf += chunk;
            const prog = extractNarrationProgress(buf);
            if (!prog) return;
            const { chunk: say, consumed } = nextSpeakableChunk(prog.text, spokenLen, prog.done);
            if (!say) return;
            spokenLen = consumed;
            narrationStreamed = true;
            // The streamed narration may carry inline [[shown|said]] annotations: show the clean side
            // as the caption (forDisplay), hand the raw sentence to the voice, which resolves the said
            // side. collapseRepeatedValues guards a "$200, $200"-style restatement on the caption.
            dispatch({
              type: 'speak',
              narration: collapseRepeatedValues(forDisplay(prog.text.slice(0, consumed))),
            });
            // Once the spoken budget is spent, stop QUEUEING further sentences — the caption above
            // keeps growing with the raw stream (it self-corrects to the capped narration when the
            // turn settles), but the audio queue must never keep growing past the conversational
            // length a person would actually say out loud.
            if (spokenChars >= spokenCap) return;
            spokenChars += say.length;
            speak?.(say);
          },
          {
            caps: getCaps?.(),
            signal: ctrl.signal,
            onActivity: (activity) => {
              if (!ctrl.signal.aborted) dispatch({ type: 'activity', activity });
            },
            // Vary the visuals turn-to-turn: down-weight the last turns' block types and
            // seed the component draw with the turn counter (different cool set each time).
            recentTypes: [...usedTypesRef.current],
            rotation: turnRef.current,
            // Carry the user's attachments into the turn — adapters send them as native
            // image/document parts where the provider can read them.
            attachments,
            // Pinned on-screen elements: their real rendered props are fed to the model as
            // context so the follow-up answers about exactly what the user selected.
            selectedBlocks,
            // The Blank Space: values the user filled into the prior answer's holes, fed back so
            // the model completes the SAME answer instead of guessing or restarting.
            filledBlanks,
            // Ink gestures: the marks the user drew on the answer, translated to instructions and
            // grounded on the marked parts' real props (which ride along via selectedBlocks).
            inkIntents,
            // The prior answer's headline — pins a topic-less continuation ("more in depth",
            // "continue") to the current thread so a weak model can't drift to an older topic.
            priorTopic: prior?.title || undefined,
            // The living world already on the canvas, so a follow-up ("over time", "what if…")
            // evolves THAT world instead of exploding a second one beside it.
            priorWorld: currentWorld(specRef.current),
            // Topic Courses: this turn is one lesson in a course — the directive + topic pin
            // ride straight through to generateLive (see GenerateLiveOpts.lesson).
            lesson: opts?.lesson,
            // Progressive reveal: grow the canvas as each block closes, so it fills in
            // WITH the voice rather than popping in after. Replace turns only.
            onPartial: willStream
              ? (partial) => {
                  if (ctrl.signal.aborted) return;
                  didStream = true;
                  // Fetch the block-family chunks WHILE the answer streams, so the reveal
                  // never waits on the network (see canvas/blocks/loader.ts).
                  preloadBlockFamilies(partial.spec.blocks);
                  dispatch({ type: 'stream', spec: partial.spec });
                }
              : undefined,
            // Name what's being read / built while the turn works (the turn-state chrome).
            onSources: (s) => {
              if (!ctrl.signal.aborted) dispatch({ type: 'sources', sources: s });
            },
            onPending: willStream
              ? (t) => {
                  if (!ctrl.signal.aborted) dispatch({ type: 'pending', pending: t });
                }
              : undefined,
            // Reasoning models stream "thinking" tokens before the answer — reflect that as a
            // live cue so a long pre-answer phase never reads as a frozen "Composing…".
            onThinking: (on) => {
              if (!ctrl.signal.aborted) dispatch({ type: 'thinking', on });
            },
          },
        );

        // A newer turn may have aborted this one while generateLive was in flight. If so, stop
        // here: none of the tail (speak, error, show, history, prefetch) must run, or a slow
        // prior turn would overwrite the canvas the newer turn just put up.
        if (ctrl.signal.aborted) return;

        // If narration never streamed as text (constrained tool-JSON resolved whole,
        // or the model omitted it), speak it now from the validated result.
        if (!narrationStreamed && result.narration) {
          dispatch({ type: 'speak', narration: result.narration });
          // Caption stays the normal narration; the voice gets the spoken twin when supplied.
          speak?.(result.spoken || result.narration);
        }

        // Populate the session answer cache for successful turns — a later identical re-ask
        // (same question at the same conversation depth) returns instantly, zero model calls.
        // Require real content: never cache an empty/salvaged spec, or a re-ask would replay a
        // blank answer instead of generating a real one. Cap the cache (FIFO) so a marathon
        // session can't grow it without limit — each entry is a full result (tens–hundreds of KB).
        if (!result.error && result.spec.blocks.length > 0) {
          answerCacheRef.current.set(answerKey, result);
          if (answerCacheRef.current.size > ANSWER_CACHE_MAX) {
            const oldest = answerCacheRef.current.keys().next().value;
            if (oldest !== undefined) answerCacheRef.current.delete(oldest);
          }
        }
      }

      // A FAILED turn (provider error) is not an answer: surface the error state and stop.
      // Nothing is spoken, nothing enters chat history / the timeline / the library, and no
      // prefetch runs — the canvas stays exactly as it was, with Retry carrying the question.
      if (result.error) {
        // `question` is the label the card shows; `retry` is the real prompt the button re-runs
        // (for an ordinary turn they're identical; for a synthetic turn the prompt must run, not show).
        dispatch({
          type: 'error',
          error: { ...result.error, ...asked },
        });
        return;
      }

      // Stored chat history uses the DISPLAY text, not the raw prompt: a synthetic turn's
      // instruction ("…generate a concise morning brief… do not explain what you are doing")
      // must never enter history — it would both leak to any surface that renders history (the
      // dashboard extraction preview) and pollute the model's context on follow-ups with a stale
      // meta-instruction. The model still got the full prompt for THIS turn via generateLive's
      // first arg; history is the record for later turns. For an ordinary ask displayText IS the
      // user's words, so this is unchanged. Pinned elements are noted so the bubble reads
      // naturally (their serialized props go to the model this turn only, via selected-block ctx).
      const userContent = selectedBlocks?.length
        ? `${displayText} (about: ${selectedBlocks.map(blockLabel).join(', ')})`
        : displayText;
      const nextHistory: ChatMessage[] = [
        ...history,
        { role: 'user', content: userContent },
        { role: 'assistant', content: result.narration || result.spec.title },
      ];
      // Decide what this turn does to the canvas (a deterministic topic-shift check
      // overrides the model's hint), then merge accordingly — augment/refine never lose
      // the user's place, and an overcrowded augment falls back to a clean replace.
      // Wrapped: a malformed/pathological spec that throws here (bad merge, bad tour remap)
      // must still settle the turn — otherwise `busy` stays true forever with no way for the
      // user to recover (a permanently spinning turn), since nothing else in this function
      // catches it. `mode`/`renderedSpec`/`frame` are declared outside the try (assigned only
      // on success) because the tail below — memory writes, the Library save, chip prefetch —
      // still reads them; the catch branch returns before any of that runs.
      let mode: Mode;
      let renderedSpec: ConversationSpec;
      let frame: TurnFrame;
      try {
        const priorBlocks: Block[] = opts?.freshStart ? [] : (specRef.current?.blocks ?? []);
        // A streamed turn already revealed a fresh (replace-style) canvas as it generated,
        // so it must settle as REPLACE — otherwise a late flip to augment would re-add the
        // prior blocks and jump. Non-streamed turns use the full deterministic decision
        // (settleTurn is the shared merge/tour/frame step — the demo baker runs it too).
        const settled = settleTurn(prior, priorBlocks, displayText, result, {
          forceReplace: willStream,
        });
        mode = settled.mode;
        renderedSpec = settled.frame.spec;
        const nextSnap = settled.snap;
        // The "Watch Me Think" map this answer grew from, so the user can re-open it read-only.
        frame = fromMind ? { ...settled.frame, mind: fromMind } : settled.frame;

        // Start the MERGED canvas's family chunks now, before the reveal. The streaming preload
        // above only ever saw a replace-turn's own blocks — an augment/refine keeps prior blocks
        // and the repair pass can add new types, either of which would otherwise send the reveal
        // walk's readiness barrier to the network on a cold cache.
        preloadBlockFamilies(renderedSpec.blocks);

        dispatch({
          type: 'show',
          spec: renderedSpec,
          narration: result.narration,
          history: nextHistory,
          mode,
          spot: settled.spot,
          prior: nextSnap,
          tour: frame.tour,
          // The prior canvas (captured before this turn) goes to history if we replace.
          priorSpec,
          // Whether this turn already revealed progressively; if so, the final settle must
          // NOT remount the canvas (it already rendered under the current epoch). A cache hit
          // never streamed a partial, however "replace"-shaped the pre-turn heuristic guessed —
          // it must still remount, or a fresh answer that happens to land on the same block
          // types/positions as the old canvas would silently update in place with no reveal.
          streamed: didStream,
          frame,
          understood: result.understood ?? [],
          // A fresh standalone start begins its own timeline (this frame is turn 1), so a
          // Watch-Me-Think answer fired on a restored session becomes its own saved conversation.
          freshTimeline: opts?.freshStart,
        });

        // Add this turn's block types to the conversation's used-set, so the NEXT turn prefers
        // ones not yet shown — this is what keeps successive canvases visually different.
        for (const t of nextSnap.blockTypes) usedTypesRef.current.add(t);
      } catch {
        // Never leave the turn spinning: a spec that can't be merged/toured is treated like any
        // other failed turn — an honest, recoverable error, retry carrying the real question.
        dispatch({
          type: 'error',
          error: {
            kind: 'http',
            message: "Something went wrong putting that answer together — let's try again.",
            ...asked,
          },
        });
        return;
      }

      // Update the concept graph: the model's own `memory` nodes PLUS a heuristic read of the
      // user's own words (a reliable fallback for local models that don't emit the field).
      // When the model emits nodes, trust those and skip extraction (they're richer).
      // Gate EXPLICITLY on the toggle so the privacy contract can't be broken by a refactor.
      // Local-only, best-effort — a write failure must never affect the conversation. Also gate
      // on relevance: a creative/ephemeral ask ("write a funny poem") shouldn't bank facts — the
      // INJECT path already skips these (generateLive), so this closes the save-side asymmetry.
      if (getCaps?.().memoryEnabled && memoryRelevant(userText)) {
        try {
          // Provenance for everything written this turn: which turn it came from, the user's own
          // words as the grounding quote, and whether the turn was web-grounded (affects trust).
          const turnId = String(frame.at);
          const quote = displayText.slice(0, 200);
          const webGrounded = (renderedSpec.sources?.length ?? 0) > 0;
          const modelNodes = result.memory ?? [];
          if (modelNodes.length) {
            // Classify each model-authored fact: a body that echoes the user's words is trusted as
            // user-stated; a free inference stays model-inferred (injected later only as a guess).
            // This is the guard that stops a one-turn hallucination from hardening into a "fact".
            mergeNodes(
              modelNodes.map((n) => ({
                ...n,
                source: classifySource(n.body, displayText, { webGrounded }),
                turnId,
                quote,
              })),
            );
          } else {
            // Fallback: slot extracted first-person facts into the "profile" concept. Mine the
            // human-facing text, not a synthetic instruction prompt (which would bank nonsense).
            // These are the user's literal words → user-stated.
            const extracted = extractUserFacts(displayText);
            if (extracted.length) {
              mergeNodes([
                {
                  concept: 'profile',
                  body: extracted.join('. '),
                  source: 'user-stated',
                  turnId,
                  quote,
                },
              ]);
            }
          }
          // A declared correction becomes a durable PROCEDURAL lesson — verify this kind of figure
          // next time. The `corrects` field is model-authored, so trust its corrected VALUE as fact
          // only when the user actually supplied it this turn; a spontaneous self-correction stays
          // unconfirmed (the verify hint fires either way).
          if (result.corrects) {
            const cs = classifyCorrectionSource(result.corrects.now, displayText);
            mergeNodes([correctionUpdate(result.corrects, { turnId, source: cs })]);
          }
        } catch {
          /* memory is best-effort — a write failure must not affect the conversation */
        }
      }

      // Save a finished canvas to the local Library (opt-in) so it can be resumed later. Only fresh
      // (replace) canvases are kept — an augment/refine refines the current one in place rather than
      // creating a new library entry. saveCanvas never throws and stores nothing fabricated.
      if (mode === 'replace' && getLibraryEnabled?.()) {
        saveCanvas(renderedSpec, displayText);
      }

      // Prefetch chip answers in the background so tapping one feels instant. Each one is a whole
      // speculative turn on the user's key, so it's gated twice: to the 'thorough' quality dial (the
      // user who explicitly opted into the richest experience), and to the top CHIP_PREFETCH chips —
      // the ones actually likely to be tapped. On 'fast'/'balanced' a chip generates on tap.
      const prefetchCfg = getConfig();
      const prefetchCaps = getCaps?.();
      if (prefetchCaps?.quality === 'thorough') {
        const chips = renderedSpec.suggests ?? [];
        const recentForPrefetch = [...usedTypesRef.current];
        // Keyed under the config THIS prefetch actually ran with, matching the lookup above —
        // if the user switches provider/model (or toggles search) before tapping the chip, the
        // stale-config entry simply misses and the tap generates fresh instead of replaying it.
        const prefetchSig = configSignature(prefetchCfg, prefetchCaps);
        chips.slice(0, CHIP_PREFETCH).forEach((chip, i) => {
          const chipCtrl = new AbortController();
          prefetchAbortRef.current.push(chipCtrl);
          turnEngine()
            .then(({ generateLive }) =>
              generateLive(chip.label, nextHistory, prefetchCfg, undefined, {
                caps: prefetchCaps,
                signal: chipCtrl.signal,
                repair: false,
                // Each prefetched chip varies its own visuals too (distinct rotation seed).
                recentTypes: recentForPrefetch,
                rotation: turnRef.current + 1 + i,
              }),
            )
            .then((r) => {
              // Never cache a FAILED prefetch — a tap must retry for real, not replay an error.
              if (!chipCtrl.signal.aborted && !r.error)
                prefetchCacheRef.current.set(`${chip.label}::${prefetchSig}`, r);
            })
            .catch(() => {
              /* prefetch is best-effort — a miss just means a normal generation on tap */
            });
        });
      }
    },
    [canRun, getConfig, getCaps, speak, cancelSpeak, getLibraryEnabled],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    showFrameCancelRef.current?.();
    showFrameCancelRef.current = null;
    for (const c of prefetchAbortRef.current) c.abort();
    prefetchAbortRef.current = [];
    prefetchCacheRef.current.clear();
    answerCacheRef.current.clear();
    usedTypesRef.current.clear();
    dispatch({ type: 'reset' });
  }, []);
  const setSpot = useCallback((spot: string | null) => dispatch({ type: 'spot', spot }), []);
  const jumpTo = useCallback((index: number) => dispatch({ type: 'jump', index }), []);
  // Show a composed-thread spec on the canvas (see composeThread.ts), or null to return to live.
  const previewSpec = useCallback((spec: ConversationSpec | null) => {
    if (spec) preloadBlockFamilies(spec.blocks); // composed blocks may pull families not yet loaded
    dispatch({ type: 'preview', spec });
  }, []);
  // THE one model call a living answer costs, fired only when a reader opens a world card. It is
  // deliberately NOT abortable: the tokens are committed the moment the request leaves, so letting
  // a build the reader walked away from finish is what makes their next open free (explodeWorld
  // memoises it in-session and caches it across sessions). A card that already carries a world
  // never calls anything.
  //
  // Identity-STABLE (the gate and the config are read through a ref) because the surface drives it
  // from an effect: a callback that changed every render would re-fire the build on every render.
  // The world card a reader taps may belong to an answer they have scrolled BACK to, not to the
  // live head — so a block is looked for on the viewed canvas and in every frame this session
  // holds, not only on the newest one. (The reverse direction is already safe: dispatching a built
  // world writes it onto the block and every frame that carries it.)
  const findBlock = useCallback((blockId: string): Block | undefined => {
    const seen = viewSpecRef.current?.blocks.find((b) => b.id === blockId);
    if (seen) return seen;
    const live = specRef.current?.blocks.find((b) => b.id === blockId);
    if (live) return live;
    for (const frame of framesRef.current) {
      const hit = frame.spec.blocks.find((b) => b.id === blockId);
      if (hit) return hit;
    }
    return undefined;
  }, []);

  const generateWorld = useCallback(
    async (blockId: string): Promise<WorldSpec | null> => {
      const { canRun: gate, getConfig: readConfig } = argsRef.current;
      if (gate && !gate()) return null;
      const block = findBlock(blockId);
      if (block?.type !== 'world') return null;
      if (block.props.world) return block.props.world;
      const question = block.props.title;
      try {
        // Only the grounding the offering turn already had — a world never opens a fresh search.
        const world = await explodeWorld(question, await turnCorpus(question), readConfig());
        if (world) dispatch({ type: 'world', blockId, question, world });
        return world;
      } catch {
        // Honest dead end: the surface shows the failure, never a stand-in world.
        return null;
      }
    },
    [findBlock],
  );

  // Breaking one cause down — the second, smaller call a living answer can cost, and only ever on
  // an explicit press. The result deliberately does NOT go through dispatch: an expansion is a
  // reader looking closer, not new canvas content, and `withWorld` refuses to overwrite a block
  // that already holds a world (rightly — that is the answer's own record). The surface keeps it,
  // and a re-open pays nothing because expandWorldNode caches the children.
  const expandWorld = useCallback(
    async (blockId: string, nodeId: string): Promise<WorldSpec | null> => {
      const { canRun: gate, getConfig: readConfig } = argsRef.current;
      if (gate && !gate()) return null;
      const block = findBlock(blockId);
      if (block?.type !== 'world') return null;
      const world = block.props.world;
      if (!world) return null;
      try {
        return await expandWorldNode(world, nodeId, await turnCorpus(world.title), readConfig());
      } catch {
        return null;
      }
    },
    [findBlock],
  );

  // The Blank Space: a fill/clear updates the accumulator; the active stop follows.

  const fill = useCallback((value: FillValue) => dispatch({ type: 'fill', value }), []);
  const unfill = useCallback((key: string) => dispatch({ type: 'unfill', key }), []);
  const setActiveBlank = useCallback(
    (key: string | null) => dispatch({ type: 'setActiveBlank', key }),
    [],
  );
  // Complete an awaiting answer: refine the SAME canvas with the values the user filled in. The
  // prior answer's blocks ride along as context (selectedBlocks) and the directive tells the model
  // to finish, not restart; the 'start' that run() dispatches clears the now-consumed fills.
  const complete = useCallback((): boolean => {
    const spec = specRef.current;
    const filled = filledRef.current;
    if (!spec || !Object.keys(filled).length || busyRef.current) return false;
    void run(
      'Complete the answer you started above using the values I just filled into the blanks — keep everything you already showed and fill in only the parts that depended on those values. Do not start over.',
      undefined,
      spec.blocks,
      filled,
    );
    return true;
  }, [run]);
  // Deliberately NO auto-complete on the last fill: the refine spends a model call and replaces
  // canvas content, so it runs only on the explicit "Complete the answer" click. Filling the final
  // hole used to submit by itself, which yanked the answer away mid-review — the values are the
  // user's, and so is the moment to commit them (the bar flips to its ready state instead).
  const restore = useCallback(
    (spec: ConversationSpec, question: string) => {
      cancelSpeak?.();
      // A restored canvas mounts cold (no streaming preload ran) — start its family chunks now.
      preloadBlockFamilies(spec.blocks);
      dispatch({ type: 'restore', spec, question, at: Date.now() });
    },
    [cancelSpeak],
  );

  // Inject a pre-baked turn — the first-run tour's engine. It mirrors the tail of run() but with a
  // committed TurnFrame instead of a generateLive result: narrate first, then reveal WITH the
  // narration's audio, dispatching the SAME `show` the model path dispatches. The reveal-tour
  // runner in LiveApp then walks the spotlight identically, skipping stop 0 so the opener never
  // double-speaks. No model, no key, no network.
  const showFrame = useCallback(
    (
      frame: TurnFrame,
      question: string,
      opts?: { interrupt?: boolean; revealNow?: boolean; silent?: boolean },
    ) => {
      const silent = opts?.silent === true;
      // Start the frame's block-family chunks NOW, so by the time the narrate-then-reveal beat
      // mounts the canvas the families are in — a tour chapter (or a library re-open) must never
      // hold an empty grid mid-narration on a slow machine.
      preloadBlockFamilies(frame.spec.blocks);
      // The walkthrough queues its frames BEHIND whatever is being said (its coach line was
      // getting chopped mid-sentence by the flip); real interactive callers keep the interrupt.
      if (opts?.interrupt !== false) cancelSpeak?.();
      // Read BEFORE queueing this frame's own line: "true" means a coach line is mid-play and
      // this narration will wait its turn — the reveal below then keeps its fixed beat instead
      // of waiting for audio that may be most of a sentence away.
      const speakingAtCall = isSpeaking();
      dispatch({ type: 'start', fresh: false });
      if (!silent) dispatch({ type: 'speak', narration: frame.narration });
      const spokenHandle = silent ? undefined : speak?.(frame.spoken ?? frame.narration);
      const nextHistory: ChatMessage[] = [
        ...historyRef.current,
        { role: 'user', content: question },
        { role: 'assistant', content: frame.narration || frame.spec.title },
      ];
      const nextSnap: TurnSnapshot = {
        question,
        narration: frame.narration,
        title: frame.spec.title,
        blockTypes: frame.spec.blocks.map((b) => b.type),
      };
      const priorSpec = specRef.current;
      const spot = frame.spec.blocks.find((b) => b.id)?.id ?? null;
      // A newer showFrame (or a real turn — see run()) supersedes whatever the previous one was
      // waiting to reveal; only ever one of these beats should be in flight at a time.
      showFrameCancelRef.current?.();
      let superseded = false;
      showFrameCancelRef.current = () => {
        superseded = true;
      };
      const reveal = (): void => {
        if (superseded) return;
        showFrameCancelRef.current = null;
        dispatch({
          type: 'show',
          spec: frame.spec,
          narration: frame.narration,
          understood: [],
          history: nextHistory,
          mode: frame.mode,
          prior: nextSnap,
          // A silent seed lands the canvas without performing the walk; the recorded `frame`
          // below keeps the authentic tour so replays and video cuts stay complete.
          tour: silent ? [] : frame.tour,
          spot,
          frame,
          priorSpec,
          streamed: false,
          freshTimeline: false,
        });
      };
      if (opts?.revealNow || silent) {
        // Muted or silent lands the whole answer at once — a paced beat has no voice to sync to.
        reveal();
      } else if (speakingAtCall) {
        // Mid-coach-line (walkthrough): the proven short beat, so the face is already talking
        // when the canvas appears — waiting for THIS frame's audio would hold the reveal
        // through the rest of the coach's sentence.
        window.setTimeout(reveal, 480);
      } else {
        // Reveal the canvas the moment its narration becomes audible — the fixed 480ms guess
        // this replaces revealed seconds before the audio on a cold Kokoro. Bounded: with no
        // voice at all (key-free tour, no Docker) `started` resolves false in milliseconds, so
        // the captioned reveal is FASTER than the old beat, and a wedged synthesis can never
        // hold the canvas past the cap.
        void bounded(
          spokenHandle ? spokenHandle.started : Promise.resolve(false),
          SHOWFRAME_REVEAL_CAP_MS,
        ).then(reveal);
      }
    },
    [cancelSpeak, speak],
  );

  // What the canvas actually renders: a composed-thread view when active, else a jumped-to past
  // frame, else the live head.
  const viewSpec = state.viewOverride
    ? state.viewOverride
    : state.viewIndex == null
      ? state.spec
      : (state.frames[state.viewIndex]?.spec ?? state.spec);
  // Published for the world lookups above, which run from callbacks rather than from this render.
  viewSpecRef.current = viewSpec;

  // Abort any in-flight turn, pending showFrame reveal, and all prefetches on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      showFrameCancelRef.current?.();
      for (const c of prefetchAbortRef.current) c.abort();
    },
    [],
  );

  return {
    ...state,
    run,
    reset,
    setSpot,
    restore,
    jumpTo,
    previewSpec,
    fill,
    unfill,
    generateWorld,
    expandWorld,
    setActiveBlank,
    complete,
    showFrame,
    viewSpec,
  };
}
