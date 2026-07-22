import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VadVoice } from '../src/voice/VadVoice';

// transcribeWhisper probes the /stt service on speech-end. The first probe runs on a short
// timeout so a sleeping service can't stall the turn. The bug being pinned here: a single
// cold-start TIMEOUT used to set whisperOk=false permanently, downgrading the WHOLE session to
// WebSpeech with no recovery. A timeout must leave whisperOk null so the next utterance retries;
// only a DEFINITIVE failure (HTTP error, connection refused) may disable Whisper.
//
// The probe is private and only reachable through speech-end without a real mic, so these tests
// reach the private surface deliberately — exactly the regression we need to lock down.
type Whisper = {
  transcribeWhisper(audio: Float32Array): Promise<string>;
  whisperOk: boolean | null;
};

describe('VadVoice Whisper cold-start recovery', () => {
  beforeEach(() => {
    // floatToWav reads the audio; a tiny non-empty buffer is enough to build the WAV blob.
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps Whisper retryable after a timeout (whisperOk stays null)', async () => {
    // AbortSignal.timeout() rejects with a DOMException named TimeoutError when it fires.
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(timeout)),
    );

    const v = new VadVoice() as unknown as Whisper;
    const audio = new Float32Array([0.1, -0.1, 0.2, -0.2]);

    const first = await v.transcribeWhisper(audio);
    expect(first).toBe('');
    // The session is NOT downgraded: the next utterance will probe /stt again.
    expect(v.whisperOk).toBeNull();

    const second = await v.transcribeWhisper(audio);
    expect(second).toBe('');
    expect(v.whisperOk).toBeNull();
    // Both calls actually hit the service — Whisper was never short-circuited off.
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it('also treats a bare AbortError as "slow, retry"', async () => {
    const aborted = new DOMException('Aborted.', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(aborted)),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('');
    expect(v.whisperOk).toBeNull();
  });

  it('disables Whisper on a definitive HTTP failure (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not found', { status: 404 }))),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('');
    // A real service answer that says "no" is definitive — stop probing this session.
    expect(v.whisperOk).toBe(false);

    // Once disabled, later calls short-circuit without touching the network.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const again = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(again).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables Whisper on connection refused (network TypeError, not an abort)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('');
    expect(v.whisperOk).toBe(false);
  });

  it('marks Whisper healthy once it answers with text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ text: '  hello world  ' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('hello world');
    expect(v.whisperOk).toBe(true);
  });
});
