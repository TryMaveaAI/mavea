// A spoken line runs on the SHARED audio context, and streamTts takes it on a lease rather than
// grabbing it raw — otherwise one turn of speech would stand the idle timer down for the rest of
// the session and the tab would hold a real-time audio thread forever. The two things that must
// hold: the lease outlives the last scheduled buffer (suspending under a playing source would cut
// the tail off a line), and NO exit path strands it — not a clean finish, not a cancel mid-line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelActiveStream, playPcmBytes, streamSpeak } from '../src/voice/streamTts';

const IDLE_MS = 30_000;
/** 10ms of Kokoro's 24kHz 16-bit mono PCM — enough to schedule a buffer, short enough to finish. */
const PCM = new Uint8Array(480).fill(7);

let ctx: FakeAudioContext;

class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  destination = { kind: 'destination' };
  resume = vi.fn(() =>
    Promise.resolve().then(() => {
      this.state = 'running';
    }),
  );
  suspend = vi.fn(() =>
    Promise.resolve().then(() => {
      this.state = 'suspended';
    }),
  );
  createAnalyser = vi.fn(() => ({
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 8,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  }));
  createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }));
  createBuffer = vi.fn((_channels: number, length: number, rate: number) => ({
    duration: length / rate,
    getChannelData: () => new Float32Array(length),
  }));
  createBufferSource = vi.fn(() => ({
    buffer: null,
    onended: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  }));
}

// One context for the file, like the app's: the shared graph is a module singleton.
vi.stubGlobal('AudioContext', function AudioContextStub() {
  ctx = new FakeAudioContext();
  return ctx;
});

/** A Kokoro response whose body the test controls — `close()` ends the line. */
function streamingResponse(): { controller: ReadableStreamDefaultController<Uint8Array> } {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(PCM);
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body)),
  );
  return {
    get controller() {
      return controller;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  cancelActiveStream();
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('streamTts audio lease', () => {
  it('hands the lease back when a line finishes, so the context can park again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(PCM)),
    );

    const spoken = streamSpeak('a finished line', 'af_heart');
    await vi.advanceTimersByTimeAsync(1_000); // read, schedule, and wait out the scheduled tail
    await expect(spoken).resolves.toBe(true);

    // The idle timer is armed again — which it could not be if streamTts had taken the context
    // raw, the way it did before it leased.
    expect(ctx.state).toBe('running');
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(ctx.state).toBe('suspended');
  });

  it('leases the cached-clip path too — a cache hit must not pin the context either', async () => {
    const played = playPcmBytes(PCM, 'a cached line');
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(played).resolves.toBe(true);

    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(ctx.state).toBe('suspended');
  });

  it('holds the lease for as long as the line is playing, and returns it on a cancel', async () => {
    const response = streamingResponse();

    const spoken = streamSpeak('an interrupted line', 'af_heart');
    await vi.advanceTimersByTimeAsync(0); // first buffer scheduled; the body stays open

    // Nothing may park the context under a line that is still playing — that would cut its tail.
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
    expect(ctx.state).toBe('running');

    cancelActiveStream();
    response.controller.close(); // the reader wakes, sees the cancel, and unwinds
    await expect(spoken).resolves.toBe(true); // hard-stopped, never re-spoken

    // A stranded lease here would mean a permanently awake context for the rest of the session.
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(ctx.state).toBe('suspended');
  });
});
