// generateLive.ts — the provider-agnostic Live turn. Picks the adapter from the
// user's ModelConfig, runs ONE streamed generation, funnels the raw output
// through the single validation core (validateLiveResponse), and assembles a
// renderable ConversationSpec. NEVER throws: any network/parse/validation failure
// resolves to an honest fallback so the canvas always has something to show.
//
// `onDelta` streams raw text as it arrives so the caller (the Live surface) can
// speak the narration-first sentence within a few hundred ms while blocks finish.
import type {
  ConversationSpec,
  Block,
  InsightProps,
  WebSource,
  SuggestSpec,
  FillValue,
} from '../data/conversation';
import {
  validateLiveResponse,
  liveSystemPrompt,
  blockTypesForTier,
  FRONTIER_BLOCK_TYPES,
  PHOTO_BLOCK_TYPE,
  ANNOTATABLE_TYPES,
  type LiveResponse,
  type TourMark,
  type CorrectsNote,
} from '../engine/liveSchema';
import type { ModelConfig } from '../types/mavea';
import { catalogFacts } from '../canvas/blocks/catalog/facts';
import { ensureDetails } from '../canvas/blocks/catalog/details';
import { getAdapter } from './providers';
import { isReasoningModel } from './providers/openaiCompatible';
import { currentDateTimeLine } from './ground/now';
import { semanticFit } from './semantic';
import { speedTierFor, recordTurnSpeed, type SpeedTier } from './speed';
import {
  selectComponents,
  catalogSpan,
  classifyAsk,
  isTeachingAsk,
  detectRequested,
  formRequestDirective,
  detectSpecialists,
  specialistDirective,
  multiPartDirective,
  effectiveExplainLevel,
  simpleLevelMenu,
  deepLevelMenu,
  analyzeIntent,
  GENERATIVE_BLOCK_TYPES,
  shouldSynthesize,
  synthesisMenu,
  annotateMenu,
  svgBlockMenu,
  COMPOSITE_BLOCK_TYPE,
} from './select';
import { chooseArc } from './story/arcs';
import { rhythmDirective } from './story/rhythm';
import { getMemoryNodes } from './memory/store';
import { buildMemoryContext } from './memory/inject';
import { rankForInjection, proceduralHints, personalFitLine } from './memory/retrieve';
import { memoryRelevant } from './memory/relevance';
import { adaptiveCols } from './layout';
import { actionsMenu } from './actions/catalog';
import { getConnectedMcps } from './actions/connected';
import { targetBlockCount, countDirective, DEEP_BLOCKS } from './screen';
import type { ChatMessage, LiveRequest, ThinkingLevel } from './providers/types';
import { attachmentKind, type Attachment } from './attachments';
import type { InkIntent } from './annotate/inkIntent';
import { extractNarration, extractStringField, ArrayStreamScanner } from './streamParse';
import {
  getSearchProvider,
  needsFreshInfo,
  needsLiveData,
  searchQuery,
  requestedResultCount,
} from './search';
import { buildSearchContext, toSources } from './search/inject';
import { resultLimit } from './search/limit';
import { blockLabel } from '../canvas/blockLabel';
import {
  thinkingLevelFor,
  temperatureFor,
  capSpoken,
  NARRATION_FIRST_LINE,
  spokenLineDirective,
  type QualityPref,
} from './effort';
import { buildSendHistory, KEEP_RECENT_TURNS } from './history';
import { safePdfUrl, pdfProxyUrl } from './doc/safeUrl';
import {
  autoFix,
  checkConsistency,
  hasHardIssue,
  HARD_ISSUE_CODES,
  repairInstruction,
  recoverInstruction,
} from './verify';

export type { ChatMessage };

/** How the user wants answers grounded in the live web (their choice, with cost in mind):
 *  - 'off'      — never search. No extra cost beyond the base model call.
 *  - 'realtime' — grounds through the provider's OWN native search (Gemini google_search,
 *    OpenRouter's web tool: cited + current; free up to the provider's monthly quota, then
 *    per-query). Native-only — a provider without built-in search simply can't ground, even
 *    when this is selected; there is no keyless/keyed app-side fallback.
 *  Search only fires when the ask actually needs fresh info, so ordinary turns cost nothing. */
export type SearchMode = 'off' | 'realtime';

/** The user's reasoning/cost preference, mirrored from the config (see effort.ts). */
export type { QualityPref };

/** Live capabilities the user has turned on for this turn. */
export interface LiveCaps {
  /** Legacy on/off web-search flag — still honored; `searchMode` is the richer control and
   *  wins when set (off→'off', on→'realtime'). */
  webSearch?: boolean;
  /** The user's chosen search mode: off, or real-time grounding through the provider's OWN
   *  native search (no keyless/keyed app-side fallback — see generateLive's hasLivePath). */
  searchMode?: SearchMode;
  /** Reasoning effort the user dialed in (Fast/Balanced/Thorough) → adaptive thinkingLevel. */
  quality?: QualityPref;
  /** Personalize with remembered facts + let the model surface new ones (cross-session
   *  memory). Off unless the user enabled it; all memory stays local to the browser. */
  memoryEnabled?: boolean;
  /** Let the model compose NEW visuals on the fly (the generative diagram/composite family).
   *  Off unless the user enabled it; when off these blocks are excluded from the per-turn
   *  menu + schema, so a paid model is never offered them and spends no tokens on them. */
  generativeBlocks?: boolean;
  /** Explanation level for this turn: 'simple' makes BOTH the words and the visuals plainer;
   *  'deep' gives the full-rigor treatment; defaults to 'standard'. A per-turn voice trigger
   *  ("explain like I'm 5" / "go deeper") can force a level for one turn regardless of the
   *  persisted setting (see effectiveExplainLevel). */
  explainLevel?: 'standard' | 'simple' | 'deep';
}

/** A coarse, user-visible activity so the surface can show what's happening and make
 *  any billable action obvious: 'searching' the web, then null when idle. */
export type LiveActivity = 'searching' | null;

export interface GenerateLiveOpts {
  repair?: boolean;
  caps?: LiveCaps;
  /** Aborts in-flight search on a new turn / unmount. */
  signal?: AbortSignal;
  /** Reports coarse activity for the transparency / consent UI. */
  onActivity?: (activity: LiveActivity) => void;
  /** Progressive reveal: called with a renderable spec each time another block finishes
   *  streaming, so the canvas fills in WITH the voice instead of popping in after. Streaming
   *  only — the post-stream tail (validate → recovery → repair → re-tile) emits nothing until
   *  the final result returns. */
  onPartial?: (partial: { spec: ConversationSpec; narration: string }) => void;
  /** Real search sources, the moment they're known (app-side search resolves before the
   *  model call; native grounding reports after it) — so the surface can name what is
   *  being read while the answer still generates. */
  onSources?: (sources: WebSource[]) => void;
  /** The primary DATA SHAPE of the block currently streaming — its `"type"` key arrives long
   *  before the block closes, and we resolve it to a shape HERE (the engine already holds the
   *  catalog) so the surface can label the in-progress skeleton without importing the catalog
   *  itself. Rides the same delta path as onPartial (streamed turns only); null between blocks. */
  onPending?: (shape: string | null) => void;
  /** The model is emitting reasoning/"thinking" tokens before any answer content (some
   *  OpenRouter/reasoning models do this) — true while it thinks, false the instant real content
   *  starts. Lets the surface show a live "Thinking…" cue instead of a frozen "Composing…". */
  onThinking?: (active: boolean) => void;
  /** Block types rendered in the last turn or two. Down-weighted in component selection
   *  so the next canvas reaches for DIFFERENT visuals instead of repeating the last one. */
  recentTypes?: readonly string[];
  /** A per-turn counter seeding the (otherwise random) component draw, so the same vague
   *  ask surfaces different cool components each turn while staying reproducible per seed. */
  rotation?: number;
  /** Files the user attached this turn (images / PDFs). Passed straight to the adapter,
   *  which sends them as native image/document parts on vision providers and notes them in
   *  text elsewhere. The model reads the file; we never parse or fabricate its contents. */
  attachments?: Attachment[];
  /** Blocks the user pinned from the current answer to ask a follow-up about. Their real,
   *  on-screen props are serialized into the model's user message (like search grounding) so the
   *  reply is about exactly what's on screen. Real-data-only: this is the rendered data, never invented. */
  selectedBlocks?: Block[];
  /** "The Blank Space": values the user filled into the prior answer's holes (keyed by Blank.key).
   *  Serialized into the user message so the model COMPLETES the same answer with the user's real
   *  inputs — never guessing them. Real-data-only: these are the user's own words/numbers. */
  filledBlanks?: Record<string, FillValue>;
  /** Highlights the user drew on the current answer (the Mark tool is a pure highlighter —
   *  see InkGesture). Translated to plain-language instructions prepended to the user
   *  message — advisory, real-data-only (textAt is literal on-screen text, never invented; the
   *  model may ignore them and they never hard-fail a turn). The marked parts' blocks ride along
   *  via selectedBlocks so their real props are in context. */
  inkIntents?: InkIntent[];
  /** The headline/topic of the answer the user is following up on (the prior TurnSnapshot.title).
   *  Used to pin a topic-less continuation ("more in depth", "continue") to the current thread so a
   *  weak model can't drift to an older topic. Advisory: the in-function history scan also derives
   *  one, so the fix still works if the caller doesn't pass it. */
  priorTopic?: string;
  /** Topic Courses: this turn is one lesson in a generated course (see course/lessonSpine.ts's
   *  buildLessonSpine) — `directive` is appended AFTER depthLine (additive, layers on top of the
   *  ordinary teaching-arc shaping, never replaces it) and `topic` is pinned via the existing
   *  topicLockLine mechanism so the lesson can't drift off its own syllabus entry. Undefined for
   *  every ordinary turn; only the course integration sets this. */
  lesson?: { directive: string; topic: string };
}

/** Why a turn failed, in plain language — so the surface can render an HONEST error state
 *  (clearly not an answer) with the right recovery action, instead of a fake finding card. */
export interface LiveError {
  /** auth → fix the key in settings; quota → provider account is out; network → unreachable;
   *  http → some other provider error (status carried for the curious). */
  kind: 'auth' | 'quota' | 'network' | 'http';
  /** HTTP status from the provider, when one came back (e.g. 401, 429). */
  status?: number;
  /** A plain-language, user-facing line ("Your API key was rejected — check it in settings"). */
  message: string;
}

/** Display names for the connection-failure message ("Couldn't reach Anthropic"). Local on
 *  purpose — providerInfo lives in the adapter registry, which callers mock in tests. */
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google',
  openrouter: 'OpenRouter',
  grok: 'Grok',
};

/** The words a provider uses when the ACCOUNT is spent, as opposed to merely being asked too often.
 *  Both arrive as a 429 (and Anthropic bills a dead balance as a 400), so only the wording tells them
 *  apart — and "wait a moment and try again" is exactly the wrong advice for a user who has to go top
 *  up. The adapters carry the provider's error body into the thrown message so this can match on it. */
const SPENT_ACCOUNT =
  /resource.?exhausted|quota.?exceed|exceeded your (?:current )?quota|insufficient[_ ](?:quota|funds)|monthly.?limit|credit balance|billing/i;

/** Map a provider failure to a plain-language LiveError. Adapters throw `Error('<provider> <status>
 *  — <reason from the body>')` on HTTP failure, so the status is parsed from the message; no status
 *  at all means the request never got a response (network down, timeout, CORS). */
