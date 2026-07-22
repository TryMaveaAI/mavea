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
export async function providerErrorDetail(res: Response): Promise<string> {
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
        timer = setTimeout(() => reject(new Error('stream stalled')), idleMs);
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
 */
export async function readSSE(
  res: Response,
  onData: (obj: unknown) => void | boolean,
  idleMs: number = STREAM_IDLE_MS,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await readChunk(reader, idleMs);
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
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await readChunk(reader, idleMs);
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
