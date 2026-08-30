// gemini.ts — Google Gemini adapter (Flash / Flash-Lite are the cheap, very fast
// options). Structured output via generationConfig.responseSchema +
// responseMimeType:application/json; streams via :streamGenerateContent?alt=sse.
// Through the same-origin /llm/gemini proxy (x-goog-api-key header, no CORS).
//
// Cost shape (Flash-Lite): implicit caching is on by default for Gemini 2.5+, and the
// stable, verbatim `systemInstruction` (prompt + component menu) is sent FIRST every
// turn while only the rolling history + question vary — so the big input is a cache hit
// (~10% of base price) on every turn after the first. We never manage cachedContent.
//
// Reasoning effort is a dial: most Live turns are visual composition, not deep
// reasoning, so we let Flash-Lite's `minimal` default stand and only raise it (to
// `low`) for a genuinely hard ask — set per turn via req.thinkingLevel.
//
// Real-time grounding: on Gemini 3 the google_search + url_context tools COMBINE with a
// strict responseSchema in one call, and the response carries groundingMetadata with
// the real source URLs — so a grounded, cited answer still arrives as our rich JSON
// canvas, no extra round-trip. Tools are added only when the turn asks for them, and
// Google bills a search query only when the answer actually used a web source.
import type { ModelConfig } from '../../types/mavea';
import type {
  ProviderAdapter,
  LiveRequest,
  LiveProbe,
  DeltaFn,
  RawResult,
  ThinkingLevel,
  GroundingSource,
  TokenUsage,
} from './types';
import {
  fetchWithTimeout,
  readSSE,
  isStreamStall,
  retryAfterMs,
  sleepAbortable,
  PROVIDER_BLOCKED,
  PROVIDER_EMPTY,
  PROVIDER_THINKING_BUDGET,
  obj,
  str,
  arr,
  num,
  noteRateLimited,
} from './http';
import { geminiUserParts } from './parts';

// Default base is the same-origin proxy prefix; cfg.baseUrl overrides with the
// direct API base (https://generativelanguage.googleapis.com) for Node eval runs.
const PROXY_BASE = '/llm/gemini';
const API_BASE = '/v1beta';
const GEN_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 4_000;
/** Hard ceiling on one turn's whole stream. GEN_TIMEOUT_MS only guards time-to-first-BYTE and the
 *  SSE idle timer only catches a stream that has gone silent — neither stops one that trickles
 *  forever. Matches the ceiling openaiCompatible has always had; generous, because the face shows a
 *  live thinking state throughout. */
const STREAM_TOTAL_MS = 180_000;
/** Transient statuses worth one more try: 429 is a per-minute rate limit, 503 is Google's
 *  "model overloaded". Both clear on their own; failing the turn on them makes the user do by hand
 *  exactly what this loop does. */
const RETRY_STATUSES = new Set([429, 503]);
const TRANSIENT_RETRIES = 2;
/** Finish reasons that mean the model refused, rather than ran out of room or simply finished. */
const BLOCKED_FINISH = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']);

function keyHeader(cfg: ModelConfig): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey ?? '' };
}

/** Pull the short reason out of a Gemini error body so the thrown message can distinguish a
 *  transient per-minute rate limit from grounding-not-available-on-this-tier — both arrive as
 *  429 but warrant different user guidance. Returns " — <status/reason>" or '' (never throws,
 *  never leaks the full body or any key). */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { status?: unknown; message?: unknown } };
    const status = typeof body.error?.status === 'string' ? body.error.status : '';
    const msg = typeof body.error?.message === 'string' ? body.error.message : '';
    // RESOURCE_EXHAUSTED on a grounded request = the separately-metered Search grounding quota;
    // surface that word so describeLiveError can tell the user grounding isn't available, not
    // that their whole key is dead.
    // For auth/config failures (403 PERMISSION_DENIED, 400 INVALID_ARGUMENT), the STATUS alone
    // ("PERMISSION_DENIED") is opaque — Google's message says *why* ("API key not valid", "API not
    // enabled for project…"). Append a trimmed message so the cause is actionable, never the key.
    const detail = status && msg ? `${status}: ${msg.slice(0, 160)}` : status || msg.slice(0, 160);
    return detail ? ` — ${detail}` : '';
  } catch {
    return '';
  }
}

/** Gemini's thinkingConfig uses uppercase level names. Omit the whole config when no
 *  level is requested, so the model's own default (Flash-Lite = MINIMAL) applies. */
