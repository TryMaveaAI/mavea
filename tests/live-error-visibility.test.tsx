// A failed FOLLOW-UP has to be seen. The Retry card mounts at the top of the canvas, and on a tall
// answer the user is scrolled well past it — so a provider error landed off-screen and the turn
// read as "nothing happened at all". Mavéa's honest-states rule only holds if the honest state is
// actually in view.
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveResult } from '../src/live/generateLive';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { Block, ConversationSpec } from '../src/data/conversation';

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(
    async (): Promise<LiveResult> => ({
      spec: {
        id: 'live',
        workspace: 'Live',
        title: "Couldn't answer",
        sub: '',
        opener: '',
        context: [],
        blocks: [],
        proof: null,
        extras: {},
        group: 'home',
        suggests: [],
        keywords: [],
      } as unknown as ConversationSpec,
      narration: '',
      tier: 'frontier',
      error: { kind: 'auth', status: 401, message: 'Your API key was rejected.' },
    }),
  ),
}));

import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { acceptLegalTerms } from '../src/legal/acceptance';
import { saveSession, clearSession } from '../src/live/session/store';

/** A saved session so LiveApp mounts straight into a canvas — the scrollable box the fix targets. */
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

const scrollTo = vi.fn();

beforeEach(() => {
  scrollTo.mockClear();
  // jsdom has no layout, so scrollTo is the only observable signal that the canvas was moved.
  Element.prototype.scrollTo = scrollTo;
  localStorage.setItem('mavea-live-setup-v1', '1');
  acceptLegalTerms();
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
  savePriorSession();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  clearSession();
  resetLiveConfig();
});

describe('LiveApp — a failed follow-up is brought into view', () => {
  it('scrolls the canvas back to the Retry card when a turn fails', async () => {
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

    await waitFor(() => expect(document.querySelector('.live-error')).toBeTruthy());
    const canvas = document.querySelector('.canvas-scroll');
    expect(canvas).toBeTruthy();
    expect(scrollTo.mock.instances).toContain(canvas);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
