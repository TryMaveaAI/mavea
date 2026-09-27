// http.ts — shared transport helpers for the provider adapters.
// fetch-with-timeout (never leaks the timer) + minimal SSE / NDJSON stream
// readers. Streaming is what makes Live feel real-time: the face speaks the
// narration as soon as the first tokens land, while blocks are still generating.

/** fetch with an AbortController timeout. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Abort on EITHER the timeout or the caller's signal (a superseded turn), so an interrupted
  // request stops the fetch — and its stream reader — instead of running to completion.
  const sig = signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal;
  try {
    return await fetch(url, { ...init, signal: sig });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A short, safe reason from a failed response's body, to append to the thrown `"<provider> <status>"`
 * message. The status alone is ambiguous where it matters most: a 429 is EITHER a transient
 * per-minute rate limit ("wait a moment") OR a real quota exhaustion ("your plan is out"), and
 * describeLiveError can only tell them apart from the provider's own words. Without this, every 429
 * read as a transient rate limit and a user whose credit had actually run out was told to wait.
 *
 * Reads the body as text (an error can arrive as HTML from a gateway), then pulls the message out of
 * the JSON shape every provider uses — `{ error: { message, type|status|code } }`. Trimmed hard, so
 * no key, header, or whole body can ride along. Never throws: no detail is always an acceptable answer.
 */
/* Until when optional provider work should stay quiet. This learns from live response headers and
 * transient failures; quota tables vary by model, account, and tier, so a baked-in RPM number would
 * be stale (and wrong for the user's key) the moment a provider changes it. */
let providerPressureUntil = 0;
let providerPressureObservedAt = 0;

/**
 * Whether a provider rate-limited us inside the given window. Speculative work (chip prefetch,
 * background enrichment) checks this before spending: quotas are per-minute, so a speculative
 * call made in the shadow of a 429 doesn't just fail — it eats the budget the user's NEXT
 * interactive turn needs, which is how one question came to retry three times before landing.
 */
export function recentlyRateLimited(windowMs = 60_000): boolean {
  if (windowMs <= 0) return false;
  const now = Date.now();
  return providerPressureUntil > now || now - providerPressureObservedAt < windowMs;
}

/** Note provider pressure seen OUTSIDE providerErrorDetail. The Gemini and Responses adapters retry
 * 429/overload responses
 *  inside their own loops and only reach an error-detail call on the FINAL failure — so a
 *  retried-then-recovered rate limit (the common shape) never told the guard anything, and the
 *  guard was inert on exactly the providers it was built for. */
export function noteRateLimited(status: number): void {
  if (status === 429 || status === 503 || status === 529) {
    providerPressureObservedAt = Date.now();
    providerPressureUntil = Math.max(providerPressureUntil, Date.now());
  }
}

export async function providerErrorDetail(res: Response): Promise<string> {
  observeProviderLimits(res);
  try {
    const text = (await res.text()).slice(0, 2000);
    if (!text) return '';
    let reason = '';
    let message = '';
    try {
      const body = obj(JSON.parse(text));
      const err = obj(body.error);
      reason = str(err.status) || str(err.type) || str(err.code);
      message = str(err.message) || str(body.message);
    } catch {
      /* not JSON (an HTML gateway page) — fall through to the raw text below */
    }
    const detail = [reason, message || (reason ? '' : text)].filter(Boolean).join(': ');
    return detail ? ` — ${detail.replace(/\s+/g, ' ').trim().slice(0, 160)}` : '';
  } catch {
    return '';
  }
}

/** The words a provider uses when the KEY itself is no good — missing, malformed, revoked, or not
 *  enabled for this API. Google returns these as a 400 INVALID_ARGUMENT, which a plain status
 *  ladder reads as "check the model name" (a turn) or "Error 400." (the setup wizard) — so both the
 *  turn path and the readiness strip match on the provider's own words instead. */
const BAD_KEY =
  /api[_ ]?key not valid|api[_ ]?key.{0,20}invalid|invalid[_ ]api[_ ]?key|API_KEY_INVALID|missing.{0,10}api[_ ]?key|authentication[_ ]error/i;

/** Whether a provider's own error text says the key — not the model, not the request — is the
 *  problem. Reads a thrown adapter message or a probe's `detail` equally. */
export function looksLikeBadKey(text: string | undefined): boolean {
  return !!text && BAD_KEY.test(text);
}

/** Max silence between stream chunks before we treat the stream as stalled.
 *  The fetch-level timeout above only guards time-to-FIRST-byte — it's cleared the instant the
 *  response headers arrive, so it does NOT protect the body. A provider that streams a few blocks
 *  and then goes quiet — without closing the connection — would otherwise hang the read loop (and
 *  the turn) forever on "Composing your answer…". Healthy streams emit tokens/keep-alives every
 *  few seconds, so a 30s gap with zero bytes is a genuine stall, not a slow-but-live generation. */
export const STREAM_IDLE_MS = 15_000;

