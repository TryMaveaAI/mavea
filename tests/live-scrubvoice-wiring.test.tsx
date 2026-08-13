// The scrub-the-voice recorder can only protect a turn's track if the SURFACE drives it. Both
// levers were once dead code — the recorder knew how to go deaf during a replay and how to close a
// finished turn, but LiveApp never called either, so replayed lines still overwrote the live
// turn's snapshot and a post-turn voice audition still appended itself to the settled answer.
// These tests pin the wiring in LiveApp, not the recorder's own behavior (tests/live-scrubvoice).
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveResult } from '../src/live/generateLive';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { Block, ConversationSpec } from '../src/data/conversation';

// A turn that fails settles exactly like one that succeeds (busy → not busy, canvas untouched)
// without dragging the reveal walk and its audio waits into the test.
vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async (): Promise<LiveResult> => ({
    spec: null as unknown as ConversationSpec,
    narration: '',
    tier: 'frontier',
    error: { kind: 'auth', status: 401, message: 'Your API key was rejected.' },
  })),
}));

import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { acceptLegalTerms } from '../src/legal/acceptance';
import { saveSession, clearSession } from '../src/live/session/store';
import { recorderTap, beginTurn, snapshot, setTapSuspended } from '../src/live/scrubvoice/recorder';
// The replay overlay is lazy in LiveApp; importing it here warms the module registry so opening
// it in a test is a tick, not a cold transform.
import '../src/live/ReplayOverlay';

const SR = 24000;
/** One spoken line arriving at the tap, exactly as streaming TTS feeds it. A settled line
 *  notifies the surface (the live waveform), so it lands inside act like any other update. */
function speakInto(text: string, seconds = 1): void {
  act(() => {
    recorderTap.begin(text);
    recorderTap.push(new Float32Array(Math.round(seconds * SR)).fill(0.2));
    recorderTap.end(true);
  });
}

function savePriorSession(): void {
  const spec = {
    id: 's',
    workspace: 'W',
    title: 'Compound interest',
    sub: '',
    opener: '',
    context: [],
    blocks: [
      {
        type: 'insight',
        id: 'i1',
        col: 12,
        num: '1',
        props: { title: 'Compound interest', summary: 's', conf: 'inferred' },
      } as Block,
    ],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
  const frame: TurnFrame = {
    question: 'How does compound interest work?',
    narration: 'It compounds.',
    mode: 'replace',
    tour: [],
    spec,
    at: Date.now(),
  };
  const history: ChatMessage[] = [
    { role: 'user', content: frame.question },
    { role: 'assistant', content: frame.narration },
  ];
  saveSession(history, [frame]);
}

beforeEach(() => {
  // jsdom implements no scrolling, and a settled turn scrolls its canvas.
  Element.prototype.scrollTo = vi.fn();
  localStorage.setItem('mavea-live-setup-v1', '1');
  acceptLegalTerms();
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
  savePriorSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
  setTapSuspended(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  clearSession();
  resetLiveConfig();
  setTapSuspended(false);
});

describe('LiveApp — a replay deafens the turn recorder', () => {
  it('suspends the tap while the replay overlay is open, and resumes when it closes', async () => {
    render(<LiveApp />);
    act(() => beginTurn()); // the live turn is recording
    speakInto('The live answer.');
    expect(snapshot()?.spans.map((s) => s.text)).toEqual(['The live answer.']);

    fireEvent.click(screen.getByRole('button', { name: /Replay earlier answers/i }));
    await screen.findByRole('dialog', { name: 'Replay' }); // the overlay's chunk has landed
    // Everything the replay narrates goes through this same tap — none of it may join the track.
    speakInto('A replayed answer from three turns ago.', 4);
    expect(snapshot()?.spans.map((s) => s.text)).toEqual(['The live answer.']);
    expect(snapshot()?.duration).toBeCloseTo(1, 5);

    fireEvent.click(screen.getByRole('button', { name: /← Live/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Replay' })).toBeNull());
    speakInto('Back on the live turn.');
    expect(snapshot()?.spans.map((s) => s.text)).toEqual([
      'The live answer.',
      'Back on the live turn.',
    ]);
  });

  it('releases the suspension when the surface unmounts', async () => {
    const view = render(<LiveApp />);
    fireEvent.click(screen.getByRole('button', { name: /Replay earlier answers/i }));
    await screen.findByRole('dialog', { name: 'Replay' });
    view.unmount();

    act(() => beginTurn());
    speakInto('A later turn, on a fresh mount.');
    expect(snapshot()?.spans.map((s) => s.text)).toEqual(['A later turn, on a fresh mount.']);
  });
});

describe('LiveApp — a settled turn closes the recording', () => {
  it('drops post-turn speech (a voice audition) instead of appending it to the answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LiveApp />);
    const input = await waitFor(() => {
      const el = document.querySelector('.composer-input') as HTMLInputElement | null;
      if (!el) throw new Error('composer not mounted');
      return el;
    });
    fireEvent.change(input, { target: { value: 'and with monthly contributions?' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await Promise.resolve();
    });
    // The turn opened the recording, so its own spoken line lands in the track.
    speakInto('The answer.');
    expect(snapshot()?.spans.map((s) => s.text)).toEqual(['The answer.']);

    await waitFor(() => expect(document.querySelector('.live-error')).toBeTruthy());
    // The answer has settled and the voice never comes back — past the quiet window the surface
    // waits out (a tour's own holds are shorter than this), the recording closes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    speakInto('Voice preview audition.', 3);
    expect(snapshot()?.spans.map((s) => s.text)).toEqual(['The answer.']);
    expect(snapshot()?.duration).toBeCloseTo(1, 5);
  });
});
