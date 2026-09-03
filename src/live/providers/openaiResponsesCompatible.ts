// openaiResponsesCompatible.ts — shared adapter for providers that speak OpenAI's
// Responses API wire format (`/v1/responses`): OpenAI itself, and xAI's Grok, whose
// Responses API mirrors OpenAI's design (an `input` array instead of `messages`,
// `response.*` streaming events). Native web search lives ONLY here for both — OpenAI's
// Chat Completions `web_search_preview` is deprecated (shutdown 2026-07-23) with no
// replacement tool on that endpoint, and xAI never documented `web_search` on its
// `/v1/chat/completions` at all — so a provider that wants search-grounded Live answers
// has to speak this API, not the classic chat-completions one openaiCompatible.ts covers.
//
// Structure guaranteed via text.format:json_object (loose JSON mode, same philosophy as
// the Chat Completions path — props are validated/coerced downstream, not schema-locked,
// because the open `props` field per block type doesn't fit a strict schema cleanly) —
// EXCEPT on a search turn: OpenAI's API rejects `json_object` + `web_search` outright
// ("Web Search cannot be used with JSON mode", confirmed against a live 400). A search turn
// switches to `json_schema` (Structured Outputs) instead, non-strict so the open `props`
// field survives — that combination is fine, only the older "JSON mode" is excluded.
// Bearer key in the header, forwarded by the same-origin /llm/<provider> proxy (no CORS).
import type { ModelConfig, ProviderId, ProviderCapabilities } from '../../types/mavea';
import type {
  ProviderAdapter,
  LiveRequest,
  LiveProbe,
  DeltaFn,
  RawResult,
  GroundingSource,
  TokenUsage,
} from './types';
import {
  fetchWithTimeout,
  readSSE,
  retryAfterMs,
  sleepAbortable,
  obj,
  str,
  arr,
  num,
  noteRateLimited,
} from './http';
import { openaiResponsesUserContent } from './parts';
import {
  isReasoningModel,
  isMinimalGlimpse,
  inBandErrorMessage,
  NO_THINKING_EFFORT,
} from './openaiCompatible';
import { liveJsonSchema } from './schema';

const GEN_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 4_000;

/** How many times to retry a transient 429 (rate limit) before surfacing it. */
const RATE_LIMIT_RETRIES = 3;

/** Pull the real reason out of a non-200 response body so a 400 ("Unsupported parameter" etc.)
 *  isn't a silent, undebuggable "openai 400" — mirrors gemini.ts's errorDetail. Never throws,
 *  never leaks the key (the body is the provider's own JSON error envelope). */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: unknown; code?: unknown; param?: unknown };
    };
    const message = typeof body.error?.message === 'string' ? body.error.message : '';
    const param = typeof body.error?.param === 'string' ? ` (param: ${body.error.param})` : '';
    return message ? ` — ${message.slice(0, 200)}${param}` : '';
  } catch {
    return '';
  }
}

export interface OpenAIResponsesOptions {
  id: ProviderId;
  /** Same-origin proxy prefix (e.g. '/llm/openai'); cfg.baseUrl overrides for eval. */
  proxyBase: string;
  /** Segment before the '/v1/...' paths — '' for both OpenAI and xAI today. */
  apiBase?: string;
  capabilities: ProviderCapabilities;
  extraHeaders?: Record<string, string>;
  /** The hosted web-search tool entry to inject into `tools[]` when the turn requests
   *  webSearch. Omit → no native search offered. */
  webSearchTool?: () => Record<string, unknown>;
  /** The `tool_choice` value that FORCES the search tool, for a turn whose caller set
   *  `requireSearch`. Provided only where the provider's API documents it (OpenAI's Responses API
   *  accepts `{type:'web_search'}`); omitted, the flag degrades to offering the tool — a provider
   *  that rejected an undocumented force value would 400 every dashboard check, which is strictly
   *  worse than a model that occasionally declines to search. */
  forceSearchToolChoice?: () => Record<string, unknown>;
}

