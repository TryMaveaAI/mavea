// `onStart` is the reveal walk's "the voice is saying this now" signal: walkSync moves the
// spotlight on it. A clip anchored behind a still-playing clause is SCHEDULED a clause-length
// before a sample of it sounds, so reporting it at scheduling time puts the canvas that far ahead
// of the voice — and a clip stopped in that window would report audio nobody ever heard.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** One scheduled buffer, on the shared clock. */
const starts: { at: number; duration: number }[] = [];

// The audio clock runs in REAL time: what is under test is a wait for it to reach a buffer, which
// a frozen clock can never do.
const clock = { zero: 0 };
/** While set, the clock reads this and no later — a suspended context. Releasing it moves the
 *  zero forward so the clock resumes from where it froze, as a real context does. */
const hold: { frozenAt: number | null } = { frozenAt: null };

const fakeCtx = {
  state: 'running',
  get currentTime(): number {
    const now = (Date.now() - clock.zero) / 1000;
    if (hold.frozenAt === null) return now;
    clock.zero += (now - hold.frozenAt) * 1000;
    return hold.frozenAt;
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

vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => fakeCtx,
  leaseAudioContext: () => ({ ctx: fakeCtx, release: () => {} }),
  tapPlaybackNode: () => () => {},
  voiceEnergyTap: () => () => {},
  resetVoiceEnergy: (): void => {},
}));

import { cancelActiveStream, playPcmBytes } from '../src/voice/streamTts';

const SAMPLE_RATE = 24000;
/** Short enough to keep the test well under a second of real time, long enough that scheduling
 *  the next clip and hearing it are plainly different moments. */
const CLIP_SECONDS = 0.3;
const PCM = new Uint8Array(CLIP_SECONDS * SAMPLE_RATE * 2).fill(7);
const LEAD_SECONDS = 0.08;

/** The clock reading when each clip announced itself audible. */
let audibleAt: (number | null)[] = [];

function play(index: number): Promise<boolean> {
  return playPcmBytes(PCM, `clause ${index}`, () => {
    audibleAt[index] = fakeCtx.currentTime;
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  starts.length = 0;
  clock.zero = Date.now();
  hold.frozenAt = null;
  audibleAt = [null, null];
});

afterEach(() => {
  cancelActiveStream();
});

describe('a clip reports itself audible when the clock reaches it', () => {
  it('holds the second clip’s start until the first has played out', async () => {
    const first = play(0);
    // The queue takes the next clause up as soon as this one has scheduled its last buffer, which
    // for a cached clip is immediately — the whole point of anchoring on the tail. It asks the
    // clock how much voice is still scheduled before it anchors, so it lands a tick later rather
    // than inside this call.
    const second = play(1);
    await vi.waitFor(() => expect(starts).toHaveLength(2));
    expect(starts[1].at).toBeCloseTo(starts[0].at + CLIP_SECONDS, 6);

    await sleep(LEAD_SECONDS * 1000 + 60);
    expect(audibleAt[0]).not.toBeNull();
    expect(audibleAt[1]).toBeNull();

    await vi.waitFor(() => expect(audibleAt[1]).not.toBeNull(), { timeout: 2000 });
    // Timers fire late, never early; the spotlight must not move before the buffer sounds.
    expect(audibleAt[1] as number).toBeGreaterThanOrEqual(starts[1].at - 0.01);
    await Promise.all([first, second]);
  });

  it('never announces a clip that was stopped before it sounded', async () => {
    const first = play(0);
    const second = play(1);
    // Both are scheduled: the second is anchored behind the first and waiting on the clock.
    await vi.waitFor(() => expect(starts).toHaveLength(2));
    cancelActiveStream();

    // Past the moment the second clip WOULD have sounded, had it not been stopped.
    await sleep((starts[1].at - fakeCtx.currentTime) * 1000 + 100);
    expect(audibleAt[1]).toBeNull();
    await Promise.all([first, second]);
  });

  it('measures the wait on the audio clock, which a suspended context stops', async () => {
    // A backgrounded tab suspends the context: its clock freezes while setTimeout keeps counting,
    // so a wait computed once would fire the spotlight onto a line nobody has heard yet.
    const first = play(0);
    await vi.waitFor(() => expect(starts).toHaveLength(1));
    hold.frozenAt = fakeCtx.currentTime;

    await sleep(LEAD_SECONDS * 1000 + 120);
    expect(audibleAt[0], 'the clock has not reached the clip').toBeNull();

    hold.frozenAt = null;
    await vi.waitFor(() => expect(audibleAt[0]).not.toBeNull(), { timeout: 2000 });
    expect(audibleAt[0] as number).toBeGreaterThanOrEqual(starts[0].at - 0.01);
    await first;
  });
});
