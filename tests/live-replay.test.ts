import { describe, it, expect } from 'vitest';
import { replayFrame, replaySequence } from '../src/live/replay';
import type { TurnFrame } from '../src/live/history';
import type { Block, ConversationSpec } from '../src/data/conversation';

const blk = (id?: string, title = 'T'): Block =>
  ({
    type: 'insight',
    col: 4,
    delay: 0,
    ...(id ? { id } : {}),
    props: { title },
  }) as unknown as Block;

const spec = (blocks: Block[], title = 'A canvas'): ConversationSpec =>
  ({ title, blocks }) as unknown as ConversationSpec;

const frame = (overrides: Partial<TurnFrame> = {}): TurnFrame => ({
  question: 'q',
  narration: 'the spoken line',
  mode: 'replace',
  tour: [],
  spec: spec([blk('live-1'), blk('live-2'), blk('live-3')]),
  at: 0,
  ...overrides,
});

const spots = (beats: { set?: { spot?: string | null } }[]) =>
  beats.filter((b) => b.set && b.set.spot).map((b) => b.set!.spot);

describe('replayFrame — one captured turn, played exactly as it was', () => {
  it('narrates the turn line and walks the canvas in reading order, then releases', () => {
    const seg = replayFrame(frame());
    expect(seg.say).toBe('the spoken line');
    expect(spots(seg.beats)).toEqual(['live-1', 'live-2', 'live-3']);
    expect(seg.beats[0].set?.caption).toBe('the spoken line');
    expect(seg.beats[seg.beats.length - 1].set?.spot).toBeNull();
  });

  it('speaks the voice-ready twin while captions keep the normally written text', () => {
    const seg = replayFrame(frame({ narration: 'Try Omakase.', spoken: 'Try oh-mah-kah-seh.' }));
    expect(seg.say).toBe('Try oh-mah-kah-seh.');
    expect(seg.beats[0].set?.caption).toBe('Try Omakase.');
  });

  it("honors the frame's model tour (index-based) by resolving indices to block ids", () => {
    const seg = replayFrame(
      frame({
        tour: [
          { index: 2, say: 'third' },
          { index: 0, say: 'first' },
        ],
      }),
    );
    // Indices 2,0 map to live-3, live-1 — replayed in the authored order.
    expect(spots(seg.beats)).toEqual(['live-3', 'live-1']);
  });

  it('carries the authored Pen marks on the same resolved cue as its spotlight', () => {
    const mark = { kind: 'circle' as const, at: 'third' };
    const seg = replayFrame(frame({ tour: [{ index: 2, say: 'third', mark }] }));
    expect(seg.cues).toEqual([{ spot: 'live-3', say: 'third', marks: [mark] }]);
  });

  it('drops a tour index that points past the blocks', () => {
    const seg = replayFrame(frame({ tour: [{ index: 9 }, { index: 1 }] }));
    expect(spots(seg.beats)).toEqual(['live-2']);
  });
});

describe('replaySequence — from the start or from a point onward', () => {
  const frames = [
    frame({ question: 'q0', narration: 'n0' }),
    frame({ question: 'q1', narration: 'n1' }),
    frame({ question: 'q2', narration: 'n2' }),
  ];

  it('replays every frame in order from the start', () => {
    const segs = replaySequence(frames);
    expect(segs.map((s) => s.say)).toEqual(['n0', 'n1', 'n2']);
  });

  it('replays from a chosen point onward', () => {
    const segs = replaySequence(frames, 1);
    expect(segs.map((s) => s.say)).toEqual(['n1', 'n2']);
  });

  it('clamps an out-of-range start', () => {
    expect(replaySequence(frames, 99)).toEqual([]);
    expect(replaySequence(frames, -5).length).toBe(3);
  });
});
