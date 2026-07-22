// The shared type contract for Mavéa: one canonical set of unions that every module imports,
// so the same vocabulary — phases, presence states, providers — is spoken everywhere.

export type { IconKey } from '../icons/icons';

/* ---- presence (these unions mirror the .presence CSS data-* selectors) ---- */
// `reading` is used by the upload flow. `idle`/`showing` have no dedicated CSS by design —
// they render the calm base face, so don't add styles for them.
export type PresenceState =
  | 'idle'
  | 'reading'
  | 'listening'
  // Live's "working" look: the same blooming rings as 'listening' but with no mic open —
  // shown while a turn generates so loading reads as the face thinking, not a spinner.
  | 'loading'
  | 'thinking'
  | 'speaking'
  | 'showing'
  | 'acting';
// The jelly's expression library — face + hue, one emotion at a time. `warm` (crescent squint,
// rose flush) and `concerned` (knit brows, ember hue) are the two read honestly from an
// answer's content (presence/expression.ts). The rest are reserved for moments that earn
// them: `celebrate` ≤1 a session on a genuinely positive verdict, `surprised` when Mavéa
// interjects on its own, `wink` for a playful sign-off, `curious`/`laugh`/`sleepy` for
// scripted beats, `focused` narrows the eyes for serious work.
export type Emotion =
  | 'neutral'
  | 'focused'
  | 'concerned'
  | 'warm'
  | 'celebrate'
  | 'laugh'
  | 'wink'
  | 'surprised'
  | 'curious'
  | 'sleepy';
export type Gaze = 'center' | 'down' | 'left' | 'right' | 'up';

/* ---- app phase / focus ---- */
export type Phase = 'home' | 'uploading' | 'canvas';
export type Focus = 'center' | 'corner';

/* ---- status pill ---- */
// '' is a real rendered state (the base presence-colored dot). Keep it.
export type StatusKind = '' | 'read' | 'think';
export interface Status {
  label: string;
  kind?: StatusKind;
}

/* ---- topics ----
   With dozens of conversations a literal union would be unwieldy, so the registry is keyed
   by string and validated at runtime. */
export type TopicId = string;

/* ---- presence signature colors (CSS var sets) ---- */
export type PresenceColorId = 'indigo' | 'violet' | 'aqua' | 'gold';
export interface PresenceColor {
  base: string;
  soft: string;
  deep: string;
  glow: string;
}

/* ---- Live mode: BYOK model configuration (shared across Settings UI + engine) ----
   Live mode wraps ANY model behind one ProviderAdapter (src/live/providers). These
   are the *config* types the UI and engine both reference; the adapter interface
   itself lives co-located in src/live/providers/types.ts. */
// 'openrouter' and 'grok' are OpenAI-compatible APIs: one key fans out to many models,
// sharing the OpenAI wire format and reusing the openaiCompatible adapter (see
// live/providers/openaiCompatible.ts). 'grok' is xAI's API (https://api.x.ai/v1).
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'grok';

/** What a given provider/model can do — drives the per-model accuracy+speed strategy. */
export interface ProviderCapabilities {
  /** Native guaranteed-valid-JSON output: Anthropic's Structured Outputs (a real JSON
   *  schema, validated), OpenAI/Grok/Gemini's loose json_object mode (valid JSON, but the
   *  shape isn't schema-locked — the open `props` field per block type doesn't fit a
   *  strict schema cleanly, see schema.ts). When true we skip re-prompting for JSON; when
   *  false we fall back to prompt-for-JSON + validateLiveResponse repair. */
  constrainedDecoding: boolean;
  /** Token streaming, so the face can speak narration-first while blocks generate. */
  streaming: boolean;
  vision: boolean;
  contextWindow: number;
  /** Rough capability tier — gates how many block types we expose to this model. */
  strengthTier: 'frontier' | 'mid' | 'small';
  /** Provider executes web search server-side (Anthropic/OpenAI/Grok web_search, Gemini
   *  google_search, OpenRouter `:online`). Every first-party Live adapter has this today;
   *  when false (e.g. a custom OpenAI-compatible endpoint with no search tool wired), a
   *  genuinely live/fresh ask gets generateLive's honest "NO LIVE DATA" refusal instead of
   *  a fabricated answer — there is no general retrieve-then-read fallback for ordinary
   *  Live turns (that's a separate, still-used mechanism for Prism/Why-Machine/ground
   *  grounding — see live/search/). Defaults to false when omitted. */
  nativeWebSearch?: boolean;
}

/** A user's connected model. Every provider is hosted BYOK, so `apiKey` is required to run. */
export interface ModelConfig {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  /** Optional base-URL override (self-hosted gateway, proxy path). */
  baseUrl?: string;
}
