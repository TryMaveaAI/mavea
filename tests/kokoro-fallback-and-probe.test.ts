import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Two honesty guarantees of the whole-clip fallback path in voice/kokoro.ts:
//
//  • Mute and the quiet-hours gain are OUTPUT policy, not a property of the streaming path. The
//    blob fallback used to ignore both, so the one clip a silenced session played was the one
//    that failed to stream — at full volume.
//  • The /tts/health cache goes stale instead of lasting the whole session. The settings hint
//    tells the user to start the local TTS service; a probe that never ran again made that a
//    lie (voice stayed off until a reload), and a Kokoro that died mid-answer never showed up
//    in the UI at all.
//
// No WebAudio here (sharedAudioContext is null), so every line falls straight through
// streamSpeak to the blob path — exactly the situation both fixes are about.
vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => null,
  leaseAudioContext: () => null, // no WebAudio to lease either
  tapPlaybackNode: () => () => {},
  voiceEnergyTap: () => () => {},
  resetVoiceEnergy: () => {},
}));

import { speakKokoroResult, cancelKokoro, resetKokoroProbe } from '../src/voice/kokoro';
import { setOutputMuted, setVoiceGain } from '../src/voice/streamTts';

class FakeAudio {
  volume = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly src: string) {}
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
}

let clips: FakeAudio[] = [];

/** A Kokoro that is up and answers every speech POST with a one-byte clip. */
function serving(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/tts/health') return { ok: true } as Response;
    return {
      ok: true,
      blob: async () => ({ size: 4 }) as unknown as Blob,
    } as unknown as Response;
  });
}

const healthCalls = (mock: ReturnType<typeof vi.fn>): number =>
  mock.mock.calls.filter((call) => String(call[0]) === '/tts/health').length;

beforeEach(() => {
  clips = [];
  resetKokoroProbe();
  vi.stubGlobal('Audio', function (this: unknown, src: string) {
    const clip = new FakeAudio(src);
    clips.push(clip);
    return clip;
  } as unknown as typeof Audio);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:line');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  cancelKokoro();
  resetKokoroProbe();
  setOutputMuted(false);
  setVoiceGain(1);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the whole-clip fallback obeys the output policy', () => {
  it('plays a muted line silently, and follows an unmute mid-clip', async () => {
    vi.stubGlobal('fetch', serving());
    setOutputMuted(true);

    const finished = speakKokoroResult('This line must not be heard.', 'mavea');
    await vi.waitFor(() => expect(clips).toHaveLength(1));
    expect(clips[0].volume).toBe(0);

    // Mute is instant on this path too — the clip already playing turns audible again.
    setOutputMuted(false);
    expect(clips[0].volume).toBe(1);

    clips[0].onended?.();
    await expect(finished).resolves.toBe(true);
  });

  it('speaks at the quiet-hours gain, and lets the clip go once it ends', async () => {
    vi.stubGlobal('fetch', serving());
    setVoiceGain(0.45);

    const finished = speakKokoroResult('Ember volume, please.', 'mavea');
    await vi.waitFor(() => expect(clips).toHaveLength(1));
    expect(clips[0].volume).toBe(0.45);

    clips[0].onended?.();
    await expect(finished).resolves.toBe(true);
    // Released with the clip: a finished element must not be retained by the policy.
    setOutputMuted(true);
    expect(clips[0].volume).toBe(0.45);
  });
});

describe('the health probe recovers without a reload', () => {
  it('re-checks a down service once the retry window passes, and not before', async () => {
    const offline = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', offline);

    await expect(speakKokoroResult('Silent one.', 'mavea')).resolves.toBe(false);
    await expect(speakKokoroResult('Silent two.', 'mavea')).resolves.toBe(false);
    // Still one probe, and never a doomed speech request per line.
    expect(offline).toHaveBeenCalledTimes(1);

    // The user starts the TTS service. Past the retry window, the next line probes again and
    // speaks — no reload needed.
    const back = serving();
    vi.stubGlobal('fetch', back);
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 30_000);

    const finished = speakKokoroResult('Audible at last.', 'mavea');
    await vi.waitFor(() => expect(clips).toHaveLength(1));
    clips[0].onended?.();
    await expect(finished).resolves.toBe(true);
    expect(healthCalls(back)).toBe(1);
  });

  it('re-checks after a line that got past the gate but produced no audio', async () => {
    // Health is up; every speech request fails — Kokoro died between the probe and the line.
    const dying = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/tts/health'
        ? ({ ok: true } as Response)
        : ({ ok: false, status: 502 } as Response),
    );
    vi.stubGlobal('fetch', dying);

    await expect(speakKokoroResult('Nothing comes out.', 'mavea')).resolves.toBe(false);
    expect(healthCalls(dying)).toBe(1);

    // The silence expires the cached "available", so the next line re-checks instead of the
    // session staying voiceless with a settings hint that still claims voice is on.
    await expect(speakKokoroResult('Nor this one.', 'mavea')).resolves.toBe(false);
    expect(healthCalls(dying)).toBe(2);
  });
});
