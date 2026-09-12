// The queue takes up the next clause as soon as the previous one has SCHEDULED its last buffer,
// and streamTts anchors that next clause on the tail it left on the shared audio clock. The
// whole-clip fallback (voice/kokoro playJobBlob) has no such clock: it hands an HTMLAudio element
// to the speakers the moment the WAV arrives. So a clause that falls back while the previous
// clause's WebAudio tail is still sounding is a second voice on top of the first — which is what
// the fallback is FOR (the stream path failed), and the clause before it is routinely a cache hit
// with audio already scheduled. The anchor cannot help here: this sink never consults it. What it
// waits on is the tail, so the wait has to be measured on the AUDIO clock and has to be honest
// about the synthesizer, which went idle when the clip landed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** One scheduled WebAudio buffer, on the shared clock. */
const starts: { at: number; duration: number }[] = [];

// The audio clock runs in REAL time (plus whatever synthesis costs below), because the thing
// under test is a wait for it to drain — a frozen clock could never show one finishing. It can
// also be STOPPED, the way a suspended context stops it while wall-clock timers keep counting.
const clock = { base: 0, zero: 0, stopped: false };

const fakeCtx = {
  state: 'running',
  get currentTime(): number {
    return clock.stopped ? clock.base : clock.base + (Date.now() - clock.zero) / 1000;
  },
  sampleRate: 24000,
  resume: async (): Promise<void> => {},
  createGain: () => ({
    gain: {
      value: 1,
      cancelScheduledValues(): void {},
      setValueAtTime(): void {},
      linearRampToValueAtTime(): void {},
    },
    connect(): void {},
    disconnect(): void {},
  }),
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
      },
      stop(): void {},
      disconnect(): void {},
    };
    return src;
  },
};

/** Suspend the context where it stands — an iOS call interruption, a backgrounded tab, the
 *  idle-suspend lease. Its clock stops with it; wall-clock timers keep counting, which is the
 *  whole hazard. Scheduled buffers are not lost: they sound when it resumes. */
function stopClock(): void {
  clock.base = fakeCtx.currentTime;
  clock.stopped = true;
  fakeCtx.state = 'suspended';
}

function startClock(): void {
  clock.zero = Date.now();
  clock.stopped = false;
  fakeCtx.state = 'running';
}

vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => fakeCtx,
  leaseAudioContext: () => ({ ctx: fakeCtx, release: () => {} }),
  tapPlaybackNode: () => () => {},
  voiceEnergyTap: () => () => {},
  resetVoiceEnergy: (): void => {},
}));

import {
  speakKokoroLine,
  splitSynthesisChunks,
  kokoroVoice,
  kokoroSynthesizing,
  primeKokoroLine,
  cancelKokoro,
  resetKokoroProbe,
} from '../src/voice/kokoro';
import { pcmCacheClear, pcmCacheKey, pcmCachePut } from '../src/voice/pcmCache';
import { getVoiceSpeed } from '../src/voice/streamTts';

const SAMPLE_RATE = 24000;
/** Long enough that its tail is still sounding when the fallback's WAV lands, short enough to
 *  keep the test under a second of real time. */
const CACHED_SECONDS = 0.6;
const CACHED_PCM = new Uint8Array(CACHED_SECONDS * SAMPLE_RATE * 2).fill(7);
/** Synthesis costs wall clock, so the shared audio clock has moved on between clauses. */
const SYNTH_SECONDS = 0.05;

/** Splits into exactly two clauses: the first is cached, the second has to be synthesized. */
const LINE = 'The harbour empties on the ebb tide, and the moored boats settle into the mud.';
/** One clause — the next line the surface announces while the fallback is waiting out the tail. */
const NEXT_LINE = 'A gull lands on the rail.';

/** The audio clock when the fallback element was handed to the speakers, or null. */
let fallbackPlayedAt: number | null = null;
/** The audio clock when the fallback's WAV arrived — before the fix, its play() moment. */
let wavReadyAt: number | null = null;
/** Every synthesis request the module made, in order. */
let requested: { input: string; format: string }[] = [];
/** Stop the clock as the WAV is handed over, i.e. exactly as the tail wait begins. */
let stopClockOnBlob = false;

