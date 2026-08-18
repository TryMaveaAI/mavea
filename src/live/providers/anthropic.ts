// anthropic.ts — Claude adapter. Strongest accuracy posture: schema-constrained
// output via native STRUCTURED OUTPUTS (output_config.format → json_schema), so the
// model's final text always matches liveJsonSchema(). This replaced an older
// tool-forcing trick (tool_choice pinned to a custom emit_canvas tool) that guaranteed
// the same shape but made web_search unreachable — forcing a specific tool stops the
// model from calling any OTHER tool first. Structured Outputs validates the FINAL
// response instead, so tool_choice stays at its default 'auto' and Claude is free to
// run a web_search loop (server-side; results arrive as server_tool_use /
// web_search_tool_result blocks) before emitting the schema-shaped answer.
// Caching is prefix-based, so the request is shaped so the whole system + history prefix
// caches: the stable tier base is the lone system block (cache_control → ~90% cheaper on
// turns 2+), the per-turn section (hero picks, count, freshness — changes every turn) rides
// at the head of the USER turn, and a second breakpoint on the last history message caches
// the replayed conversation too — both on a 1h TTL, since a voice session pauses longer
// than the 5-min default all the time. Extended thinking fires for medium/high-effort
// turns (hard questions with balanced/thorough quality): adaptive mode lets Claude
// decide whether to think, display:summarized keeps thinking output lean — thinking only
// composes with 'auto' tool_choice, which this adapter always uses now, so thinking +
// web_search + structured output all coexist in one call.
// Goes through the same-origin /llm/anthropic proxy (key in header, no CORS).
import type { ModelConfig } from '../../types/mavea';
import type { ProviderAdapter, LiveRequest, LiveProbe, DeltaFn, RawResult } from './types';
import { fetchWithTimeout, providerErrorDetail, readSSE, obj, str, num } from './http';
import { liveJsonSchema } from './schema';
import { anthropicUserContent } from './parts';
import type { GroundingSource, TokenUsage } from './types';

// Default base is the same-origin proxy prefix; cfg.baseUrl overrides with the
// direct API base (https://api.anthropic.com) for Node-side eval runs.
const PROXY_BASE = '/llm/anthropic';
const MESSAGES = '/v1/messages';
const MODELS = '/v1/models';
const VERSION = '2023-06-01';
const GEN_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 4_000;

