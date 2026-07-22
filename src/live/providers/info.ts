// info.ts — provider UI metadata, kept apart from the adapters on purpose.
//
// The adapter registry (index.ts) imports every provider implementation, and each adapter pulls
// the request/response schema → the component catalog (~300 KB). This metadata, by contrast, is
// just labels and model lists for the picker and the landing page. Keeping it in its own
// adapter-free leaf lets light, eager consumers (e.g. the flagship landing's provider strip) show
// "works with Gemini / Claude / GPT / …" WITHOUT dragging the whole provider+catalog graph onto
// first paint. Anything that actually runs a turn imports the adapters from index.ts instead.
import type { ProviderId } from '../../types/mavea';

// Model catalogs move quickly. This date is deliberately exercised by truthfulness-copy.test.ts;
// after 45 days the release gate fails until the IDs, prices, and official pages are rechecked.
export const MODEL_CATALOG_AUDIT = {
  verifiedOn: '2026-07-17',
  maxAgeDays: 45,
  sources: {
    gemini: 'https://ai.google.dev/gemini-api/docs/models',
    anthropic: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    openai: 'https://developers.openai.com/api/docs/models/all',
    grok: 'https://docs.x.ai/developers/models',
    openrouter: 'https://openrouter.ai/models',
  },
} as const;

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Prefilled model — the fast+accurate default for this provider. Empty for gateways
   *  (OpenRouter) where there's no single sensible default: the user supplies their own. */
  defaultModel: string;
  /** Placeholder shown when there's no default (gateways), to hint the expected id shape. */
  modelPlaceholder?: string;
  suggestedModels: string[];
  /** Whether the provider requires an API key before a turn can run. */
  needsKey: boolean;
  /** Where to get a key for this provider (the console/signup page) — shown as a "Get a key" link
   *  on the Connect step so a keyless first-time visitor isn't stuck once they see the field. */
  keyUrl?: string;
  /** True when that page issues a genuinely free tier (not just trial credit), so the link can
   *  honestly say "Get a free key" instead of overstating a paid provider's offer. */
  keyFree?: boolean;
  /** Hidden from the picker UI but kept in the registry so its adapter and any saved config
   *  keep working. Use VISIBLE_PROVIDERS for anything user-facing. */
  hidden?: boolean;
  /** One-line operating-point hint shown in the UI. */
  hint: string;
  /** Optional per-model note (RAM footprint / when to pick it) shown beside the model. */
  modelNotes?: Record<string, string>;
  /** How this provider grounds answers in live web data, shown in the picker so users know
   *  what to expect before they pick: 'native' = the provider searches server-side (Gemini
   *  google_search, OpenRouter's web tool, Anthropic/OpenAI/Grok's own web_search); 'app' =
   *  Mavéa's own retrieve-then-read (free Wikipedia, or a keyed Brave/Tavily) does the
   *  grounding — used elsewhere (Prism/Why-Machine), not by any Live provider today; 'local'
   *  = none. */
  search: 'native' | 'app' | 'local';
}

export const PROVIDERS: ProviderInfo[] = [
  // The curated menus below are deliberately the ECONOMICAL tier: each provider defaults to its
  // fast, low-cost model (the gemini-3.1-flash-lite class) with one modest step-up beside it.
  // Flagship-priced models are intentionally NOT suggested — the model field takes any id, and
  // the picker's footer says so and links each provider's full catalog.
  {
    id: 'gemini',
    label: 'Gemini · Google',
    defaultModel: 'gemini-3.1-flash-lite',
    suggestedModels: ['gemini-3.1-flash-lite', 'gemini-3.5-flash'],
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    keyFree: true,
    hint: 'Fast and efficient — recommended.',
    search: 'native', // google_search grounding, server-side
    modelNotes: {
      'gemini-3.1-flash-lite': 'fast · light',
      'gemini-3.5-flash': 'a step up in quality · still quick',
    },
  },
  {
    id: 'anthropic',
    label: 'Claude · Anthropic',
    defaultModel: 'claude-haiku-4-5',
    suggestedModels: ['claude-haiku-4-5', 'claude-sonnet-5'],
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    hint: 'Fast, efficient default.',
    search: 'native', // web_search server tool, via Structured Outputs (see anthropic.ts)
    modelNotes: {
      'claude-haiku-4-5': 'fast · light',
      'claude-sonnet-5': 'a step up in quality · 1M ctx',
    },
  },
  {
    id: 'openai',
    label: 'GPT · OpenAI',
    // The GPT-5 family are reasoning models: the adapter sends max_completion_tokens +
    // reasoning_effort and omits the (fixed-at-1) temperature automatically. Default is nano —
    // the lightest, highest-throughput option — with mini and the newest generation as step-ups.
    defaultModel: 'gpt-5.4-nano',
    suggestedModels: ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.6-luna'],
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    hint: 'Fast, efficient default.',
    search: 'native', // web_search server tool on the Responses API (see openaiResponsesCompatible.ts)
    modelNotes: {
      'gpt-5.4-nano': 'fastest · highest throughput',
      'gpt-5.4-mini': 'a step up in quality',
      'gpt-5.6-luna': 'newest generation',
    },
  },
  {
    id: 'grok',
    label: 'Grok · xAI',
    // xAI's OpenAI-compatible API. 4.3 is the current fast, low-cost general model; 4.5 is the
    // flagship step-up. The model field remains free text for users who need another option.
    defaultModel: 'grok-4.3',
    suggestedModels: ['grok-4.3', 'grok-4.5'],
    needsKey: true,
    keyUrl: 'https://console.x.ai',
    hint: 'Fast, efficient default.',
    search: 'native', // xAI's web_search tool on its Responses API (see openaiResponsesCompatible.ts)
    modelNotes: {
      'grok-4.3': 'fast · light',
      'grok-4.5': 'a step up in quality · current flagship',
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    // One key, hundreds of models — so there's no default and no curated list: the user pastes
    // exactly the model they want (the gateway IS the escape hatch for anything the first-party
    // menus don't suggest). The picker's footer links the full openrouter.ai catalog.
    defaultModel: '',
    modelPlaceholder: 'e.g. google/gemini-3.5-flash',
    suggestedModels: [],
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    keyFree: true,
    hint: 'One key, 100s of models — paste any model id.',
    search: 'native', // openrouter:web_search server tool (model-driven)
  },
];

/** Providers offered in the picker UI. Hidden entries stay in PROVIDERS so their adapter and
 *  any saved config keep working — they're just not selectable. Use this list anywhere the
 *  user chooses a provider; use PROVIDERS for registry/adapter lookups. */
export const VISIBLE_PROVIDERS: ProviderInfo[] = PROVIDERS.filter((p) => !p.hidden);

export function providerInfo(id: ProviderId): ProviderInfo {
  const info = PROVIDERS.find((p) => p.id === id);
  if (!info) throw new Error(`unknown provider ${id}`);
  return info;
}
