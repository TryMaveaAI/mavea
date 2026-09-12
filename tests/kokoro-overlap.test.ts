// Two clauses of one breath must never be audible at the same time, and no more of the breath may
// be on the clock at once than the queue can account for. A CACHED clause schedules its whole clip
// in one pass, so its tail sits a clip-length ahead of the clock — much further out than a
// streamed clause's back-pressured two seconds. The next clause anchors on that tail: a tail the
// anchor refuses to trust becomes a clip that starts at "now", over the one still playing (the
// second voice that arrives a second or two in and then stops while the first carries on), while a
// tail nothing waits for lets a run of cache hits schedule a whole line's audio at t=0.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** One scheduled buffer: the clip (its own gain node) it was routed through, where it sits on the
 *  clock, and what the clock read when it was scheduled. */
interface Scheduled {
  clip: number;
  at: number;
  duration: number;
  clock: number;
}
const starts: Scheduled[] = [];
let clipSeq = 0;

// The audio clock runs in REAL time (plus whatever synthesis costs below): a clause held back
// until the scheduled voice drains is a wait a frozen clock could never end.
const clock = { base: 0, zero: 0 };

const fakeCtx = {
  state: 'running',
  get currentTime(): number {
    return clock.base + (Date.now() - clock.zero) / 1000;
  },
  sampleRate: 24000,
  resume: async (): Promise<void> => {},
  createGain: () => ({
    // Every clip builds its own gain node, so it is the handle that says which clip a buffer
    // belongs to — the fake has no other way to tell two overlapping clips apart.
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
      connect(dest: { id?: number }): void {
        src.clip = dest?.id ?? 0;
      },
      start(at: number): void {
        starts.push({
          clip: src.clip,
          at,
          duration: src.buffer?.duration ?? 0,
          clock: fakeCtx.currentTime,
        });
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
/** A clause of this length leaves a tail further out than any "too far ahead to be real" distance
 *  bound would have trusted — which is the whole reason the anchor goes by ownership. */
const CACHED_SECONDS = 3.5;
const CACHED_PCM = new Uint8Array(CACHED_SECONDS * SAMPLE_RATE * 2).fill(7);
/** The read-ahead horizon streamTts holds every sink to. */
const MAX_AHEAD_SECONDS = 2;
/** Short enough that a chain of them runs inside a test, long enough that three do not fit under
 *  the horizon — so the third clause has to wait for the clock. */
const CHAIN_SECONDS = 1.2;
const CHAIN_PCM = new Uint8Array(CHAIN_SECONDS * SAMPLE_RATE * 2).fill(7);
const STREAMED_PCM = new Uint8Array(0.4 * SAMPLE_RATE * 2).fill(7);
/** Rendering a clause costs wall clock (1–2s on the machines in scope), so the shared audio
 *  clock has moved on by the time the next clause is anchored against the previous tail. */
const SYNTH_SECONDS = 0.8;

/** Splits into exactly two clauses: the first is cached, the second is synthesized. */
const LINE = 'The harbour empties on the ebb tide, and the moored boats settle into the mud.';
/** Three clauses — the mid-turn steady state, where the one-ahead prefetch has them all cached. */
const LONG_LINE =
  'The harbour empties on the ebb tide, and the moored boats settle into the mud, while the gulls wheel over the empty quay.';
/** One clause, short enough that it never splits. */
const SHORT_LINE = 'A gull lands on the rail.';

/** Put every clause of a line in the PCM cache, as the one-ahead prefetch does mid-turn. */
function cacheAll(line: string, pcm: Uint8Array = CACHED_PCM): string[] {
  const clauses = splitSynthesisChunks(line);
  for (const clause of clauses) {
    pcmCachePut(pcmCacheKey(kokoroVoice('mavea'), getVoiceSpeed(), clause), pcm);
  }
  return clauses;
}

let synthesized: string[] = [];

beforeEach(() => {
  resetKokoroProbe();
  pcmCacheClear();
  starts.length = 0;
  clipSeq = 0;
  clock.base = 0;
  clock.zero = Date.now();
  synthesized = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/tts/health')) return { ok: true } as Response;
      clock.base += SYNTH_SECONDS;
      synthesized.push((JSON.parse(String(init?.body)) as { input: string }).input);
      return {
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(STREAMED_PCM);
            c.close();
          },
        }),
        // The one-ahead prefetch reads arrayBuffer; an empty one leaves the second clause
        // uncached, which is the cached-then-streamed pair this suite is about.
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cancelKokoro();
  vi.unstubAllGlobals();
});

/** Speak one breath whose first clause is already in the PCM cache, and resolve once both
 *  clauses have scheduled audio. Neither clause is awaited to its end — the overlap is visible
 *  the moment the second one is scheduled. */
async function speakCachedThenStreamed(): Promise<string[]> {
  const clauses = splitSynthesisChunks(LINE);
  expect(clauses).toHaveLength(2);
  pcmCachePut(pcmCacheKey(kokoroVoice('mavea'), getVoiceSpeed(), clauses[0]), CACHED_PCM);
  speakKokoroLine(LINE, 'mavea');
  await vi.waitFor(() => expect(new Set(starts.map((s) => s.clip)).size).toBe(2));
  return clauses;
}

/** Every pair of clips that genuinely share clock time. Touching is the goal (gapless); an
 *  overlap is the second voice the reader hears under the first. */
function overlapsIn(spans: { clip: number; from: number; to: number }[]): string[] {
  return spans
    .flatMap((a, i) => spans.slice(i + 1).map((b) => [a, b] as const))
    .filter(([a, b]) => a.from < b.to - 1e-6 && b.from < a.to - 1e-6)
    .map(
      ([a, b]) =>
        `clip ${a.clip} [${a.from}, ${a.to}] overlaps clip ${b.clip} [${b.from}, ${b.to}]`,
    );
}

/** The interval each clip occupies on the audio clock, in scheduling order. */
function clipSpans(): { clip: number; from: number; to: number }[] {
  const spans = new Map<number, { clip: number; from: number; to: number }>();
  for (const s of starts) {
    const span = spans.get(s.clip);
    if (!span) spans.set(s.clip, { clip: s.clip, from: s.at, to: s.at + s.duration });
    else {
      span.from = Math.min(span.from, s.at);
      span.to = Math.max(span.to, s.at + s.duration);
    }
  }
  return [...spans.values()];
}

describe('kokoro clause overlap', () => {
  it('starts the streamed clause where the cached clause ends', async () => {
    const clauses = await speakCachedThenStreamed();
    // The cache hit is what makes the tail a clip-length out; prove the first clause never
    // reached the synthesizer.
    expect(synthesized).not.toContain(clauses[0]);

    const [cached, streamed] = clipSpans();
    expect(streamed.from).toBeCloseTo(cached.to, 6);
  });

  it('never has two clips scheduled over the same interval', async () => {
    await speakCachedThenStreamed();
    expect(overlapsIn(clipSpans())).toEqual([]);
  });

  it('chains cache hits back to back without stacking the whole line on the clock', async () => {
    // Mid-turn the steady state is cached → cached: the one-ahead prefetch keeps the next clause
    // in memory, so each clause schedules its whole clip the moment the queue takes it up.
    expect(cacheAll(LONG_LINE, CHAIN_PCM)).toHaveLength(3);
    speakKokoroLine(LONG_LINE, 'mavea');
    await vi.waitFor(() => expect(new Set(starts.map((s) => s.clip)).size).toBe(3), {
      timeout: 4000,
    });
    expect(synthesized).toEqual([]);

    const spans = clipSpans();
    expect(spans[1].from).toBeCloseTo(spans[0].to, 6);
    expect(spans[2].from).toBeCloseTo(spans[1].to, 6);
    expect(overlapsIn(spans)).toEqual([]);

    // Never more than one clip past the horizon on the clock at once: unheld, all three clips —
    // their buffers, gain nodes, energy taps and pending timers — would be alive from the first.
    const ahead = Math.max(...starts.map((s) => s.at + s.duration - s.clock));
    expect(ahead).toBeLessThan(CHAIN_SECONDS + MAX_AHEAD_SECONDS + 0.1);

    // The third clause waited for the voice ahead of it to drain, and was still scheduled before
    // that voice ran out — held back, not dropped a beat.
    const third = starts.find((s) => s.clip === spans[2].clip) as Scheduled;
    expect(third.clock).toBeGreaterThan(spans[1].to - MAX_AHEAD_SECONDS - 0.15);
    expect(third.clock).toBeLessThan(spans[1].to);
  });

  it('drops the tail of a cancelled clause, so the next line opens at the clock', async () => {
    cacheAll(LINE);
    const opener = cacheAll(SHORT_LINE);
    speakKokoroLine(LINE, 'mavea');
    await vi.waitFor(() => expect(starts.length).toBeGreaterThan(0));
    const abandoned = Math.max(...starts.map((s) => s.at + s.duration));

    cancelKokoro();
    starts.length = 0;
    expect(synthesized).toEqual([]);

    const opened = fakeCtx.currentTime;
    speakKokoroLine(SHORT_LINE, 'mavea');
    await vi.waitFor(() => expect(starts.length).toBeGreaterThan(0));
    // Anchoring behind audio that was stopped would open the line minutes of silence later; the
    // torn-down clip released the tail, so this one starts a lead ahead of the clock.
    expect(opener).toHaveLength(1);
    expect(starts[0].at).toBeLessThan(abandoned);
    expect(starts[0].at).toBeGreaterThanOrEqual(opened + 0.08 - 1e-6);
    expect(starts[0].at).toBeLessThan(opened + 0.5);
  });
});