function headers(cfg: ModelConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey ?? '',
    'anthropic-version': VERSION,
    // Anthropic detects browser-originated calls (sec-fetch-* survive the proxy) and
    // rejects them unless this opt-in header is present. The key still only travels
    // browser → same-origin proxy → Anthropic.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/** Dynamic-filtering web search (`web_search_20260209`) isn't available on Haiku —
 *  it falls back to the basic tool version. Match a name boundary so a future
 *  "claude-haiku-5" etc. still matches. */
function webSearchToolType(model: string): string {
  return /haiku/i.test(model) ? 'web_search_20250305' : 'web_search_20260209';
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  capabilities: {
    constrainedDecoding: true,
    streaming: true,
    vision: true,
    contextWindow: 200_000,
    strengthTier: 'frontier',
    // Claude runs web_search as a server-side tool loop before its final (Structured
    // Outputs-validated) answer — see the header comment for why this needed dropping
    // forced tool_choice first.
    nativeWebSearch: true,
  },

  async probe(cfg: ModelConfig): Promise<LiveProbe> {
    try {
      const base = cfg.baseUrl ?? PROXY_BASE;
      // Pass 1 (free): GET /v1/models — catches an unreachable endpoint and an obviously bad
      // key without spending tokens, and gates the paid check below.
      const res = await fetchWithTimeout(
        `${base}${MODELS}`,
        { method: 'GET', headers: headers(cfg) },
        PROBE_TIMEOUT_MS,
      );
      if (!res.ok) return { ok: false, model: false, statusCode: res.status };
      // Pass 2 (paid, ~1 token): a minimal POST /v1/messages. /v1/models can return 200 while
      // the REAL generation endpoint 401s (Anthropic's browser detection blocks /v1/messages
      // only) — so "Ready" must come from the endpoint a turn actually uses. Probes only fire
      // on settled key/model changes and explicit Recheck, never per keystroke, so the cost is
      // a one-token call per probe.
      const gen = await fetchWithTimeout(
        `${base}${MESSAGES}`,
        {
          method: 'POST',
          headers: headers(cfg),
          body: JSON.stringify({
            model: cfg.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        },
        PROBE_TIMEOUT_MS,
      );
      return { ok: gen.ok, model: gen.ok, statusCode: gen.status };
    } catch {
      return { ok: false, model: false };
    }
  },

  // Prewarming only wants the connection open, and Anthropic's probe spends a token to get its
  // verdict — so warming runs pass 1 alone. Without this, merely focusing the composer billed the
  // user's key.
  async warm(cfg: ModelConfig): Promise<void> {
    try {
      const base = cfg.baseUrl ?? PROXY_BASE;
      await fetchWithTimeout(
        `${base}${MODELS}`,
        { method: 'GET', headers: headers(cfg) },
        PROBE_TIMEOUT_MS,
      );
    } catch {
      /* warming is best-effort — an unreachable endpoint just means the first turn pays setup */
    }
  },

  async generate(req: LiveRequest, cfg: ModelConfig, onDelta?: DeltaFn): Promise<RawResult> {
    const base = cfg.baseUrl ?? PROXY_BASE;

    // Prompt caching is PREFIX-based: any uncached bytes poison everything behind them. The
    // stable base (liveSystemPrompt) is several thousand tokens that never change within a
    // (tier, complexity), so it rides alone in the system slot under a cache breakpoint. The
    // per-turn suffix (hero picks, count directive, freshness line, etc.) varies every turn —
    // as a second system block it sat BEFORE the history, billing the entire replayed
    // conversation at full price on every turn. It folds into the user turn instead, ahead of
    // the user's own words (the same split gemini.ts and the Responses adapters ship): the
    // model reads every instruction in the same order, but now `system + history` caches, with
    // a second breakpoint on the last history message so a long session re-buys only its delta.
    // Both breakpoints use the 1h TTL — a voice conversation pauses longer than the 5-minute
    // default all the time, and each such pause was repaying the full cold prompt.
    const stableBase = req.systemBase ?? req.system;
    const perTurn = req.systemBase ? req.system.slice(stableBase.length).trimStart() : '';
    const cacheHour = { type: 'ephemeral', ttl: '1h' };
    // A caller without a systemBase split (Prism, mindshape, dashboards…) keeps the exact
    // wire shape it always had: one plain-ephemeral system block, untouched messages.
    const systemBlocks = [
      {
        type: 'text',
        text: stableBase,
        cache_control: req.systemBase ? cacheHour : { type: 'ephemeral' },
      },
    ];
    const lastTurn = req.history.length - 1;
    const history = req.history.map((h, i) =>
      req.systemBase && i === lastTurn
        ? { role: h.role, content: [{ type: 'text', text: h.content, cache_control: cacheHour }] }
        : h,
    );
    const baseUserContent = anthropicUserContent(req.user, req.attachments);
    const userContent = perTurn
      ? [
          { type: 'text', text: perTurn },
          ...(typeof baseUserContent === 'string'
            ? [{ type: 'text', text: baseUserContent }]
            : baseUserContent),
        ]
      : baseUserContent;

    // Adaptive thinking: let Claude decide whether to reason on medium/high-effort
    // turns (hard questions with Balanced/Thorough quality). Requires temperature:1
    // (Anthropic enforces this when thinking is active). display:summarized keeps the
    // thinking output lean, reducing billed output tokens. Thinking blocks arrive as
    // thinking_delta events — our SSE reader below only reads `delta.text`, so they
    // stream past silently without touching the answer accumulator.
    const useThinking = req.thinkingLevel === 'medium' || req.thinkingLevel === 'high';

    // Structured-output schema: an explicit caller override wins (an object requests THAT
    // shape, `null` goes free-form); otherwise a CANVAS turn (generateLive always sets
    // blockTypes) gets the rich canvas schema. Ignoring req.format here used to force every
    // non-canvas feature (mindshape, Prism, Ripple, SRS…) into the canvas shape regardless
    // of what it asked for.
    const isCanvasTurn = req.format === undefined && !!req.blockTypes?.length;
    const schema =
      req.format !== undefined
        ? req.format
        : isCanvasTurn
          ? liveJsonSchema(req.blockTypes, req.complexity)
          : null;

    const useNativeSearch = !!req.tools?.webSearch;

    const res = await fetchWithTimeout(
      `${base}${MESSAGES}`,
      {
        method: 'POST',
        headers: headers(cfg),
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: req.maxTokens ?? 1024,
          temperature: useThinking ? 1 : (req.temperature ?? 0.3),
          ...(useThinking ? { thinking: { type: 'adaptive', display: 'summarized' } } : {}),
          system: systemBlocks,
          messages: [...history, { role: 'user', content: userContent }],
          // Structured Outputs validates the FINAL text response against the schema —
          // tool_choice is left at its default 'auto' (never forced), which is what lets
          // Claude call web_search first when it's offered below.
          ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
          ...(useNativeSearch
            ? {
                tools: [{ type: webSearchToolType(cfg.model), name: 'web_search', max_uses: 5 }],
              }
            : {}),
          stream: true,
        }),
      },
      GEN_TIMEOUT_MS,
      req.signal,
    );
    // Carry the provider's own reason: a 429 is either a per-minute rate limit or a spent quota,
    // and only the body says which (describeLiveError reads the words, not just the status).
    if (!res.ok) throw new Error(`anthropic ${res.status}${await providerErrorDetail(res)}`);

    // The schema-validated answer arrives as ordinary text_delta fragments on a `text`
    // content block — Structured Outputs constrains the FINAL text, it doesn't reroute it
    // through a tool_use block the way the old tool-forcing trick did. Any preceding
    // server_tool_use / web_search_tool_result blocks carry no `delta.text`, so they fall
    // out of `acc` for free. Citations ride alongside as citations_delta events; collected
    // defensively (any delta carrying a `citation` object) since the exact delta shape for
    // web-search citations wasn't verifiable against a live key.
    let acc = '';
    let usage: TokenUsage | undefined;
    const grounding = new Map<string, GroundingSource>();
    await readSSE(res, (ev) => {
      const e = obj(ev);
      const type = str(e.type);
      if (type === 'content_block_delta') {
        const delta = obj(e.delta);
        const frag = str(delta.text);
        if (frag) {
          acc += frag;
          onDelta?.(frag);
        }
        const citation = obj(delta.citation);
        const curl = str(citation.url);
        if (curl && !grounding.has(curl)) {
          grounding.set(curl, { title: str(citation.title) || curl, url: curl });
        }
      } else if (type === 'message_start') {
        // Anthropic's input_tokens EXCLUDES the cached slices (unlike Gemini/OpenAI, whose
        // prompt totals INCLUDE them), so sum all three — the fresh input plus the two cache
        // slices — to make `input` mean "total input tokens" the same way across providers;
        // the cache_read slice is also surfaced as cachedInput (the cheap-rate portion).
        const u = obj(obj(e.message).usage);
        usage = {
          input:
            num(u.input_tokens) +
            num(u.cache_read_input_tokens) +
            num(u.cache_creation_input_tokens),
          output: num(u.output_tokens),
          cachedInput: num(u.cache_read_input_tokens),
        };
      } else if (type === 'message_delta') {
        // The final cumulative output_tokens lands on message_delta; keep the input/cache
        // figures captured at message_start.
        const u = obj(e.usage);
        if (u.output_tokens !== undefined) {
          usage = {
            input: usage?.input ?? 0,
            cachedInput: usage?.cachedInput ?? 0,
            output: num(u.output_tokens),
          };
        }
      }
    });

    const sources = grounding.size ? [...grounding.values()] : undefined;
    // Resolve as the parsed object when possible; else hand the raw string to the
    // validator (it tolerates partial/embedded JSON).
    try {
      return {
        raw: JSON.parse(acc) as object,
        ...(sources ? { sources } : {}),
        ...(usage ? { usage } : {}),
      };
    } catch {
      return { raw: acc, ...(sources ? { sources } : {}), ...(usage ? { usage } : {}) };
    }
  },
};
