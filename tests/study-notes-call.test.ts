import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, BlockStudy, ConversationSpec } from '../src/data/conversation';

// The on-demand Study call had no tests at all — only its coercer did (study-annotate.test.ts).
// Everything that makes it affordable lives HERE, in the call: the content-addressed cache that
// makes a re-open free, the in-flight dedup that stops a remount paying twice, the rule that a
// failure is never memoised, and the streaming that puts the first note in the margin seconds
// before the last one is written. Each of those is a billing or latency promise on a BYOK key,
// so each gets a test.

const cache = new Map<string, unknown>();
const generate = vi.fn();

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({ generate }),
}));

vi.mock('../src/live/ripple/cache', () => ({
  cacheGet: async (key: string) => cache.get(key) ?? null,
  cachePut: async (key: string, value: unknown) => void cache.set(key, value),
  fnv1a: (text: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  },
  rippleCacheKey: (identity: string, model: string) => `${identity}|${model}`,
}));

vi.mock('../src/live/usage/ledger', () => ({ recordUsage: () => {} }));

const { studyNotesFor } = await import('../src/live/study/annotate');

const cfg = {
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  apiKey: 'k',
} as unknown as Parameters<typeof studyNotesFor>[2];

function specWith(title: string): ConversationSpec {
  const blocks = [
    { type: 'insight', id: 'live-1', col: 4, props: { title, summary: `${title} summary` } },
    { type: 'list', id: 'live-2', col: 6, props: { title: 'Drivers', items: ['A', 'B'] } },
  ] as unknown as Block[];
  return { id: 'live', blocks } as unknown as ConversationSpec;
}

/** One note object, as the model would write it. */
function note(id: string, assumes: string): string {
  return JSON.stringify({
    id,
    assumes,
    pattern: `${id} pattern that adds something the card does not show.`,
    test: `What would have to be true for ${id} to fail?`,
    scrawls: ['short remark'],
  });
}

/** An adapter that emits the reply in pieces, the way a real stream arrives. */
function streamingReply(chunks: string[]) {
  return async (
    _req: unknown,
    _cfg: unknown,
    onDelta?: (chunk: string, meta?: { reasoning?: boolean }) => void,
  ) => {
    for (const chunk of chunks) onDelta?.(chunk);
    return { raw: chunks.join(''), usage: undefined };
  };
}

const REPLY = [
  `{"notes":[`,
  note('live-1', 'First assumption.'),
  `,`,
  note('live-2', 'Second.'),
  `]}`,
];

