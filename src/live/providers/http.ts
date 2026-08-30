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
/* When any provider last answered 429 (epoch ms), noted by providerErrorDetail below —
 * the one chokepoint every adapter's error path already flows through. */
let rateLimitedAt = 0;

/**
 * Whether a provider rate-limited us inside the given window. Speculative work (chip prefetch,
 * background enrichment) checks this before spending: quotas are per-minute, so a speculative
 * call made in the shadow of a 429 doesn't just fail — it eats the budget the user's NEXT
 * interactive turn needs, which is how one question came to retry three times before landing.
 */
export function recentlyRateLimited(windowMs = 60_000): boolean {
  return Date.now() - rateLimitedAt < windowMs;
}

/** Note a 429 seen OUTSIDE providerErrorDetail. The Gemini and Responses adapters retry 429s
 *  inside their own loops and only reach an error-detail call on the FINAL failure — so a
 *  retried-then-recovered rate limit (the common shape) never told the guard anything, and the
 *  guard was inert on exactly the providers it was built for. */
export function noteRateLimited(status: number): void {
  if (status === 429) rateLimitedAt = Date.now();
}

export async function providerErrorDetail(res: Response): Promise<string> {
  if (res.status === 429) rateLimitedAt = Date.now();
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

/** Max silence between stream chunks before we treat the stream as stalled.
 *  The fetch-level timeout above only guards time-to-FIRST-byte — it's cleared the instant the
 *  response headers arrive, so it does NOT protect the body. A provider that streams a few blocks
 *  and then goes quiet — without closing the connection — would otherwise hang the read loop (and
 *  the turn) forever on "Composing your answer…". Healthy streams emit tokens/keep-alives every
 *  few seconds, so a 30s gap with zero bytes is a genuine stall, not a slow-but-live generation. */
export const STREAM_IDLE_MS = 30_000;

/** Max silence before the FIRST chunk, which is a different wait from the gaps that follow.
 *  Once a stream is flowing, 30s of nothing means it died. But the first frame is preceded by the
 *  model reading the whole prompt and (where thinking is on) reasoning before it emits a token —
 *  and on the first turn of a session none of that prefix is cached, so it is by far the slowest
 *  frame of the turn. Holding it to the mid-stream budget turned an ordinary cold start into
 *  "stream stalled", which carries no status and so surfaced as "couldn't reach the provider" —
 *  and the retry the user then typed by hand succeeded, because by then the prefix was cached. */
export const STREAM_FIRST_CHUNK_MS = 75_000;

/** Thrown when a stream goes quiet past its budget. Named so a caller can tell a stall — which is
 *  worth one retry when nothing arrived — from a real provider error, which is not. */
export const STREAM_STALLED = 'stream stalled';

/** True when `err` is the stall above (and not, say, an abort or an HTTP failure). */
export function isStreamStall(err: unknown): boolean {
  return err instanceof Error && err.message === STREAM_STALLED;
}

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
export function retryAfterMs(res: Response, attempt: number): number {
  const hdr = Number(res.headers.get('retry-after'));
  if (Number.isFinite(hdr) && hdr > 0) return Math.min(hdr * 1000, 10_000);
  return Math.min(800 * 2 ** attempt, 8_000);
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
