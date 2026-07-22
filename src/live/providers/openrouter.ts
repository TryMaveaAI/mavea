// openrouter.ts — OpenRouter adapter. One key fans out to hundreds of models from
// many vendors (incl. free `:free` variants), all behind the OpenAI Chat Completions
// wire format — so it's a thin instantiation of openaiCompatible.ts. Routed through
// the same-origin /llm/openrouter proxy (→ https://openrouter.ai); its API lives under
// /api/v1, hence apiBase:'/api'. OpenRouter asks integrators to send HTTP-Referer +
// X-Title for attribution/leaderboards — harmless and recommended.
//
// Native web search via OpenRouter's `openrouter:web_search` server tool: the model
// decides when/how often to search across its own engine (Exa by default), and citations
// arrive on the SAME delta.annotations[].url_citation path the transport already parses.
// It needs a tool-calling-capable model (the recommended defaults are); search-native
// Perplexity Sonar models ground without it. Only injected when the turn asks for fresh data.
import { openaiCompatible } from './openaiCompatible';

export const openrouterAdapter = openaiCompatible({
  id: 'openrouter',
  proxyBase: '/llm/openrouter',
  apiBase: '/api',
  extraHeaders: {
    'HTTP-Referer': 'https://github.com/TryMaveaAI/mavea',
    'X-Title': 'Mavéa',
  },
  // middle-out compresses long conversation history from the middle, preserving the
  // system prompt and recent turns. Keeps cost flat as the chat grows without losing
  // recent context — OpenRouter applies it transparently before forwarding to the model.
  extraBody: { transforms: ['middle-out'] },
  // OpenRouter fronts Anthropic models, which cache nothing without an explicit breakpoint —
  // and forwards the marker harmlessly for every other model it routes to.
  cacheSystemPrefix: true,
  // OpenRouter's /v1/models list omits stealth/alpha + rotating ids, so don't flag a typed
  // model "not found" just because it isn't listed — trust the user's id (e.g. owl-alpha).
  modelListExhaustive: false,
  webSearchTool: () => ({
    type: 'openrouter:web_search',
    parameters: { engine: 'auto', max_results: 5, search_context_size: 'medium' },
  }),
  capabilities: {
    constrainedDecoding: true, // most instruct models honor response_format:json_object
    streaming: true,
    vision: true,
    contextWindow: 128_000, // a safe default; the chosen model's real window may differ
    strengthTier: 'frontier',
    nativeWebSearch: true, // openrouter:web_search server tool (see header)
  },
});
