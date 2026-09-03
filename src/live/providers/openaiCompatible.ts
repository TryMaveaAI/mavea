// openaiCompatible.ts — the shared adapter for every provider that speaks the
// OpenAI Chat Completions wire format: OpenAI itself, plus gateways like OpenRouter
// (and, via a custom baseUrl, Groq / Together / LM Studio). One implementation,
// parameterized by base URL + headers, so a new compatible provider is a few lines
// of config rather than a copy of the whole transport.
//
// Structure guaranteed via response_format:json_object; streams choices[].delta.content
// so narration arrives first. Bearer key in the header, forwarded by the same-origin
// /llm/<provider> proxy (no CORS). Props are validated/coerced downstream by
// validateLiveResponse — the adapter stays pure transport.
import type { ModelConfig, ProviderId, ProviderCapabilities } from '../../types/mavea';
import type {
  ProviderAdapter,
  LiveRequest,
  LiveProbe,
  DeltaFn,
  RawResult,
  TokenUsage,
} from './types';
import { fetchWithTimeout, providerErrorDetail, readSSE, obj, str, arr, num } from './http';
import { openaiUserContent, textOnlyUser } from './parts';
import { isFreeRoute } from './route';

const GEN_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 4_000;
/** Hard ceiling on a single turn's whole stream (headers + body). GEN_TIMEOUT_MS only guards
 *  time-to-first-byte and the SSE idle timer only catches a DEAD stream — but a reasoning model
 *  (e.g. a stealth OpenRouter model) can trickle "thinking" tokens that keep resetting the idle
 *  timer indefinitely. This cap aborts so the turn always finalizes recoverably instead of
 *  spinning forever. Generous, because the UI shows a live "Thinking…" state meanwhile. */
const STREAM_TOTAL_MS = 180_000;
/** The same ceiling for a free gateway route, which is queued behind every other free user and
 *  streams a fraction as fast. 180s cut real answers off mid-canvas there — and since the turn
 *  keeps whatever streamed (generateLive salvages the parsed blocks rather than discarding them),
 *  a longer window buys MORE answer rather than a longer wait for none. The user picked a slow
 *  model deliberately; this waits with them instead of overruling the choice. */
const FREE_ROUTE_STREAM_TOTAL_MS = 300_000;

export interface OpenAICompatibleOptions {
  id: ProviderId;
  /** Same-origin proxy prefix (e.g. '/llm/openai'); cfg.baseUrl overrides for eval. */
  proxyBase: string;
  /** Segment before the OpenAI '/v1/...' paths: '' for OpenAI, '/api' for OpenRouter. */
  apiBase?: string;
  capabilities: ProviderCapabilities;
  /** Static extra headers — e.g. OpenRouter's attribution HTTP-Referer / X-Title. */
  extraHeaders?: Record<string, string>;
  /** Extra top-level fields merged into the request body before core params. Provider-
   *  specific extensions (e.g. OpenRouter's `transforms`) that don't conflict with the
   *  standard OpenAI fields. Core params (model, messages, stream, etc.) always override. */
  extraBody?: Record<string, unknown>;
  /** The hosted web-search tool entry to inject into `tools[]` when the turn requests
   *  webSearch — the shape differs per gateway (OpenRouter's `openrouter:web_search`,
   *  etc.), so each provider supplies its own. Citations come back the same way for all
   *  OpenAI-style routes: `delta.annotations[].url_citation`. Omit → no native search
   *  (the app's retrieve-then-read grounding handles it instead). NOTE: OpenAI's classic
   *  Chat Completions `web_search_preview` is deprecated (shutdown 2026-07-23) and is
   *  deliberately NOT wired here — OpenAI grounds via the app-side path. */
  webSearchTool?: () => Record<string, unknown>;
  /** Whether the provider's `/v1/models` listing is the authoritative set of usable ids.
   *  True for first-party APIs (OpenAI, Grok) — an id not in the list is a typo. False for
   *  gateways like OpenRouter, whose catalog is huge and excludes stealth/alpha/rotating ids
   *  (e.g. openrouter/owl-alpha): a successful, keyed listing means "reachable", and we trust
   *  the user's typed model rather than wrongly flagging it "not found". Defaults to true. */
  modelListExhaustive?: boolean;
  /** Mark the stable system prefix for caching with an Anthropic-style `cache_control` breakpoint.
   *  Gateways that front Anthropic (OpenRouter) require the explicit breakpoint — Anthropic caches
   *  nothing without one — while first-party OpenAI/Grok cache long prefixes automatically and have
   *  no such field. Providers that don't understand it ignore it, but only turn it on where it
   *  earns something. */
  cacheSystemPrefix?: boolean;
}