function thinkingConfig(level?: ThinkingLevel): { thinkingLevel: string } | undefined {
  if (!level) return undefined;
  return { thinkingLevel: level.toUpperCase() };
}

/** Build the `tools` array for a turn. google_search grounds the answer in real-time
 *  web results; url_context lets the model read URLs in the user's text. Returns
 *  undefined (no tools key) when nothing is requested. */
function buildTools(req: LiveRequest): Array<Record<string, unknown>> | undefined {
  const tools: Array<Record<string, unknown>> = [];
  if (req.tools?.webSearch) tools.push({ google_search: {} });
  if (req.tools?.urlContext) tools.push({ url_context: {} });
  return tools.length ? tools : undefined;
}

/** Turn a 200-OK-but-empty Gemini response into an error that says what happened.
 *
 * Gemini reports a refusal in-band: HTTP 200, a well-formed stream, and `finishReason` /
 * `promptFeedback.blockReason` instead of text. Reading only `parts[].text` therefore produced an
 * empty string, which validateLiveResponse rejected, which triggered generateLive's collapse
 * recovery — a SECOND billed call the user never saw — before finally rendering the fallback card
 * that reads "try asking again". That card is why people learned to send the prompt twice. */
function emptyResponseError(finishReason: string, blockReason: string): Error {
  const reason = blockReason || finishReason;
  if (blockReason || BLOCKED_FINISH.has(finishReason)) {
    return new Error(`gemini ${PROVIDER_BLOCKED} — ${reason}`);
  }
  // MAX_TOKENS with nothing visible means the thinking budget consumed the entire allowance; the
  // user can actually fix that, so say so rather than calling it an empty answer.
  if (finishReason === 'MAX_TOKENS') return new Error(`gemini ${PROVIDER_THINKING_BUDGET}`);
  return new Error(`gemini ${PROVIDER_EMPTY}${reason ? ` — ${reason}` : ''}`);
}

/** Pull the real web sources out of a candidate's groundingMetadata. Sources arrive in
 *  `groundingChunks[].web.{uri,title}`; we collect them across the stream and dedup by
 *  URL so the citation list matches what actually grounded the answer. */
function collectGrounding(cand: Record<string, unknown>, into: Map<string, GroundingSource>): void {
  const meta = obj(cand.groundingMetadata);
  for (const chunk of arr(meta.groundingChunks)) {
    const web = obj(obj(chunk).web);
    const url = str(web.uri);
    if (!url || into.has(url)) continue;
    into.set(url, { title: str(web.title) || url, url });
  }
}

