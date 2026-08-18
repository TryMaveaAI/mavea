// prepareConversationAudio's synthesis path, isolated from real TTS. The export used to voice a
// conversation strictly one line at a time (slow) while other paths fired everything at once
// (fan-maxing) — these pin the paced middle ground and the early stop: at most two syntheses in
// flight, turn order preserved, per-line progress for the studio's phase label, and a running
// duration total that trips the video cap mid-synthesis instead of after paying for all of it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';

vi.mock('../src/clip/reel/audioTrack', () => ({
  synthesizeVoiceLine: vi.fn(),
  bufferToStream: vi.fn(() => null),
}));
// The export's mix is rendered offline, so it asks for the rate rather than taking the shared
// context — that is what lets the idle timer park the audio thread after an export.
vi.mock('../src/voice/voiceEnergy', () => ({
  sharedSampleRate: () => 24_000,
}));

import { prepareConversationAudio } from '../src/clip/conversation/audio';
import { synthesizeVoiceLine } from '../src/clip/reel/audioTrack';

const synth = vi.mocked(synthesizeVoiceLine);

const block = (id: string): Block =>
  ({ type: 'insight', id, col: 6, delay: 0, props: { title: id } }) as unknown as Block;

const frame = (narration: string): TurnFrame => ({
  question: `About ${narration}?`,
  narration,
  mode: 'replace',
  topicShift: true,
  tour: [],
  spec: { title: narration, blocks: [block('b-1')] } as ConversationSpec,
  at: 100,
});

/** The offline mix graph, reduced to what the renderer touches — the audio itself is not under
 *  test here, only how the synthesis feeding it is scheduled. */
class FakeOfflineAudioContext {
  sampleRate: number;
  length: number;
  destination = {};
  constructor(_channels: number, length: number, rate: number) {
    this.length = length;
    this.sampleRate = rate;
  }
  createGain(): { gain: { value: number }; connect: () => void } {
    return { gain: { value: 1 }, connect: vi.fn() };
  }
  createBuffer(_ch: number, len: number, _rate: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
  createBufferSource(): { buffer: unknown; connect: () => void; start: () => void } {
    return { buffer: null, connect: vi.fn(), start: vi.fn() };
  }
  async startRendering(): Promise<AudioBuffer> {
    return { duration: this.length / this.sampleRate } as unknown as AudioBuffer;
  }
}

beforeEach(() => {
  synth.mockReset();
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prepareConversationAudio — paced synthesis', () => {
  it('runs at most two syntheses at once, preserves turn order, and reports per-line progress', async () => {
    const texts = ['alpha', 'bravo', 'charlie', 'delta'];
    let inFlight = 0;
    let maxInFlight = 0;
    const started: string[] = [];
    synth.mockImplementation(async (text) => {
      started.push(text);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return new Float32Array(2_400); // 0.1s at 24kHz
    });

    const progress: [number, number][] = [];
    const prepared = await prepareConversationAudio(
      texts.map(frame),
      () => null,
      undefined,
      (done, total) => progress.push([done, total]),
    );

    expect(maxInFlight).toBe(2);
    expect(started.slice(0, 2)).toEqual(['alpha', 'bravo']); // the pool fills front-to-back
    // Completion order may interleave; the assembled turns must not.
    expect(prepared.turns.map((turn) => turn.spans[0].text)).toEqual(texts);
    expect(progress).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('stops synthesizing the moment the running total exceeds the video cap', async () => {
    const frames = ['one', 'two', 'three', 'four', 'five', 'six'].map(frame);
    const signals: (AbortSignal | undefined)[] = [];
    synth.mockImplementation(async (_text, signal) => {
      signals.push(signal);
      await new Promise((r) => setTimeout(r, 5));
      // 70s of audio per line: the 180s ceiling trips on the third landing, far before turn six.
      // A bare length stands in — the samples are never mixed, the export refuses first.
      return { length: 70 * 24_000 } as unknown as Float32Array;
    });

    await expect(prepareConversationAudio(frames, () => null)).rejects.toThrow(
      'conversation-too-long',
    );
    // The old behavior synthesized EVERYTHING and only then refused.
    expect(synth.mock.calls.length).toBeLessThan(frames.length);
    // And the synthesis still in flight when the cap tripped was aborted, not left running.
    expect(signals[signals.length - 1]?.aborted).toBe(true);
  });
});