/** OpenAI reasoning models (gpt-5.x and the o-series) reject a custom `temperature`
 *  (it's fixed at 1) and `max_tokens` (they meter hidden reasoning tokens from the
 *  completion budget via `max_completion_tokens`), and accept a `reasoning_effort` dial.
 *  Match only at a name boundary so `gpt-4o`/`gpt-4.1` (classic) stay on the normal path.
 *  Exported for openaiResponsesCompatible.ts, which faces the same reasoning-model split
 *  on the Responses API (there under `reasoning.effort` + `max_output_tokens` instead). */
export function isReasoningModel(model: string): boolean {
  return /(?:^|\/)(?:o[1-9]|gpt-5)/i.test(model);
}

/** The gpt-5 family adds a `minimal` reasoning tier BELOW `low`: the model answers without a
 *  hidden thinking pass, so nothing competes with the answer for the completion budget. Matched
 *  by NAME rather than by "is a reasoning model" — the o-series rejects the value outright, and a
 *  gateway route can point at any vendor's model — so the tier is only ever requested where it is
 *  documented. Same name-boundary rule as isReasoningModel, so a gateway id
 *  ("openai/gpt-5.4-nano") matches while "acme-gpt-5-clone" does not. */
function supportsMinimalReasoning(model: string): boolean {
  return /(?:^|\/)gpt-5/i.test(model);
}

/** A GLIMPSE: a small, self-sized, disposable ask (the ghost speculation off a half-spoken
 *  sentence, a node breakdown, a grounding resolve). It has to be recognised from the request
 *  alone, so the bar is deliberately high — the caller must have set BOTH dials on purpose:
 *
 *   · `thinkingLevel: 'minimal'` — it declared that this ask needs no deliberation, and
 *   · `maxTokens` — it sized its own budget rather than taking the adapter's default, and
 *   · no `blockTypes` — it is not a Live canvas turn (a lean canvas turn also asks for minimal
 *     thinking, and that one MUST keep the reasoning floor: it hands the model a very large
 *     prompt whose structured answer is worth reserving room for).
 *
 *  A search turn is excluded at the call sites, not here: web search is reasoning-gated and does
 *  not engage reliably at the lowest tier, so grounding always outranks the saving.
 *
 *  Why it matters: a glimpse fires up to three times per listen, and on a reasoning model the
 *  1500-token floor below is a licence to think — the "150-token" ghost bills an order of
 *  magnitude more than it asked for. Asking for the minimal tier removes the hidden pass the
 *  floor exists to protect, which is exactly what makes dropping the floor safe here. */
export function isMinimalGlimpse(req: LiveRequest, model: string): boolean {
  return (
    req.thinkingLevel === 'minimal' &&
    req.maxTokens !== undefined &&
    !req.blockTypes?.length &&
    supportsMinimalReasoning(model)
  );
}

/** Some gateways answer with HTTP 200 but report the real failure (an expired key, an
 *  exhausted quota) IN the streamed body — a top-level `error` frame instead of the normal
 *  `choices[]` delta. Left unsniffed, that frame carries no content, the stream ends having
 *  accumulated nothing, and the turn misreads it as "the model gave a thin/empty answer" —
 *  retrying, then falling back to a generic card that hides the real cause from the user.
 *  Folds the failure into the SAME "<provider> <status> <message>" shape a real HTTP error
 *  throws, so describeLiveError's existing status/keyword mapping (401/403/429, "quota", …)
 *  classifies it identically regardless of which channel the provider used to report it.
 *  Exported for openaiResponsesCompatible.ts (the Responses API has its own in-band
 *  `response.failed` event, but the same status/message classification applies). */
