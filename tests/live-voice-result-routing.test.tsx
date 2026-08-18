// What LiveApp does with a finished voice result. Two silent-drop regressions live here:
//  — a spoken question arriving while a turn is still GENERATING but not audibly speaking is not
//    flagged as a barge-in, so it reached submit() unforced and run()'s busy guard threw it away:
//    no turn, no feedback, mic still open, transcript still on screen.
//  — the just-listen bank (and a Blank-Space voice fill) consume the utterance but used to leave
//    the partial transcript set, so the composer stayed swapped for the "heard" read-out and the
//    text input was gone until the next turn landed.
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceResult, VoiceStateEvent } from '../src/voice/types';
import type { LiveResult } from '../src/live/generateLive';

// A controllable stand-in for the local VAD controller: the real hook wiring stays in play, we
// just drive the results by hand instead of through a microphone.
const voice: {
  result?: (r: VoiceResult) => void;
  state?: (e: VoiceStateEvent) => void;
  speakingGate: boolean[];
} = { speakingGate: [] };

vi.mock('../src/voice/VadVoice', () => {
  class FakeVadVoice {
    readonly mode = 'vad' as const;
    readonly capabilities = { stt: true, tts: true, canUseRealVoice: true };
    onBargeIn?: () => void;
    onResult(fn: (r: VoiceResult) => void): () => void {
      voice.result = fn;
      return () => {};
    }
    onStateChange(fn: (e: VoiceStateEvent) => void): () => void {
      voice.state = fn;
      return () => {};
    }
    start(): void {}
    stop(): void {}
    forceStop(): void {}
    async speak(): Promise<void> {}
    cancel(): void {}
    setMuted(): void {}
    setSoundEnabled(): void {}
    setMaveaSpeaking(speaking: boolean): void {
      voice.speakingGate.push(speaking);
    }
    dispose(): void {}
  }
  return { VadVoice: FakeVadVoice };
});

// The turn engine, held open so a turn stays "busy" for as long as a test needs.
const asks: string[] = [];
let settle: ((r: LiveResult) => void) | null = null;
vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(
    (userText: string) =>
      new Promise<LiveResult>((resolve) => {
        asks.push(userText);
        settle = resolve;
      }),
  ),
}));

import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { stashSeedQuery } from '../src/live/seedQuery';
import { acceptLegalTerms } from '../src/legal/acceptance';
import { clearSession } from '../src/live/session/store';

beforeEach(() => {
  asks.length = 0;
  settle = null;
  voice.speakingGate = [];
  localStorage.setItem('mavea-live-setup-v1', '1');
  acceptLegalTerms(); // run() fails closed without it — no model call would ever be made
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  clearSession();
  resetLiveConfig();
});

/** Speak `text` as a completed utterance. */
async function say(text: string): Promise<void> {
  await act(async () => {
    voice.result?.({ transcript: text });
    await Promise.resolve();
  });
}

function findButton(match: (b: HTMLButtonElement) => boolean): HTMLButtonElement {
  const btn = [...document.querySelectorAll('button')].find(match);
  if (!btn) throw new Error('button not found');
  return btn;
}

describe('LiveApp — a finished voice result is never silently dropped', () => {
  it('a question spoken while a turn is still generating starts a new turn', async () => {
    stashSeedQuery('How does compound interest work?');
    render(<LiveApp />);
    await waitFor(() => expect(asks).toHaveLength(1));
    // The first turn never settles — it is still "busy", and silent (nothing is being spoken).
    expect(settle).not.toBeNull();

    await say('actually, what about inflation?');

    // Forced through as a barge-in would be: the stuck turn is abandoned and this one runs.
    await waitFor(() => expect(asks).toHaveLength(2));
    expect(asks[1]).toBe('actually, what about inflation?');
  });

  it('banking an utterance in just-listen leaves the composer typeable', async () => {
    render(<LiveApp />);
    // Just listen: every utterance banks instead of answering.
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await waitFor(() => expect(document.querySelector('button.cmdk-row')).toBeTruthy());
    fireEvent.click(findButton((b) => (b.textContent ?? '').startsWith('Just listen')));

    await say('we should probably skip the conference');

    // Banked (the chip counts it) — and the transcript was consumed, so the input is back.
    await waitFor(() =>
      expect(findButton((b) => (b.textContent ?? '').includes('banked')).textContent).toContain(
        '1 banked',
      ),
    );
    expect(document.querySelector('.composer-input')).toBeTruthy();
    expect(document.querySelector('.live-listen.heard')).toBeNull();
  });

  // The gap the user reported: the mic closes and every "I'm hearing you" indicator unmounts at
  // once, so the surface is blank for the length of a transcription — which reads as not having
  // been heard at all.
  it('holds the listening card from the provisional end of speech through transcription', async () => {
    render(<LiveApp />);
    const card = (): Element | null => document.querySelector('.listen-card');
    const stilled = (): boolean => !!document.querySelector('.listen-card.is-transcribing');

    await act(async () => voice.state?.({ phase: 'listening' }));
    await waitFor(() => expect(card()).not.toBeNull());
    expect(stilled()).toBe(false);

    // The mic's tail-watcher says they have plainly stopped — ~1.3s before the phase changes.
    await act(async () => voice.state?.({ phase: 'listening', speechEnding: true }));
    await waitFor(() => expect(stilled()).toBe(true));

    // A mid-thought pause, taken back: the card returns to reading as an open mic.
    await act(async () => voice.state?.({ phase: 'listening', speechEnding: false }));
    await waitFor(() => expect(stilled()).toBe(false));

    // A plain listening event carries no opinion about the tail, so it must not flap the cue.
    await act(async () => voice.state?.({ phase: 'listening', speechEnding: true }));
    await waitFor(() => expect(stilled()).toBe(true));
    await act(async () => voice.state?.({ phase: 'listening' }));
    expect(stilled()).toBe(true);

    // Transcription proper: the mic is closed, and the card is still the thing on screen.
    await act(async () => voice.state?.({ phase: 'transcribing' }));
    expect(card()).not.toBeNull();

    // …and it goes when the turn does, not before.
    await act(async () => voice.state?.({ phase: 'idle' }));
    await waitFor(() => expect(card()).toBeNull());
  });

  it('tracks the echo gate in TAP mode too, not only always-on', async () => {
    // `speak()` arms the gate in every mic mode, but the disarm used to be gated on always-on —
    // so in Tap/Hold it stayed armed forever and every later utterance took the barge path,
    // re-speaking the whole previous answer on a filler word.
    localStorage.removeItem('mavea-always-on'); // Tap is the default mode
    render(<LiveApp />);
    await waitFor(() => expect(voice.speakingGate).toContain(false));
  });
});