export function describeLiveError(err: unknown, provider: string): LiveError {
  const msg = err instanceof Error ? err.message : '';
  const status = Number(/\b(\d{3})\b/.exec(msg)?.[1]) || undefined;
  const label = PROVIDER_LABELS[provider] ?? provider;
  if (status === 401)
    return { kind: 'auth', status, message: 'Your API key was rejected — check it in settings.' };
  if (status === 403)
    return {
      kind: 'auth',
      status,
      message:
        'Request blocked — your API key may lack permission for this model, or the request was rejected by the provider safety filters.',
    };
  // 429 is usually a transient per-minute rate limit on the free tier, not a plan
  // exhaustion — "check your plan" is wrong and alarming. Distinguish by the provider's own
  // wording (RESOURCE_EXHAUSTED, "exceeded your current quota") vs a plain 429 (rate limited).
  if (status === 429) {
    const isExhausted = SPENT_ACCOUNT.test(msg);
    return {
      kind: 'quota',
      status,
      message: isExhausted
        ? `Your ${label} daily quota is full — wait until tomorrow or upgrade your plan.`
        : `${label} is rate-limiting you (too many requests per minute) — wait a moment and try again.`,
    };
  }
  // Out of money, not out of patience — and at whatever status the provider bills it (Anthropic
  // charges a dead balance as a 400). Checked BEFORE the generic 400/404 mapping, whose "check the
  // model name" advice would send the user hunting for a typo that isn't there.
  if (SPENT_ACCOUNT.test(msg))
    return {
      kind: 'quota',
      status,
      message: `Your ${label} account is out of quota or credit — check your plan, or wait and retry.`,
    };
  if (status === 404)
    return { kind: 'http', status, message: 'Model not found — check the model name in settings.' };
  if (status === 400)
    return {
      kind: 'http',
      status,
      message: 'The model request was rejected — check the model name in settings.',
    };
  if (status)
    return { kind: 'http', status, message: `${label} returned error ${status} — try again.` };
  return {
    kind: 'network',
    message: `Couldn't reach ${label} — check your connection and try again.`,
  };
}

/** What generateLive returns: a renderable spec + the one spoken sentence. */
export interface LiveResult {
  spec: ConversationSpec;
  narration: string;
  /** The connected model's capability tier — the surface uses it for the lifecycle decision. */
  tier: 'frontier' | 'mid' | 'small';
  /** Optional model hint for replace/augment/refine (the surface verifies it deterministically). */
  continuity?: 'replace' | 'augment' | 'refine';
  /** Optional model-authored spotlight tour (0-based block indices), applied on replace turns.
   *  `saySpoken` is the voice-ready twin of `say` (from inline [[shown|said]] annotations);
   *  `mark` is the stop's drawn gesture (kind + the exact on-block text it aims at). */
  tour?: {
    index: number;
    say?: string;
    saySpoken?: string;
    mark?: TourMark;
    marks?: TourMark[];
  }[];
  /** Concept nodes the model wrote to the user's wiki this turn (only when memory is enabled).
   *  Each node replaces the prior body for that concept slug. The surface persists these;
   *  generateLive never writes storage. */
  memory?: { concept: string; body: string }[];
  /** The model's constraint chips — its own reading of the ask, correctable by the user
   *  ("edit its mind"). Shown under the answer; tapping one fires a correction turn. */
  understood?: string[];
  /** Self-declared correction of an earlier answer this session — the surface marks the
   *  earlier moment corrected instead of letting history silently disagree with itself. */
  corrects?: CorrectsNote;
  /** The voice-ready twin of `narration`, derived from its inline [[shown|said]] annotations
   *  (numbers/symbols/terms written for the ear). The surface SPEAKS this when present and shows
   *  the clean `narration`; absent when the line reads aloud cleanly as written. (Tour lines and
   *  block notes carry their own twins on the tour stops / blocks.) */
  spoken?: string;
  /** Set when the provider call FAILED — the turn produced no answer. The surface must render
   *  this as an explicit error state (with retry / settings), never as canvas content, and
   *  must not enter it into chat history or the library. `spec` is a minimal honest stub. */
  error?: LiveError;
}

// A large explicit count ("give me 15 steps", "list 20 reasons", "top 12 tips") is usually
// satisfied as many rows inside ONE dense block (a timeline/list/table), not as extra top-level
// blocks — so `blocks` (the canvas's block COUNT) never sees it, and the coarse per-block
// average below would under-budget that one block and truncate it mid-item. Matched broadly
// (not just the search-result nouns in ../search's requestedResultCount, which sizes a
// different thing) purely to size the OUTPUT TOKEN budget — completeness comes before the cost
// of a few hundred more tokens, so when in doubt this errs toward more room, never less.
const EXPLICIT_ITEM_COUNT_RE =
  /\b(\d{1,3})\s+(?:steps?|reasons?|ways?|tips?|points?|questions?|tools?|features?|factors?|benefits?|risks?|considerations?|techniques?|strategies?|methods?|examples?|ideas?|items?|options?|things?|entries?|results?|sources?)\b/i;

function explicitItemCount(userText: string): number {
  const n = Number(userText.match(EXPLICIT_ITEM_COUNT_RE)?.[1]);
  return Number.isFinite(n) ? n : 0;
}

/** Output-token budget for a turn, sized to the real canvas so a full reply never
 *  truncates mid-JSON (a cut-off object fails the final parse and collapses the turn
 *  to a single raw-text card). Roughly: a verbose, enriched block is ~150 JSON tokens,
 *  plus a fixed envelope for title/sub/narration/chips. On Gemini (and any provider where
 *  thinking draws from the SAME output budget) we add explicit thinking headroom on top, so a few
 *  hundred reasoning tokens can never eat into the JSON. `explicitCount` (see
 *  explicitItemCount above) adds real headroom — AND lifts its own ceiling — for a named
 *  count beyond what a typical block already carries, so a genuinely dense, complete answer
 *  is never the thing sacrificed to a fixed limit. Clamped so a tiny ask stays cheap; a
 *  legitimately large one gets the room it needs rather than an arbitrary cap. */
function outputBudget(
  blocks: number,
  provider: string,
  thinkingLevel?: ThinkingLevel,
  deep = false,
  explicitCount = 0,
  model = '',
): number {
  // Sized for FULL blocks: we now ask the model to answer completely (every ingredient with
  // amounts, every step in detail), so a real block runs ~230 JSON tokens, not ~160 — under-
  // budgeting truncates the JSON mid-object and collapses the turn to a raw-text card.
  const PER_BLOCK = 230;
  // title + sub + narration + the spoken tour + punctuation, plus headroom for the follow-up
  // chips — which are no longer capped at a fixed few, so a breadth ask ("give me 10 next
  // steps") needs room to emit them without truncating the JSON.
  const ENVELOPE = 700;
  // A typical block already budgets enough for a handful of rows; only the count BEYOND that
  // needs its own line item — each extra row costs roughly one enriched item's worth of JSON
  // (a label, a value, a short detail).
  const itemHeadroom = Math.max(0, explicitCount - 6) * 60;
  const json = ENVELOPE + blocks * PER_BLOCK + itemHeadroom;
  // Thinking tokens draw from the SAME output budget on both Gemini and Anthropic.
  // Gemini always needs headroom (it thinks at every non-minimal level); Anthropic only
  // when thinking actually activates (adaptive mode fires on medium/high effort turns).
  const thinkHeadroom =
    thinkingLevel === 'high'
      ? 1500
      : thinkingLevel === 'medium'
        ? 900
        : thinkingLevel === 'low'
          ? 500
          : 200;
  // An OpenAI-style reasoning model (gpt-5.x, the o-series, Grok) is the harshest case of all: it
  // spends its reasoning tokens FIRST and out of this very budget, and if it runs out mid-thought it
  // returns `status: incomplete` with NOTHING written — not a truncated answer, an empty one. On a
  // real ask ("plan a 3-day trip") that reasoning ran past 3,900 tokens, so the whole budget was
  // gone before a single character of the answer existed; every substantive turn collapsed to the
  // fallback card after ~60s of silence, twice over once recovery re-asked. These models need room
  // to think measured in thousands, not hundreds.
  //
  // This is free to give: max_output_tokens is a CEILING, not a purchase. Unused tokens cost nothing,
  // and the tokens actually spent are the same either way — the only thing a tight cap buys is a
  // failed turn the user still pays for.
  const reasoningModel = isReasoningModel(model);
  const reasonHeadroom = thinkingLevel === 'high' ? 6000 : thinkingLevel === 'medium' ? 4000 : 2500;
  const needsThinkHeadroom =
    provider === 'gemini' ||
    (provider === 'anthropic' && (thinkingLevel === 'medium' || thinkingLevel === 'high'));
  const total = json + (reasoningModel ? reasonHeadroom : needsThinkHeadroom ? thinkHeadroom : 0);
  // Ceiling raised to 7200 so a genuinely large answer (an explicit "give me 10 …", or a full
  // 18-block canvas with thinking headroom) can complete its JSON instead of being clipped. A depth
  // request ("go deeper", "more detail") lifts the ceiling + adds headroom so a fuller answer fits.
  // The ceiling ALSO rises with itemHeadroom, so the very signal that inflated the estimate above
  // can't then get clamped back down by a fixed cap — a large named count earns its own room.
  // A reasoning model's ceiling has to clear its own thinking too, or the clamp re-imposes exactly
  // the starvation the headroom above exists to prevent.
  const base = deep ? 9600 : 7200;
  const ceiling = (reasoningModel ? base + reasonHeadroom : base) + itemHeadroom;
  return Math.min(ceiling, Math.max(1200, Math.round(total + (deep ? 600 : 0))));
}

/** Turn follow-up chip labels into SuggestSpecs. The route carries the chip text so
 *  the surface runs it as the next turn (cheap: a chip costs tokens only when tapped). */
function chipsToSuggests(chips: string[] | undefined): SuggestSpec[] {
  if (!chips?.length) return [];
  return chips.map((label) => ({ label, icon: 'chat', route: label }));
}

/** Wrap a validated LiveResponse into the full ConversationSpec the canvas expects.
 *  `sources` are the real search results we grounded on (not model-emitted), so the
 *  citations the user sees are guaranteed to match what was actually fetched. */
function toSpec(v: LiveResponse, sources: WebSource[]): ConversationSpec {
  return {
    id: 'live',
    workspace: 'Live',
    title: v.title,
    sub: v.sub,
    opener: v.narration,
    context: [],
    blocks: v.blocks,
    proof: null,
    ...(v.topic ? { topic: v.topic } : {}),
    ...(v.track ? { track: v.track } : {}),
    ...(v.bend ? { bend: v.bend } : {}),
    ...(v.blanks?.length ? { blanks: v.blanks, awaiting: true } : {}),
    ...(sources.length ? { sources } : {}),
    extras: {},
    group: 'home',
    suggests: chipsToSuggests(v.chips),
    keywords: [],
  };
}

/** Structural equality for the plain-JSON values the validator emits. Used to give a
 *  re-validated stream partial back the previous emit's object when nothing in the block
 *  changed. Blocks are small and each is compared once per emit, so a direct recursive
 *  walk is the right size — no memo tables, no dependency. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bArr = b as unknown[];
    if (a.length !== bArr.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameJson(a[i], bArr[i])) return false;
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = Object.keys(aObj);
  if (keys.length !== Object.keys(bObj).length) return false;
  for (const k of keys) if (!(k in bObj) || !sameJson(aObj[k], bObj[k])) return false;
  return true;
}

/** True when a string is leaked machine output (a JSON envelope/object/array) rather than
 *  human prose. The end user must NEVER see this — it only happens when the model failed to
 *  produce real blocks, so we swap it for a clean message instead of showing braces. */
function looksLikeJson(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  return t.startsWith('{') || t.startsWith('[') || /"(narration|blocks|props|type)"\s*:/.test(t);
}

/** Pull the `narration` string out of a partial/invalid JSON response. narration is emitted
 *  first, so even a truncated reply usually carries a complete one — we show that instead of
 *  the raw braces. Returns '' if none is recoverable (fallbackSpec then uses its own message).
 *  Accepts a parsed object too: Gemini (the default Live model) returns an already-parsed object
 *  in JSON mode, so a string-only salvage would throw away a perfectly good narration on collapse. */
