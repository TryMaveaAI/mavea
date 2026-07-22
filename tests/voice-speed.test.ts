import { afterEach, describe, expect, it, vi } from 'vitest';

// Voice speed is applied MODEL-SIDE: Kokoro renders each line at the chosen rate, so the voice
// speeds up/slows down with its pitch held natural (no resampling chipmunk). This proves the rate
// reaches the synth request, is clamped to the supported span, and is stamped onto the recording so
// replay can re-time it. Same AudioContext stub the output-mute test uses.
vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => ({
    currentTime: 0,
    state: 'running',
    resume: async () => {},
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
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
  }),
  tapPlaybackNode: () => () => {},
}));

import {
  setVoiceSpeed,
  getVoiceSpeed,
  streamSpeak,
  cancelActiveStream,
} from '../src/voice/streamTts';
import { beginTurn, recorderTap, snapshot } from '../src/live/scrubvoice/recorder';
import { SPEED_RATES, formatRate, clampSpeed, nextRate } from '../src/live/scrubvoice/voiceSpeed';

afterEach(() => {
  cancelActiveStream();
  setVoiceSpeed(1);
  vi.restoreAllMocks();
});

describe('voice speed — model-side, natural pitch', () => {
  it('sends the current speed to Kokoro so the synth renders each line at that rate', async () => {
    setVoiceSpeed(1.5);
    let sent: { speed?: number } | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return new Response(new ReadableStream({ start: () => {} }));
    }) as unknown as typeof fetch);
    void streamSpeak('hello there', 'af_heart');
    await vi.waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.speed).toBe(1.5);
  });

  it('clamps the speed to the supported 0.75×–2× span', () => {
    setVoiceSpeed(5);
    expect(getVoiceSpeed()).toBe(2);
    setVoiceSpeed(0.1);
    expect(getVoiceSpeed()).toBe(0.75);
    setVoiceSpeed(1.25);
    expect(getVoiceSpeed()).toBe(1.25);
  });

  it('stamps the turn’s speed on the recording so replay can re-time it against the current speed', () => {
    setVoiceSpeed(1.25);
    beginTurn();
    recorderTap.begin('a line');
    recorderTap.push(new Float32Array(2400)); // 0.1s @ 24kHz
    recorderTap.end(true);
    expect(snapshot()?.speed).toBe(1.25);
  });
});

describe('the shared speed ladder', () => {
  it('cycles 1 → 1.25 → 1.5 → 2 → 0.75 → 1', () => {
    expect(SPEED_RATES[0]).toBe(1);
    expect(nextRate(1)).toBe(1.25);
    expect(nextRate(1.25)).toBe(1.5);
    expect(nextRate(1.5)).toBe(2);
    expect(nextRate(2)).toBe(0.75);
    expect(nextRate(0.75)).toBe(1);
  });

  it('clamps and formats out-of-range or odd inputs', () => {
    expect(clampSpeed(9)).toBe(2);
    expect(clampSpeed(0)).toBe(0.75);
    expect(formatRate(1)).toBe('1×');
    expect(formatRate(1.25)).toBe('1.25×');
    expect(formatRate(1.5)).toBe('1.5×');
    expect(formatRate(2)).toBe('2×');
  });
});
