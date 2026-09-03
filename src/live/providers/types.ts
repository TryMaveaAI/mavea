// types.ts — the ProviderAdapter seam. ONE interface, five implementations
// (anthropic, openai, gemini, openrouter, grok). An adapter is pure transport + shaping:
// it talks to a provider and returns RAW model output. It does NOT validate,
// repair, or render — that stays in liveSchema.validateLiveResponse (the single
// defense-in-depth core) so every provider goes through identical safety.
import type { ModelConfig, ProviderId, ProviderCapabilities } from '../../types/mavea';
import type { Attachment } from '../attachments';
import type { AskComplexity } from '../select/complexity';

/** One prior turn in the rolling history handed to the model. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** How hard the model should think before answering. Maps to a provider's reasoning
 *  control (e.g. Gemini's `thinkingConfig.thinkingLevel`). Most Live turns are visual
 *  composition, not deep reasoning, so `minimal` is the fast/cheap default; a genuinely
 *  hard ask steps up to `low`. Providers without the knob ignore it. */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/** Live turn capabilities that an adapter can act on natively. Provider-agnostic flags;
 *  an adapter ignores any it can't serve (so callers never branch per provider). */
export interface LiveRequestTools {
  /** Ground the answer with the provider's native web search (cited, real-time). Only
   *  honored by adapters whose `capabilities.nativeWebSearch` is true. */
  webSearch?: boolean;
  /** Let the model read URLs found in the user's text (provider-native URL reading). */
  urlContext?: boolean;
  /** REQUIRE the search tool rather than merely offering it. Attaching a tool leaves the choice to
   *  the model (`tool_choice` defaults to auto), and a small model routinely declines: observed on
   *  gpt-5.4-nano, which answered "Bitcoin price in USD" from training memory with zero citations
   *  across two attempts at medium and then high reasoning effort, while the prompt insisted on
   *  searching. Set this only where an ungrounded answer is worthless by definition — a dashboard
   *  check, whose whole contract is "no source, no number" — never on a general turn, where forcing
   *  a search for a question that needs none would spend a call to learn nothing.
   *
   *  BEST-EFFORT BY PROVIDER, necessarily: only OpenAI's Responses API documents a force value
   *  (`tool_choice: {type:'web_search'}`), so only that adapter hard-requires. Anthropic pins
   *  tool_choice to auto BECAUSE forcing a specific tool stops Claude's web_search loop outright
   *  (see anthropic.ts's header), Gemini's google_search is a built-in with no force lever, and
   *  Grok/OpenRouter have documented none. Everywhere the flag can't bind, the existing defenses
   *  still hold: the prompt demands search, the grounding gate discards uncited values, and the
   *  in-pass retry re-asks with a sharpened demand. */
  requireSearch?: boolean;
}

/** Everything an adapter needs to produce one Live turn. */
export interface LiveRequest {
  /** Human-readable ledger attribution for this billed call. Provider facades record it centrally. */
  usageLabel?: string;
  /** System prompt (LIVE_SYSTEM_PROMPT, possibly tier-tuned). Providers cache this. */
  system: string;
  /** The stable, tier-invariant base of the system prompt (liveSystemPrompt(tier)).
   *  Anthropic uses it to split system into a cached first block + uncached per-turn
   *  suffix, so the large stable prefix gets the ~90% cache discount every turn after
   *  the first. Omit → fall back to caching the whole system. */
  systemBase?: string;
  /** The full cacheable prefix, beginning with `systemBase`. Live uses the second segment for
   *  session-stable feature/menu guidance; Anthropic marks both segments independently, while
   *  implicit-cache providers send the combined prefix before history. */
  systemStable?: string;
  /** Rolling history (excludes the system prompt and the current user turn). */
  history: ChatMessage[];
  /** The current user question. */
  user: string;
  /** Files the user attached this turn (images / PDFs). Vision adapters inject them as a
   *  native image/document part; adapters that can't read a given file note it in text
   *  instead of dropping it. Omit → text-only turn. */
  attachments?: Attachment[];
  /** Hard output cap — keep tiny; less to generate = faster done. */
  maxTokens?: number;
  temperature?: number;
  /** The block types exposed for this turn (capability-tiered). Constrained-decoding
   *  adapters build their schema enum from this; omitted → the base 8. */
  blockTypes?: string[];
  /** How much canvas this ask deserves (see ../select/complexity). A schema-constrained
   *  adapter (Anthropic tool forcing, OpenAI json_schema) reads this to relax its blocks-array
   *  `minItems` for a genuinely 'brief' ask — otherwise the JSON schema itself forces padding
   *  onto an answer the user explicitly asked to keep short. Omit → the adapter's richer default. */
  complexity?: AskComplexity;
  /** Reasoning effort for this turn (adaptive by ask complexity). Omit → provider default. */
  thinkingLevel?: ThinkingLevel;
  /** Native tools to enable for this turn (web search / URL reading). Omit → none. */
  tools?: LiveRequestTools;
  /** Structured-output JSON schema for constrained-decoding adapters.
   *  An object overrides the adapter's default schema; `null` disables the schema constraint
   *  (free-form JSON); omit → the adapter's default (the canvas schema). Lets a non-canvas caller
   *  — e.g. the mindshape extractor — constrain the model to its OWN shape instead of being
   *  forced into the canvas shape. Adapters without constrained decoding ignore it. */
  format?: object | null;
  /** Abort the in-flight request when the turn is superseded (a new ask). Threaded into the
   *  adapter's fetch so an interrupted turn STOPS generating instead of running to completion
   *  (or the 60/90s timeout) and burning the full token budget. Omit → only the timeout aborts. */
  signal?: AbortSignal;
}

