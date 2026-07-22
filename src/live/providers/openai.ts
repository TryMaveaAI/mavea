// openai.ts — GPT adapter. Runs on the Responses API (openaiResponsesCompatible.ts), not
// Chat Completions — full web search only lives there: Chat Completions' `web_search_preview`
// is deprecated (shutdown 2026-07-23) with no replacement tool on that endpoint. JSON is
// guaranteed via text.format:json_object, streams response.output_text.delta so narration
// arrives first, Bearer key through the same-origin /llm/openai proxy (no CORS). OpenAI
// applies prompt caching automatically to the repeated system prefix.
//
// The shared transport detects reasoning models (gpt-5.x / o-series) and swaps in
// `reasoning.effort` + omits the (fixed-at-1) temperature, so the current GPT-5 defaults
// work without per-call errors; classic 4o/4.1 keep temperature.
//
// Native web search: `{type:'web_search'}` in tools[], only injected when the turn asks
// for fresh data. OpenAI's own docs caution that search doesn't engage reliably at 'minimal'
// reasoning effort — the shared transport already clamps 'minimal' to 'low' for every
// reasoning-model call, so a search turn never lands at the unsupported tier.
import { openaiResponsesCompatible } from './openaiResponsesCompatible';

export const openaiAdapter = openaiResponsesCompatible({
  id: 'openai',
  proxyBase: '/llm/openai',
  webSearchTool: () => ({ type: 'web_search' }),
  capabilities: {
    constrainedDecoding: true, // json_object mode (structure guaranteed; props via validator)
    streaming: true,
    vision: true,
    contextWindow: 128_000,
    strengthTier: 'frontier',
    nativeWebSearch: true,
  },
});
