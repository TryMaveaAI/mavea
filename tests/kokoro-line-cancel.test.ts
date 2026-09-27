// A line can be stopped on its own. The aside the face steps in with shares the queue with the
// narration, and the hold that keeps the aside on screen outlasts its line whenever other speech
// has started — so an overlay opening over the aside used to hard-stop the whole queue and cut the
// narration off mid-sentence. Stopping one line must leave every other line exactly as it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Scheduled {
  clip: number;
  at: number;
  duration: number;
}
const starts: Scheduled[] = [];
/** Clips told to stop while they still had audio left to play — a cut, not a clean end. */
const stopped = new Set<number>();
let clipSeq = 0;

// Real-time audio clock: a line only finishes when the clock passes its last buffer.
const clock = { zero: 0 };

const fakeCtx = {
  state: 'running',
  get currentTime(): number {
    return (Date.now() - clock.zero) / 1000;
  },
  sampleRate: 24000,
  resume: async (): Promise<void> => {},
  createGain: () => ({
    id: ++clipSeq,
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
      clip: 0,
      endsAt: 0,
      connect(dest: { id?: number }): void {
        src.clip = dest?.id ?? 0;
      },
      start(at: number): void {
        src.endsAt = at + (src.buffer?.duration ?? 0);
        starts.push({ clip: src.clip, at, duration: src.buffer?.duration ?? 0 });
      },
      // A clip's own teardown also stops its sources once they have played out; only a stop
      // that lands before the buffer's end is audible.
      stop(): void {
        if (fakeCtx.currentTime < src.endsAt) stopped.add(src.clip);
      },
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

import {
  speakKokoroLine,
  splitSynthesisChunks,
  kokoroVoice,
  cancelKokoro,
  resetKokoroProbe,
} from '../src/voice/kokoro';
import { pcmCacheClear, pcmCacheKey, pcmCachePut } from '../src/voice/pcmCache';
import { getVoiceSpeed } from '../src/voice/streamTts';

const SAMPLE_RATE = 24000;
const CLIP_SECONDS = 0.4;
/** The read-ahead horizon streamTts holds a cached clip to before it may go on the clock. */
const MAX_AHEAD_SECONDS = 2;

function pcmOf(seconds: number): Uint8Array {
  return new Uint8Array(seconds * SAMPLE_RATE * 2).fill(7);
}

const ASIDE = 'That clip is on its way.';
const NARRATION = 'The harbour empties on the ebb tide.';
const LATER = 'The moored boats settle into the mud.';

/** Every clause cached, so no line waits on the synthesizer and the timing is the clock's alone. */
function cache(...lines: string[]): void {
  for (const line of lines) cacheFor(CLIP_SECONDS, line);
}

function cacheFor(seconds: number, line: string): void {
  for (const clause of splitSynthesisChunks(line)) {
    pcmCachePut(pcmCacheKey(kokoroVoice('mavea'), getVoiceSpeed(), clause), pcmOf(seconds));
  }
}

/** Every synthesis request the module makes, by the text it asked for. */
let requested: string[] = [];

/** Answer every synthesis request with `respond`; the health probe always says yes. */
function synthesizeWith(respond: (init: RequestInit) => Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/tts/health')) return { ok: true } as Response;
      requested.push((JSON.parse(String(init?.body)) as { input: string }).input);
      return respond(init ?? {});
    }),
  );
}

/** A synthesis request that never answers until it is aborted. */
function hangUntilAborted(init: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted.', 'AbortError')),
    );
  });
}

/** A PCM stream the test feeds by hand, one read at a time. */
function handDrivenStream(): {
  response: Response;
  pendingReads: Array<(result: ReadableStreamReadResult<Uint8Array>) => void>;
} {
  const pendingReads: Array<(result: ReadableStreamReadResult<Uint8Array>) => void> = [];
  const reader = {
    read: () =>
      new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => pendingReads.push(resolve)),
    releaseLock(): void {},
    cancel: async (): Promise<void> => {},
  };
  return {
    response: { ok: true, body: { getReader: () => reader } } as unknown as Response,
    pendingReads,
  };
}

/** Where a clip first goes on the clock, once it has. */
function firstStartOf(clip: number): number | undefined {
  const own = starts.filter((s) => s.clip === clip).map((s) => s.at);
  return own.length ? Math.min(...own) : undefined;
}

let synthesized = 0;

beforeEach(() => {
  resetKokoroProbe();
  pcmCacheClear();
  starts.length = 0;
  stopped.clear();
  clipSeq = 0;
  clock.zero = Date.now();
  synthesized = 0;
  requested = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/tts/health')) return { ok: true } as Response;
      synthesized += 1;
      return { ok: false } as Response;
    }),
  );
});

afterEach(() => {
  cancelKokoro();
  vi.unstubAllGlobals();
});

