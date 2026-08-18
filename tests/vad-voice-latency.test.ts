// The three places VadVoice used to leave the surface with nothing to show: the 1.6s VAD
// hangover before transcription even starts, a send-tap during that gap, and utterances queued
// strictly one behind the other. Each fix is visual or throughput only — what gets captured, and
// the order the user's words arrive in, must be exactly what it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VadVoice } from '../src/voice/VadVoice';
import type { VoiceResult, VoiceStateEvent } from '../src/voice/types';

type VadCallbacks = {
  audioContext?: AudioContext;
  onFrameProcessed: (
    probabilities: { isSpeech: number; notSpeech: number },
    frame: Float32Array,
  ) => void;
  onSpeechStart: () => void;
  onSpeechRealStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  onVADMisfire: () => void;
};

let callbacks: VadCallbacks | null = null;
const vad = {
  start: vi.fn(() => Promise.resolve()),
  pause: vi.fn(() => Promise.resolve()),
  destroy: vi.fn(() => Promise.resolve()),
};

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (options: VadCallbacks) => {
      callbacks = options;
      return vad;
    }),
  },
}));

/** One 32ms VAD frame. */
const FRAME = new Float32Array(512);
const SPEECH = { isSpeech: 0.9, notSpeech: 0.1 };
const QUIET = { isSpeech: 0.05, notSpeech: 0.95 };
/** 300ms of quiet at 32ms per frame — the provisional end-of-speech threshold. */
const QUIET_FRAMES = 9;

async function started(continuous = false): Promise<{
  voice: VadVoice;
  results: VoiceResult[];
  states: VoiceStateEvent[];
}> {
  const voice = new VadVoice();
  const results: VoiceResult[] = [];
  const states: VoiceStateEvent[] = [];
  voice.onResult((result) => results.push(result));
  voice.onStateChange((state) => states.push(state));
  voice.start({ inCanvas: false, continuous });
  await vi.waitFor(() => expect(callbacks).not.toBeNull());
  return { voice, results, states };
}

