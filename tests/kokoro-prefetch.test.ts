// @vitest-environment jsdom
// The cache/prefetch integration around the Kokoro queue, on a faked WebAudio graph (playback
// here is scheduling arithmetic, not sound): a finished streamed line fills the PCM cache so a
// repeat never re-synthesizes; a primed next line prefetches while nothing is rendering; and a
// line whose own prefetch is still in flight is JOINED — never synthesized a second time (the
// single-synthesis invariant is the CPU guarantee for weak machines).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeCtx = {
  state: 'running',
  currentTime: 0,
  resume: async (): Promise<void> => {},
  createGain: () => ({ gain: { value: 1 }, connect(): void {}, disconnect(): void {} }),
  createBuffer: (_ch: number, len: number, rate: number) => ({
    duration: len / rate,
    getChannelData: () => new Float32Array(len),
  }),
  createBufferSource: () => ({
    buffer: null,
    onended: null,
    connect(): void {},
    start(): void {},
    stop(): void {},
    disconnect(): void {},
  }),
};

vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => fakeCtx,
  // streamTts leases the context instead of grabbing it, so the shared graph can park when
  // nothing is playing; the release is a no-op here.
  leaseAudioContext: () => ({ ctx: fakeCtx, release: () => {} }),
  tapPlaybackNode: () => () => {},
  voiceEnergyTap: () => () => {},
  resetVoiceEnergy: (): void => {},
}));

import {
  speakKokoroLine,
  primeKokoroLine,
  cancelKokoro,
  resetKokoroProbe,
} from '../src/voice/kokoro';
import { pcmCacheClear, pcmCacheBytes } from '../src/voice/pcmCache';

// 10ms of 24kHz 16-bit mono — playback waits stay tiny.
const PCM = new Uint8Array(480).fill(7);

function streamBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

/** Per-test log of synthesis request texts, in arrival order. */
let synthesized: string[] = [];

beforeEach(() => {
  resetKokoroProbe();
  pcmCacheClear();
  synthesized = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/tts/health')) return { ok: true } as Response;
      synthesized.push((JSON.parse(String(init?.body)) as { input: string }).input);
      return {
        ok: true,
        body: streamBody(PCM),
        arrayBuffer: async () => PCM.buffer.slice(0),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cancelKokoro();
  vi.unstubAllGlobals();
});

describe('kokoro cache + one-ahead prefetch', () => {
  it('caches a finished streamed line, so a repeat plays from memory with zero synthesis', async () => {
    const first = speakKokoroLine('The sushi counter opens at dawn.', 'mavea');
    await expect(first.finished).resolves.toBe(true);
    expect(synthesized).toHaveLength(1);
    expect(pcmCacheBytes()).toBeGreaterThan(0);

    const again = speakKokoroLine('The sushi counter opens at dawn.', 'mavea');
    await expect(again.started).resolves.toBe(true);
    await expect(again.finished).resolves.toBe(true);
    expect(synthesized).toHaveLength(1); // no second synthesis request
  });

  it('a primed next line prefetches while idle, and then speaks as a pure cache hit', async () => {
    // A first line settles the health probe (prefetch is gated on a confirmed server).
    await speakKokoroLine('Stop one.', 'mavea').finished;
    expect(synthesized).toEqual(['Stop one.']);

    primeKokoroLine('Stop two.', 'mavea');
    await vi.waitFor(() => expect(synthesized).toContain('Stop two.'));

    const line = speakKokoroLine('Stop two.', 'mavea');
    await expect(line.finished).resolves.toBe(true);
    // Exactly one synthesis of stop two — the prefetch — ever hit the server.
    expect(synthesized.filter((t) => t === 'Stop two.')).toHaveLength(1);
  });
});
