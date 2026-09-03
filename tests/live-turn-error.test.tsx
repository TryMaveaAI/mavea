// A FAILED turn (provider error) must surface as an explicit error state — never as
// content. It must not enter chat history, the timeline frames, or the Library, and a
// successful retry must clear it. (Trust-critical: an error dressed up as a finding is
// indistinguishable from an answer to a new user.)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import { generateLive, type LiveResult } from '../src/live/generateLive';
import type { Attachment } from '../src/live/attachments';
import { getLibrary, clearLibrary } from '../src/live/library/store';

// Controllable stand-in for generateLive (the hoisted mock reads it lazily).
const gen = { result: null as LiveResult | null };

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async () => gen.result),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function errorResult(): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title: "Couldn't answer",
      sub: '',
      opener: 'Your API key was rejected — check it in settings.',
      context: [],
      blocks: [],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: '',
    tier: 'frontier',
    error: {
      kind: 'auth',
      status: 401,
      message: 'Your API key was rejected — check it in settings.',
    },
  };
}

function okResult(): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title: 'Weather Today',
      sub: '',
      opener: 'Sunny.',
      context: [],
      blocks: [
        { type: 'insight', id: 'i1', col: 12, num: '1', props: { title: 'Sunny', summary: 's' } },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: 'Sunny.',
    tier: 'frontier',
  };
}

function collapsedResult(): LiveResult {
  const result = okResult();
  return {
    ...result,
    spec: {
      ...result.spec,
      title: 'Here’s what I can say',
      opener: 'A partial reply.',
      blocks: [
        {
          type: 'insight',
          id: 'live-1',
          col: 12,
          num: '1',
          props: { title: 'Here’s what I can say', summary: 'A partial reply.' },
        },
      ],
    },
    narration: 'A partial reply.',
    collapsed: true,
  };
}

beforeEach(() => {
  clearLibrary();
  vi.mocked(generateLive).mockClear();
  gen.result = errorResult();
});

describe('useLiveTurn — a failed turn is an error state, not content', () => {
  it('surfaces the error (with the question, for Retry) and leaves all records untouched', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getLibraryEnabled: () => true }),
    );

    await act(() => result.current.run("what's the weather?"));

    // The error is surfaced, carrying the question so the surface can offer Retry.
    expect(result.current.error).toMatchObject({
      kind: 'auth',
      status: 401,
      question: "what's the weather?",
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.status).toBe('idle');

    // Nothing entered the records a real answer would: no chat history, no canvas,
    // no timeline frame, and NOTHING saved to the Library.
    expect(result.current.history).toHaveLength(0);
    expect(result.current.spec).toBeNull();
    expect(result.current.frames).toHaveLength(0);
    expect(getLibrary()).toHaveLength(0);
  });

  it('carries the ask’s inputs so Retry re-sends the same turn, not a stripped one', async () => {
    // The composer clears attachments/pins/ink marks on submit. An error that stored only the text
    // retried an attachment-only ask as "What can you tell me about the attached file?" — with no
    // file attached.
    const attachments = [
      { id: 'a1', name: 'lease.pdf', kind: 'pdf', mime: 'application/pdf', data: 'x' },
    ] as unknown as Attachment[];
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    await act(() => result.current.run('', attachments));
    expect(result.current.error?.attachments).toBe(attachments);

    gen.result = okResult();
    const err = result.current.error!;
    await act(() =>
      result.current.run(err.retry, err.attachments, err.selectedBlocks, undefined, err.inkIntents),
    );
    const opts = vi.mocked(generateLive).mock.lastCall?.[4];
    expect(opts?.attachments).toBe(attachments);
  });

  it('a successful retry clears the error and lands as a normal answer', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getLibraryEnabled: () => true }),
    );
    await act(() => result.current.run("what's the weather?"));
    expect(result.current.error).not.toBeNull();

    gen.result = okResult();
    await act(() => result.current.run(result.current.error!.question));

    expect(result.current.error).toBeNull();
    expect(result.current.spec?.title).toBe('Weather Today');
    expect(result.current.history).toHaveLength(2); // the retried turn IS recorded
    expect(result.current.frames).toHaveLength(1);
    expect(getLibrary()).toHaveLength(1); // and saved, as any successful canvas is
  });

  it('shows a collapsed recovery card without caching or remembering it', async () => {
    gen.result = collapsedResult();
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getLibraryEnabled: () => true }),
    );

    await act(() => result.current.run('explain the mechanism'));

    expect(result.current.spec?.title).toBe('Here’s what I can say');
    expect(result.current.collapsed).toBe(true);
    expect(result.current.history).toHaveLength(0);
    expect(result.current.frames).toHaveLength(0);
    expect(getLibrary()).toHaveLength(0);

    await act(() => result.current.run('explain the mechanism'));
    expect(generateLive).toHaveBeenCalledTimes(2);
  });
});