/** Max silence before the FIRST chunk, which is a different wait from the gaps that follow.
 *  Once a stream is flowing, 30s of nothing means it died. But the first frame is preceded by the
 *  model reading the whole prompt and (where thinking is on) reasoning before it emits a token —
 *  and on the first turn of a session none of that prefix is cached, so it is by far the slowest
 *  frame of the turn. Holding it to the mid-stream budget turned an ordinary cold start into
 *  "stream stalled", which carries no status and so surfaced as "couldn't reach the provider" —
 *  and the retry the user then typed by hand succeeded, because by then the prefix was cached. */
export const STREAM_FIRST_CHUNK_MS = 25_000;

/** Thrown when a stream goes quiet past its budget. It is never re-sent automatically: the
 *  provider may already be billing the prompt it was reading, so the turn fails and the reader's
 *  Retry decides. */
export const STREAM_STALLED = 'stream stalled';

/* --- markers for a 200 OK that carried no usable answer ------------------------------------- *
 * A provider can accept a request, return HTTP 200, and stream nothing — safety-blocked, stopped
 * on recitation, or having spent its whole output budget on thinking. With no status code to read,
 * describeLiveError would file every one of those under "couldn't reach the provider". Adapters put
 * one of these markers in the thrown message so the user gets told what actually happened. */

/** The provider refused the content (safety, recitation, prohibited content). */
export const PROVIDER_BLOCKED = 'content-blocked';
/** The provider answered, but with nothing in it, and said no more than that. */
export const PROVIDER_EMPTY = 'empty-response';
/** The output budget was spent before a single visible token — thinking ate the whole allowance. */
export const PROVIDER_THINKING_BUDGET = 'thinking-budget';

/** How long to wait before retrying a rate-limited request: the provider's own Retry-After header
 *  when it sent one (capped), else a short exponential backoff. Shared by every adapter that
 *  retries, so a burst of dashboard refreshes rides out a brief tokens-per-minute spike the same
 *  way whichever model is connected. */
export function retryAfterMs(res: Response, attempt: number, detail = ''): number {
  const exact = providerRetryDelayMs(res);
  if (exact !== undefined) return exact;
  const bodyHint = /retry(?: after| in)?\s+([\d.]+)\s*(ms|s|m)\b/i.exec(detail);
  if (bodyHint) {
    const unit = bodyHint[2]!.toLowerCase();
    const multiplier = unit === 'ms' ? 1 : unit === 'm' ? 60_000 : 1000;
    return Math.min(Number(bodyHint[1]) * multiplier, 30_000);
  }
  const base = Math.min(900 * 2 ** attempt, 12_000);
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

/** Statuses worth a bounded automatic retry. The gateway timeouts (504, and Cloudflare's 524 in
 *  front of a gateway) are deliberately absent: the upstream model may have run, and billed, the
 *  whole ask before the gateway gave up, so a silent re-send could charge the reader twice. */
const TRANSIENT_PROVIDER_STATUSES = new Set([408, 429, 500, 502, 503, 529]);
const NON_RETRYABLE_QUOTA =
  /(?:requests?|tokens?)\s+per\s+day|daily quota|billing|credit balance|insufficient[_ ](?:quota|funds)|monthly.?limit|spend.?limit/i;

/** Whether another bounded attempt can plausibly help. Daily/spend exhaustion is deliberately not
 * retried: it wastes the very allowance the user is trying to protect. */
export function isTransientProviderFailure(status: number, detail = ''): boolean {
  return TRANSIENT_PROVIDER_STATUSES.has(status) && !NON_RETRYABLE_QUOTA.test(detail);
}

function durationMs(raw: string, now: number): number | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  // HTTP dates and Anthropic's ISO reset timestamps contain fragments such as "24 Sep"; parse
  // them before the compact-duration grammar so the day is never mistaken for "24s".
  if (value.includes(',') || /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = Date.parse(value);
    return Number.isFinite(date) ? date - now : undefined;
  }
  const pieces = [...value.matchAll(/([\d.]+)\s*(ms|s|m|h)/gi)];
  if (pieces.length) {
    const units = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;
    return pieces.reduce((sum, match) => {
      const unit = match[2]!.toLowerCase() as keyof typeof units;
      return sum + Number(match[1]) * units[unit];
    }, 0);
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 1_000_000_000_000) return numeric - now;
    if (numeric > 1_000_000_000) return numeric * 1000 - now;
    return numeric * 1000;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? date - now : undefined;
}

/** Read the retry/reset dialects exposed by OpenAI-compatible and Anthropic responses. Exact
 * provider guidance wins over local backoff; waits stay bounded so an interactive turn never hangs
 * behind a far-future daily reset. */
