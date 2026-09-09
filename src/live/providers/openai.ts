// openai.ts — GPT adapter. Runs on the Responses API (openaiResponsesCompatible.ts), not
// Chat Completions — full web search only lives there: Chat Completions' `web_search_preview`
// is deprecated (shutdown 2026-07-23) with no replacement tool on that endpoint. JSON is
// guaranteed via text.format:json_object, streams response.output_text.delta so narration
// arrives first, Bearer key through the same-origin /llm/openai proxy (no CORS). OpenAI
// applies prompt caching automatically, and GPT-5.6+ receives an explicit breakpoint at the end
// of the repeated system prefix so changing per-turn guidance cannot move it.
//
// The shared transport detects reasoning models (gpt-5.x / o-series) and swaps in
// `reasoning.effort` + omits the (fixed-at-1) temperature, so the current GPT-5 defaults
// work without per-call errors; classic 4o/4.1 keep temperature.
//
// Native web search: `{type:'web_search'}` in tools[], only injected when the turn asks
// for fresh data. OpenAI's own docs caution that search doesn't engage reliably at 'minimal'
// reasoning effort — the shared transport uses the provider's no-thinking tier for ordinary
// composition and disposable glimpses, while a search turn stays above it so the tool engages.
import { openaiResponsesCompatible } from './openaiResponsesCompatible';

export const openaiAdapter = openaiResponsesCompatible({
  id: 'openai',
  proxyBase: '/llm/openai',
  webSearchTool: () => ({ type: 'web_search' }),
  // Documented on the Responses API; verified live (gpt-5.4-nano answered a live-price check from
  // training memory under tool_choice:auto, and searched with citations once forced).
  forceSearchToolChoice: () => ({ type: 'web_search' }),
  capabilities: {
    constrainedDecoding: true, // json_object mode (structure guaranteed; props via validator)
    streaming: true,
    vision: true,
    contextWindow: 1_050_000, // gpt-5.6-luna, the default (922k of it addressable as input)
    strengthTier: 'frontier',
    nativeWebSearch: true,
  },
});
