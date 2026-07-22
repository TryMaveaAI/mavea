// A failed Silero VAD load (offline, CDN blocked) must not leave always-on silently dead. When a
// SpeechRecognition fallback exists, VadVoice degrades to it gracefully and stays quiet; when the
// browser has NO SpeechRecognition either, there is no possible fallback at all — that case must
// surface an error so the user isn't left staring at a mic that will never react to anything.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force the dynamic Silero import to throw — the same technique used elsewhere in this suite to
// drive VadVoice's fallback path deterministically (no WASM, no real mic in jsdom).
vi.mock('@ricky0123/vad-web', () => ({
  get MicVAD(): never {
    throw new Error('no VAD in test');
  },
}));

import { VadVoice } from '../src/voice/VadVoice';
import type { VoiceStateEvent } from '../src/voice/types';

class FakeRecognition {
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe('VadVoice — a load failure with no possible fallback is not silent', () => {
  it('surfaces "unsupported" when Silero fails to load and the browser has no SpeechRecognition either', async () => {
    // No webkitSpeechRecognition stubbed — matches Firefox/Safari, or any browser with WebSpeech
    // unavailable, exactly the scenario with zero remaining path to a working mic.
    const v = new VadVoice();
    const states: VoiceStateEvent[] = [];
    v.onStateChange((e) => states.push(e));

    v.start();

    await vi.waitFor(() => {
      expect(states.some((e) => e.error === 'unsupported')).toBe(true);
    });
  });

  it('degrades quietly (no error) when a SpeechRecognition fallback is available', async () => {
    const recognizers: FakeRecognition[] = [];
    (globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      function () {
        const r = new FakeRecognition();
        recognizers.push(r);
        return r;
      };

    const v = new VadVoice();
    const states: VoiceStateEvent[] = [];
    v.onStateChange((e) => states.push(e));

    v.start();

    await vi.waitFor(() => expect(recognizers[0]?.start.mock.calls.length ?? 0).toBeGreaterThan(0));
    expect(states.some((e) => e.error)).toBe(false);
  });
});
