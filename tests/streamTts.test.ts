import { afterEach, describe, expect, it, vi } from 'vitest';

// The back-pressure test needs a running-but-frozen clock; the same stub shape the mute/speed
// suites use. decodePcm16 below is pure and never touches this.
const audio = vi.hoisted(() => ({
  ramps: [] as { to: number }[],
  stops: [] as (number | undefined)[],
}));

vi.mock('../src/voice/voiceEnergy', () => {
  const sharedAudioContext = () => ({
    currentTime: 0,
    state: 'running',
    resume: async () => {},
    destination: {},
    createGain: () => ({
      gain: {
        value: 1,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: (to: number) => audio.ramps.push({ to }),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBuffer: (_ch: number, len: number) => ({
      duration: len / 24000,
      getChannelData: () => new Float32Array(len),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: (at?: number) => audio.stops.push(at),
      onended: null,
    }),
  });
  return {
    sharedAudioContext,
    // streamTts takes the context on a LEASE (it must say when a clip is done, so the shared
    // context can park while nothing is playing) — the same fake, plus a no-op release.
    leaseAudioContext: () => ({ ctx: sharedAudioContext(), release: () => {} }),
    tapPlaybackNode: () => () => {},
  };
});

import { decodePcm16, streamSpeak, cancelActiveStream } from '../src/voice/streamTts';

// Kokoro streams signed 16-bit little-endian PCM. decodePcm16 turns each chunk into Float32
// samples in [-1, 1), carrying a half-written sample across a chunk boundary so a split read
// never drops or corrupts a sample — the bit the streaming player leans on for gapless audio.
describe('decodePcm16', () => {
  it('decodes the signed 16-bit LE extremes to [-1, 1)', () => {
    // 0x8000 = -32768 → -1.0 ; 0x7FFF = 32767 → ~+0.99997 ; 0x0000 = 0
    const chunk = new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0x00, 0x00]);
    const { samples, carry } = decodePcm16(chunk, null);
    expect(Array.from(samples)).toEqual([-1, 32767 / 32768, 0]);
    expect(carry).toBeNull();
  });

  it('carries a trailing odd byte and reconstructs the split sample on the next chunk', () => {
    // The low byte of a sample arrives at the end of one chunk, the high byte at the start of
    // the next; together they must decode to the same value as if read in one piece.
    const first = decodePcm16(new Uint8Array([0x00]), null);
    expect(first.samples.length).toBe(0);
    expect(first.carry).toBe(0x00);

    const second = decodePcm16(new Uint8Array([0x80]), first.carry);
    expect(Array.from(second.samples)).toEqual([-1]); // 0x8000 → -1.0
    expect(second.carry).toBeNull();
  });

  it('handles an odd-length chunk by emitting whole samples and carrying the remainder', () => {
    // bytes [0x10,0x20] → 0x2010 = 8208 ; 0x30 has no pair yet → carried.
    const { samples, carry } = decodePcm16(new Uint8Array([0x10, 0x20, 0x30]), null);
    expect(Array.from(samples)).toEqual([8208 / 32768]);
    expect(carry).toBe(0x30);
  });

  it('decodes a stream split into awkward chunks identically to one contiguous read', () => {
    const whole = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const oneShot = decodePcm16(whole, null).samples;

    const out: number[] = [];
    let carry: number | null = null;
    for (const chunk of [whole.slice(0, 1), whole.slice(1, 4), whole.slice(4, 5), whole.slice(5)]) {
      const r = decodePcm16(chunk, carry);
      out.push(...Array.from(r.samples));
      carry = r.carry;
    }
    expect(carry).toBeNull();
    expect(out).toEqual(Array.from(oneShot));
  });

  it('returns no samples and no carry for an empty chunk', () => {
    const { samples, carry } = decodePcm16(new Uint8Array([]), null);
    expect(samples.length).toBe(0);
    expect(carry).toBeNull();
  });

  it('preserves a pending carry across an empty chunk (never drops the split byte)', () => {
    // A zero-length read between the two halves of a sample must not lose the carried byte.
    const r = decodePcm16(new Uint8Array([]), 0x42);
    expect(r.samples.length).toBe(0);
    expect(r.carry).toBe(0x42);
  });
});

// Once ~2s of audio is scheduled ahead, the reader stops pulling until the playhead drains the
// backlog. That wait used to be a 60ms poll — ~470 timer wakeups over a 30s line, pure CPU noise
// while the machine is already busy speaking. It is now ONE sleep computed from how far the
// schedule actually runs past the cap, and teardown() wakes it, so a cancel never waits out the
// window. These pin both halves.
describe('streamSpeak — back-pressure is one cancellable computed sleep per window', () => {
  afterEach(() => {
    cancelActiveStream();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('arms a single timer sized to the window, and a cancel resolves without waiting it out', async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    // ~3s of 24kHz 16-bit PCM queued before the first read: the first flush schedules it all,
    // putting the cursor ~1.08s past the 2s cap — exactly one back-pressure window opens.
    controller.enqueue(new Uint8Array(3 * 24000 * 2));

    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const done = streamSpeak('hello there', 'af_heart');
    // Flush microtasks (bounded — no timers involved) until the back-pressure sleep is armed.
    for (let i = 0; i < 200 && timeoutSpy.mock.calls.length === 0; i++) await Promise.resolve();

    // One computed sleep for the whole window — a 60ms poll would show delay 60 here (and then
    // ~18 wakeups for this same window as the clock drained).
    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    const delay = timeoutSpy.mock.calls[0][1] as number;
    expect(delay).toBeGreaterThan(500);
    expect(delay).toBeLessThan(1300);

    // Cancel mid-window: teardown wakes the sleep, so the clip resolves with the fake clock
    // never advanced — the interrupt lands instantly, not after the computed wait.
    cancelActiveStream();
    await expect(done).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0); // the sleep was cleared, not left to fire late
  });
});

// Stopping a buffer source mid-waveform leaves a discontinuity, and a discontinuity is a CLICK —
// on every barge-in, every mute, every hush. The offline export path has always ramped each line
// out; the live path cut it dead. The ramp must also cost nothing that outlives the cancel: a
// deferred teardown timer would be a regression against the invariant right above this.
describe('streamSpeak — a cancelled clip fades out instead of clicking', () => {
  afterEach(() => {
    cancelActiveStream();
    vi.useRealTimers();
    vi.restoreAllMocks();
    audio.ramps.length = 0;
    audio.stops.length = 0;
  });

  it('ramps the output to silence, and stops the sources AFTER the ramp rather than during it', async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    // Same shape as the back-pressure test above: enough queued audio that the first flush
    // schedules real sources and the read then parks, so the cancel lands mid-clip.
    controller.enqueue(new Uint8Array(3 * 24000 * 2));
    const done = streamSpeak('hello there', 'af_heart');
    for (let i = 0; i < 400 && audio.stops.length === 0; i++) await Promise.resolve();

    cancelActiveStream();
    await expect(done).resolves.toBe(true);

    expect(audio.ramps.at(-1)).toEqual({ to: 0 });
    // Every source is stopped at a FUTURE time — the end of the ramp — not at zero (now).
    expect(audio.stops.length).toBeGreaterThan(0);
    for (const at of audio.stops) expect(at).toBeGreaterThan(0);
    // And nothing is left pending: the fade rides the sources' own end, never a timer.
    expect(vi.getTimerCount()).toBe(0);
  });
});
