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
const PCM = new Uint8Array(CLIP_SECONDS * SAMPLE_RATE * 2).fill(7);

const ASIDE = 'That clip is on its way.';
const NARRATION = 'The harbour empties on the ebb tide.';
const LATER = 'The moored boats settle into the mud.';

/** Every clause cached, so no line waits on the synthesizer and the timing is the clock's alone. */
function cache(...lines: string[]): void {
  for (const line of lines) {
    for (const clause of splitSynthesisChunks(line)) {
      pcmCachePut(pcmCacheKey(kokoroVoice('mavea'), getVoiceSpeed(), clause), PCM);
    }
  }
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

  it('is a no-op once the line has ended', async () => {
    cache(ASIDE, LATER);
    const aside = speakKokoroLine(ASIDE, 'mavea');
    await expect(aside.finished).resolves.toBe(true);
    const later = speakKokoroLine(LATER, 'mavea');
    await vi.waitFor(() => expect(starts.length).toBeGreaterThan(1));

    aside.cancel();

    await expect(later.finished).resolves.toBe(true);
    expect(stopped.size).toBe(0);
  });
});
