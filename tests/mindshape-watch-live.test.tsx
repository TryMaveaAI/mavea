// Watch Me Think, driven through LiveApp with a controllable microphone.
//
// Every case here is a report of the same shape — "it didn't understand me" or "it takes long to
// react" — traced to a seam between the voice controller and the map:
//  — the settle timer was armed behind a render-old phase, so the first utterance never armed it;
//  — a low-confidence utterance was routed to the composer as a draft, out of a map the speaker
//    was looking at, with the mic still open;
//  — a typed thought cancelled the pending settle and nothing ever put it back.
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceResult, VoiceStateEvent } from '../src/voice/types';

// A controllable stand-in for the local VAD controller: the real LiveApp wiring stays in play, the
// results and phase events are driven by hand instead of by a microphone.
const voice: {
  result?: (r: VoiceResult) => void;
  state?: (e: VoiceStateEvent) => void;
  stops: number;
} = { stops: 0 };

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
    stop(): void {
      voice.stops += 1;
    }
    forceStop(): void {}
    async speak(): Promise<void> {}
    cancel(): void {}
    setMuted(): void {}
    setSoundEnabled(): void {}
    setMaveaSpeaking(): void {}
    dispose(): void {}
  }
  return { VadVoice: FakeVadVoice };
});

// No model in these tests — the local pass is what draws the map, and the settle resolves empty.
vi.mock('../src/live/mindshape/modelRefine', () => ({
  settleMindShape: vi.fn(async () => null),
  patchMindShape: vi.fn(async () => null),
}));

import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { acceptLegalTerms } from '../src/legal/acceptance';
import { clearSession } from '../src/live/session/store';

beforeEach(() => {
  voice.stops = 0;
  localStorage.setItem('mavea-live-setup-v1', '1');
  acceptLegalTerms();
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  clearSession();
  resetLiveConfig();
});

function findButton(match: (b: HTMLButtonElement) => boolean): HTMLButtonElement {
  const btn = [...document.querySelectorAll('button')].find(match);
  if (!btn) throw new Error('button not found');
  return btn;
}

/** Open Watch Me Think from the command palette, the way a reader does. */
async function startWatching(): Promise<void> {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  await waitFor(() => expect(document.querySelector('button.cmdk-row')).toBeTruthy());
  fireEvent.click(findButton((b) => (b.textContent ?? '').startsWith('Watch me think')));
  await waitFor(() => expect(document.querySelector('.ms-canvas')).toBeTruthy());
}

/** One completed utterance, delivered exactly as VadVoice does it: the result and the phase
 *  returning to idle in the SAME synchronous batch, with no render between them. */
async function utterance(transcript: string, r?: Partial<VoiceResult>): Promise<void> {
  await act(async () => {
    voice.result?.({ transcript, ...r });
    voice.state?.({ phase: 'idle' });
    await Promise.resolve();
  });
}

const mapText = (): string => document.querySelector('.ms-canvas')?.textContent ?? '';
const phaseOf = (): string | null =>
  document.querySelector('.ms-canvas')?.getAttribute('data-phase') ?? null;

describe('Watch Me Think — the map keeps up with the microphone', () => {
  // S1. The surface read the map's phase off a ref assigned during render, and the VAD emits the
  // transcript and the idle phase back to back — so on the FIRST utterance the guard saw 'idle'
  // and no settle was ever scheduled. The session then had exactly one way to end: the button.
  it('settles after the quiet even when the very first utterance is the only one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LiveApp />);
    await startWatching();

    await utterance('i keep going back and forth about whether to take the new role');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    await waitFor(() => expect(phaseOf()).toBe('settled'));
    // The settle also closes the mic — a map that has resolved must not keep listening.
    expect(voice.stops).toBeGreaterThan(0);
  });

  // M1. The words were heard, just not confidently. Sending them to the composer took them out of
  // the map the speaker was watching and left nothing behind — the literal "it didn't understand
  // what I say" report. The map keeps them and says it is unsure.
  it('keeps a low-confidence utterance on the map instead of diverting it to the composer', async () => {
    render(<LiveApp />);
    await startWatching();

    await utterance('my dad is getting older and i want to be closer to him', {
      confidence: 0.4,
      lowConfidence: true,
    });

    await waitFor(() => expect(document.querySelector('.ms-card')).toBeTruthy());
    expect(mapText()).toMatch(/dad/i);
    // Marked, not hidden: the card is there and admits the wording may be wrong.
    expect(document.querySelector('.ms-card[data-uncertain]')).toBeTruthy();
    // …and it did not become a composer draft under a "say that again" notice.
    expect(
      (document.querySelector('.composer-input') as HTMLTextAreaElement | null)?.value ?? '',
    ).toBe('');
  });

  // A shaky utterance marks what it brought, not what was already there: the extractor re-reads
  // the whole ramble on every utterance, so the clear thought comes back in the same pass.
  it('marks only the thought the shaky utterance introduced', async () => {
    render(<LiveApp />);
    await startWatching();

    await utterance('i keep going back and forth about whether to take the new role');
    await waitFor(() => expect(document.querySelector('.ms-card')).toBeTruthy());
    await utterance('my dad is getting older and i want to be closer to him', {
      confidence: 0.4,
      lowConfidence: true,
    });

    await waitFor(() => expect(document.querySelector('.ms-card[data-uncertain]')).toBeTruthy());
    const unsure = Array.from(document.querySelectorAll('.ms-card[data-uncertain]'))
      .map((c) => c.textContent ?? '')
      .join(' ');
    expect(unsure).toMatch(/dad|closer/i);
    expect(unsure).not.toMatch(/role/i);
    expect(document.querySelector('.ms-card:not([data-uncertain])')?.textContent).toMatch(/role/i);
  });

  // S8. Typing cancels the pending settle, which is right — someone typing their third thought is
  // not someone who has finished. Nothing re-armed it, so the map then waited forever.
  it('re-arms the quiet settle after a typed thought', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LiveApp />);
    await startWatching();

    await utterance('i want to move closer to my family');
    const input = document.querySelector('.composer-input') as HTMLTextAreaElement;
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.change(input, { target: { value: 'but the job is here and i cannot leave it' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    await waitFor(() => expect(phaseOf()).toBe('settled'));
  });

  // S3. The map's own phase says 'listening' from the first word to the settle, so between the last
  // word and the settled shape there was nothing on screen that had noticed the speaker stop.
  it('shows the map reacting the moment the speaker stops, before transcription finishes', async () => {
    render(<LiveApp />);
    await startWatching();
    await utterance('i have been putting off the conversation with my manager for weeks');

    await act(async () => voice.state?.({ phase: 'listening' }));
    await waitFor(() => expect(mapText()).not.toMatch(/catching that/i));

    // The VAD's provisional end of speech — ~300ms after the last word, well inside its 1.6s
    // redemption window and long before a transcript exists.
    await act(async () => voice.state?.({ phase: 'listening', speechEnding: true }));
    await waitFor(() => expect(mapText()).toMatch(/catching that/i));

    // A mid-thought pause taken back reads as an open mic again.
    await act(async () => voice.state?.({ phase: 'listening', speechEnding: false }));
    await waitFor(() => expect(mapText()).not.toMatch(/catching that/i));
  });
});
