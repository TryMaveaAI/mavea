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

// The failure the stand-in reports; a test that needs a different one sets it before it asks.
const failure = vi.hoisted(() => ({
  error: { kind: 'auth', status: 401, message: 'Your API key was rejected.' } as {
    kind: 'auth' | 'quota' | 'http';
    status: number;
    message: string;
    searchRefused?: true;
  },
}));

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async (): Promise<LiveResult> => ({
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
    error: failure.error,
  })),
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
  failure.error = { kind: 'auth', status: 401, message: 'Your API key was rejected.' };
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

describe('LiveApp — a refused Search is fixed by one switch', () => {
  it('offers the Web search row itself, not a generic settings panel', async () => {
    failure.error = {
      kind: 'quota',
      status: 429,
      message: 'Google refused Search for this key, and waiting will not change that.',
      searchRefused: true,
    };
    render(<LiveApp />);
    const input = await waitFor(() => {
      const el = document.querySelector('.composer-input') as HTMLInputElement | null;
      if (!el) throw new Error('composer not mounted');
      return el;
    });
    fireEvent.change(input, { target: { value: 'what is the weather in Tokyo this week?' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await Promise.resolve();
    });

    await waitFor(() => expect(document.querySelector('.live-error')).toBeTruthy());
    const panel = document.querySelector('.live-error') as HTMLElement;
    expect(panel.textContent).not.toMatch(/Open settings/);
    const turnOff = Array.from(panel.querySelectorAll('button')).find((b) =>
      /web search setting/i.test(b.textContent ?? ''),
    );
    expect(turnOff).toBeTruthy();

    fireEvent.click(turnOff as HTMLElement);
    await waitFor(() => expect(document.getElementById('ls-web-search')).toBeTruthy());
  });

  it('re-asks the same question without Search when the reader chooses to, and only then', async () => {
    failure.error = {
      kind: 'quota',
      status: 429,
      message: 'Google refused Search for this key, and waiting will not change that.',
      searchRefused: true,
    };
    setLiveConfigV2({ searchMode: 'realtime' });
    const { generateLive } = await import('../src/live/generateLive');
    const asked = vi.mocked(generateLive);
    asked.mockClear();
    render(<LiveApp />);
    const input = await waitFor(() => {
      const el = document.querySelector('.composer-input') as HTMLInputElement | null;
      if (!el) throw new Error('composer not mounted');
      return el;
    });
    fireEvent.change(input, { target: { value: 'what is the weather in Tokyo this week?' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await Promise.resolve();
    });
    await waitFor(() => expect(document.querySelector('.live-error')).toBeTruthy());

    // The first ask went out grounded, and nothing re-asked on its own.
    const searchOf = (i: number): string | undefined => {
      const opts = asked.mock.calls[i]?.at(-1) as { caps?: { searchMode?: string } } | undefined;
      return opts?.caps?.searchMode;
    };
    expect(asked).toHaveBeenCalledTimes(1);
    expect(searchOf(0)).toBe('realtime');

    const button = Array.from(document.querySelectorAll('.live-error button')).find((b) =>
      /ask without web search/i.test(b.textContent ?? ''),
    );
    expect(button).toBeTruthy();
    // The no-Search ask then fails for an unrelated reason: Retry must keep asking without Search,
    // or it walks the reader straight back into the refusal they just routed around.
    failure.error = { kind: 'http', status: 503, message: 'Google is busy right now.' };
    await act(async () => {
      fireEvent.click(button as HTMLElement);
      await Promise.resolve();
    });
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(2));
    expect(searchOf(1)).toBe('off');

    await waitFor(() => expect(document.querySelector('.live-error')?.textContent).toMatch(/busy/));
    const retry = Array.from(document.querySelectorAll('.live-error button')).find((b) =>
      /^retry$/i.test((b.textContent ?? '').trim()),
    );
    await act(async () => {
      fireEvent.click(retry as HTMLElement);
      await Promise.resolve();
    });
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(3));
    expect(searchOf(2)).toBe('off');
  });

  it('keeps the generic Open settings for every other failure', async () => {
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
    const panel = document.querySelector('.live-error') as HTMLElement;
    expect(panel.textContent).toMatch(/Open settings/);
    expect(panel.textContent).not.toMatch(/Web search setting/);
  });
});
