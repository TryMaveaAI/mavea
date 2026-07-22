// grok.ts — xAI Grok adapter. Runs on xAI's Responses API (openaiResponsesCompatible.ts),
// which mirrors OpenAI's design (https://api.x.ai/v1/responses: an `input` array, Bearer
// key, streamed response.output_text.delta), routed through the same-origin /llm/grok proxy
// (→ https://api.x.ai). The current suggested model is Grok 4.5; JSON is guaranteed via
// text.format:json_object and validated downstream.
//
// Native web search: xAI's own agentic {type:'web_search'} tool (NOT OpenAI's
// web_search_preview) — this moved off the deprecated body-level search_parameters and is
// documented ONLY on the Responses API, never on bare /v1/chat/completions, which is why
// this adapter can't share the classic openaiCompatible.ts transport the way it used to.
// xAI's tool also accepts optional `filters`/`enable_image_search` knobs; we send the
// minimal shape and let the model's own default engine choose.
import { openaiResponsesCompatible } from './openaiResponsesCompatible';

export const grokAdapter = openaiResponsesCompatible({
  id: 'grok',
  proxyBase: '/llm/grok',
  webSearchTool: () => ({ type: 'web_search' }),
  capabilities: {
    constrainedDecoding: true, // text.format:json_object (structure guaranteed; props via validator)
    streaming: true,
    vision: true, // Grok 4.5 accepts image input
    contextWindow: 500_000,
    strengthTier: 'frontier',
    nativeWebSearch: true,
  },
});