class FakeAudio {
  volume = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #source = '';
  get src(): string {
    return this.#source;
  }
  set src(value: string) {
    this.#source = value;
    // An empty source fails to load in a real element, and that error is what settles a clip the
    // queue has hard-stopped — without it a cancelled fallback holds the pump for ever.
    if (!value) queueMicrotask(() => this.onerror?.());
  }
  play(): Promise<void> {
    fallbackPlayedAt = fakeCtx.currentTime;
    return Promise.resolve();
  }
  pause(): void {}
}

beforeEach(() => {
  resetKokoroProbe();
  pcmCacheClear();
  starts.length = 0;
  clock.base = 0;
  startClock();
  fallbackPlayedAt = null;
  wavReadyAt = null;
  requested = [];
  stopClockOnBlob = false;
  vi.stubGlobal('Audio', function () {
    return new FakeAudio();
  } as unknown as typeof Audio);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clause');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/tts/health')) return { ok: true } as Response;
      clock.base += SYNTH_SECONDS;
      const body = JSON.parse(String(init?.body)) as { input: string; response_format: string };
      requested.push({ input: body.input, format: body.response_format });
      // The streaming transport is down (proxy reset, container restart) but the server itself
      // answers — precisely the split that makes the whole-clip fallback the path that plays.
      if (body.response_format === 'pcm') throw new TypeError('network error');
      wavReadyAt = fakeCtx.currentTime;
      return {
        ok: true,
        blob: async () => {
          if (stopClockOnBlob) stopClock();
          return { size: 4 } as unknown as Blob;
        },
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cancelKokoro();
  resetKokoroProbe();
  startClock();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Speak a line whose first clause plays from the cache and whose second falls back to a WAV,
 *  and resolve once that WAV is in hand — the start of the tail wait. */
async function speakToFallbackWait(): Promise<void> {
  const clauses = splitSynthesisChunks(LINE);
  expect(clauses).toHaveLength(2);
  pcmCachePut(pcmCacheKey(kokoroVoice('mavea'), getVoiceSpeed(), clauses[0]), CACHED_PCM);
  speakKokoroLine(LINE, 'mavea');
  await vi.waitFor(() => expect(wavReadyAt).not.toBeNull(), { timeout: 4000 });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('the whole-clip fallback shares the queue clock', () => {
  it('waits for the previous clause to finish before it reaches the speakers', async () => {
    await speakToFallbackWait();
    await vi.waitFor(() => expect(fallbackPlayedAt).not.toBeNull(), { timeout: 4000 });

    const tail = Math.max(...starts.map((s) => s.at + s.duration));
    // The overlap window is real: the cached clause still had most of a breath left to play when
    // the fallback's clip was ready. Without that, this test would prove nothing.
    expect(tail - (wavReadyAt as number)).toBeGreaterThan(0.2);
    expect(fallbackPlayedAt as number).toBeGreaterThanOrEqual(tail);
  });

  it('waits on the audio clock, not the wall clock', async () => {
    stopClockOnBlob = true;
    await speakToFallbackWait();
    const tail = Math.max(...starts.map((s) => s.at + s.duration));

    // Long enough that a single timer sized for the remaining tail has certainly fired. The
    // suspended context played none of that tail, so the clause it would land on is still to come.
    await sleep((tail - (wavReadyAt as number)) * 1000 + 300);
    expect(fallbackPlayedAt).toBeNull();

    startClock();
    await vi.waitFor(() => expect(fallbackPlayedAt).not.toBeNull(), { timeout: 4000 });
    expect(fallbackPlayedAt as number).toBeGreaterThanOrEqual(tail);
  });

  it('reports the synthesizer idle while it waits, and prefetches the next line', async () => {
    await speakToFallbackWait();
    // The clip is downloaded and the wait has begun: Kokoro is idle. Reported as synthesis, this
    // is a clause-length of "Preparing voice…" painted over a voice that is speaking.
    expect(fallbackPlayedAt).toBeNull();
    expect(kokoroSynthesizing()).toBe(false);

    // …and an idle synthesizer is exactly when the next line is rendered ahead, which is what
    // keeps the following stop from opening on dead air.
    primeKokoroLine(NEXT_LINE, 'mavea');
    await vi.waitFor(
      () => expect(requested.some((r) => r.input === NEXT_LINE && r.format === 'pcm')).toBe(true),
      { timeout: 2000 },
    );
    expect(fallbackPlayedAt).toBeNull();
  });
});