export const geminiAdapter: ProviderAdapter = {
  id: 'gemini',
  capabilities: {
    constrainedDecoding: true,
    streaming: true,
    vision: true,
    contextWindow: 1_000_000,
    strengthTier: 'frontier',
    // Gemini grounds server-side via the google_search tool, so generateLive skips its
    // app-side retrieve-then-read for this provider and lets the adapter handle it.
    nativeWebSearch: true,
  },

  async probe(cfg: ModelConfig): Promise<LiveProbe> {
    try {
      const base = cfg.baseUrl ?? PROXY_BASE;
      const res = await fetchWithTimeout(
        `${base}${API_BASE}/models`,
        { method: 'GET', headers: keyHeader(cfg) },
        PROBE_TIMEOUT_MS,
      );
      if (!res.ok) return { ok: false, model: false, statusCode: res.status };
      const body: unknown = await res.json();
      // model names come back as "models/gemini-3.1-flash-lite"
      const names = arr(obj(body).models).map((m) => str(obj(m).name).replace(/^models\//, ''));
      return { ok: true, model: names.length === 0 || names.includes(cfg.model) };
    } catch {
      return { ok: false, model: false };
    }
  },

  async generate(req: LiveRequest, cfg: ModelConfig, onDelta?: DeltaFn): Promise<RawResult> {
    const base = cfg.baseUrl ?? PROXY_BASE;
    const url = `${base}${API_BASE}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
    // Implicit caching needs a BYTE-IDENTICAL prefix turn-to-turn. req.system carries per-turn
    // guidance (the selected-block menu, hero picks, freshness) that changes every turn, so
    // sending it as the systemInstruction defeats the cache. Send the STABLE systemBase
    // (liveSystemPrompt(tier)) as the systemInstruction instead and fold the per-turn delta into
    // the user turn — the model still sees every instruction, but now the large prefix
    // (systemInstruction + prior history) hits Gemini's implicit cache (~90% input discount).
    const sysBase = req.systemBase;
    let stableSystem = req.system;
    let perTurn = '';
    if (sysBase && req.system.startsWith(sysBase)) {
      stableSystem = sysBase;
      perTurn = req.system.slice(sysBase.length).trim();
    }
    const userParts = geminiUserParts(req.user, req.attachments);
    const contents = [
      ...req.history.map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: perTurn ? [{ text: perTurn }, ...userParts] : userParts },
    ];
    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.3,
      maxOutputTokens: req.maxTokens ?? 1024,
      // JSON mode guarantees parseable output. We deliberately DON'T send a responseSchema:
      // because each block's `props` is an open object (its shape varies per the 150+ block
      // types), a strict schema makes Gemini take the trivially-valid path and emit `props:{}`
      // for every block — a wall of empty cards. The prompt fully specifies the shape and the
      // single validation core owns correctness, exactly like the OpenAI json_object path; this
      // also lets the model fill the rich OPTIONAL fields the per-turn menu teaches. (It's the
      // same reason native grounding tools compose cleanly here — no schema to fight.)
      responseMimeType: 'application/json',
    };
    const thinking = thinkingConfig(req.thinkingLevel);
    if (thinking) generationConfig.thinkingConfig = thinking;
    const tools = buildTools(req);

    const requestInit: RequestInit = {
      method: 'POST',
      headers: keyHeader(cfg),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: stableSystem }] },
        contents,
        generationConfig,
        ...(tools ? { tools } : {}),
      }),
    };

    // Total-turn ceiling, merged with the caller's abort (a superseded turn). See STREAM_TOTAL_MS.
    const capCtrl = new AbortController();
    const capTimer = setTimeout(() => capCtrl.abort(), STREAM_TOTAL_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, capCtrl.signal]) : capCtrl.signal;
    try {
      // One retry for a stream that went quiet before a single byte. Bounded to the ZERO-byte case
      // on purpose: once fragments have been streamed the user has seen them and generateLive
      // salvages what arrived, so re-asking would both double-bill and paint the answer twice.
      for (let attempt = 0; ; attempt++) {
        let acc = '';
        const grounding = new Map<string, GroundingSource>();
        let usage: TokenUsage | undefined;
        let finishReason = '';
        let blockReason = '';
        try {
          let res: Response;
          for (let tries = 0; ; tries++) {
            res = await fetchWithTimeout(url, requestInit, GEN_TIMEOUT_MS, signal);
            if (res.ok) break;
            // Even a retried-and-recovered 429 must reach the guard: speculative work checks
            // recentlyRateLimited() before spending, and quota contention is per-minute.
            noteRateLimited(res.status);
            if (RETRY_STATUSES.has(res.status) && tries < TRANSIENT_RETRIES && !signal.aborted) {
              await sleepAbortable(retryAfterMs(res, tries), signal);
              continue;
            }
            throw new Error(`gemini ${res.status}${await errorDetail(res)}`);
          }

          await readSSE(res, (ev) => {
            // candidates[0]: text fragments in content.parts[], sources in groundingMetadata.
            const cand = obj(arr(obj(ev).candidates)[0]);
            const parts = arr(obj(cand.content).parts);
            for (const p of parts) {
              const frag = str(obj(p).text);
              if (frag) {
                acc += frag;
                onDelta?.(frag);
              }
            }
            collectGrounding(cand, grounding);
            // Why the stream ended, and whether the prompt itself was refused. Only consulted when
            // no text arrived — a finished answer needs no explanation, and a MAX_TOKENS stop with
            // real content is generateLive's existing "cut short" salvage, not a failure.
            finishReason = str(cand.finishReason) || finishReason;
            blockReason = str(obj(obj(ev).promptFeedback).blockReason) || blockReason;
            // usageMetadata rides on the final chunk(s); cachedContentTokenCount is the slice
            // billed at the cheap cached rate (implicit caching — proves the long-convo savings).
            const u = obj(ev).usageMetadata;
            if (u) {
              usage = {
                input: num(obj(u).promptTokenCount),
                output: num(obj(u).candidatesTokenCount),
                cachedInput: num(obj(u).cachedContentTokenCount),
              };
            }
          });
        } catch (err) {
          if (attempt === 0 && !acc && isStreamStall(err) && !signal.aborted) continue;
          throw err;
        }
        if (!acc) throw emptyResponseError(finishReason, blockReason);
        const out: RawResult = { raw: acc };
        if (grounding.size) out.sources = [...grounding.values()];
        if (usage) out.usage = usage;
        return out;
      }
    } finally {
      clearTimeout(capTimer);
    }
  },
};
