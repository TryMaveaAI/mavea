// A failed Silero VAD load must not leave local voice capture silently dead. Mavéa deliberately
// does not hand audio to browser-vendor recognition as a fallback.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force the dynamic Silero import to throw — the same technique used elsewhere in this suite to
// drive VadVoice's fallback path deterministically (no WASM, no real mic in jsdom).
vi.mock('@ricky0123/vad-web', () => ({
  get MicVAD(): never {
    throw new Error('no VAD in test');
  },
}));

import { VadVoice } from '../src/voice/VadVoice';
import type { VoiceStateEvent } from '../src/voice/types';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VadVoice — a local VAD load failure is not silent', () => {
  it('surfaces "unsupported" without invoking a vendor speech fallback', async () => {
    const v = new VadVoice();
    const states: VoiceStateEvent[] = [];
    v.onStateChange((e) => states.push(e));

    v.start();

    await vi.waitFor(() => {
      expect(states.some((e) => e.error === 'unsupported')).toBe(true);
    });
    v.dispose();
  });
});
