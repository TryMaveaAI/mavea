import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VadVoice } from '../src/voice/VadVoice';
import type { VoiceResult, VoiceStateEvent } from '../src/voice/types';

type VadCallbacks = {
  onFrameProcessed: (probabilities: { isSpeech: number }, frame: Float32Array) => void;
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

describe('VadVoice local transcription boundary', () => {
  beforeEach(() => {
    callbacks = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function started(continuous = false) {
    const voice = new VadVoice();
    const results: VoiceResult[] = [];
    const states: VoiceStateEvent[] = [];
    voice.onResult((result) => results.push(result));
    voice.onStateChange((state) => states.push(state));
    voice.start({ inCanvas: false, continuous });
    await vi.waitFor(() => expect(callbacks).not.toBeNull());
    return { voice, results, states };
  }

  it('uses verbose local whisper.cpp confidence and marks uncertain speech as a draft', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({
          text: 'maybe schedule it for Friday',
          words: [
            { word: 'maybe', probability: 0.62 },
            { word: 'schedule', probability: 0.58 },
          ],
          segments: [{ no_speech_prob: 0.08 }],
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { results } = await started();

    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1, 0.2, -0.2]));

    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toMatchObject({
      transcript: 'maybe schedule it for Friday',
      confidence: 0.6,
      lowConfidence: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/stt/inference');
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('response_format')).toBe('verbose_json');
  });

  it('transcribes buffered raw frames locally when Hold is released', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ text: 'send these words' })),
    );
    const { voice, results } = await started();

    callbacks!.onFrameProcessed({ isSpeech: 0.9 }, new Float32Array([0.2, 0.1]));
    voice.forceStop();

    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(results[0].transcript).toBe('send these words');
    expect(vad.pause).toHaveBeenCalledTimes(1);
  });

  it('drops a transcription that resolves after the capture was canceled', async () => {
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
    const { voice, results } = await started();

    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'));
    voice.stop();
    resolveFetch(Response.json({ text: 'stale words' }));

    await Promise.resolve();
    await Promise.resolve();
    expect(results).toEqual([]);
  });

  it('releases one-shot capture at the speech boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ text: 'one tap only' })),
    );
    const { results } = await started();

    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));

    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(vad.pause).toHaveBeenCalledTimes(1);
  });

  it('releases a one-shot capture after a too-short VAD misfire', async () => {
    await started();

    callbacks!.onSpeechStart();
    callbacks!.onVADMisfire();

    expect(vad.pause).toHaveBeenCalledTimes(1);
  });

  it('treats an empty successful transcript as no speech without disabling the next attempt', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(Response.json({ text: '' }))
      .mockResolvedValueOnce(Response.json({ text: 'the next attempt works' }));
    vi.stubGlobal('fetch', fetchMock);
    const { voice, results, states } = await started();

    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.01, -0.01]));
    await vi.waitFor(() => expect(states.some((state) => state.error === 'no-speech')).toBe(true));

    voice.start({ inCanvas: false });
    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));

    await vi.waitFor(() => expect(results[0]?.transcript).toBe('the next attempt works'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(states.some((state) => state.error === 'unsupported')).toBe(false);
  });

  // whisper.cpp is commonly still booting when the first utterance of a session lands. The
  // failure used to latch for the whole session, so the mic was dead until a reload — while the
  // copy the user reads says "try again in a moment". The disable is now a bounded backoff.
  it('retries local transcription after the backoff instead of latching off for the session', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('not up yet', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ text: 'it woke up' }));
    vi.stubGlobal('fetch', fetchMock);
    // Advanceable clock, still monotonic, so vi.waitFor keeps working on real time.
    const realNow = Date.now.bind(Date);
    let skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
    const { voice, results, states } = await started();

    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));
    await vi.waitFor(() =>
      expect(states.some((state) => state.error === 'transcription')).toBe(true),
    );

    // Inside the backoff the next utterance fails fast — no retry storm against a dead service.
    voice.start({ inCanvas: false });
    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));
    await vi.waitFor(() =>
      expect(states.filter((state) => state.error === 'transcription')).toHaveLength(2),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past it, the service that has since come up is tried again and the mic works.
    skew = 30_000;
    voice.start({ inCanvas: false });
    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));

    await vi.waitFor(() => expect(results[0]?.transcript).toBe('it woke up'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a denied microphone distinctly from missing audio hardware', async () => {
    vad.start.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    const { states } = await started();

    await vi.waitFor(() =>
      expect(states.some((state) => state.error === 'not-allowed')).toBe(true),
    );
  });

  it('lets an in-flight Always-on transcript finish when the user clicks Done', async () => {
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
    const { voice, results } = await started(true);

    callbacks!.onSpeechStart();
    callbacks!.onSpeechEnd(new Float32Array([0.1, -0.1]));
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'));
    voice.forceStop();
    resolveFetch(Response.json({ text: 'keep my final thought' }));

    await vi.waitFor(() => expect(results[0]?.transcript).toBe('keep my final thought'));
    expect(vad.pause).toHaveBeenCalledTimes(1);
  });
});
