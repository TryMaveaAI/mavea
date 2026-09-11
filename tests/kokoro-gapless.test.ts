// Consecutive lines play back to back on one audio clock. The queue used to await a line's END
// before taking up the next, which then re-anchored itself at "now + lead": every clause
// boundary carried the end-wait, the lead and a main-thread hop as dead air — heard as the voice
// pausing to "load" the next line. Now a line is taken up the moment the previous one has
// scheduled its last buffer, and it starts exactly where that buffer ends.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Scheduled {
  at: number;
  duration: number;
}
const starts: Scheduled[] = [];
const fakeCtx = {
  state: 'running',
  currentTime: 0,
  sampleRate: 24000,
  resume: async (): Promise<void> => {},
  createGain: () => ({ gain: { value: 1 }, connect(): void {}, disconnect(): void {} }),
  createBuffer: (_ch: number, length: number, rate: number) => ({
    duration: length / rate,
    getChannelData: () => new Float32Array(length),
  }),
  createBufferSource: () => {
    const src = {
      buffer: null as { duration: number } | null,
      onended: null as (() => void) | null,
      connect(): void {},
      start(at: number): void {
        starts.push({ at, duration: src.buffer?.duration ?? 0 });
        // A real node fires onended after its buffer; the clock here never moves, so fire it
        // on the next tick so scheduler bookkeeping (source sets, gain drop) still runs.
        setTimeout(() => src.onended?.(), 0);
      },
      stop(): void {},
      disconnect(): void {},
    };
    return src;
  },
};

vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => fakeCtx,
  leaseAudioContext: () => ({ ctx: fakeCtx, release: () => {} }),
  tapPlaybackNode: () => () => {},
  voiceEnergyTap: () => () => {},
  resetVoiceEnergy: (): void => {},
}));

import { speakKokoroLine, cancelKokoro, resetKokoroProbe } from '../src/voice/kokoro';
import { pcmCacheClear } from '../src/voice/pcmCache';

// 50ms of 24kHz 16-bit mono per line.
const PCM = new Uint8Array(2400).fill(7);
let synthesized: string[] = [];

beforeEach(() => {
  resetKokoroProbe();
  pcmCacheClear();
  starts.length = 0;
  synthesized = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/tts/health')) return { ok: true } as Response;
      synthesized.push((JSON.parse(String(init?.body)) as { input: string }).input);
      return {
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(PCM);
            c.close();
          },
        }),
        arrayBuffer: async () => PCM.buffer.slice(0),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cancelKokoro();
  vi.unstubAllGlobals();
});

describe('kokoro gapless playback', () => {
  it('starts the next line exactly where the previous tail ends', async () => {
    const one = speakKokoroLine('First clause of the breath.', 'mavea');
    const two = speakKokoroLine('Second clause of the breath.', 'mavea');
    await expect(one.finished).resolves.toBe(true);
    await expect(two.finished).resolves.toBe(true);
    expect(synthesized).toEqual(['First clause of the breath.', 'Second clause of the breath.']);
    // One buffer per line here (a single 50ms chunk each).
    expect(starts).toHaveLength(2);
    const firstEnds = starts[0].at + starts[0].duration;
    expect(starts[1].at).toBeCloseTo(firstEnds, 6);
  });

  it('takes the next line up before the previous one has finished playing', async () => {
    const one = speakKokoroLine('First.', 'mavea');
    speakKokoroLine('Second.', 'mavea');
    // The second synthesis is requested while the first line's tail is still scheduled — the
    // first has not resolved yet, and both requests have already reached the server.
    await vi.waitFor(() => expect(synthesized).toHaveLength(2));
    let firstDone = false;
    void one.finished.then(() => {
      firstDone = true;
    });
    await Promise.resolve();
    expect(firstDone).toBe(false);
    await one.finished;
  });
});