/** Build an OpenAI-Responses-compatible ProviderAdapter from a small config. */
export function openaiResponsesCompatible(opts: OpenAIResponsesOptions): ProviderAdapter {
  const {
    id,
    proxyBase,
    apiBase = '',
    capabilities,
    extraHeaders,
    webSearchTool,
    forceSearchToolChoice,
  } = opts;
  const RESPONSES = `${apiBase}/v1/responses`;
  const MODELS = `${apiBase}/v1/models`;

  function headers(cfg: ModelConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey ?? ''}`,
      ...extraHeaders,
    };
  }

  return {
    id,
    capabilities,

    async probe(cfg: ModelConfig): Promise<LiveProbe> {
      try {
        const base = cfg.baseUrl ?? proxyBase;
        const res = await fetchWithTimeout(
          `${base}${MODELS}`,
          { method: 'GET', headers: headers(cfg) },
          PROBE_TIMEOUT_MS,
        );
        if (!res.ok) {
          // xAI is the one provider here that answers a bad key with 400 ("invalid-argument",
          // "Incorrect API key provided…") instead of the 401 every other provider (and the
          // Connect step's statusCode switch) expects — confirmed against a live 400 from
          // api.x.ai. Left as-is, that 400 falls through to the generic "Error 400." message,
          // which reads as the integration being broken rather than as a bad key. Detect xAI's
          // specific invalid-key shape and remap it to 401 so the same "Invalid API key." copy
          // other providers get applies here too.
          let statusCode = res.status;
          if (id === 'grok' && statusCode === 400) {
            try {
              const errBody = (await res.clone().json()) as { code?: unknown };
              if (errBody.code === 'invalid-argument') statusCode = 401;
            } catch {
              /* not JSON — keep the raw status */
            }
          }
          return { ok: false, model: false, statusCode };
        }
        const body: unknown = await res.json();
        const ids = arr(obj(body).data).map((m) => str(obj(m).id));
        return { ok: true, model: ids.length === 0 || ids.includes(cfg.model) };
      } catch {
        return { ok: false, model: false };
      }
    },

    async generate(req: LiveRequest, cfg: ModelConfig, onDelta?: DeltaFn): Promise<RawResult> {
      const base = cfg.baseUrl ?? proxyBase;
      const searchTool = webSearchTool && req.tools?.webSearch ? webSearchTool() : undefined;
      const reasoning = isReasoningModel(cfg.model);

      // History replays as plain {role, content: string} "easy" input messages — content here
      // is OUR resent text, not the API's own canonical output item, so it must stay on the
      // `input_text`/plain-string side of the input schema for EVERY role (user or assistant).
      // `output_text` is only valid inside a verbatim ResponseOutputMessage (id/status and all)
      // reflected back from a prior response — using it here 400s on the very first multi-turn
      // request, since a freshly-authored assistant replay is never that shape.
      const historyInput = req.history.map((h) => ({ role: h.role, content: h.content }));
      const baseUserContent = capabilities.vision
        ? openaiResponsesUserContent(req.user, req.attachments)
        : [{ type: 'input_text' as const, text: req.user }];

      // Prompt caching keys on the request's leading tokens, so anything that changes turn-to-turn
      // poisons everything behind it. req.system is the stable base (liveSystemPrompt) followed by
      // per-turn guidance — the block menu, hero picks, freshness — that differs every turn, so
      // leaving it in `instructions` caps the cache at the base and leaves the replayed history
      // (the bulk of a long session) paying full price every turn. Send only the stable base as
      // instructions and fold the per-turn delta into the user turn, ahead of the user's own words:
      // the model still sees every instruction, in the same order, but now the whole
      // instructions + history prefix caches. This is the split Gemini already ships.
      const sysBase =
        req.systemStable && req.system.startsWith(req.systemStable)
          ? req.systemStable
          : req.systemBase;
      const stableSystem = sysBase && req.system.startsWith(sysBase) ? sysBase : req.system;
      const perTurn =
        sysBase && req.system.startsWith(sysBase) ? req.system.slice(sysBase.length).trim() : '';
      const userContent = perTurn
        ? [{ type: 'input_text' as const, text: perTurn }, ...baseUserContent]
        : baseUserContent;

      // Only a search turn needs to move off json_object — see the header comment. An explicit
      // caller override (req.format) wins; otherwise a canvas turn (blockTypes set) gets the
      // rich canvas schema, same as Anthropic's Structured Outputs path.
      const isCanvasTurn = req.format === undefined && !!req.blockTypes?.length;
      const schema =
        req.format !== undefined
          ? req.format
          : isCanvasTurn
            ? liveJsonSchema(req.blockTypes, req.complexity)
            : null;
      const textFormat = !searchTool
        ? { type: 'json_object' }
        : schema
          ? {
              type: 'json_schema',
              name: isCanvasTurn ? 'live_canvas' : 'live_json',
              schema,
              strict: false, // strict would force the open `props` field to `{}` — see schema.ts
            }
          : { type: 'text' };

      // json_object mode is validated server-side against the INPUT messages: OpenAI 400s the
      // whole request ("must contain the word 'json' in some form") unless "json" literally
      // appears there — and `instructions` (where our system prompt, which says JSON plenty,
      // actually lives) does NOT count. A user asking "best deep-dish pizza nearby?" has no
      // reason to say "json", so every such turn died. One tiny system-role input line
      // satisfies the validator without polluting the user's own words.
      //
      // Sent for BOTH JSON modes (json_object AND the json_schema a search turn uses), not just
      // json_object: a canvas ask flips between the two as web search toggles, and gating this
      // leading input line on the exact mode would change the request prefix between otherwise-
      // identical turns and forfeit that turn's automatic prefix cache. Under json_schema it's a
      // harmless no-op. A non-canvas caller running in plain `text` mode gets nothing — telling it
      // to "Respond in JSON" would be wrong there.
      const jsonNudge =
        textFormat.type === 'text'
          ? []
          : [{ role: 'system' as const, content: 'Respond in JSON.' }];

      // Reasoning effort. Canvas turns stay pinned to 'low' (see the note by the request body):
      // 'medium' lets the reasoning run away on the large canvas prompt and produce nothing. But web
      // search is reasoning-gated — OpenAI's own guidance is that the tool "doesn't engage reliably"
      // below 'medium', which is precisely why a low-effort dashboard refresh so often comes back
      // ungrounded ("couldn't verify with sources"). A SEARCH turn that is NOT a canvas turn — a
      // dashboard refresh, an on-demand grounded metric — is small (a short prompt and a few JSON
      // values), so the runaway doesn't apply: give it enough effort to actually search. Default
      // 'medium'; a caller (the grounding retry) can push 'high' via thinkingLevel. Everything else
      // stays 'low' — except a GLIMPSE (see isMinimalGlimpse): a disposable, self-sized ask that
      // declared it needs no deliberation at all. The ghost speculation fires up to three of those
      // per listen off a half-spoken sentence, and paying for a hidden thinking pass to produce
      // three six-word titles is the clearest waste on the turn path. Never a search turn (the tool
      // doesn't engage reliably at the lowest tier) and never a canvas turn (blockTypes excludes it,
      // so a lean ask — which also asks for minimal thinking — keeps today's floor and effort).
      const glimpse = !searchTool && isMinimalGlimpse(req, cfg.model);
      const effort: typeof NO_THINKING_EFFORT | 'low' | 'medium' | 'high' =
        searchTool && !isCanvasTurn
          ? req.thinkingLevel === 'high'
            ? 'high'
            : 'medium'
          : glimpse
            ? NO_THINKING_EFFORT
            : 'low';

      const requestInit = {
        method: 'POST',
        headers: headers(cfg),
        body: JSON.stringify({
          model: cfg.model,
          // OpenAI's Responses API retains application state by default. Mavéa never needs a
          // provider-side response object after this stream ends, so opt out explicitly. xAI's
          // compatible endpoint does not document this field and must not receive it.
          ...(id === 'openai' ? { store: false } : {}),
          instructions: stableSystem,
          input: [...jsonNudge, ...historyInput, { role: 'user', content: userContent }],
          text: { format: textFormat },
          // A reasoning model meters hidden thinking tokens out of THIS budget, so a small cap
          // (the tiny on-demand callers pass 150–500) can be spent entirely on reasoning, ending
          // the turn `incomplete` with no answer. The floor scales with the effort chosen ABOVE,
          // because that choice is this adapter's own: a search-metric turn lifted to medium/high
          // routinely burns thousands of reasoning tokens before its first output token, and the
          // old flat 1500 floor left a dashboard refresh (caller cap ~3000) failing with "used its
          // entire output budget on reasoning" on every check — billed reasoning + billed search,
          // zero answer. A FLOOR, deliberately, not an allowance added on top: adding headroom to a
          // caller that already sized itself generously only inflates what the provider reserves
          // against its per-minute quota (measured: a four-board batch went 11.9k → 15.9k that
          // way). And it lifts only the small callers that need it — sizing a large, self-sized
          // request DOWN belongs where that request is computed, not here.
          //
          // The bottom rung of that same ladder reserves nothing: the tier means no hidden pass,
          // so there is no thinking to leave room for and the caller's own
          // cap is the honest number. That is the whole reason the floor may be dropped there and
          // nowhere else — a floor removed while the model is still asked to think is how a small
          // caller pays for reasoning and receives an empty completion.
          max_output_tokens: reasoning
            ? effort === NO_THINKING_EFFORT
              ? (req.maxTokens ?? 1024)
              : Math.max(
                  req.maxTokens ?? 1024,
                  effort === 'high' ? 12_000 : effort === 'medium' ? 8_000 : 1500,
                )
            : (req.maxTokens ?? 1024),
          // Reasoning models (gpt-5.x) reject a custom temperature (fixed at 1) and use
          // `reasoning.effort` instead; classic models keep `temperature`. `effort` (computed above)
          // is 'low' for a canvas turn, lifted for a search-metric turn, and dropped to 'minimal'
          // for a glimpse — the two forces that shape the default are both measured:
          //  · Canvas turns MUST stay 'low'. Letting the API default ('medium') apply destroys them:
          //    a canvas turn hands the model a very large instruction prompt and asks for structured
          //    JSON, and at medium the reasoning ran away and consumed the whole output budget before
          //    writing a character (ended `incomplete`, empty; ~18k tokens, thought 119s, produced
          //    nothing). At 'low' the same ask streams first words in ~6s and lands an eight-block
          //    canvas in ~20s. So the quality dial buys a richer canvas, not reasoning depth, here.
          //  · Search-metric turns (a dashboard refresh) MUST NOT stay 'low'. Web search is
          //    reasoning-gated — it "doesn't engage reliably" below 'medium' — so a low-effort refresh
          //    kept coming back ungrounded ("couldn't verify"). These turns are small (short prompt,
          //    a few values), so the runaway above doesn't apply: 'medium' is safe and makes search
          //    actually fire.
          ...(reasoning ? { reasoning: { effort } } : { temperature: req.temperature ?? 0.3 }),
          stream: true,
          ...(searchTool ? { tools: [searchTool] } : {}),
          // Offering the tool is not asking for it: tool_choice defaults to auto, so the model may
          // skip the search and answer from memory — which a dashboard check then correctly throws
          // away, having billed for it. Where the caller says the answer is worthless ungrounded
          // AND this provider documents a force value, require the tool instead of hoping.
          ...(searchTool && req.tools?.requireSearch && forceSearchToolChoice
            ? { tool_choice: forceSearchToolChoice() }
            : {}),
        }),
      };
      // A 429 (rate limit) is transient — a burst of dashboard refreshes, or a bumped-effort search
      // turn, can briefly exceed the org's tokens-per-minute. Retry a few times (honoring Retry-After)
      // so the turn rides out the spike instead of failing; any other non-OK status is a real error.
      let res: Response;
      for (let rlAttempt = 0; ; rlAttempt++) {
        res = await fetchWithTimeout(
          `${base}${RESPONSES}`,
          requestInit,
          GEN_TIMEOUT_MS,
          req.signal,
        );
        if (res.ok) break;
        noteRateLimited(res.status);
        if (res.status === 429 && rlAttempt < RATE_LIMIT_RETRIES && !req.signal?.aborted) {
          await sleepAbortable(retryAfterMs(res, rlAttempt), req.signal);
          continue;
        }
        throw new Error(`${id} ${res.status}${await errorDetail(res)}`);
      }

      let acc = '';
      const citationMap = new Map<string, GroundingSource>();
      let usage: TokenUsage | undefined;
      let inBandError: string | undefined;
      await readSSE(res, (ev) => {
        const e = obj(ev);
        const type = str(e.type);
        // Checked before the type dispatch below (and independent of the exact `type` string a
        // failure frame carries — `response.failed`'s nested `response.error`, a bare top-level
        // `error`, or any other shape a gateway might use) so an in-band failure is never missed.
        const nestedError = obj(obj(e.response).error);
        const topError = obj(e.error);
        const errObj = Object.keys(nestedError).length ? nestedError : topError;
        if (Object.keys(errObj).length) {
          inBandError = inBandErrorMessage(id, errObj);
          return true; // stop reading — nothing useful follows a failure
        }
        if (type === 'response.output_text.delta') {
          const frag = str(e.delta);
          if (frag) {
            acc += frag;
            onDelta?.(frag);
          }
          return;
        }
        // A reasoning model spends its thinking tokens out of the SAME max_output_tokens budget, and
        // when it runs out mid-thought the run ends `incomplete` having written nothing at all. That
        // is a failed turn, but it arrives looking like a polite finish, so it used to fall straight
        // through as an empty answer — the user waited a minute, watched the recovery pass do it
        // again, and got the honest-fallback card with no idea why. Name it.
        if (type === 'response.incomplete') {
          if (!acc) {
            const reason = str(obj(obj(e.response).incomplete_details).reason);
            inBandError =
              reason === 'max_output_tokens'
                ? `${id}: the model used its entire output budget on reasoning and never wrote an answer — raise maxTokens`
                : `${id}: the model stopped before writing an answer${reason ? ` (${reason})` : ''}`;
            return true;
          }
          return;
        }
        // The final aggregated event carries the real citations (annotations arrive on the
        // completed output item, not incrementally on each delta) and token usage.
        if (type === 'response.completed') {
          const response = obj(e.response);
          for (const item of arr(response.output)) {
            const it = obj(item);
            if (str(it.type) !== 'message') continue;
            for (const part of arr(it.content)) {
              for (const ann of arr(obj(part).annotations)) {
                const a = obj(ann);
                if (str(a.type) !== 'url_citation') continue;
                const url = str(a.url);
                if (url && !citationMap.has(url))
                  citationMap.set(url, { url, title: str(a.title) || url });
              }
            }
          }
          const u = obj(response.usage);
          if (u.input_tokens !== undefined || u.output_tokens !== undefined) {
            usage = {
              input: num(u.input_tokens),
              output: num(u.output_tokens),
              cachedInput: num(obj(u.input_tokens_details).cached_tokens),
            };
          }
          return;
        }
      });
      if (inBandError) throw new Error(inBandError);
      const sources = citationMap.size ? [...citationMap.values()] : undefined;
      return { raw: acc, ...(sources ? { sources } : {}), ...(usage ? { usage } : {}) };
    },
  };
}
