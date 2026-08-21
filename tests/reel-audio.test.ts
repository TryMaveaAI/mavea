// The reel's narration renderer used to fire every slide's TTS request simultaneously — 8-20
// inferences against a voice container with a small fixed thread pool, which maxed the fans on
// weak machines and finished SLOWER than pacing. These pin the pool: at most two syntheses in
// flight, slide order preserved in the rendered timings, and per-line progress for the studio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The offline render only ever asks for the rate — it never plays through the shared context,
// which is why it takes the rate accessor rather than the context itself. The real-time paths
// (export track, preview loop) LEASE it, so the fake hands back a release the tests can watch.
const audio = vi.hoisted(() => ({ release: vi.fn(), leases: 0 }));
vi.mock('../src/voice/voiceEnergy', () => ({
  sharedSampleRate: () => 48_000,
  leaseAudioContext: () => {
    audio.leases += 1;
    return {
      ctx: {
        createMediaStreamDestination: () => ({ stream: { id: 'fake' } }),
        createBufferSource: () => ({
          buffer: null,
          connect() {},
          start() {},
          stop() {},
          disconnect() {},
        }),
        createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
        destination: {},
        state: 'running',
        currentTime: 0,
        resume: async () => {},
      } as unknown as AudioContext,
      release: audio.release,
    };
  },
}));

import { renderReelAudio } from '../src/clip/reel/audioTrack';
import type { ReelScript } from '../src/clip/reel/reelScript';

/** Seconds of PCM the fake TTS returns per voiceover line. */
const SPOKEN_S: Record<string, number> = { alpha: 1, bravo: 2, charlie: 3, delta: 4, echo: 5 };

const script = (): ReelScript =>
  ({
    slides: Object.keys(SPOKEN_S).map((voiceover) => ({ voiceover, durationMs: 100 })),
  }) as unknown as ReelScript;

/** The offline mix graph, reduced to what the renderer touches — scheduling is under test here,
 *  not the audio. Line nodes chain connect(gain).connect(master), so connect returns its target. */
class FakeOfflineAudioContext {
  sampleRate: number;
  length: number;
  destination = {};
  constructor(_channels: number, length: number, rate: number) {
    this.length = length;
    this.sampleRate = rate;
  }
  createGain(): unknown {
    return {
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: (target: unknown) => target,
    };
  }
  createBuffer(_ch: number, len: number, _rate: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
  createBufferSource(): unknown {
    return { buffer: null, connect: (target: unknown) => target, start: vi.fn() };
  }
  async startRendering(): Promise<AudioBuffer> {
    return { duration: this.length / this.sampleRate } as unknown as AudioBuffer;
  }
}

let inFlight = 0;
let maxInFlight = 0;
let requested: string[] = [];

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  requested = [];
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
  // The speech endpoint, returning silence sized to the line so the timings expose result order.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const line = (JSON.parse(String(init?.body)) as { input: string }).input;
      requested.push(line);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      const samples = Math.round((SPOKEN_S[line] ?? 0.1) * 24_000);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(samples * 2) };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderReelAudio — paced synthesis', () => {
  it('keeps at most two syntheses in flight and the timings in slide order', async () => {
    const audio = await renderReelAudio(script());

    expect(maxInFlight).toBe(2);
    expect(requested.slice(0, 2)).toEqual(['alpha', 'bravo']); // the pool fills front-to-back
    // Each timing = its own line's spoken length + the slide gap: order survived the pacing.
    expect(audio.timings).toEqual([1_180, 2_180, 3_180, 4_180, 5_180]);
    expect(audio.missing).toBe(0);
    expect(audio.buffer).not.toBeNull();
  });

  it('reports per-line progress as lines land', async () => {
    const progress: [number, number][] = [];
    await renderReelAudio(script(), undefined, (done, total) => progress.push([done, total]));

    expect(progress).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
  });
});

// The idle audio thread is only reclaimable if every real-time player hands the shared context
// back. The reel is the long pole: a preview loop or an export track can run for minutes, and
// taking the context raw (as these did) retired the idle timer for the whole session.
describe('reel playback leases the shared audio context', () => {
  it('holds it while playing and releases it on stop', async () => {
    audio.release.mockClear();
    const { bufferToStream } = await import('../src/clip/reel/audioPlayback');

    const track = bufferToStream({ duration: 1 } as AudioBuffer);
    expect(track).not.toBeNull();
    // Still holding it — the encoder is reading this track in real time.
    expect(audio.release).not.toHaveBeenCalled();

    track!.stop();
    expect(audio.release).toHaveBeenCalledTimes(1);
  });

  it('the looping preview releases it too', async () => {
    audio.release.mockClear();
    const { makePreviewAudio } = await import('../src/clip/reel/audioPlayback');

    const preview = makePreviewAudio({ duration: 1 } as AudioBuffer);
    expect(preview).not.toBeNull();
    expect(audio.release).not.toHaveBeenCalled();

    preview!.stop();
    expect(audio.release).toHaveBeenCalledTimes(1);
  });
});
