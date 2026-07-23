// @vitest-environment jsdom
// The honest "Preparing voice…" signal: while a queued line is still being synthesized (engaged
// but not audible), isVoicePreparing() must be true — this is the seconds-long window on a slow
// machine that used to show a pulsing "Speaking" pill over silence — and a hard cancel must
// clear it immediately. Uses the real kokoro queue with fetch faked: the health probe answers
// up, synthesis hangs forever (jsdom has no WebAudio, so the line sits in the blob fetch).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speakKokoroLine, cancelKokoro, resetKokoroProbe } from '../src/voice/kokoro';
import { isVoicePreparing } from '../src/voice/tts';

let synthRequests = 0;

beforeEach(() => {
  resetKokoroProbe();
  synthRequests = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/tts/health')) {
        return Promise.resolve({ ok: true } as Response);
      }
      // Synthesis never completes — the exact shape of a slow machine mid-render.
      synthRequests++;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }),
  );
});

afterEach(() => {
  cancelKokoro();
  vi.unstubAllGlobals();
});

describe('isVoicePreparing', () => {
  it('is true while a queued line synthesizes, and false the moment the queue is cancelled', async () => {
    expect(isVoicePreparing()).toBe(false);
    const line = speakKokoroLine('a line that will never finish rendering', 'mavea');
    await vi.waitFor(() => expect(isVoicePreparing()).toBe(true));
    // Cancel only once synthesis is genuinely in flight (the abortable window under test).
    await vi.waitFor(() => expect(synthRequests).toBeGreaterThan(0));

    cancelKokoro();
    expect(isVoicePreparing()).toBe(false);
    // The cancelled line still settles both lifecycle promises (never leaks a waiter).
    await expect(line.started).resolves.toBe(false);
    await expect(line.finished).resolves.toBe(false);
  });
});
