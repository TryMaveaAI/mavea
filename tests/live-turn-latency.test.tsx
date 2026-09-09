// What a slow turn was found to be made of, and the four things that keep it from recurring.
//
// Measured live on the reader's own key: 3.1-flash-lite answered in 3-5s most of the time and 16s
// once for the same size, with zero thinking — provider-side time-to-first-byte variance on ~15k
// uncached input tokens. 3.8-flash was worse in a different way: its first request was refused
// (no MINIMAL tier), the re-ask was rate-limited, the backoff retry was rate-limited again, and
// the turn died — all under a status line that said only "composing".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';
import { STREAM_FIRST_CHUNK_MS, STREAM_IDLE_MS } from '../src/live/providers/http';
import { ComposingStatus } from '../src/live/turnstate/ComposingStatus';

const enc = new TextEncoder();
function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const ok = () =>
  sse([
    'data: {"candidates":[{"content":{"parts":[{"text":"{\\"narration\\":\\"Hi\\"}"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}\n',
  ]);
const refusesMinimal = () =>
  new Response(
    JSON.stringify({
      error: { message: 'thinking level MINIMAL is not supported for this model' },
    }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  );
const rateLimited = (retryAfterSec: number) =>
  new Response('{"error":{"message":"quota"}}', {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfterSec) },
  });

const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'k' };
const req: LiveRequest = { system: 'sys', history: [], user: 'why?', thinkingLevel: 'minimal' };
const sentLevel = (call: unknown[]): string | undefined =>
  (
    JSON.parse(String((call[1] as RequestInit).body)) as {
      generationConfig?: { thinkingConfig?: { thinkingLevel?: string } };
    }
  ).generationConfig?.thinkingConfig?.thinkingLevel;

describe('a model with no MINIMAL tier is learned once, not once per page load', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('learns an unknown model refusal once, then a fresh session opens at LOW directly', async () => {
    const futureCfg = { ...cfg, model: 'gemini-future-flash' };
    const fetch1 = vi.fn().mockResolvedValueOnce(refusesMinimal()).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch1);
    const { geminiAdapter } = await import('../src/live/providers/gemini');
    await geminiAdapter.generate(req, futureCfg);
    expect(fetch1).toHaveBeenCalledTimes(2);
    expect(sentLevel(fetch1.mock.calls[0])).toBe('MINIMAL');
    expect(sentLevel(fetch1.mock.calls[1])).toBe('LOW');
    expect(JSON.parse(localStorage.getItem('mavea-gemini-no-minimal') ?? '[]')).toContain(
      'gemini-future-flash',
    );

    // The next page load. This used to re-spend a whole request re-learning the same fact —
    // on a key near its quota, the request that tipped the real one into a 429.
    vi.resetModules();
    const fetch2 = vi.fn().mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch2);
    const fresh = await import('../src/live/providers/gemini');
    await fresh.geminiAdapter.generate(req, futureCfg);
    expect(fetch2).toHaveBeenCalledTimes(1);
    expect(sentLevel(fetch2.mock.calls[0])).toBe('LOW');
  });

  it('opens known 3.7/3.8 Flash models at LOW without paying a rejected request', async () => {
    for (const model of ['gemini-3.7-flash', 'gemini-3.8-flash']) {
      const fetch1 = vi.fn().mockResolvedValueOnce(ok());
      vi.stubGlobal('fetch', fetch1);
      const { geminiAdapter } = await import('../src/live/providers/gemini');
      await geminiAdapter.generate(req, { ...cfg, model });
      expect(fetch1).toHaveBeenCalledTimes(1);
      expect(sentLevel(fetch1.mock.calls[0])).toBe('LOW');
      vi.unstubAllGlobals();
    }
  });

  it('does not remember it for a different model', async () => {
    localStorage.setItem('mavea-gemini-no-minimal', JSON.stringify(['gemini-3.8-flash']));
    const fetch1 = vi.fn().mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch1);
    const { geminiAdapter } = await import('../src/live/providers/gemini');
    await geminiAdapter.generate(req, { ...cfg, model: 'gemini-3.1-flash-lite' });
    expect(sentLevel(fetch1.mock.calls[0])).toBe('MINIMAL');
  });

  it('survives storage that is walled off or holds junk', async () => {
    localStorage.setItem('mavea-gemini-no-minimal', '{not json');
    const fetch1 = vi.fn().mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch1);
    const { geminiAdapter } = await import('../src/live/providers/gemini');
    await expect(geminiAdapter.generate(req, cfg)).resolves.toBeTruthy();
  });
});

describe('a rate-limit backoff is reported, not slept through in silence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('brackets the wait with onWait(ms) and onWait(null)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(rateLimited(1)).mockResolvedValueOnce(ok()),
    );
    const { geminiAdapter } = await import('../src/live/providers/gemini');
    const waits: (number | null)[] = [];
    await geminiAdapter.generate(
      { ...req, thinkingLevel: undefined, onWait: (ms) => waits.push(ms) },
      { ...cfg, model: 'gemini-3.1-flash-lite' },
    );
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThan(0);
    expect(waits[1]).toBeNull();
  });

  it('shows the reader it is the provider, not the model', () => {
    const { container, rerender } = render(<ComposingStatus activity="rate-limited" />);
    expect(container.textContent).toMatch(/rate-limited/i);
    rerender(<ComposingStatus activity={null} />);
    expect(container.textContent).toMatch(/Composing your answer/);
  });
});

describe('a hung stream fails fast enough to retry', () => {
  // 75s before a stream was even considered stalled, and 180s in total, is why a stuck turn read
  // as "never stops". Measured time-to-first-byte on a healthy turn is ~1s and the worst seen
  // was ~13s, so these still clear a slow thinking pass while turning a hang into a prompt retry.
  it('bounds the first byte and the idle gap', () => {
    expect(STREAM_FIRST_CHUNK_MS).toBeLessThanOrEqual(25_000);
    expect(STREAM_IDLE_MS).toBeLessThanOrEqual(15_000);
  });

  it('bounds the request in every adapter, and the whole call in every adapter that caps one', () => {
    const num = (src: string, name: string) =>
      Number(new RegExp(`${name} = ([\\d_]+)`).exec(src)?.[1]?.replace(/_/g, ''));
    for (const f of ['gemini', 'anthropic', 'openaiCompatible', 'openaiResponsesCompatible']) {
      const src = readFileSync(join(__dirname, `../src/live/providers/${f}.ts`), 'utf8');
      expect(num(src, 'GEN_TIMEOUT_MS'), f).toBeLessThanOrEqual(30_000);
      // The Responses adapter has no total ceiling of its own today; asserting one it lacks would
      // be a lie, and adding one is its own change.
      if (/STREAM_TOTAL_MS = /.test(src))
        expect(num(src, 'STREAM_TOTAL_MS'), f).toBeLessThanOrEqual(90_000);
    }
  });
});

describe('the study-notes prefetch is speculative, and checks the guard', () => {
  it('skips when the key has just been rate-limited', () => {
    const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    const gate = src.indexOf("if (viewMode !== 'study' && !studyOpenedRef.current) return;");
    expect(gate).toBeGreaterThan(0);
    // Within the same effect, before the model is asked.
    expect(src.slice(gate, gate + 900)).toMatch(/recentlyRateLimited\(\)/);
  });
});
