// The fetch-level timeout only guards time-to-first-byte (it's cleared the instant headers
// arrive). A provider that streams a few chunks and then goes silent — without closing the
// connection — used to hang the read loop, and the turn, forever ("Composing your answer…").
// The stream readers now bound each chunk wait with an idle watchdog so a mid-stream stall
// surfaces as an error the turn can recover from. This is the "sometimes it freezes" regression.
import { describe, it, expect } from 'vitest';
import { readSSE, readNDJSON } from '../src/live/providers/http';

const enc = new TextEncoder();

/** A response whose body emits the given chunks, then optionally NEVER closes (a stalled stream). */
function streamResponse(chunks: string[], contentType: string, close = true): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      if (close) controller.close();
      // else: leave the stream open forever — the provider has gone silent mid-flight.
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

describe('stream idle watchdog', () => {
  it('aborts an SSE stream that stalls mid-flight instead of hanging forever', async () => {
    const got: unknown[] = [];
    const res = streamResponse(['data: {"v":1}\n'], 'text/event-stream', false);
    await expect(
      readSSE(
        res,
        (o) => {
          got.push(o);
        },
        40,
      ),
    ).rejects.toThrow(/stall/i);
    // The chunk that DID arrive before the stall was still delivered (the turn isn't lost — it
    // settles into a recoverable error with whatever streamed so far).
    expect(got).toEqual([{ v: 1 }]);
  });

  it('aborts an NDJSON stream that stalls mid-flight', async () => {
    const got: unknown[] = [];
    const res = streamResponse(['{"a":1}\n'], 'application/x-ndjson', false);
    await expect(
      readNDJSON(
        res,
        (o) => {
          got.push(o);
        },
        40,
      ),
    ).rejects.toThrow(/stall/i);
    expect(got).toEqual([{ a: 1 }]);
  });

  it('ends promptly on an in-band completion signal even if the connection never closes', async () => {
    // The "owl-alpha hangs forever" case: a cloaked gateway streams the whole answer, emits a
    // finish_reason frame, then holds the socket open with no [DONE] and no close. Returning true
    // from onData on that frame must end the read at once — not wait out the idle/total cap (which
    // would leave the turn stuck on "Composing your answer…", composer disabled).
    const got: unknown[] = [];
    const res = streamResponse(
      [
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
        'data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n',
      ],
      'text/event-stream',
      false, // never closes — the provider keeps the connection open
    );
    // A generous idle budget: if early-stop were broken the read would hang and the watchdog
    // would reject; instead it resolves immediately on the finish frame.
    await readSSE(
      res,
      (o) => {
        got.push(o);
        const choice = (o as { choices?: { finish_reason?: string }[] }).choices?.[0];
        return !!choice?.finish_reason;
      },
      5_000,
    );
    expect(got).toHaveLength(2);
  });

  it('a healthy stream that closes promptly still completes and delivers every frame', async () => {
    const got: unknown[] = [];
    const res = streamResponse(
      ['data: {"v":1}\n', 'data: {"v":2}\n', 'data: [DONE]\n'],
      'text/event-stream',
    );
    // A short idle budget proves the watchdog never trips on a stream that keeps moving + closes.
    await readSSE(
      res,
      (o) => {
        got.push(o);
      },
      40,
    );
    expect(got).toEqual([{ v: 1 }, { v: 2 }]);
  });
});