beforeEach(() => {
  cache.clear();
  generate.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('the Study notes call', () => {
  it('hands over each note as it closes, before the reply finishes', async () => {
    const seen: number[] = [];
    const firstValues: BlockStudy[] = [];
    generate.mockImplementation(streamingReply(REPLY));
    const notes = await studyNotesFor(specWith('stream'), 'why', cfg, 'standard', (partial) => {
      seen.push(partial.size);
      const first = partial.get('live-1');
      if (first) firstValues.push(first);
    });
    // The margin filled in as the stream ran: one note, then both — not a single batch at the end.
    expect(seen).toEqual([1, 2]);
    expect(notes?.size).toBe(2);
    expect(notes?.get('live-1')?.assumes).toBe('First assumption.');
    expect(firstValues[1]).toBe(firstValues[0]);
    expect(notes?.get('live-1')).toBe(firstValues[0]);
  });

  it('ignores thinking tokens rather than scanning them', async () => {
    generate.mockImplementation(
      async (
        _r: unknown,
        _c: unknown,
        onDelta?: (chunk: string, meta?: { reasoning?: boolean }) => void,
      ) => {
        onDelta?.('{"notes":[ deliberating', { reasoning: true });
        for (const chunk of REPLY) onDelta?.(chunk);
        return { raw: REPLY.join(''), usage: undefined };
      },
    );
    const notes = await studyNotesFor(specWith('think'), 'why', cfg);
    expect(notes?.size).toBe(2);
  });

  it('serves a second open from the cache without calling the model', async () => {
    generate.mockImplementation(streamingReply(REPLY));
    await studyNotesFor(specWith('cache'), 'why', cfg);
    expect(generate).toHaveBeenCalledTimes(1);
    const again = await studyNotesFor(specWith('cache'), 'why', cfg);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(again?.get('live-1')?.assumes).toBe('First assumption.');
  });

  it('pays once when two openers race (a remount, a Study→Focus→Study flip)', async () => {
    generate.mockImplementation(streamingReply(REPLY));
    const spec = specWith('race');
    const [a, b] = await Promise.all([
      studyNotesFor(spec, 'why', cfg),
      studyNotesFor(spec, 'why', cfg),
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(a?.size).toBe(2);
    expect(b?.size).toBe(2);
  });

  it('never memoises a failure — the next open gets a real attempt', async () => {
    generate.mockRejectedValueOnce(new Error('gemini 503 — UNAVAILABLE'));
    expect(await studyNotesFor(specWith('fail'), 'why', cfg)).toBeNull();
    generate.mockImplementation(streamingReply(REPLY));
    const notes = await studyNotesFor(specWith('fail'), 'why', cfg);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(notes?.size).toBe(2);
  });

  it('never memoises a reply where nothing survived coercion', async () => {
    generate.mockImplementation(streamingReply([`{"notes":[{"id":"not-in-this-answer"}]}`]));
    expect(await studyNotesFor(specWith('empty'), 'why', cfg)).toBeNull();
    generate.mockImplementation(streamingReply(REPLY));
    expect((await studyNotesFor(specWith('empty'), 'why', cfg))?.size).toBe(2);
  });

  it('keys on the CONTENT, so a later answer of the same shape is not served these notes', async () => {
    generate.mockImplementation(streamingReply(REPLY));
    await studyNotesFor(specWith('shape-a'), 'why', cfg);
    // Same block ids, same types, same positions — only the props differ. Keyed on shape alone
    // this answer would have been handed the previous one's notes, figures and all.
    await studyNotesFor(specWith('shape-b'), 'why', cfg);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('writes a note for Simple and a note for In-depth to different keys', async () => {
    generate.mockImplementation(streamingReply(REPLY));
    await studyNotesFor(specWith('level'), 'why', cfg, 'standard');
    await studyNotesFor(specWith('level'), 'why', cfg, 'simple');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('releases an aborted subscriber while the shared request continues', async () => {
    let emit: ((chunk: string) => void) | undefined;
    let finish: ((result: { raw: string }) => void) | undefined;
    generate.mockImplementation(
      (
        _req: unknown,
        _cfg: unknown,
        onDelta?: (chunk: string, meta?: { reasoning?: boolean }) => void,
      ) =>
        new Promise((resolve) => {
          emit = (chunk) => onDelta?.(chunk);
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const released = vi.fn();
    const active = vi.fn();
    const spec = specWith('watcher-release');
    const first = studyNotesFor(spec, 'why', cfg, 'standard', released, controller.signal);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    controller.abort();
    const second = studyNotesFor(spec, 'why', cfg, 'standard', active);
    for (const chunk of REPLY) emit?.(chunk);
    finish?.({ raw: REPLY.join('') });
    await Promise.all([first, second]);

    expect(released).not.toHaveBeenCalled();
    expect(active).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledOnce();
  });

  it('aborts a provider that exceeds the 30 second notes deadline', async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    generate.mockImplementation(
      (req: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          providerSignal = req.signal;
          req.signal?.addEventListener('abort', () =>
            reject(new DOMException('Timed out', 'AbortError')),
          );
        }),
    );

    const pending = studyNotesFor(specWith('deadline'), 'why', cfg);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(pending).resolves.toBeNull();
    expect(providerSignal?.aborted).toBe(true);
  });
});