function salvageNarration(raw: string | object): string {
  if (typeof raw !== 'string') {
    const n = (raw as { narration?: unknown }).narration;
    return typeof n === 'string' && !looksLikeJson(n) ? n.trim() : '';
  }
  const m = raw.match(/"narration"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return '';
  try {
    const n = JSON.parse(`"${m[1]}"`);
    return looksLikeJson(n) ? '' : n;
  } catch {
    const n = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
    return looksLikeJson(n) ? '' : n;
  }
}

/** The graceful fallback: one honest insight carrying whatever we can show. */
function fallbackSpec(summary: string): ConversationSpec {
  // Last line of defense: if what we were handed is JSON (or empty), the model didn't produce
  // a real answer — show a clean human message, never raw output.
  const clean =
    summary.trim() && !looksLikeJson(summary)
      ? summary.trim()
      : "I couldn't put that into a clean view just now — try asking again.";
  // No "conf" badge: this degraded text card is NOT a graded finding, so stamping it "Inferred"
  // is exactly the misleading badge the user sees on a collapsed turn. Omitting it shows no badge.
  const props: InsightProps = {
    title: 'Here’s what I can say',
    summary: clean,
  };
  const block: Block = { type: 'insight', col: 12, delay: 0, id: 'live-1', num: '1', props };
  return {
    id: 'live',
    workspace: 'Live',
    title: 'Here’s what I can say',
    sub: '',
    opener: props.summary ?? '',
    context: [],
    blocks: [block],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

/** A message that is ENTIRELY a "keep going / go deeper" filler — it names NO topic of its own, so
 *  on such a turn "this"/"more"/"deeper" can only mean the thread the user is already reading. We use
 *  this to BOTH lift the depth budget AND lock the topic, so a weak model can't drift to an older,
 *  meatier thread surfaced in the recap (the "more in depth → answers about Kafka" bug). Anchored to
 *  the whole string so a follow-up that NAMES a topic ("go deeper on graphs") is NOT treated as
 *  topic-less and is left free. */
const CONTINUATION_ONLY =
  /^\s*(?:(?:can you |could you |please |now |ok(?:ay)? |and |so )*)(more(?: please)?|more in[- ]?depth|in[- ]?(?:more )?depth|in (?:more )?detail|details?|go (?:on|deeper|ahead|further)|dig(?:ging)? deeper|deeper|expand(?: on (?:that|it|this))?|elaborate|continue|carry on|keep going|keep it going|tell me more|what(?:'s| is)? next|next|and then|why exactly|proceed|further)\s*[.!?]*$/i;

/** The user's most recent SUBSTANTIVE ask — walk history backwards, skipping pure continuation
 *  fillers and any injected recap/lock line, so a topic-less follow-up ("more in depth") still has a
 *  real subject to pin. Reliable even when the prior answer collapsed to the generic fallback title. */
function lastSubstantiveAsk(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'user') continue;
    const t = m.content.trim();
    if (!t) continue;
    if (/^Earlier in this conversation the user asked about:/i.test(t)) continue;
    if (/^The user is continuing the current thread about:/i.test(t)) continue;
    if (CONTINUATION_ONLY.test(t)) continue;
    return t;
  }
  return '';
}

function selectedBlocksTopic(blocks: readonly Block[] | undefined): string {
  if (!blocks?.length) return '';
  const labels = [
    ...new Set(
      blocks
        .map(blockLabel)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (!labels.length) return '';
  return labels.slice(0, 3).join(labels.length === 2 ? ' and ' : ', ');
}

function usefulPriorTopic(topic: string | undefined): string {
  const t = (topic ?? '').trim();
  if (!t || /^here['’]?s what i can say$/i.test(t) || /^couldn['’]?t answer$/i.test(t)) return '';
  return t;
}

/** The stub spec for a FAILED turn (provider error). Honest by construction: no blocks, no
 *  confidence badge, an unambiguous title — never dressed up as a finding. The surface reads
 *  `result.error` and renders its own error state; this exists only so the LiveResult contract
 *  ("always a renderable spec") holds for any caller that ignores the error field. */
function errorSpec(error: LiveError): ConversationSpec {
  return {
    id: 'live',
    workspace: 'Live',
    title: "Couldn't answer",
    sub: '',
    opener: error.message,
    context: [],
    blocks: [],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

// checkLiveReady moved to the catalog-free leaf ./ready so the setup wizard's static import of it
// no longer pins the catalog into the eager Live chunk. Re-exported for any caller still importing
// it from here.
export { checkLiveReady } from './ready';

/** Max pinned blocks + per-block prop budget when serializing on-screen elements for the model.
 *  Caps keep the added context lean (the product's terse-by-design bar) even on data-heavy blocks. */
const MAX_SELECTED_BLOCKS = 6;
const MAX_BLOCK_PROPS_CHARS = 400;

/** Serialize the blocks the user pinned into a compact, real-data context block, prepended to the
 *  question so the model answers about exactly those on-screen elements. Empty when none are pinned.
 *  `purpose: 'complete'` reframes it for a blank-completion turn: these aren't elements being asked
 *  about, they're the answer already on screen to finish — so the model keeps the structure and
 *  doesn't restate the shown values. */
export function buildSelectedBlockContext(
  blocks: Block[] | undefined,
  purpose: 'ask' | 'complete' = 'ask',
): string {
  if (!blocks?.length) return '';
  const lines = blocks.slice(0, MAX_SELECTED_BLOCKS).map((b, i) => {
    let data: string;
    try {
      data = JSON.stringify(b.props ?? {});
    } catch {
      data = '';
    }
    if (data.length > MAX_BLOCK_PROPS_CHARS) data = data.slice(0, MAX_BLOCK_PROPS_CHARS) + '…';
    return `[${i + 1}] ${b.type} "${blockLabel(b)}": ${data}`;
  });
  if (purpose === 'complete') {
    return `This is the answer already on the user's screen — finish it with the filled-in values below, keeping these elements and their structure. Don't restate values that didn't change:\n${lines.join('\n')}`;
  }
  const intro =
    blocks.length > 1
      ? 'The user is asking about these specific elements currently on their screen'
      : 'The user is asking about this specific element currently on their screen';
  return `${intro} — answer about them using their real, shown values:\n${lines.join('\n')}`;
}

const CODE_REVIEW_TOPIC_RE =
  /\b(code|coding|programming|software|function|method|class|snippet|implementation|algorithm\w*|data structures?|topo(?:logical)? sort|kahn'?s?|big-?o|time complexity|python|typescript|javascript|java|rust|go|sql)\b/i;
const CODE_REVIEW_ASK_RE =
  /\b(review|critique|audit|debug|fix|bug|flaw|wrong|issue|problem|edge case|safety|correct(?:ness)?|performance|complexity|why (?:is|does|isn'?t|doesn'?t|won'?t)|what'?s wrong|find)\b/i;

// A calculation-shaped ask — named a recurring amount, a rate, a price, a split/allocation, or a
// budget/afford question — the class BENDABLE NUMBER actually applies to. Deliberately generous
// (a false positive only costs a few unused tokens, guarded by the directive's own "ONLY when…"
// qualifier; a false negative would remove the model's only path to offer a slider), so this just
// keeps that paragraph off the many turns that plainly have nothing to do with a draggable number.
const MIGHT_BEND_RE =
  /\b(budget|afford\w*|allocat\w*|split\b|monthly|per month|\/mo\b|rate|price|cost|salary|income|savings?|payment|installment|percent|%|interest|loan|mortgage|rent\b|down payment)\b/i;

// A turn that could plausibly be "worth tracking as a living dashboard" — an ongoing metric, a
// recurring number, a goal/target/progress. Same generous-on-purpose logic as MIGHT_BEND_RE above.
const MIGHT_TRACK_RE =
  /\b(track\w*|dashboard|over time|trend\w*|progress|goal\b|target\b|milestone|weekly|monthly|quarterly|kpi|metric\w*|revenue|burn rate|growth)\b/i;

function hasSelectedCode(blocks: readonly Block[] | undefined): boolean {
  return !!blocks?.some((b) => b.type === 'codeblock');
}

function codeReviewAccuracyDirective(userText: string, selectedBlocks?: readonly Block[]): string {
  const isCodeReview =
    hasSelectedCode(selectedBlocks) ||
    (CODE_REVIEW_TOPIC_RE.test(userText) && CODE_REVIEW_ASK_RE.test(userText));
  if (!isCodeReview) return '';
  return [
    'CODE AUDIT ACCURACY — when reviewing/debugging code, separate PROVEN DEFECTS from CONTRACT CAVEATS.',
    'A proven defect must follow from the visible code under the normal input contract. If a flaw depends on an unstated representation or input assumption, write it as "if ..." and call it a caveat, not a bug.',
    'Run one counterexample check before naming a flaw. Example: in graph algorithms, disconnected components are NOT the same as vertices omitted from adjacency keys; a disconnected DAG works when every vertex is represented. For Kahn/topological sort, missing cycle detection is a safety issue, list.pop(0) is a performance issue, and omitted sink/isolated vertices are a graph/in_degree mismatch caveat.',
  ].join(' ');
}

/** The teaching ARC directive — shapes a learning ask into HOOK → MECHANISM (visual) → WORKED
 *  EXAMPLE → VARIANTS/COSTS/PITFALLS → CHECK, instead of just a longer list of facts. It reuses
 *  the existing "section/order/depth/facet" tagging below for the CHECK beat (facet:"check") so
 *  the "Go deeper" drawer stays coherent — no new tagging scheme. Gated the SAME way as
 *  sectionLine (tier !== 'small'): a local model can't reliably fill a teachdiagram's structured
 *  step schema, so a small tier gets the plainer TEACH-IN-FULL fallback below instead.
 *  `speed` mirrors the block-count cap logic below (~targetBlockCount/speed==='slow') so this
 *  directive's wording never contradicts it — a measured-slow model is told to compress the arc
 *  into that same smaller budget, not to drop the check beat or fight the cap. */
export function teachingArcDirective(speed: SpeedTier): string {
  const compressLine =
    speed === 'slow'
      ? ' Your responses on this connection have been measured as slow — compress this arc into fewer, denser blocks INSIDE the block-count budget you were already given, rather than dropping the CHECK beat or fighting that budget; combine steps into one block before you cut the shape of the lesson.'
      : '';
  return `TEACH IT AS A SHAPED LESSON, NOT A LONGER LIST — this is a learning ask, so the FIRST answer must already be a complete lesson the learner never has to ask you to expand. Build it in this order:
1. HOOK — one or two sentences on why this matters, anchored to one concrete thing a newcomer can actually picture (a real example, never an abstract claim).
2. BUILD THE MECHANISM, VISUALLY — use a teachdiagram whose steps ADD to one growing figure: each step's "add" only ever adds shapes/labels on top of what came before, it never replaces or restarts the figure. Give every step's caption its spoken twin too ("captionSpoken") so it can be narrated in sync with the drawing.
3. A WORKED EXAMPLE, carried all the way through to a concrete final result — never abandoned halfway through the steps.
4. VARIANTS, COSTS, AND PITFALLS — sized to what was actually asked, not padded for length.
5. A CHECK — close with 1-2 quiz blocks: an honest single correct option (never a trick) plus a brief explanation of why. Tag them "facet":"check" (the CONCEPT SECTIONS tagging below) so they land in the "Go deeper" drawer's recall group.
Cover every core sub-part the question names (e.g. "linked lists AND graphs" means teach BOTH, each with its own hook-through-check arc). Ground every claim; never pad with filler.${compressLine}`;
}

/** One filled hole as a "key = value" line for the model. A dragged card contributes its label
 *  (its real props ride along separately via selectedBlocks on the refine turn). */
function describeFill(v: FillValue): string {
  switch (v.kind) {
    case 'number':
      return `${v.key} = ${v.value}${v.unit ? ` ${v.unit}` : ''}`;
    case 'card':
      return `${v.key} = ${v.label}`;
    default:
      return `${v.key} = ${v.value}`;
  }
}

/** Serialize the values the user filled into "The Blank Space" holes, prepended to the refine
 *  turn so the model completes the SAME answer with the user's real inputs. Empty when none. */
export function buildFilledBlankContext(filled: Record<string, FillValue> | undefined): string {
  const vals = Object.values(filled ?? {});
  if (!vals.length) return '';
  return `The user filled in the blanks you left — complete the same answer using these real values, do not start over. State each value exactly once where it belongs; never repeat the same number back-to-back:\n${vals
    .map(describeFill)
    .join('; ')}`;
}

const MAX_INK_INTENTS = 8;
const MAX_INK_TEXT = 80;

/** Translate the user's highlight marks into plain instructions prepended to the turn — the input
 *  twin of buildSelectedBlockContext. Self-describing (no system-prompt line needed) and
 *  real-data-only: each named part is literal on-screen text, or the marked block's real label as a
 *  fallback; a mark that can't be named is dropped, never an invented token. `blockById` resolves
 *  the marked blocks (the surface merges them into selectedBlocks, so this map is those). */
export function buildInkIntentContext(
  intents: InkIntent[] | undefined,
  blockById: (id: string) => Block | undefined,
): string {
  if (!intents?.length) return '';
  const clip = (s: string): string =>
    s.length > MAX_INK_TEXT ? s.slice(0, MAX_INK_TEXT - 1) + '…' : s;
  const labelOf = (id: string | undefined): string => {
    const b = id ? blockById(id) : undefined;
    return b ? blockLabel(b) : '';
  };
  // Name a highlighted part by its literal text, else by the block it belongs to.
  const name = (it: InkIntent): string | null => {
    const t = it.textAt?.trim();
    if (t) return `"${clip(t)}"`;
    const label = labelOf(it.blockIds[0]);
    return label ? `the "${label}" card` : null;
  };

  const lines: string[] = [];
  for (const it of intents.slice(0, MAX_INK_INTENTS)) {
    const n = name(it);
    if (n) lines.push(`The user highlighted ${n} — focus your answer on it.`);
  }
  if (!lines.length) return '';
  return `The user highlighted parts of the answer on screen — focus on these:\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

/**
 * Produce one Live turn for `userText` given the rolling `history` and the
 * connected `cfg`. Streams raw deltas through `onDelta`. Never throws.
 */
export async function generateLive(
  userText: string,
  history: ChatMessage[],
  cfg: ModelConfig,
  onDelta?: (chunk: string) => void,
  opts: GenerateLiveOpts = {},
): Promise<LiveResult> {
  // The component brain picks a small, fitting, varied set from the catalog and shows
  // ONLY those in the prompt — so the menu stays compact however large the library grows,
  // and the model reaches past the boring few. The validator gate uses the SAME set, the
  // base floor is always included, and any failure falls back to the safe set — so this
  // never makes a turn worse than before.
  const adapter = getAdapter(cfg.provider);
  const tier = adapter.capabilities.strengthTier;
  // How FAST this model has been (learned from prior turns; 'standard' until measured). A 'slow' model
  // gets a leaner menu + fewer blocks + a smaller token budget below, so it emits less and answers
  // sooner — capability (`tier`) is untouched. See ./speed.
  const speed = speedTierFor(cfg.model);
  const caps = opts.caps ?? {};
  // How much canvas this ask deserves: 'rich' (the default) fills the screen with many
  // varied, advanced components like a demo; 'lean' keeps a trivial fact answer focused.
  const complexity = classifyAsk(userText);
  // A teaching/learning ask must land DEEP on the FIRST answer — a learner should never have to say
  // "more in depth". Gate on 'rich' so an explicitly-brief teaching ask ("teach me X in one line")
  // still stays brief. Drives a deeper block target + the teaching depth directive below.
  const isTeaching = complexity === 'rich' && isTeachingAsk(userText);
  // The explanation level for THIS turn: the persisted setting, overridable by a one-turn voice
  // trigger ("explain like I'm 5" → simple; "go deeper" → standard). Orthogonal to complexity —
  // a simple answer can still be RICH and long; it's the words and the visual choices that
  // get plainer, not the amount of content.
  const explainLevel = effectiveExplainLevel(userText, caps.explainLevel ?? 'standard');
  // What KIND of answer this is (decide / plan / troubleshoot / reflect …) → the story arc that
  // shapes how the canvas is ORDERED: a decision opens with a verdict and ends on an action; a
  // troubleshooting answer leads with the likely cause. A lean ask gets 'simple_answer' (an empty
  // directive — today's behavior). The model still picks the components; the arc only orders them.
  // What KIND of answer this is — computed once and reused for the story arc AND the
  // sampling temperature (creative asks run hot, precision asks run cold).
  const intent = analyzeIntent(userText, history);
  const arc = chooseArc(intent, complexity);
  // On-the-fly visual creation is opt-in (and OFF by default): unless the user enabled it,
  // exclude the generative family from selection so it never enters the prompt menu or the
  // schema — a paid model is never offered it and spends zero tokens composing one.
  // Personalize with what we've learned about how THIS user likes answers (opt-in, local). The
  // hints nudge the weighted component draw and add one prompt line below — advisory only: they
  // never override a strong shape fit, an explicit request, or the safe base set.
  const memoryActive = caps.memoryEnabled && memoryRelevant(userText);
  const lessons = memoryActive ? proceduralHints(getMemoryNodes(), userText) : undefined;
  // On-device semantic fit (../semantic): scores the ask against component exemplars to catch the
  // vague/novel wording no keyword or intent rule trips. Resolves to null INSTANTLY when the embedder
  // isn't warm (cold start, a weak device, the node eval, or assets not built), so this adds zero
  // latency until the ~7MB model has loaded — then it's a sub-ms worker round-trip. Advisory only:
  // the selector folds it in as a bounded additive boost, never an override.
  const semantic = await semanticFit(userText);
  const selection = await selectComponents({
    userText,
    history,
    tier,
    recent: opts.recentTypes,
    rotation: opts.rotation,
    complexity,
    exclude: caps.generativeBlocks ? undefined : GENERATIVE_BLOCK_TYPES,
    lessons: lessons ? { prefer: lessons.prefer, avoid: lessons.avoid } : undefined,
    semanticFit: semantic ?? undefined,
    speedTier: speed,
    // Ground selection in what the user uploaded (a spreadsheet → a table, etc.).
    attachments: opts.attachments?.map((a) => ({ kind: attachmentKind(a), name: a.name })),
    // Pins the teaching kit (teachdiagram/workedexample/quiz/flashcard) + a small learn-family
    // draw boost — see SelectionInput.teaching. The selector itself withholds this on 'small'.
    teaching: isTeaching,
  });
  // Photos are real, found images only — direct links to stable free-commercial hosts, verified
  // to load. Small models never get the block (they invent URLs); there is no generated-image
  // path (the unused Pollinations pipeline was removed).
  const photoEnabled = tier !== 'small';
  // Actions are gated OFF until the user connects an MCP; only then do we expose the
  // 'action' block (to the validator + schema) and tell the model what it can offer.
  // Nothing ever runs without an explicit confirm on the card.
  const connectedMcps = getConnectedMcps();
  const actionMenu = connectedMcps.size ? actionsMenu(connectedMcps) : '';
  // The tier's STANDARD set (the base 8, plus the frontier cousins bars/stack/donut/gauge that
  // liveSystemPrompt's frontier addendum tells a capable model to "use liberally"). These must
  // be in the gate AND the type enum even when the random hero draw didn't pick them — otherwise
  // the model obeys the prompt, emits a donut/gauge/bars, and the validator silently drops every
  // one, collapsing a full 10-block canvas down to the lone always-allowed insight. (This was THE
  // "Live only shows 1 element" bug: prompt and gate disagreed on the standard frontier blocks.)
  const tierStandard = blockTypesForTier(tier);
  const extras = [...(photoEnabled ? [PHOTO_BLOCK_TYPE] : []), ...(actionMenu ? ['action'] : [])];
  // SYNTHESIS — when no registered component fits this rich ask, let the model compose a bespoke
  // layout from primitives ('composite') or draw a custom SVG illustration ('svgblock') instead of
  // falling back to plain text. Fires only on a weak fit, so the extra prompt tokens are
  // proportional to need.
  const generativeOn = !!caps.generativeBlocks;
  const synthesize = shouldSynthesize({
    complexity,
    tier,
    bestFit: selection.bestFit,
    generativeOn,
  });
  const synthExtra = synthesize ? [COMPOSITE_BLOCK_TYPE, 'svgblock'] : [];
  // When the user turns generative visuals fully ON, the svg escape hatch is offered EVERY turn
  // for EVERY tier (composite/diagramflow already flow through via the non-exclusion above). Its
  // low wowWeight keeps it a genuine last resort that selection rarely surfaces on its own, so we
  // add it explicitly here to guarantee it's both allowed and taught whenever the user enabled it.
  const genExtra = generativeOn ? ['svgblock'] : [];
  const allowed: ReadonlySet<string> = new Set([
    ...selection.allowed,
    ...tierStandard,
    ...extras,
    ...synthExtra,
    ...genExtra,
  ]);
  // ANNOTATE-THE-BASE — the rung below composition. Whenever a base that can actually render
  // annotations is on the menu, teach the model to reach for it: a table plus currency formatting
  // and a total row is the receipt the user asked for, and no new component had to exist for it.
  // Gated on a real capable base (never advertise a field the renderer would drop) and off for the
  // small tier, which can't reliably fill a nested grammar.
  const annotatableBases = [...new Set(selection.types)].filter((t) => ANNOTATABLE_TYPES.has(t));
  const offerAnnotate = tier !== 'small' && annotatableBases.length > 0;
  const blockTypes = [
    ...new Set([...selection.types, ...tierStandard, ...extras, ...synthExtra, ...genExtra]),
  ];
  // The validator coerces whatever the model emits from that block's catalog DETAILS (its required
  // props, item shapes, prop hints), and it runs synchronously while the response streams. Load the
  // details for every allowed type BEFORE the first token arrives, or a block whose family was never
  // fetched would fail to coerce and vanish from the canvas. `selectComponents` already warmed the
  // menu's families; this covers the tier standards and the synthesis/generative extras it can't know
  // about. Families already resident cost nothing.
  await ensureDetails(blockTypes);
  // Whether the svg escape hatch is on the table this turn — drives the teaching fragment below,
  // so any tier that's offered svgblock is also told exactly how to format it.
  const offerSvg = allowed.has('svgblock');
  // Name the turn's strongest SPECIALIZED picks so the model builds around them instead of
  // defaulting to the generic dozen — concrete targets reinforce the variety mandate against the
  // pull of the (generic) worked example in the base prompt.
  const heroPicks = selection.types.filter((t) => !FRONTIER_BLOCK_TYPES.has(t)).slice(0, 3);
  const baseSystem = selection.promptSnippet
    ? `${liveSystemPrompt(tier, complexity)}\n\n${selection.promptSnippet}`
    : liveSystemPrompt(tier, complexity);
  const codeAuditLine = codeReviewAccuracyDirective(userText, opts.selectedBlocks);
  // Density scales with the ask: a rich question fills THIS viewport (a big monitor needs
  // more than a laptop); a trivial one stays to a few focused blocks.
  // A measured-slow model caps a RICH answer to a tighter spread so the turn completes far sooner — a
  // leaner-but-fast canvas beats a full-but-14s one. Lean/brief asks are already small; fast/standard
  // models keep the full viewport-filling target.
  const rawTarget = targetBlockCount(complexity, { teaching: isTeaching });
  const target = speed === 'slow' && complexity === 'rich' ? Math.min(rawTarget, 6) : rawTarget;
  // Tell the model how full to make the canvas — and, for a follow-up, which block types
  // it just used so it varies them. Both override the static counts baked into the prompt.
  const countLine = countDirective(complexity, target);
  // Honor an explicit count: when the user names how many things they want, that number wins
  // over the viewport-derived budget above — "give me 10 ideas" should return ten, not eight.
  const explicitCountLine =
    'EXPLICIT COUNT — if the user asked for a specific number of items, examples, options, or results (e.g. "give me 10 ideas", "list 12 tools"), deliver exactly that many in the canvas — as rows of a single list/table/grid block, or as that many blocks. This OVERRIDES the block-count guidance above: the count the user named wins, never silently fewer.';
  // Format fidelity: when the user explicitly named the FORM they want (a table, a diagram, a
  // timeline, code, a checklist, a comparison…), the selector has already PINNED that block type
  // into the menu — tell the model to LEAD with it. We intersect with what's actually offered, so
  // we never ask for a form the tier can't produce (e.g. a diagram when generative blocks are off).
  const requestedForms = detectRequested(userText).filter((t) => selection.allowed.has(t));
  const formRequestLine = formRequestDirective(requestedForms);
  // Specialist disambiguation: when the CONTENT maps to a purpose-built block (a state machine, a
  // risk matrix, a function plot…), the selector has pinned it — nudge the model to prefer it over
  // the generic it would otherwise default to. Intersected with what the tier can actually produce.
  const specialistForms = detectSpecialists(userText).filter((s) => selection.allowed.has(s.type));
  const specialistLine = specialistDirective(specialistForms);
  // Compound ask ("X and also Y", two questions): make the model cover EVERY part, not just the first.
  const multiPartLine = multiPartDirective(userText);
  const recentLine = opts.recentTypes?.length
    ? `VARIETY IS A TIE-BREAKER, NEVER A CONSTRAINT ON THE RIGHT TOOL — earlier answers this conversation used: ${[...new Set(opts.recentTypes)].slice(0, 14).join(', ')}. For each block, pick the component that BEST FITS its data. If the best fit is one you've already used because the data genuinely calls for it again (a second real timeline, another comparison), USE IT — the right tool repeating is correct, not a mistake. Only when two components fit EQUALLY well, prefer the one you haven't used yet. Never reach for a worse-fitting block just to look different.`
    : '';
  // The spoken line is conversational, never a wall of text. Tell the model the budget so it
  // writes to length rather than getting truncated mid-thought.
  // Emit narration FIRST so the voice can start the instant the spoken line streams — never gated
  // behind the title or the blocks. The app speaks it sentence-by-sentence as it arrives, so a
  // front-loaded spoken line is what makes a slow model still feel responsive.
  // Both directives live in effort.ts (shared with the eval harness) so the ONE real per-turn
  // narration-length rule can't drift out of sync between what production sends and what an
  // eval scores against.
  const narrationFirst = NARRATION_FIRST_LINE;
  const spokenLine = spokenLineDirective(complexity);
  // Memory (opt-in): let the model surface durable user facts to remember, in this same
  // turn (no extra call). The surface persists them locally; we never write storage here.
  // Gated on relevance too: a creative/ephemeral ask ("make a funny poem") neither reads from
  // nor writes to memory, so we don't ask the model to record anything on those turns.
  // (`memoryActive` is computed above, where the procedural hints are derived.)
  const memoryLine = memoryActive
    ? 'MEMORY — if this exchange revealed something lasting about the user, write concept nodes to "memory": an array of {"concept": string, "body": string} objects. "concept" is a dot-path slug: "profile" (who they are — role, context), "preferences" (how they like answers — and when the user states a FORMAT, e.g. "as a table"/"just bullets", record it under "preferences.form", or a DEPTH, e.g. "keep it brief"/"go deep", under "preferences.depth"), "topics.<domain>" (domain context, e.g. "topics.finance"), "threads.<topic>" (something still in motion). "body" is a SHORT paragraph — write the COMPLETE current knowledge for that concept, not a delta, since it REPLACES whatever was there. Only write concepts that changed this turn. Omit the field entirely when nothing genuinely new was learned. Example: [{"concept":"profile","body":"Software founder in Austin building Mavéa, a React AI app."},{"concept":"preferences","body":"Prefers dense answers with real numbers; no explanatory fluff."}]'
    : '';
  // PERSONAL FIT — a one-line nudge from what we've learned about THIS user (depth + verify).
  // Built by the shared `personalFitLine` so the eval measures this exact prompt, never a copy.
  const personalLine = lessons ? personalFitLine(lessons) : '';
  // "understood" and "chips" are the two fields the model is asked for that no provider schema
  // enforces, so they live or die on instruction-following. Their full definitions are fixed text
  // and sit in the cached prefix (STATIC_TURN_ADDENDUM) — but a directive the model last read
  // thousands of tokens ago, behind an entire per-turn block, is one it quietly starts dropping.
  // This is the cheap half: a tail reminder that costs ~20 uncached tokens and keeps both fields in
  // recent view, where the definitions themselves would have cost ~400.
  const emitReminder =
    'Emit BOTH optional top-level fields defined above: "understood" (3-5 constraint chips) and "chips" (the deeper follow-ups).';
  // Self-healing history: a genuine reversal is declared, so the earlier answer can be
  // visibly marked corrected instead of history silently disagreeing with itself.
  const correctsLine = history.length
    ? 'OWN YOUR CORRECTIONS — if this answer genuinely CONTRADICTS something you told the user EARLIER in this conversation (a figure, a date, a recommendation), also emit "corrects": {"what": <the thing, a few words>, "was": <what you said before>, "now": <what is right>}. Only for a real reversal of your own earlier claim — never for added detail, a refinement, or a new topic. Omit otherwise.'
    : '';
  // Bendable answers: one draggable input on a genuinely calculational answer, recomputed
  // locally through model-authored formulas the user can inspect — auditable, never hidden.
  // Gated on MIGHT_BEND_RE so this paragraph isn't sent on every single turn regardless of
  // whether the ask has anything to do with a number the user could drag.
  const bendLine =
    tier === 'small' || !MIGHT_BEND_RE.test(userText)
      ? ''
      : 'BENDABLE NUMBER — ONLY when the answer is a CALCULATION with one input the user owns (a monthly amount, a rate, a price), you may also emit "bend": {"index": <0-based index of the block the slider belongs under>, "label": <what is being bent>, "param": {"value": n, "min": n, "max": n, "step": n, "unit"?: "$"}, "outputs": [{"label", "formula", "unit"?}, …]}. Each formula is plain arithmetic in x (the dragged value) using ONLY numbers and + - * / ( ) — e.g. "x*0.3" — and must restate the same math your blocks show. At most one bend; omit it for anything that is not a real calculation.';
  // "Track it live": the model rates whether this answer is worth standing up as a living dashboard.
  // The bar is deliberately high — a one-off fact is not a dashboard — and the surface only nudges
  // above a threshold, so a stray middling score never reaches the user. Gated the same way as
  // bendLine: MIGHT_TRACK_RE keeps the paragraph off turns that plainly aren't an ongoing metric.
  const trackLine =
    tier === 'small' || !MIGHT_TRACK_RE.test(userText)
      ? ''
      : 'TRACKABLE — rate 0–100 how genuinely worth-tracking-as-a-living-dashboard this answer is: an ongoing metric or trend the user would revisit and watch evolve (a recurring business number, a personal target, a project milestone). MOST answers score LOW — one-off facts, explanations, advice, and curiosity questions are all well under 50. Reserve 90+ for the rare answer you would truly stand a dashboard up for. Emit "track": {"score": <0-100>, "reason": <short why, a few words>} ONLY when you score it 80 or above; omit the field entirely otherwise.';
  // ANTICIPATE & ANSWER the related angles, in the SAME canvas — the thing that makes a Mavéa
  // answer feel hand-built like the demos: don't just answer the literal question, answer the
  // 2-3 things a curious person would naturally wonder next, AS blocks, woven into the same
  // block budget (not a longer page). The chips are then for going DEEPER still, beyond what
  // the canvas already covers — never a restatement of a block that's already there.
  const relatedLine =
    complexity === 'brief'
      ? '' // a brief answer stays on the literal question — no pre-answered tangents
      : complexity === 'lean'
        ? 'ALSO ANSWER THE OBVIOUS NEXT QUESTION — beyond the direct answer, work in the one or two adjacent facts a person would immediately wonder, as their own small blocks (e.g. "capital of France?" → the answer, then a key-stats block and a couple of notable nearby facts). Pre-answer it; don\'t just hint at it.'
        : 'ANSWER THE RELATED QUESTIONS TOO — don\'t stop at the literal ask. Think about the 2-3 things someone would naturally wonder next, and ANSWER THEM as blocks in this same canvas (e.g. "how do I improve my credit score?" → also show what counts as a good score, what hurts it most, and how long changes take). Weave them into the same block budget so the canvas pre-empts the follow-ups instead of leaving them unanswered.';
  // OPEN-ENDED PLANNING DEPTH — broad "what could I do / how should I approach this" asks (a trip,
  // an event, a project) are where a thin generic list feels worst. The planning *intent* regex
  // misses the common "what can I do / things to do" phrasing, so we also sniff that here, and only
  // for a 'rich' answer. The directive makes the model decompose the question into the real facets
  // and decision points instead of one shallow list — the single biggest lever on the "it wasn't
  // great" feeling for this class of question.
  const EXPLORATORY =
    /\b(what (?:can|should|could|to) (?:i |we |you )?(?:do|see|visit|eat|try|expect)|things to (?:do|see)|what to (?:do|see)|ideas? for|suggestions? for|recommend\w*|must[-\s](?:see|do|visit|try)|where (?:should|can|to) (?:i|we) (?:go|stay|eat)|plan (?:a|my|our)\b|itinerary)\b/i;
  const wantsPlanningDepth =
    complexity === 'rich' &&
    (intent.planning || intent.domain === 'travel' || EXPLORATORY.test(userText));
  const planningDepthLine = wantsPlanningDepth
    ? 'OPEN-ENDED PLANNING — this is a broad "what could I do / how should I approach this", not a single fact, so a short generic list is a FAILURE here. Decompose it the way a sharp expert would and answer each facet as its own varied block: the real OPTIONS grouped by type; the DECISION POINTS the user actually faces (timing/season, area/neighborhood, budget, who it is for, trade-offs); concrete STANDOUTS (the few unmissable picks AND a couple of non-obvious ones); and a sensible WAY TO SEQUENCE it (a day-by-day or step ordering, e.g. a timeline or itinerary block). Be specific — real names, places, and numbers — so it reads like a hand-built guide, not a thin summary.'
    : '';
  // Explanation level: SIMPLE = plainer words AND simpler visuals; IN-DEPTH = the full-rigor
  // treatment. Both orthogonal to block count — it's the language and the visual choices that
  // shift, never the completeness.
  const levelLine =
    explainLevel === 'simple' ? simpleLevelMenu() : explainLevel === 'deep' ? deepLevelMenu() : '';

  // Hoist search mode here — needed by noLiveDataLine below, which must be part of the
  // system prompt constructed before the search/grounding section runs later.
  const searchMode: SearchMode = caps.searchMode ?? (caps.webSearch ? 'realtime' : 'off');

  // Always tell the model what "today" (AND right now) is so it reasons correctly about
  // time-relative questions ("this week", "upcoming", "recent") without the user having to
  // spell it out. The clock time matters as much as the date for anything scheduled — "the
  // 4pm match" is upcoming, live, or finished depending on what time it actually is, and a
  // model that only knows the date can't tell which (it has to lean entirely on whatever a
  // search result happens to say about status, which a static schedule page often omits).
  const dateLine = currentDateTimeLine();

  // When a question needs live data but no real-time source can serve it, the model has no
  // access to current facts — without this explicit gate it hallucinates plausible-sounding
  // scores, prices, and headlines, far worse than an honest refusal. This fires when search is
  // OFF on a fresh ask, AND when a genuinely VOLATILE ask (live score/price/news) has no live
  // path: Real-time grounds ONLY through the provider's own native search — there is no keyless
  // or keyed web-provider fallback — so a provider without native search has no live path at
  // all, regardless of searchMode. (When native grounding IS available we stay optimistic here;
  // if it then 429s, the ungrounded retry leans on the base prompt's "never fabricate live data"
  // rule.) Every first-party provider (Gemini, OpenRouter, Anthropic, OpenAI, Grok) now
  // wires native search, so !hasLivePath in practice only still fires for a custom
  // OpenAI-compatible endpoint (a self-hosted gateway via cfg.baseUrl) that never declared
  // nativeWebSearch — the check stays, since a future/local adapter can still lack it.
  const hasLivePath = searchMode === 'realtime' && !!adapter.capabilities.nativeWebSearch;
  const noLiveSource =
    (searchMode === 'off' && needsFreshInfo(userText)) || (needsLiveData(userText) && !hasLivePath);
  const noLiveDataLine = noLiveSource
    ? `NO LIVE DATA — this question needs real-time information (a live score, current price, today's news, or a result after your training cutoff) and you have NO live source connected. YOU CANNOT KNOW today's value. Do NOT invent or guess a specific current score, price, headline, or result — a fabricated answer is far worse than an honest one. Instead: (1) open your narration by admitting you don't have live access right now; (2) use an "insight" block (conf:"inferred") to flag it; (3) share real background/history from training, clearly labelled as background, never as the current answer; (4) tell the user they can ${searchMode === 'off' ? 'turn on Real-time search in Settings → Search' : 'connect a model whose provider supports built-in search (Gemini, OpenAI, Anthropic, Grok, and OpenRouter all do) for live grounding'}. Never emit a "gamesummary", "scoreboard", or any block that presents a fabricated current result as fact.`
    : '';

  // When this turn is likely to ground on the provider's NATIVE web search, ask the model to
  // also list its sources inline. This is the documented recovery for Gemini's empty-citation
  // behavior: google_search run with JSON output returns EMPTY groundingMetadata, so the adapter
  // can't read the URLs — but the model still knows the pages it used, and listing them inline
  // (merged + deduped below, ONLY on a genuinely grounded turn) restores real citations.
  // OR'd with needsLiveData (not just needsFreshInfo): liveStatusLine below fires on needsLiveData
  // alone and its "NO SOURCE, NO NUMBER" rule leans on a "sources" array existing — a live-data ask
  // that ISN'T also a needsFreshInfo match (a bare "at the moment" / "half-time", no other trigger
  // word) would otherwise get the strict citation REQUIREMENT without ever being told the array's
  // name or that it's expected on every grounded turn.
  const mayGround =
    searchMode === 'realtime' &&
    !!adapter.capabilities.nativeWebSearch &&
    (needsFreshInfo(userText) || needsLiveData(userText));
  const groundedSourcesLine = mayGround
    ? 'CITE YOUR SOURCES — REQUIRED, not optional, whenever you used web-search results: include the exact source URLs you actually relied on as a top-level "sources": [{"title": string, "url": string}] array, every single time you ground an answer in search — an answer that used search but arrives with no "sources" array is an incomplete answer, the same as a missing required field. Only real URLs from the search results — never invent one.'
    : '';

  // A genuinely volatile ask (live score, breaking news) with a live path still risks landing
  // on a STALE page — a search tool picks whatever page ranks well, which for sports is often a
  // static fixtures/schedule page, not a live-updating scoreboard. Without this nudge a model
  // reads "16:00 ET" off a schedule and reports the match as merely upcoming, even when it's
  // actually live or finished by now (it has the current clock time from dateLine above, but
  // schedule pages rarely spell out in-progress status in plain text). Provider-agnostic — every
  // native-search adapter shares this same system prompt, so this applies uniformly to all of
  // them, not just one. It cannot fabricate a score no page states; it can only search harder and
  // read status more carefully.
  const liveStatusLine =
    hasLivePath && needsLiveData(userText)
      ? 'LIVE STATUS, NOT JUST A SCHEDULE — this is a genuinely live/volatile ask. A search result is often a static schedule or fixtures page, not a live scoreboard — reading only a kickoff time off it and reporting "upcoming" can be WRONG if the event is actually in progress or already finished relative to the current time above. Specifically look for and trust live-status language in what you find (in progress, live, final, ET/minute markers, final score) over an assumed schedule time. If your sources genuinely don\'t show live/final status, say so honestly rather than guessing — but don\'t default to "upcoming" just because a schedule page is what you found first.\n\nNO SOURCE, NO NUMBER — this is the single most important rule for this turn. EVERY specific score, stat, or status you state as fact (a final score, "1–2", "40 minutes in", "live") must come from an actual page your search returned, and that page must appear in your "sources" array. Before writing any specific number, check: did a real source actually state this, or am I filling in a plausible-sounding value? If you are not certain a source stated it verbatim, DO NOT write it as fact — say exactly what you could and could not confirm (e.g. "I found that USA vs Belgium is underway, but couldn\'t confirm the current score" beats a confident but invented "1–2"). A vague, partial, honestly-hedged answer is ALWAYS better than a fluent, specific, unsourced one — confident invention is the single worst failure mode for this question, worse than any refusal.'
      : '';

  // Native grounding leaves the QUERY to the model, and a query with no date ("MLB games and
  // scores") lets the search index rank yesterday's completed games above today's slate — the
  // model then faithfully reports the wrong day. dateLine above tells it what today IS; this
  // makes it CARRY that date into any time-sensitive search and read result dates against it.
  // Gated exactly like the citation rule: any fresh-looking ask that will actually ground.
  const searchDateLine = mayGround
    ? 'SEARCH WITH TODAY IN MIND — an undated question about games, scores, schedules, prices, or weather means TODAY (the current date above), never whichever recent day a search happens to rank first. When you search for anything time-sensitive, put the actual current date in the query itself (e.g. "MLB scores <today\'s date>") — a search index cannot resolve a bare "today" — and check each result\'s OWN date before trusting it: yesterday\'s completed games are the wrong answer to an undated ask, even from the top-ranked page. If you can only confirm an earlier day\'s results, say plainly which day they are from — never present them as current.'
    : '';

  // (The icon vocabulary is fixed text too — it rides in the cached prefix, not here.)

  // "Go deeper" / "more detail" / a bare "more" → the user wants a fuller answer. Give the model
  // both the instruction (depthLine) and the room (a bumped block + token budget below) — a moderate
  // increase, enough to actually answer in more depth, not a runaway.
  // A pure continuation filler ("more in depth", "continue", "keep going") also earns the depth
  // budget — and pins the topic below, so "deeper" can't drift to an older thread.
  const askNamesNoTopic = CONTINUATION_ONLY.test(userText.trim());
  const wantsDepth =
    /\b(go deeper|dig(?:ging)? deeper|deeper|in (?:more )?detail|more detail(?:ed|s)?|elaborate|expand on|explain (?:it |this )?more|tell me more|the full picture|fuller|at length|thorough(?:ly)?|comprehensive(?:ly)?|walk me through|step[ -]by[ -]step|go on|much more)\b/i.test(
      userText,
    ) ||
    /^\s*(more|more please|details?|in depth|go deeper|expand|elaborate|why exactly|keep going)\s*[.!?]*$/i.test(
      userText.trim(),
    ) ||
    askNamesNoTopic;
  // One "deepen" flag folds an explicit depth request AND a teaching ask, so the block/token
  // headroom below is added at most ONCE even when both are true.
  const deepen = wantsDepth || isTeaching;
  const depthLine = wantsDepth
    ? 'DEPTH REQUEST — the user explicitly asked to go deeper / for more detail than a normal answer. Expand: add the supporting detail, the "why", the mechanism, the edge cases, and a fuller worked walkthrough. Use MORE of the canvas (more blocks, and richer ones) than you otherwise would — be thorough here, not terse. Still ground every claim; never pad with filler.'
    : isTeaching
      ? tier !== 'small'
        ? teachingArcDirective(speed)
        : // A local/'small' model can't reliably fill a teachdiagram's structured step schema (the
          // same gate sectionLine below uses), so it gets this plainer, schema-free instruction
          // instead of the full arc directive.
          'TEACH IT IN FULL — this is a learning ask, so the FIRST answer must already be a COMPLETE lesson the learner does NOT have to ask you to expand. Cover EVERY core sub-part the question names (e.g. "linked lists AND graphs" means teach BOTH): the core idea in plain terms; HOW it works (a real structural diagram, not just prose); at least one WORKED example carried all the way through; for anything algorithmic, correct CODE; the key variants and when to use which; the costs that matter (time & space / Big-O); and the common pitfalls. Use plenty of the canvas — many varied, substantive blocks, never a thin summary. Ground every claim; never pad with filler.'
      : '';
  // Topic lock: ONLY when the current ask names no topic of its own, pin to the subject the user is
  // already on. The visible UI context wins: a selected card, then the current answer title, then
  // chat history as a fallback for collapsed/generic prior answers. Stops a topic-less "go deeper"
  // from drifting to an older thread.
  // A course lesson pins its own syllabus entry regardless of how the ask names (or doesn't
  // name) a topic — the lesson directive below is what actually shapes the answer, but the
  // topic lock keeps a weak model from drifting off THIS lesson onto the course's broader subject.
  const pinnedTopic =
    opts.lesson?.topic ||
    (askNamesNoTopic
      ? selectedBlocksTopic(opts.selectedBlocks) ||
        usefulPriorTopic(opts.priorTopic) ||
        lastSubstantiveAsk(history)
      : '');
  const topicLockLine = pinnedTopic
    ? `STAY ON THE CURRENT TOPIC — this is a follow-up asking to go further on the answer or UI element the user is looking at RIGHT NOW. The subject is: ${pinnedTopic}. Answer ONLY about that subject, going deeper than your previous answer. Do NOT switch to — or blend in — any earlier, unrelated topic from this conversation, even if an older one had more to show. If selected on-screen context is provided, it is the authoritative subject. If you are unsure what "this"/"more"/"deeper" refers to, it is the current visible answer, never an older thread.`
    : '';

  // Concept-section tagging for the "Go Deeper" drawer — fires on any substantive (rich)
  // ask on capable models. Brief/lean asks (trivial questions, explicit short-answer requests)
  // are skipped: they don't have enough content for sections to be meaningful.
  // Small local models also skip it: they won't reliably emit the extra fields and the
  // prompt length hurts their JSON fidelity. Untagged answers fall back to today's
  // plain canvas with no chrome (the depthLens fallback path — zero regression).
  const sectionLine =
    complexity === 'rich' && tier !== 'small'
      ? `CONCEPT SECTIONS — tag EVERY block with these three fields so the canvas can group it and surface a "Go deeper" drawer for each concept:
- "section": a short concept label, shared by all blocks in that concept (e.g. "What it is", "The TCP handshake", "Flow control"). ≤ 5 words. Every block in the same concept uses the EXACT same string.
- "order": 1-based integer — the display order of this section (all blocks in the same section share the same order number). First concept = 1, second = 2, and so on.
- "depth": 1 for a standard canvas block (the learner sees it first); 2 for a detailed worked example or derivation (goes in the "Go deeper" drawer, depth-first); 3 for advanced edge-case or expert content (also drawer). Omit "depth" on depth-1 blocks if you prefer — absent is treated as 1.
- "facet": the role of a depth≥2 block only: "example" (a concrete worked case) | "derivation" (the mechanism / why it works) | "edge" (an edge case or gotcha) | "analogy" (an intuition pump) | "history" (background context) | "check" (a self-test recall card). Omit on depth-1 blocks.
Add depth≥2 blocks GENEROUSLY for major concepts — at least one "example" or "derivation" per key concept. These are REAL authored explanations that extend the standard lesson; never fabricate filler. The standard (depth-1) blocks already form the complete lesson; deeper ones let the learner drill where they want to go further.`
      : '';

  const system = [
    baseSystem,
    codeAuditLine,
    depthLine,
    // Course Lessons — additive, layered on top of (never replacing) the teaching-arc shaping
    // depthLine just produced. See GenerateLiveOpts.lesson / course/lessonSpine.ts.
    opts.lesson?.directive ?? '',
    sectionLine,
    topicLockLine,
    dateLine,
    photoLine(tier),
    actionMenu,
    countLine,
    explicitCountLine,
    formRequestLine,
    specialistLine,
    multiPartLine,
    relatedLine,
    planningDepthLine,
    levelLine,
    arc.directive,
    complexity === 'rich' ? rhythmDirective() : '',
    complexity === 'rich' && heroPicks.length >= 2
      ? `HERO PICKS — build the canvas AROUND these specialized components, chosen from the library for THIS exact question: ${heroPicks.join(', ')}. Use at least TWO of them; don't collapse to a wall of the common types.`
      : '',
    noLiveDataLine,
    groundedSourcesLine,
    liveStatusLine,
    searchDateLine,
    narrationFirst,
    spokenLine,
    recentLine,
    memoryLine,
    personalLine,
    correctsLine,
    bendLine,
    trackLine,
    offerAnnotate ? annotateMenu(annotatableBases) : '',
    synthesize ? synthesisMenu() : '',
    offerSvg ? svgBlockMenu() : '',
    // Last line of the prompt, immediately before the conversation — deliberately.
    emitReminder,
  ]
    .filter(Boolean)
    .join('\n\n');
  // Cap to the screen target; a small local model stays a touch lighter so it doesn't stall.
  // A depth request earns headroom so there's room to actually go deeper.
  // Rich asks on capable models also get a separate DEEP_BLOCKS allowance for the depth≥2
  // drawer content — those blocks don't appear on the main canvas, so they don't inflate what
  // the learner sees at first paint.
  const maxBlocks =
    (tier === 'small' ? Math.min(9, target) : target) +
    (deepen ? (tier === 'small' ? 1 : 3) : 0) +
    (complexity === 'rich' && tier !== 'small' ? DEEP_BLOCKS : 0);
  // Reasoning effort: cheapest level that fits the ask, nudged by the user's quality dial.
  // Most turns are visual composition → minimal; a hard ask → a notch up. Providers
  // without the knob (everything but Gemini today) simply ignore it.
  const thinkingLevel = thinkingLevelFor(complexity, userText, caps.quality);
  // Sampling temperature from the same zero-cost classifiers: precise asks (math, debug)
  // run cold for a repeatable answer; creative asks (brainstorm) run hot for variety; the
  // rest keep the proven 0.3. Every adapter honors it (Anthropic only overrides to 1 when
  // its extended thinking fires — correct, since Claude reasons at temp 1 by design).
  const temperature = temperatureFor(complexity, intent, userText);
  // Output budget, sized to the ACTUAL canvas. Each enriched block (charts/compares with
  // footers, units, colors) is ~150 verbose-JSON tokens, plus the title/sub/narration/chips
  // envelope — so a 12-block canvas needs ~1900+ just for the JSON. The old flat 1800 cut a
  // full canvas off mid-object, which fails the final JSON.parse and drops the turn to a
  // single raw-text card. On Gemini, thinking tokens ALSO draw from maxOutputTokens, so a
  // few hundred can starve the JSON entirely — we add explicit thinking headroom on top.
  const maxTokens = outputBudget(
    maxBlocks,
    cfg.provider,
    thinkingLevel,
    deepen,
    explicitItemCount(userText),
    cfg.model,
  );
  // Keep a long conversation cheap: resend only the last few turns verbatim + a short recap
  // of older ones, so per-turn input cost stays ~flat however long the chat runs.
  const sendHistory = buildSendHistory(history, KEEP_RECENT_TURNS, {
    focusTopic: pinnedTopic || undefined,
  });

  // Whether THIS ask actually needs fresh info — the gate that keeps ordinary turns from
  // ever paying for (or waiting on) a search.
  const wantsFresh = searchMode !== 'off' && needsFreshInfo(userText);
  // A request for a real DOCUMENT/PDF needs a real, WORKING url, and the model's memory yields
  // dead links — grounding (which surfaces actual .pdf URLs) earns its keep here. (Images go
  // through generation and video isn't offered, so neither benefits from a web-page search.)
  const wantsRealDoc =
    /\b(pdf|whitepaper|white paper|the paper|the document|the report|the article|the spec|the manual|the filing)\b/i.test(
      userText,
    );
  // Real-time grounding uses the provider's OWN search (Gemini google_search). We PRE-GATE so
  // obvious no-search turns (a poem, arithmetic) never even offer the tool — then the model's
  // Dynamic Retrieval makes the final call, only actually searching (and only then billing)
  // when its own confidence says it needs live data. Cost stays proportional to need, and the
  // monthly free grounding quota covers normal use.
  const useNativeSearch =
    searchMode === 'realtime' &&
    !!adapter.capabilities.nativeWebSearch &&
    (wantsFresh || wantsRealDoc);
  // URL reading: when the message contains a link and the provider can fetch it natively,
  // let it (behind the same search consent — never silent).
  const hasUrl = /\bhttps?:\/\/\S+/i.test(userText);
  const useUrlContext = hasUrl && searchMode !== 'off' && !!adapter.capabilities.nativeWebSearch;
  const tools =
    useNativeSearch || useUrlContext
      ? {
          ...(useNativeSearch ? { webSearch: true } : {}),
          ...(useUrlContext ? { urlContext: true } : {}),
        }
      : undefined;

  // Real-time grounds ONLY through the provider's own native search — 'free' mode and the
  // keyless/keyed app-side retrieve-then-read fallback are retired, so a provider without
  // native search simply has no grounding path (the "NO LIVE DATA" honesty gate above already
  // covers a genuinely fresh/live ask in that case). Native-search providers ground themselves
  // in the generate call below; their citations come back as out.sources.
  let sources: WebSource[] = [];
  let userForModel = userText;
  if (useNativeSearch) {
    // Native grounding still shows the consent indicator — the search happens inside the
    // model call, and the real source URLs come back via out.sources (parsed below).
    opts.onActivity?.('searching');
  }

  // Pinned on-screen elements: the user tapped "ask about this" on one or more blocks of the
  // current answer. Their real rendered props are prepended like search grounding so the model
  // answers about exactly those elements (real-data-only — this is shown data, never invented).
  if (opts.selectedBlocks?.length) {
    const selectedContext = buildSelectedBlockContext(
      opts.selectedBlocks,
      opts.filledBlanks ? 'complete' : 'ask',
    );
    if (selectedContext) userForModel = `${selectedContext}\n\n${userForModel}`;
  }

  // Ink gestures: the user marked the answer (circled a value, crossed one out, drew an arrow…).
  // Translated to plain instructions and prepended directly ABOVE the selected-block data they
  // reference (the marked parts' blocks were merged into selectedBlocks). Real-data-only.
  if (opts.inkIntents?.length) {
    const byId = new Map(
      (opts.selectedBlocks ?? []).filter((b) => b.id).map((b) => [b.id as string, b] as const),
    );
    const inkContext = buildInkIntentContext(opts.inkIntents, (id) => byId.get(id));
    if (inkContext) userForModel = `${inkContext}\n\n${userForModel}`;
  }

  // The Blank Space: the values the user filled into the prior answer's holes, so a refine turn
  // completes the same answer with the user's real inputs rather than guessing them.
  if (opts.filledBlanks) {
    const filledContext = buildFilledBlankContext(opts.filledBlanks);
    if (filledContext) userForModel = `${filledContext}\n\n${userForModel}`;
  }

  // Personalize with what we remember about the user (opt-in, local-only). Prepended like
  // search grounding so it sits beside the question — advisory, the current question wins.
  if (memoryActive) {
    // Rank by relevance to THIS question (plus recency + trust) before trimming to budget, so the
    // few cards that fit are the ones that actually bear on the ask — not just the newest.
    const ranked = rankForInjection(getMemoryNodes(), userText);
    const memoryContext = buildMemoryContext(ranked);
    if (memoryContext) userForModel = `${memoryContext}\n\n${userForModel}`;
  }

  // Build + emit a renderable spec from a (partial or final) response, applying the
  // same layout + image fill the final canvas gets. Shared by the streaming reveal and
  // the pre-repair full emit so progressive blocks never jump when the turn settles.
  // Each emit re-validates the blocks-so-far into entirely fresh objects, so without care
  // every partial hands React a canvas of unfamiliar references and every settled card
  // re-renders for each block that completes after it — O(blocks²) renders per turn. The
  // `lastEmitted` pass restores identity: a block whose content is unchanged from the
  // previous emit is re-sent as the SAME object, so the canvas's memoized cards skip it.
  let lastEmitted: Block[] = [];
  const emitSpec = (resp: LiveResponse): void => {
    if (!opts.onPartial) return;
    const tiled = adaptiveCols(resp.blocks, (b) => catalogSpan((b as { type: string }).type));
    fillDocEmbeds(tiled);
    const blocks = tiled.map((b, i) =>
      i < lastEmitted.length && sameJson(b, lastEmitted[i]) ? lastEmitted[i] : b,
    );
    lastEmitted = blocks;
    const composedNow: LiveResponse = { ...resp, blocks };
    opts.onPartial({ spec: toSpec(composedNow, sources), narration: resp.narration });
  };

  // Progressive reveal: as each block finishes streaming, validate the blocks-so-far
  // and emit a partial spec so the canvas grows WITH the spoken narration.
  let buf = '';
  let blockStream = new ArrayStreamScanner('blocks');
  let lastCount = 0;
  let lastPending: string | null = null;
  let thinking = false;
  // Wraps the raw delta stream: reasoning tokens drive the "Thinking…" cue and are NEVER buffered
  // (they'd corrupt the answer JSON); content tokens end the thinking phase and feed the
  // progressive-reveal parse. Always a wrapper so reasoning is filtered even on non-streamed turns.
  const streamDelta = (chunk: string, meta?: { reasoning?: boolean }): void => {
    if (meta?.reasoning) {
      if (!thinking) {
        thinking = true;
        opts.onThinking?.(true);
      }
      return;
    }
    // The first real content fragment means the model has stopped thinking and started answering.
    if (thinking) {
      thinking = false;
      opts.onThinking?.(false);
    }
    onDelta?.(chunk);
    if (!opts.onPartial) return;
    buf += chunk;
    // The scanner walks each delta exactly once (it keeps its cursor and brace/string state
    // between calls, reading only buf's unseen tail), so parsing a whole turn costs one pass
    // over the stream — however many deltas it arrives in — and each finished block is
    // JSON.parsed once.
    blockStream.scan(buf);
    // Announce the kind of the block being built the instant its "type" key parses. Resolve the
    // raw type to its primary data shape here (the engine holds the catalog), so the skeleton can
    // be labeled without the turn state reaching the catalog itself.
    if (opts.onPending) {
      const pending = blockStream.pendingType();
      if (pending !== lastPending) {
        lastPending = pending;
        opts.onPending(pending ? (catalogFacts(pending)?.dataShapes?.[0] ?? null) : null);
      }
    }
    const rawBlocks = blockStream.items;
    if (rawBlocks.length <= lastCount) return;
    lastCount = rawBlocks.length;
    const partial = validateLiveResponse(
      {
        narration: extractNarration(buf) ?? '',
        title: extractStringField(buf, 'title') ?? '',
        sub: '',
        blocks: [...rawBlocks],
      },
      allowed,
      maxBlocks,
      sources.length > 0,
    );
    if (partial?.blocks.length) emitSpec(partial);
  };

  // The request the adapter sends. History is the compacted send-history; thinkingLevel and
  // tools are honored by adapters that support them and ignored by those that don't.
  // systemBase is the stable liveSystemPrompt prefix — Anthropic uses it to split the
  // system into a cached first block + uncached per-turn suffix (see anthropic.ts).
  const baseReq: Omit<LiveRequest, 'user'> = {
    system,
    systemBase: liveSystemPrompt(tier, complexity),
    history: sendHistory,
    blockTypes,
    complexity,
    maxTokens,
    thinkingLevel,
    temperature,
    // Thread the caller's abort into the adapter so a superseded turn stops the LLM fetch
    // (and its stream) instead of running to completion and wasting the whole token budget.
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(tools ? { tools } : {}),
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
  };

  let raw: string | object;
  try {
    const genStart = performance.now();
    const out = await adapter.generate({ ...baseReq, user: userForModel }, cfg, streamDelta);
    raw = out.raw;
    // Learn this model's throughput from the turn we just ran, so a repeatedly-slow model earns the
    // leaner menu/budget above on the NEXT turn. Best-effort + storage-backed; a no-op off-DOM.
    recordTurnSpeed(
      cfg.model,
      typeof raw === 'string' ? raw.length : JSON.stringify(raw).length,
      performance.now() - genStart,
    );
    // Native grounding returns the real source URLs it used — show those as citations.
    if (out.sources?.length) {
      sources = out.sources.map((s) => ({ title: s.title, url: s.url }));
      opts.onSources?.(sources);
    }
  } catch (err) {
    // When native grounding hits a rate-limit (429) — the norm on a free-tier key, where
    // Google Search grounding is throttled separately from ordinary generation — we recover
    // WITHOUT surfacing an error. How we recover depends on what the question needs:
    //
    //  • An ENCYCLOPEDIC ask (population, capital, history) → fall back to keyless Wikipedia and
    //    retry ungrounded. The user gets a real, cited answer on a small delay.
    //  • A genuinely LIVE ask (score, price, today's news) → Wikipedia CANNOT answer it, and
    //    citing an encyclopedia for a live question fakes grounding. So we DON'T fall back to
    //    Wikipedia; we retry ungrounded and let the base prompt's "never fabricate live data"
    //    rule make the model answer honestly, with no misleading citations.
    const isRateLimit = err instanceof Error && /\b429\b/.test(err.message);
    if (useNativeSearch && isRateLimit) {
      const volatile = needsLiveData(userText);
      try {
        if (!volatile) {
          opts.onActivity?.('searching');
          const wikiProvider = getSearchProvider('wikipedia');
          const wantCount = requestedResultCount(userText);
          const cap = resultLimit(wantCount);
          const fallbackResults = await wikiProvider.search(searchQuery(userText), {
            signal: opts.signal,
            limit: wantCount,
          });
          if (fallbackResults.length) {
            userForModel = `${buildSearchContext(userText, fallbackResults, cap)}\n\nQuestion: ${userText}`;
            sources = toSources(fallbackResults, cap);
            opts.onSources?.(sources);
          }
        }
        // Retry without native search tools so we don't hit the rate limit again. For a volatile
        // ask this is an honest ungrounded retry (no fake Wikipedia citation).
        // Reset the streaming-parse state first: the failed first attempt may already have
        // streamed partial content into buf, and reusing streamDelta as-is would splice this
        // retry's real output onto that stale prefix, corrupting the progressive block/narration
        // parse (and the narration actually spoken, via onDelta) for a turn that never happened.
        buf = '';
        blockStream = new ArrayStreamScanner('blocks');
        lastCount = 0;
        lastPending = null;
        const out2 = await adapter.generate(
          { ...baseReq, tools: undefined, user: userForModel },
          cfg,
          streamDelta,
        );
        raw = out2.raw;
      } catch (err2) {
        // The friendly LiveError below deliberately hides provider wire detail from the user —
        // log the real cause so a rejected request (a malformed field, an unsupported tool on
        // this model) is diagnosable from devtools instead of just "couldn't answer".
        console.error('[live] provider call failed', err2);
        const error = describeLiveError(err2, cfg.provider);
        return { spec: errorSpec(error), narration: '', tier, error };
      }
    } else {
      // The provider call failed — there is NO answer. Surface a typed error (mapped to plain
      // language) so the UI renders an honest, recoverable error state, never a fake finding.
      console.error('[live] provider call failed', err);
      const error = describeLiveError(err, cfg.provider);
      return { spec: errorSpec(error), narration: '', tier, error };
    }
  } finally {
    // Native search ran inside the call; clear the consent indicator now it's done. This is the
    // single clear point for every path (success, 429-recovery, Wikipedia fallback, hard
    // failure) — the early returns above still trigger it, so no branch leaves it stuck on.
    if (useNativeSearch) opts.onActivity?.(null);
  }

  let validated = validateLiveResponse(raw, allowed, maxBlocks, sources.length > 0);

  // RECOVERY — a turn must never COLLAPSE to the lone "Here's what I can say" card. That happens when
  // the first pass returns null (unparseable/truncated, or no title + no valid blocks), an empty
  // canvas (0 blocks), or — for a SUBSTANTIVE ask — a single lone card (which the product already
  // treats as a failure). Re-ask ONCE for the WHOLE answer with a firm floor before degrading to
  // text. We target the COLLAPSE only — an ordinary thin-but-real 2+ block answer is left alone (the
  // classifier + depth budget size that), so this adds a call only when the turn would otherwise be a
  // non-answer.
  const RECOVERY_MIN_BLOCKS = 6;
  const wouldCollapse =
    !validated ||
    validated.blocks.length === 0 ||
    (complexity !== 'brief' && validated.blocks.length < 3);
  let didRecover = false;
  if (opts.repair !== false && wouldCollapse) {
    didRecover = true;
    try {
      const recoverCap = Math.max(maxBlocks, RECOVERY_MIN_BLOCKS);
      const floor = complexity === 'rich' ? 5 : 3;
      // No streamDelta on the retry: the stream buffer already holds the failed first pass, so
      // re-streaming would corrupt block parsing — mirror the repair pass (line ~1322) and take the
      // result whole. Tools off so we don't re-bill a search just to restructure.
      const out2 = await adapter.generate(
        {
          ...baseReq,
          history: [...sendHistory, { role: 'user', content: userForModel }],
          user: recoverInstruction(userText, floor),
          maxTokens: outputBudget(
            recoverCap,
            cfg.provider,
            thinkingLevel,
            true,
            explicitItemCount(userText),
            cfg.model,
          ),
          tools: undefined,
        },
        cfg,
      );
      const second = validateLiveResponse(out2.raw, allowed, recoverCap, sources.length > 0);
      // Keep whichever pass produced the richer canvas — never regress if the retry did worse.
      if (second && second.blocks.length > (validated?.blocks.length ?? 0)) validated = second;
    } catch {
      /* recovery is best-effort — fall through to whatever the first pass gave */
    }
  }

  if (!validated || !validated.blocks.length) {
    // Still nothing renderable after recovery. NEVER show raw JSON — salvage the narration (emitted
    // first, so it's almost always complete; works for Gemini's parsed-object response too) and
    // present + speak that, so a collapsed turn degrades to the spoken answer, not a wall of braces.
    const salvaged = salvageNarration(raw) || validated?.narration || '';
    return { spec: fallbackSpec(salvaged), narration: salvaged, tier };
  }

  // Accuracy guardrail, COST-AWARE — two tiers so we spend model calls sparingly:
  //  1) autoFix: deterministic, FREE. Normalizes breakdown shares to 100 and aligns
  //     chart data to labels — clears the COMMON issues with no round-trip.
  //  2) self-correction: ONE extra model call, and ONLY for the rare semantic
  //     issues code can't fix (a 1-point "trend", a 1-option comparison).
  // Net: a normal turn = a single call; most repairs cost nothing; only a true
  // mistake costs one more. We keep the already-spoken narration so audio matches.
  let result = autoFix(validated);
  const issues = checkConsistency(result, complexity);
  // Skip the consistency repair when recovery already fired a second call — bounds a collapsed turn
  // to at most TWO model calls (initial + recovery), never three. autoFix still ran, so the common
  // structural issues are already fixed deterministically.
  if (!didRecover && opts.repair !== false && hasHardIssue(issues)) {
    try {
      const priorJson = typeof raw === 'string' ? raw : JSON.stringify(raw);
      // Reuse the compacted send-history (cheap), then append THIS turn + the answer being
      // corrected, so the repair sees exactly what to fix without resending the whole chat.
      const repairHistory: ChatMessage[] = [
        ...sendHistory,
        { role: 'user', content: userForModel },
        { role: 'assistant', content: priorJson },
      ];
      // For a staple-collapse (low-variety), hand the repair the specialized components this turn
      // offered but the model skipped — concrete targets beat a vague "vary it". Heroes = the
      // selected types that aren't part of the always-on standard dozen.
      const usedTypes = new Set(result.blocks.map((b) => (b as { type: string }).type));
      const unusedHeroes = selection.types
        .filter((t) => !FRONTIER_BLOCK_TYPES.has(t) && !usedTypes.has(t))
        .slice(0, 8);
      // No tools on the repair pass — it fixes block structure, it doesn't re-search (so a
      // grounded turn is never billed a second search query just to correct a chart).
      const out2 = await adapter.generate(
        {
          ...baseReq,
          history: repairHistory,
          user: repairInstruction(issues, unusedHeroes),
          tools: undefined,
        },
        cfg,
      );
      const repaired = validateLiveResponse(out2.raw, allowed, maxBlocks, sources.length > 0);
      if (repaired) {
        const fixed2 = autoFix(repaired);
        const hardBefore = issues.filter((i) => HARD_ISSUE_CODES.has(i.code)).length;
        const hardAfter = checkConsistency(fixed2).filter((i) =>
          HARD_ISSUE_CODES.has(i.code),
        ).length;
        // Keep the already-spoken narration AND the facts the first response surfaced — the
        // repair only fixes block consistency and isn't asked to re-emit memory, so without
        // this the original turn's real facts would be silently dropped.
        if (hardAfter < hardBefore)
          result = {
            ...fixed2,
            narration: result.narration,
            memory: result.memory ?? fixed2.memory,
            understood: result.understood ?? fixed2.understood,
            corrects: result.corrects ?? fixed2.corrects,
            spoken: result.spoken ?? fixed2.spoken,
          };
      }
    } catch {
      /* repair is best-effort — keep the deterministically-fixed answer */
    }
  }

  // Final layout pass: tile the blocks into full, balanced, sliver-free rows so the
  // canvas reads like a composed dashboard even when the answer is short.
  const composed: LiveResponse = {
    ...result,
    blocks: adaptiveCols(result.blocks, (b) => catalogSpan((b as { type: string }).type)),
  };
  fillDocEmbeds(composed.blocks);
  // Recover citations the adapter couldn't read. Gemini returns EMPTY groundingMetadata when
  // google_search runs with JSON output, so a genuinely-grounded answer arrives with no
  // adapter-side sources — but the model lists the URLs it used inline (see groundedSourcesLine),
  // so merge those in, deduped by URL. Gated to a real grounded turn (useNativeSearch) so an
  // ungrounded answer can never smuggle in a fabricated "source".
  if (useNativeSearch && result.sources?.length) {
    const seen = new Set(sources.map((s) => s.url));
    for (const s of result.sources) {
      if (s.url && !seen.has(s.url)) {
        seen.add(s.url);
        sources.push(s);
      }
    }
    if (sources.length) opts.onSources?.(sources);
  }
  // When the turn was grounded in real web sources, mark the opening insight "provable" so
  // the surface offers a "Prove it" affordance — tapping it shows the actual sources the
  // answer was built on (an honest receipts panel, not the demo's fabricated file rows).
  if (sources.length) {
    const lead = composed.blocks.find((b) => (b as { type: string }).type === 'insight') as
      | (Block & { prove?: boolean })
      | undefined;
    if (lead) lead.prove = true;
  }
  // Keep the spoken line conversational for the ask: a tweet for a trivial answer, up to a
  // couple of sentences for a rich one — the canvas carries the depth, never the monologue.
  const narration = capSpoken(result.narration, complexity);
  // The voice twin tracks the same ask-aware length bound as the shown narration.
  const spoken = result.spoken ? capSpoken(result.spoken, complexity) : undefined;
  return {
    spec: toSpec(composed, sources),
    narration,
    tier,
    ...(result.continuity ? { continuity: result.continuity } : {}),
    ...(result.tour ? { tour: result.tour } : {}),
    ...(caps.memoryEnabled && result.memory ? { memory: result.memory } : {}),
    ...(result.understood ? { understood: result.understood } : {}),
    ...(result.corrects ? { corrects: result.corrects } : {}),
    ...(spoken ? { spoken } : {}),
  };
}

/** The IMAGES prompt line: a capable model may supply REAL direct image URLs (found images,
 *  never generated) restricted to a few stable free-commercial hosts the validator's allowlist
 *  accepts — an invented or risky URL is simply dropped. A small model is never asked for a URL
 *  (it hallucinates them), so this returns '' there and the photo block stays off the menu. */
function photoLine(tier: 'frontier' | 'mid' | 'small'): string {
  if (tier === 'small') return '';
  const url =
    'a few real photo URLs in "candidates" (an ARRAY, best first) — DIRECT https image links ending in .jpg/.jpeg/.png/.webp to FREE-COMMERCIAL photos on Wikimedia (upload.wikimedia.org), Unsplash (images.unsplash.com), Pexels (images.pexels.com), Pixabay (cdn.pixabay.com), or NASA. Give 2-3 per image; we verify each one actually loads and drop any that fail, so offer only well-known, stable assets and never invent or guess a URL';
  return [
    `IMAGES — when a picture genuinely helps, use a "photo" block for ONE image or a "gallery" block for SEVERAL. For a photo provide ${url}. ALWAYS give a photo a short "caption" saying what it shows — if every URL fails to load, the caption becomes the card, so a photo is never wasted. For a gallery, each item is {"label": what it shows, "candidates"?: [<real direct-image URLs>]}: put 2-3 real, stable direct-image URLs (.jpg/.png/.webp) in "candidates" when you know them — we keep whichever loads and drop the rest; a label with no usable URL shows no image. Skip images unless they truly add something.`,
    'DOCUMENTS — when the user asks to SEE a paper / document / PDF, use a "pdfreader" block with the real PDF URL in "file" (a known, stable https .pdf — e.g. the canonical source; never invent a URL). A same-origin PDF opens in the reader; a verified external URL is shown as an explicit open-in-new-tab link.',
  ].join('\n');
}

/** For a pdfreader pointing at an EXTERNAL PDF whose host blocks framing, set `embedSrc` to the
 *  same-origin /pdf proxy URL so the document previews inline instead of falling back to a link.
 *  Only allowlisted https PDF hosts are proxied (safePdfUrl); a local/same-origin file or any
 *  non-allowlisted external URL is left untouched and the renderer exposes it only as a
 *  scheme-gated "Open" link. */
function fillDocEmbeds(blocks: Block[]): void {
  // The /pdf proxy is dev-only. Without it, /pdf?url=… hits the SPA fallback and serves
  // index.html — which an iframe would render as our own homepage. So only route through the
  // proxy when it actually exists (dev); a build without it leaves embedSrc unset and the
  // pdfreader shows the "Open the PDF" link instead. (optional-chained for the Node eval path.)
  if (!import.meta.env?.DEV) return;
  for (const b of blocks) {
    if ((b as { type: string }).type !== 'pdfreader') continue;
    const props = (b as { props: { file?: string; embedSrc?: string } }).props;
    if (props.embedSrc || !props.file) continue;
    const safe = safePdfUrl(props.file);
    if (safe) props.embedSrc = pdfProxyUrl(safe);
  }
}