export function providerRetryDelayMs(res: Response, now = Date.now()): number | undefined {
  // A Response always has Headers in browsers. Keeping the guard makes this helper tolerant of the
  // deliberately minimal response doubles used by readiness probes and third-party adapters.
  if (!res.headers?.get) return undefined;
  const retryMs = Number(res.headers.get('retry-after-ms'));
  if (Number.isFinite(retryMs) && retryMs > 0) return Math.min(retryMs, 30_000);

  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : durationMs(retryAfter, now);
    if (parsed !== undefined && parsed > 0) return Math.min(parsed, 30_000);
  }

  const resetHeaders = [
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
    'anthropic-ratelimit-requests-reset',
    'anthropic-ratelimit-tokens-reset',
    'ratelimit-reset',
  ];
  const waits = resetHeaders
    .map((header) => res.headers.get(header))
    .filter((value): value is string => value !== null)
    .map((value) => durationMs(value, now))
    .filter((value): value is number => value !== undefined && value > 0);
  return waits.length ? Math.min(Math.max(...waits), 30_000) : undefined;
}

/** Learn pressure from every provider response. A failed overload suppresses speculative work; a
 * successful response reporting zero remaining requests/tokens does the same until its reset. */
export function observeProviderLimits(res: Response): void {
  const pressured = res.status === 429 || res.status === 503 || res.status === 529;
  const exhausted = res.headers?.get
    ? [
        'x-ratelimit-remaining-requests',
        'x-ratelimit-remaining-tokens',
        'anthropic-ratelimit-requests-remaining',
        'anthropic-ratelimit-tokens-remaining',
      ].some((header) => {
        const remaining = res.headers.get(header);
        return remaining !== null && Number(remaining) === 0;
      })
    : false;
  if (!pressured && !exhausted) return;
  providerPressureObservedAt = Date.now();
  const delay = providerRetryDelayMs(res) ?? (pressured ? 15_000 : 60_000);
  providerPressureUntil = Math.max(providerPressureUntil, Date.now() + delay);
}

/** A cancellable sleep — resolves after `ms`, or rejects the moment the turn aborts, so a
 *  superseded turn never sits out a backoff it no longer cares about. */
export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** One `reader.read()`, but rejected if no chunk arrives within `idleMs` — so a mid-stream stall
 *  surfaces as an error the turn can recover from instead of an indefinite freeze. */
async function readChunk<T>(
  reader: ReadableStreamDefaultReader<T>,
  idleMs: number,
): Promise<ReadableStreamReadResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(STREAM_STALLED)), idleMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a Server-Sent-Events body (`text/event-stream`), invoking `onData` with
 * each parsed `data:` JSON payload. Ignores comments, keep-alives, `[DONE]`, and
 * any line that fails to parse (partial frames). Returns when the stream ends.
 *
 * `onData` may return `true` to END the read immediately — the adapter uses this when a frame
 * carries an in-band completion signal (an OpenAI `finish_reason`). Some gateways (cloaked /
 * stealth OpenRouter models) finish the answer but then hold the connection open with keep-alives
 * and never send `[DONE]` or close it; without this the loop — and the turn — would hang until the
 * total-stream cap. On an early stop the still-open socket is released.
 *
 * The wait for the FIRST frame gets its own, longer budget (`firstChunkMs`): it covers the model
 * reading the prompt and thinking, which no later gap does. See STREAM_FIRST_CHUNK_MS.
 */
export async function readSSE(
  res: Response,
  onData: (obj: unknown) => void | boolean,
  idleMs: number = STREAM_IDLE_MS,
  firstChunkMs: number = STREAM_FIRST_CHUNK_MS,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = '';
  let first = true;
  try {
    for (;;) {
      const { done, value } = await readChunk(reader, first ? firstChunkMs : idleMs);
      first = false;
      // Flush the decoder on the final read so a multi-byte char split across the last chunk
      // boundary isn't silently dropped.
      buf += done ? dec.decode() : dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          // A truthy return = the answer is complete; stop now and release the open connection.
          if (onData(JSON.parse(payload) as unknown)) {
            await reader.cancel().catch(() => {});
            return;
          }
        } catch {
          /* keep-alive or split frame — ignore */
        }
      }
      if (done) break;
    }
  } catch (err) {
    // A stalled (or aborted) stream: release the socket so it can't linger, then surface the
    // failure to the adapter — generateLive maps it to a recoverable error, never a frozen turn.
    await reader.cancel().catch(() => {});
    throw err;
  }
}

/**
 * Read a newline-delimited JSON (NDJSON) body, invoking `onObj` with each parsed
 * line object.
 */
export async function readNDJSON(
  res: Response,
  onObj: (obj: unknown) => void,
  idleMs: number = STREAM_IDLE_MS,
  firstChunkMs: number = STREAM_FIRST_CHUNK_MS,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = '';
  let first = true;
  try {
    for (;;) {
      const { done, value } = await readChunk(reader, first ? firstChunkMs : idleMs);
      first = false;
      // Flush the decoder on the final read (see readSSE) so a split multi-byte char survives.
      buf += done ? dec.decode() : dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          onObj(JSON.parse(line) as unknown);
        } catch {
          /* partial line — ignore */
        }
      }
      if (done) break;
    }
  } catch (err) {
    // See readSSE — release the stalled/aborted stream and let the adapter surface the error.
    await reader.cancel().catch(() => {});
    throw err;
  }
}

/* --- tiny defensive accessors (same spirit as liveSchema) for unknown payloads --- */
export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