/** A web source surfaced by a provider's native grounding (title + URL). Mirrors the
 *  shape `generateLive` already uses so grounded citations render in the existing UI. */
export interface GroundingSource {
  title: string;
  url: string;
}

/** Readiness probe (mirrors the existing checkLiveReady shape). Never throws. */
export interface LiveProbe {
  ok: boolean; // provider reachable + credentials accepted
  model: boolean; // the configured model is available
  statusCode?: number; // HTTP status from the probe, if it got a response (e.g. 401, 404)
}

/** Optional per-delta metadata. `reasoning` marks a model "thinking" token (e.g. OpenRouter's
 *  `delta.reasoning`): surfaced so the UI can show a live "Thinking…" state, but NEVER folded
 *  into the answer JSON. */
export type DeltaMeta = { reasoning?: boolean };

/** Streamed raw-text delta. Lets the caller parse narration-first and reveal
 *  blocks as each `{…}` closes, so the face speaks within a few hundred ms. A reasoning model
 *  may emit thinking tokens before any answer content — those arrive with `meta.reasoning` so
 *  the caller can show progress instead of a frozen "Composing…". */
export type DeltaFn = (chunk: string, meta?: DeltaMeta) => void;

/** Token accounting for one turn, when the provider reports it. `cachedInput` is the slice
 *  of input billed at the cheap cached rate (implicit/explicit context caching) — the number
 *  that proves a long conversation is actually saving money. */
export interface TokenUsage {
  input: number;
  output: number;
  /** Input tokens served from cache (billed ~10% of normal). 0 = cold / no cache hit. */
  cachedInput: number;
}

/** Raw model output for one turn: a JSON string, or an already-parsed object
 *  (constrained-decoding adapters return the parsed object directly). */
export interface RawResult {
  raw: string | object;
  /** Real web sources the provider's native grounding used, if any. Surfaced so
   *  `generateLive` can render citations without a separate retrieve-then-read pass. */
  sources?: GroundingSource[];
  /** Token usage, when the provider reports it (used for cost/cache visibility). */
  usage?: TokenUsage;
}

/** One provider implementation. */
export interface ProviderAdapter {
  id: ProviderId;
  capabilities: ProviderCapabilities;
  /** Short, never-throws readiness probe. Answers "will a turn actually work?", so an adapter may
   *  spend a token to ask the generation endpoint itself — only call it when the user asked for a
   *  readiness verdict (setup, Recheck, a settled key/model change), never on speculation. */
  probe(cfg: ModelConfig): Promise<LiveProbe>;
  /**
   * Open the network path without asking for a verdict — for prewarming, where the result is
   * discarded and the only goal is a warm connection. Implement this wherever `probe` would cost
   * the user money; callers fall back to `probe` when it's absent (there, probing is already free).
   */
  warm?(cfg: ModelConfig): Promise<void>;
  /**
   * Produce one turn. Streams text deltas via onDelta (when the provider supports
   * it) and resolves with the full raw output. Rejects on network/credential
   * failure so the provider-agnostic generateLive can fall back gracefully.
   */
  generate(req: LiveRequest, cfg: ModelConfig, onDelta?: DeltaFn): Promise<RawResult>;
}

export type { ModelConfig, ProviderId, ProviderCapabilities };