describe('stopping one spoken line', () => {
  it('stops the sounding line and leaves the narration anchored behind it playing', async () => {
    cache(ASIDE, NARRATION);
    const aside = speakKokoroLine(ASIDE, 'mavea');
    const narration = speakKokoroLine(NARRATION, 'mavea');
    // Both clips on the clock: the aside sounding, the narration anchored on its tail.
    await vi.waitFor(() => expect(new Set(starts.map((s) => s.clip)).size).toBe(2));
    const [asideClip, narrationClip] = [...new Set(starts.map((s) => s.clip))];

    aside.cancel();

    await expect(aside.finished).resolves.toBe(false);
    expect(stopped.has(asideClip)).toBe(true);
    expect(stopped.has(narrationClip)).toBe(false);
    await expect(narration.started).resolves.toBe(true);
    await expect(narration.finished).resolves.toBe(true);
    expect(stopped.has(narrationClip)).toBe(false);
    expect(synthesized).toBe(0);
  });

  it('lets a narration parked behind a long aside start as soon as the aside is cancelled', async () => {
    // Long enough that its tail sits past the read-ahead horizon, so the cached narration behind
    // it waits on the playhead instead of going onto the clock.
    const asideSeconds = MAX_AHEAD_SECONDS + 1;
    cacheFor(asideSeconds, ASIDE);
    cache(NARRATION);
    const aside = speakKokoroLine(ASIDE, 'mavea');
    const narration = speakKokoroLine(NARRATION, 'mavea');
    await vi.waitFor(() => expect(firstStartOf(1)).toBeDefined());
    const asideEnds = (firstStartOf(1) as number) + asideSeconds;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(firstStartOf(2)).toBeUndefined(); // still parked

    const cancelledAt = fakeCtx.currentTime;
    aside.cancel();

    await vi.waitFor(() => expect(firstStartOf(2)).toBeDefined());
    expect(firstStartOf(2)).toBeLessThan(cancelledAt + 0.5);
    expect(firstStartOf(2)).toBeLessThan(asideEnds - 1);
    await expect(aside.finished).resolves.toBe(false);
    await expect(narration.finished).resolves.toBe(true);
  });

  it('cancels a streamed aside whose synthesis hangs, and plays the line after it', async () => {
    cache(NARRATION);
    synthesizeWith(hangUntilAborted);
    const aside = speakKokoroLine(ASIDE, 'mavea');
    const narration = speakKokoroLine(NARRATION, 'mavea');
    await vi.waitFor(() => expect(requested).toEqual([ASIDE]));

    aside.cancel();

    await expect(aside.finished).resolves.toBe(false);
    await expect(narration.finished).resolves.toBe(true);
    // The aside never reached the clock: the one clip scheduled is the narration's whole clause.
    expect(new Set(starts.map((s) => s.clip)).size).toBe(1);
    expect(starts.reduce((sum, s) => sum + s.duration, 0)).toBeCloseTo(CLIP_SECONDS, 6);
    // No whole-clip retry of the cancelled line, and nothing else synthesized.
    expect(requested).toEqual([ASIDE]);
  });

  it('cancels a streamed aside mid-stream, and plays the line after it', async () => {
    cache(NARRATION);
    const stream = handDrivenStream();
    synthesizeWith(async () => stream.response);
    const aside = speakKokoroLine(ASIDE, 'mavea');
    const narration = speakKokoroLine(NARRATION, 'mavea');
    await vi.waitFor(() => expect(stream.pendingReads).toHaveLength(1));
    stream.pendingReads[0]({ done: false, value: pcmOf(0.5) });
    await vi.waitFor(() => expect(firstStartOf(1)).toBeDefined());
    await vi.waitFor(() => expect(stream.pendingReads).toHaveLength(2));

    aside.cancel();

    expect(stopped.has(1)).toBe(true);
    // Kokoro is still rendering the accepted request, so the next line waits for that render to
    // reach the reader rather than running a second synthesis on top of it.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(firstStartOf(2)).toBeUndefined();
    stream.pendingReads[1]({ done: false, value: pcmOf(0.5) });

    await expect(aside.finished).resolves.toBe(false);
    await expect(narration.finished).resolves.toBe(true);
    // Nothing the stream delivered after the cancel was scheduled.
    expect(starts.filter((s) => s.clip === 1)).toHaveLength(1);
    expect(stopped.has(2)).toBe(false);
    expect(requested).toEqual([ASIDE]);
  });

  it('drops a line still waiting in the queue without touching the lines around it', async () => {
    cache(NARRATION, ASIDE, LATER);
    const first = speakKokoroLine(NARRATION, 'mavea');
    const aside = speakKokoroLine(ASIDE, 'mavea');
    const later = speakKokoroLine(LATER, 'mavea');

    aside.cancel();

    await expect(aside.started).resolves.toBe(false);
    await expect(aside.finished).resolves.toBe(false);
    await expect(first.finished).resolves.toBe(true);
    await expect(later.finished).resolves.toBe(true);
    // Only the two surviving lines ever reached the clock, back to back, and neither was stopped.
    const clips = [...new Set(starts.map((s) => s.clip))];
    expect(clips).toHaveLength(2);
    expect(stopped.size).toBe(0);
  });
});