/** Let the microtask queue (and one macrotask) drain, so "nothing was emitted" means it. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('VadVoice provisional end-of-speech', () => {
  beforeEach(() => {
    callbacks = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('announces the utterance is ending after ~300ms of quiet, without leaving the listening phase', async () => {
    const { states } = await started(true);
    callbacks!.onSpeechStart();
    states.length = 0;

    for (let i = 0; i < QUIET_FRAMES - 1; i++) callbacks!.onFrameProcessed(QUIET, FRAME);
    expect(states).toEqual([]); // a breath is not the end of a thought

    callbacks!.onFrameProcessed(QUIET, FRAME);
    expect(states).toEqual([{ phase: 'listening', speechEnding: true }]);

    // Held, not repeated: the surface is told once and the VAD's own redemption window runs on.
    for (let i = 0; i < 20; i++) callbacks!.onFrameProcessed(QUIET, FRAME);
    expect(states).toHaveLength(1);
  });

  it('takes the guess back when the user was only pausing mid-thought', async () => {
    const { states } = await started(true);
    callbacks!.onSpeechStart();
    for (let i = 0; i < QUIET_FRAMES; i++) callbacks!.onFrameProcessed(QUIET, FRAME);
    states.length = 0;

    callbacks!.onFrameProcessed(SPEECH, FRAME);
    expect(states).toEqual([{ phase: 'listening', speechEnding: false }]);

    // …and it can fire again on the next real tail.
    for (let i = 0; i < QUIET_FRAMES; i++) callbacks!.onFrameProcessed(QUIET, FRAME);
    expect(states.at(-1)).toEqual({ phase: 'listening', speechEnding: true });
  });

  it('says nothing while no utterance is open', async () => {
    const { states } = await started(true);
    for (let i = 0; i < QUIET_FRAMES * 3; i++) callbacks!.onFrameProcessed(QUIET, FRAME);
    expect(states.some((state) => state.speechEnding !== undefined)).toBe(false);
  });

  it('keeps capturing every frame after the signal — the audio path is untouched', async () => {
    let sent: FormData | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        sent = init?.body as FormData;
        return Response.json({ text: 'still here' });
      }),
    );
    const { voice, results } = await started();
    callbacks!.onSpeechStart();
    // Well past the provisional signal: if it had flipped the phase early, these frames would be
    // demoted to the rolling pre-roll and the tail of the utterance would be dropped.
    const frames = QUIET_FRAMES + 6;
    for (let i = 0; i < frames; i++) callbacks!.onFrameProcessed(QUIET, new Float32Array(512));

    voice.forceStop();
    await vi.waitFor(() => expect(results).toHaveLength(1));
    const file = (sent as unknown as FormData).get('file') as Blob;
    expect(file.size).toBe(44 + frames * 512 * 2); // WAV header + every captured sample
  });
});

describe('VadVoice send-tap during transcription', () => {
  beforeEach(() => {
    callbacks = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restates the phase so the surface can react to the tap', async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const { voice, states } = await started(true);
    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'));
    states.length = 0;

    voice.forceStop();
    expect(states).toEqual([{ phase: 'transcribing' }]);

    // The in-flight transcript is still the user's final words.
    resolveFetch(Response.json({ text: 'send it' }));
    await vi.waitFor(() => expect(states.at(-1)).toEqual({ phase: 'idle' }));
  });
});

describe('VadVoice transcription concurrency', () => {
  beforeEach(() => {
    callbacks = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function utterance(sample: number): void {
    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([sample]));
  }

  it('runs two whisper round-trips at once but delivers results in capture order', async () => {
    const pending: ((response: Response) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            pending.push(resolve);
          }),
      ),
    );
    const { results } = await started(true);

    utterance(0.1);
    utterance(0.2);
    await vi.waitFor(() => expect(pending).toHaveLength(2)); // both in flight, not one behind

    utterance(0.3);
    await settle();
    expect(pending).toHaveLength(2); // …and never a third: the slot gate holds it back

    // The second utterance comes back first. Nothing may reach the surface until the first does,
    // or the user's sentences arrive shuffled.
    pending[1](Response.json({ text: 'second' }));
    await settle();
    expect(results).toEqual([]);

    pending[0](Response.json({ text: 'first' }));
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results.map((result) => result.transcript)).toEqual(['first', 'second']);

    pending[2]?.(Response.json({ text: 'third' }));
    await vi.waitFor(() => expect(results).toHaveLength(3));
    expect(results.map((result) => result.transcript)).toEqual(['first', 'second', 'third']);
  });

  it('still refuses a fourth queued utterance instead of retaining unbounded audio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { states } = await started(true);

    utterance(0.1);
    utterance(0.2);
    utterance(0.3);
    states.length = 0;
    utterance(0.4);

    expect(states.at(-1)).toEqual({ phase: 'idle', error: 'audio' });
  });
});

describe('VadVoice capture context', () => {
  class FakeAudioContext {
    state: 'running' | 'suspended' | 'closed' = 'running';
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    suspend = vi.fn(async () => {
      this.state = 'suspended';
    });
    close = vi.fn(async () => {
      this.state = 'closed';
    });
  }

  beforeEach(() => {
    callbacks = null;
    vi.clearAllMocks();
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('owns the vad-web context: suspended between listens, closed on dispose', async () => {
    const { voice } = await started(true);
    const ctx = callbacks!.audioContext as unknown as FakeAudioContext;
    expect(ctx).toBeInstanceOf(FakeAudioContext); // ours — vad-web only frees one it made itself

    voice.stop();
    await vi.waitFor(() => expect(ctx.suspend).toHaveBeenCalledTimes(1));

    voice.start({ inCanvas: false, continuous: true });
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.close).not.toHaveBeenCalled();

    voice.dispose();
    await vi.waitFor(() => expect(ctx.close).toHaveBeenCalledTimes(1));
  });

  it('never suspends a context the mic is coming straight back to', async () => {
    const { voice } = await started(true);
    const ctx = callbacks!.audioContext as unknown as FakeAudioContext;

    voice.stop();
    voice.start({ inCanvas: false, continuous: true }); // re-armed before pause() resolved
    await vi.waitFor(() => expect(vad.start).toHaveBeenCalledTimes(2));
    await settle();
    expect(ctx.suspend).not.toHaveBeenCalled();
  });
});
