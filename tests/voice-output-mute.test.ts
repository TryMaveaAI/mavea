import { afterEach, describe, expect, it, vi } from 'vitest';

// Mute is OUTPUT-only: setOutputMuted(true) zeroes the playback gain — of the clip already
// playing too — while synthesis keeps streaming and the PCM tap keeps recording, so whatever
// synthesizes while muted still lands in the scrubber's voice track. It must compose with (not
// clobber) the whisper-hours voiceGain.
const gains: Array<{ gain: { value: number }; connect: () => void; disconnect: () => void }> = [];

vi.mock('../src/voice/voiceEnergy', () => {
  const sharedAudioContext = () => ({
    currentTime: 0,
    state: 'running',
    resume: async () => {},
    destination: {},
    createGain: () => {
      const node = {
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(node);
      return node;
    },
    createBuffer: (_ch: number, len: number) => ({
      duration: len / 24000,
      getChannelData: () => new Float32Array(len),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
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

import {
  bindOutputGain,
  setOutputMuted,
  setVoiceGain,
  streamSpeak,
  cancelActiveStream,
} from '../src/voice/streamTts';

afterEach(() => {
  cancelActiveStream();
  setOutputMuted(false);
  setVoiceGain(1);
  gains.length = 0;
  vi.restoreAllMocks();
});

describe('setOutputMuted — the speaker goes silent, the pipeline does not', () => {
  it('a clip started while muted plays at gain 0, and unmuting mid-clip restores the voice', async () => {
    setOutputMuted(true);
    // A response whose body never ends keeps the stream "active" while we probe the gain.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new ReadableStream({ start: () => {} })),
    );
    void streamSpeak('hello there', 'af_heart');
    await vi.waitFor(() => expect(gains).toHaveLength(1));
    expect(gains[0].gain.value).toBe(0);

    setOutputMuted(false);
    expect(gains[0].gain.value).toBe(1);
  });

  // The HTMLAudio sinks (kokoro's whole-clip fallback, the voice preview) can't sit on the
  // WebAudio graph, so they bind to the same policy through this seam instead of quietly
  // playing at full volume.
  it('binds an HTMLAudio sink to the same policy until it is released', () => {
    setVoiceGain(0.45);
    const clip = { volume: 1 } as HTMLMediaElement;
    const release = bindOutputGain(clip);
    expect(clip.volume).toBe(0.45);

    setOutputMuted(true);
    expect(clip.volume).toBe(0);
    setOutputMuted(false);
    setVoiceGain(1);
    expect(clip.volume).toBe(1);

    release();
    setOutputMuted(true);
    expect(clip.volume).toBe(1); // a finished clip is no longer held or driven
  });

  it('composes with the whisper-hours voiceGain instead of clobbering it', async () => {
    setVoiceGain(0.45);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new ReadableStream({ start: () => {} })),
    );
    void streamSpeak('hello there', 'af_heart');
    await vi.waitFor(() => expect(gains).toHaveLength(1));
    expect(gains[0].gain.value).toBe(0.45);
    setOutputMuted(true);
    expect(gains[0].gain.value).toBe(0);
    setOutputMuted(false);
    expect(gains[0].gain.value).toBe(0.45);
  });
});
