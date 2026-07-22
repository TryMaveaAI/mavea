// Always-on (VAD) mode used to have NO path that ever surfaced a mic error: the parallel
// WebSpeech recognizer's onerror was a no-op, so denying mic permission left the mic silently
// dead forever with nothing in the UI ever explaining why. These lock the fix: real failures
// (permission denied, no mic hardware) now emit a VoiceStateEvent with `error` set — the same
// field LiveApp's onStateChange already watches for tap-mode notices — while routine churn
// ('aborted' from our own start/stop, 'no-speech' which VAD's own boundary logic makes
// meaningless here) stays quiet, exactly like WebSpeechVoice's own discipline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

let recognizers: FakeRecognition[] = [];

beforeEach(() => {
  recognizers = [];
  (globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
    function (this: FakeRecognition) {
      const r = new FakeRecognition();
      recognizers.push(r);
      return r;
    };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe('VadVoice — surfaces a real error instead of going silently deaf', () => {
  it('maps a mic-permission denial from the parallel recognizer to a user-facing error', () => {
    const v = new VadVoice();
    const states: VoiceStateEvent[] = [];
    v.onStateChange((e) => states.push(e));

    recognizers[0].onerror?.({ error: 'not-allowed' });

    expect(states).toContainEqual({ phase: 'idle', error: 'not-allowed' });
  });

  it('maps "no mic hardware" (audio-capture) the same way', () => {
    const v = new VadVoice();
    const states: VoiceStateEvent[] = [];
    v.onStateChange((e) => states.push(e));

    recognizers[0].onerror?.({ error: 'audio-capture' });

    expect(states).toContainEqual({ phase: 'idle', error: 'audio' });
  });

  it('stays quiet on its own start/stop churn ("aborted") and on "no-speech"', () => {
    const v = new VadVoice();
    const states: VoiceStateEvent[] = [];
    v.onStateChange((e) => states.push(e));

    recognizers[0].onerror?.({ error: 'aborted' });
    recognizers[0].onerror?.({ error: 'no-speech' });

    expect(states.some((e) => e.error)).toBe(false);
  });
});