export function inBandErrorMessage(id: string, err: Record<string, unknown>): string {
  const codeRaw = err.code;
  const numericStatus = typeof codeRaw === 'number' ? codeRaw : Number(str(codeRaw)) || undefined;
  const type = str(err.type);
  const code = typeof codeRaw === 'string' ? codeRaw : '';
  const message = str(err.message) || 'request failed';
  // `type`/`code` carry the provider's own canonical (short, literal) failure name — e.g.
  // OpenAI's `invalid_api_key` / `insufficient_quota` — checked first as the reliable signal;
  // `message` rides along as a best-effort fallback for a gateway that omits both.
  const signal = `${type} ${code} ${message}`;
  const status =
    numericStatus ??
    (/invalid.?api.?key|unauthorized|authentication/i.test(signal)
      ? 401
      : /insufficient.?quota|resource.?exhausted|rate.?limit/i.test(signal)
        ? 429
        : undefined);
  return `${id} ${status ?? ''} ${message}`.trim();
}

/** Build an OpenAI-compatible ProviderAdapter from a small config. */
export function openaiCompatible(opts: OpenAICompatibleOptions): ProviderAdapter {
  const {
    id,
    proxyBase,
    apiBase = '',
    capabilities,
    extraHeaders,
    extraBody,
    webSearchTool,
    modelListExhaustive = true,
    cacheSystemPrefix = false,
  } = opts;
  const CHAT = `${apiBase}/v1/chat/completions`;
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
        if (!res.ok) return { ok: false, model: false, statusCode: res.status };
        const body: unknown = await res.json();
        const ids = arr(obj(body).data).map((m) => str(obj(m).id));
        // A gateway's listing isn't exhaustive (stealth/rotating ids are absent), so trust the
        // user's typed model when the key/listing works; first-party APIs verify against the list.
        const inList = ids.length === 0 || ids.includes(cfg.model);
        return { ok: true, model: modelListExhaustive ? inList : true };
      } catch {
        return { ok: false, model: false };
      }
    },

    async generate(req: LiveRequest, cfg: ModelConfig, onDelta?: DeltaFn): Promise<RawResult> {
      const base = cfg.baseUrl ?? proxyBase;
      const searchTool = webSearchTool && req.tools?.webSearch ? webSearchTool() : undefined;
      const reasoning = isReasoningModel(cfg.model);
      // A disposable, self-sized ask (see isMinimalGlimpse) runs at the `minimal` reasoning tier
      // and keeps its own budget. Never on a search turn: search is reasoning-gated and doesn't
      // engage reliably at the lowest tier, so an ungrounded answer would be the "saving".
      const glimpse = !searchTool && isMinimalGlimpse(req, cfg.model);

      // Prompt caching keys on the request's leading tokens, so anything that varies turn-to-turn
      // poisons everything behind it. req.system is the stable base (liveSystemPrompt) followed by
      // per-turn guidance — the block menu, hero picks, freshness — that differs every turn, so
      // leaving the whole thing in the system message caps the cache at the base and makes the
      // replayed history (the bulk of a long session) full price every turn. Send the stable base
      // alone as the system message and fold the per-turn delta into the user turn, ahead of the
      // user's own words: the model sees every instruction, in the same order, but now the whole
      // system + history prefix caches. This is the split Gemini already ships.
      const sysBase =
        req.systemStable && req.system.startsWith(req.systemStable)
          ? req.systemStable
          : req.systemBase;
      const split = !!sysBase && req.system.startsWith(sysBase);
      const stableSystem = split ? (sysBase as string) : req.system;
      const perTurn = split ? req.system.slice((sysBase as string).length).trim() : '';
      // Only a split (canvas) turn gets the cache breakpoint. The array-shaped system message is a
      // real wire-format change, and this adapter is shared by everything that isn't a Live turn —
      // Prism, Ripple, dashboards, mindshape, SRS — whose system prompts are a few dozen tokens,
      // far below any provider's minimum cacheable prefix. Marking those would change their request
      // shape for zero benefit, so they keep the plain string they have always sent.
      const systemMessage =
        cacheSystemPrefix && split
          ? {
              role: 'system' as const,
              content: [
                { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
              ] as unknown as string,
            }
          : { role: 'system' as const, content: stableSystem };
      /** Put the per-turn directives at the head of the user turn — as a leading part for a parts
       *  array, or a leading paragraph for plain text. */
      const withPerTurn = <T extends string | unknown[]>(content: T): T => {
        if (!perTurn) return content;
        return (
          Array.isArray(content)
            ? [{ type: 'text', text: perTurn }, ...content]
            : `${perTurn}\n\n${content as string}`
        ) as T;
      };

      // Total-turn ceiling, merged with the caller's abort (a superseded turn). See STREAM_TOTAL_MS.
      const capCtrl = new AbortController();
      const capTimer = setTimeout(
        () => capCtrl.abort(),
        isFreeRoute(cfg.model) ? FREE_ROUTE_STREAM_TOTAL_MS : STREAM_TOTAL_MS,
      );
      const signal = req.signal ? AbortSignal.any([req.signal, capCtrl.signal]) : capCtrl.signal;
      try {
        const res = await fetchWithTimeout(
          `${base}${CHAT}`,
          {
            method: 'POST',
            headers: headers(cfg),
            body: JSON.stringify({
              // Provider-specific extras first (e.g. OpenRouter transforms) so core
              // params below always win on key collision.
              ...(extraBody ?? {}),
              model: cfg.model,
              // Reasoning models (OpenAI gpt-5.x / o-series) reject max_tokens AND a custom
              // temperature, and meter hidden reasoning tokens from the completion budget — so
              // use max_completion_tokens, omit temperature (fixed at 1), and map our adaptive
              // thinkingLevel onto reasoning_effort. Classic models keep max_tokens + temperature.
              ...(reasoning
                ? {
                    // Reasoning meters hidden thinking tokens from THIS budget, so a small cap can
                    // be spent entirely on thinking → empty answer. Floor to 1500 (the tiny
                    // on-demand callers pass 150–500) so a low-effort think still leaves room to
                    // write; the big canvas turn already passes far more, so max() is a no-op there.
                    // A glimpse is the one case with nothing to reserve — it runs at the `minimal`
                    // tier below, where there is no hidden pass to leave room for — so its own
                    // budget stands. Floor and tier move together, never separately: dropping the
                    // floor while still asking for a `low` think is how a small caller ends up
                    // billed for reasoning and handed an empty completion.
                    max_completion_tokens: glimpse
                      ? (req.maxTokens ?? 1024)
                      : Math.max(req.maxTokens ?? 1024, 1500),
                    // reasoning_effort takes low|medium|high across OpenAI-compatible reasoning
                    // models (o-series, Grok). Pin 'low' by default — sending nothing lets the API
                    // default ('medium') apply, and at medium a reasoning model spends its whole
                    // output budget thinking about the large canvas prompt and returns an empty
                    // answer (see the measured note in openaiResponsesCompatible). 'minimal' is
                    // NOT universally accepted, so it goes out only where the model family
                    // documents it and the caller asked for a glimpse (isMinimalGlimpse) — never
                    // on a search turn, whose reasoning-gated tool wants the higher tier.
                    reasoning_effort: glimpse ? 'minimal' : 'low',
                  }
                : { max_tokens: req.maxTokens ?? 1024, temperature: req.temperature ?? 0.3 }),
              // json_object mode coexists with the search tool — the model still emits JSON;
              // citations come back as separate delta.annotations entries.
              response_format: { type: 'json_object' },
              stream: true,
              // Ask for the token-usage summary frame (input/output/cached counts) — the only way
              // Chat Completions reports usage while streaming. It arrives after the finish frame;
              // the read loop below stays one extra frame to catch it.
              stream_options: { include_usage: true },
              // Inject the provider's hosted web-search tool only when the turn needs fresh data.
              ...(searchTool ? { tools: [searchTool] } : {}),
              messages: [
                systemMessage,
                ...req.history,
                {
                  role: 'user',
                  // Only a vision-capable model gets image parts; otherwise the attachment
                  // degrades to a text note so a non-vision OpenAI-compatible model still
                  // knows something was attached rather than receiving an unreadable part.
                  content: capabilities.vision
                    ? withPerTurn(openaiUserContent(req.user, req.attachments))
                    : withPerTurn(textOnlyUser(req.user, req.attachments)),
                },
              ],
            }),
          },
          GEN_TIMEOUT_MS,
          signal,
        );
        // The body says WHY: an out-of-credit 429 and a per-minute 429 are the same status, and the
        // in-band error path below already folds the same shape (see inBandErrorMessage).
        if (!res.ok) throw new Error(`${id} ${res.status}${await providerErrorDetail(res)}`);

        let acc = '';
        let usage: TokenUsage | undefined;
        // After a finish_reason frame we stay for at most ONE more frame — the usage summary
        // (stream_options.include_usage) arrives with an empty choices[] AFTER the finish frame.
        let finished = false;
        // url_citation annotations arrive as choices[0].delta.annotations entries alongside
        // the regular content stream. Deduplicated by URL so duplicate citations don't pile up.
        const citationMap = new Map<string, { title: string; url: string }>();
        // Set from inside the SSE callback below when a frame carries a top-level `error`
        // instead of `choices[]`; thrown AFTER readSSE returns (readSSE's own per-frame try/catch
        // would otherwise swallow a throw from inside the callback as "a split frame — ignore").
        let inBandError: string | undefined;
        try {
          await readSSE(res, (ev) => {
            const body = obj(ev);
            if (body.error) {
              inBandError = inBandErrorMessage(id, obj(body.error));
              return true; // stop reading — nothing useful follows an error frame
            }
            // Usage rides a post-finish frame with empty choices[] (stream_options.include_usage),
            // or on the finish frame itself on some gateways (Groq). Capture it wherever it lands.
            const u = obj(body.usage);
            if (u.prompt_tokens !== undefined || u.completion_tokens !== undefined) {
              usage = {
                input: num(u.prompt_tokens),
                output: num(u.completion_tokens),
                cachedInput: num(obj(u.prompt_tokens_details).cached_tokens),
              };
              if (finished) return true; // the frame we stayed for — stop now
            }
            if (finished) return true; // a post-finish frame without usage — stop anyway
            const choice = obj(arr(body.choices)[0]);
            const delta = obj(choice.delta);
            const frag = str(delta.content);
            if (frag) {
              acc += frag;
              onDelta?.(frag);
            }
            // Reasoning/"thinking" tokens (OpenRouter `delta.reasoning`; some routes use
            // `reasoning_content`). Surface them tagged so the UI shows a live "Thinking…" state —
            // NEVER add them to `acc`, or they'd corrupt the answer JSON.
            const rfrag = str(delta.reasoning) || str(delta.reasoning_content);
            if (rfrag) onDelta?.(rfrag, { reasoning: true });
            if (searchTool) {
              for (const ann of arr(delta.annotations)) {
                const a = obj(ann);
                if (str(a.type) === 'url_citation') {
                  const cite = obj(a.url_citation);
                  const url = str(cite.url);
                  if (url && !citationMap.has(url)) {
                    citationMap.set(url, { url, title: str(cite.title) || url });
                  }
                }
              }
            }
            // OpenAI-style completion: a frame carrying a finish_reason ('stop'/'length'/…) is the
            // end of the answer. Stay for at most one more frame to catch the usage summary (which
            // OpenAI sends AFTER the finish frame); if usage already rode this frame, stop now. This
            // still bounds a gateway that holds the socket open without [DONE] — the read yields
            // after that single extra frame or trips STREAM_IDLE_MS, caught just below.
            if (str(choice.finish_reason)) {
              finished = true;
              return usage ? true : undefined;
            }
          });
        } catch (err) {
          // A stall while waiting past the finish frame for the usage summary: the answer is
          // already complete, so drop the usage — never the turn. (Some cloaked gateways finish,
          // then hold the socket open without sending the usage frame or [DONE], tripping the
          // idle timer.) Any failure BEFORE the answer finished still propagates.
          if (!finished || !acc) throw err;
        }
        if (inBandError) throw new Error(inBandError);
        const sources = citationMap.size ? [...citationMap.values()] : undefined;
        return { raw: acc, ...(sources ? { sources } : {}), ...(usage ? { usage } : {}) };
      } finally {
        clearTimeout(capTimer);
      }
    },
  };
}
