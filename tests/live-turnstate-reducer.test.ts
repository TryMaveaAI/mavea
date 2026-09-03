import { describe, it, expect } from 'vitest';
import { reducer, INITIAL } from '../src/live/useLiveTurn';

describe('useLiveTurn reducer — turn-state additions', () => {
  it("tracks the streaming block's data shape and mid-turn sources", () => {
    // The reducer stores the payload verbatim; the engine resolves block type → data shape before
    // dispatching (so the turn state never touches the catalog).
    let s = reducer(INITIAL, { type: 'start' });
    s = reducer(s, { type: 'pending', pending: 'series' });
    expect(s.pendingShape).toBe('series');
    s = reducer(s, { type: 'pending', pending: null });
    expect(s.pendingShape).toBeNull();
    s = reducer(s, {
      type: 'sources',
      sources: [{ title: 'OCP', url: 'https://opencompute.org' }],
    });
    expect(s.liveSources).toHaveLength(1);
  });

  it('a new turn clears both', () => {
    let s = reducer(INITIAL, { type: 'pending', pending: 'scalar' });
    s = reducer(s, { type: 'sources', sources: [{ title: 'a', url: 'https://a.com' }] });
    s = reducer(s, { type: 'start' });
    expect(s.pendingShape).toBeNull();
    expect(s.liveSources).toEqual([]);
  });

  it('a failed turn clears both', () => {
    let s = reducer(INITIAL, { type: 'pending', pending: 'scalar' });
    s = reducer(s, {
      type: 'error',
      error: { kind: 'network', message: 'down', question: 'q', retry: 'q' },
    });
    expect(s.pendingShape).toBeNull();
    expect(s.liveSources).toEqual([]);
  });

  it('tracks the reasoning flag and clears it when content starts or the turn settles', () => {
    // A reasoning model's "Thinking…" cue is keyed to `reasoning`; it must clear so a settled
    // (or answering) turn never reads as still thinking.
    let s = reducer(INITIAL, { type: 'start' });
    expect(s.reasoning).toBe(false);
    s = reducer(s, { type: 'thinking', on: true });
    expect(s.reasoning).toBe(true);
    s = reducer(s, { type: 'thinking', on: false });
    expect(s.reasoning).toBe(false);
    // A new turn and a failure both reset it.
    s = reducer(s, { type: 'thinking', on: true });
    expect(reducer(s, { type: 'start' }).reasoning).toBe(false);
    expect(
      reducer(s, {
        type: 'error',
        error: { kind: 'network', message: 'down', question: 'q', retry: 'q' },
      }).reasoning,
    ).toBe(false);
  });

  it('stays busy while blocks stream and only settles on show — the loading cue is keyed to this', () => {
    // The "Composing your answer" indicator and trailing skeleton render while `busy` is true.
    // A streaming partial must NOT flip busy off, or a half-built canvas would read as finished.
    let s = reducer(INITIAL, { type: 'start' });
    expect(s.busy).toBe(true);
    const before = s.answerEpoch;
    s = reducer(s, { type: 'stream', spec: { title: 'T', blocks: [] } as never, first: true });
    expect(s.busy).toBe(true); // first block arrived, still streaming
    expect(s.answerEpoch).toBe(before + 1);
    s = reducer(s, { type: 'stream', spec: { title: 'T', blocks: [] } as never, first: false });
    expect(s.busy).toBe(true); // more blocks, still streaming
    expect(s.answerEpoch).toBe(before + 1);
    s = reducer(s, {
      type: 'show',
      spec: { title: 'T', blocks: [] },
      narration: '',
      understood: [],
      history: [],
      mode: 'replace',
      prior: null,
      tour: [],
      frame: {},
      spot: null,
      streamed: true,
    } as never);
    expect(s.busy).toBe(false); // settled — the cue clears
    expect(s.answerEpoch).toBe(before + 1);
  });

  it('restored is true only for a Library restore, and a real turn clears it', () => {
    expect(INITIAL.restored).toBe(false);
    let s = reducer(INITIAL, {
      type: 'restore',
      spec: { title: 'Saved', blocks: [] } as never,
      question: 'old q',
      at: 1000,
    });
    expect(s.restored).toBe(true);
    // Streaming a brand-new first turn must NOT read as resumed.
    s = reducer(s, { type: 'start' });
    expect(s.restored).toBe(false);
    s = reducer(s, { type: 'stream', spec: { title: 'T', blocks: [] } as never, first: true });
    expect(s.restored).toBe(false);
  });
});
