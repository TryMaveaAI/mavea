// world-walk — the walk loop's pacing and its cancellation edges, driven with no audio, no camera
// and no DOM. The rule under test throughout: a beat LIGHTS only once its line is audible, and the
// loop stops at the first wait after it is cancelled rather than running on into a torn-down world.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpokenLine } from '../src/voice/tts';
import { runWorldWalk } from '../src/live/world/worldWalk';
import type { WorldBeat } from '../src/live/world/worldStory';

const beat = (id: string): WorldBeat => ({ nodeId: id, say: `${id} line`, caption: `${id} line` });
const BEATS: WorldBeat[] = [beat('a'), beat('b'), beat('c')];

/** A speech handle whose two moments are driven by the test rather than by a clock. */
function deferredLine(): { line: SpokenLine; start: () => void; finish: () => void } {
  let start = (): void => {};
  let finish = (): void => {};
  const started = new Promise<boolean>((res) => {
    start = () => res(true);
  });
  const finished = new Promise<boolean>((res) => {
    finish = () => res(true);
  });
  const line: SpokenLine = { started, finished };
  return { line, start: () => start(), finish: () => finish() };
}

/** Let every already-resolved promise settle. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('runWorldWalk', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('holds a beat until its line is AUDIBLE, never on enqueue', async () => {
    const applied: string[] = [];
    const first = deferredLine();
    runWorldWalk(
      BEATS,
      0,
      {
        speakLine: () => first.line,
        apply: (b) => applied.push(b.nodeId),
        isCancelled: () => false,
      },
      () => {},
    );
    await flush();
    // Queued, but not yet heard — the world must not have moved.
    expect(applied).toEqual([]);
    first.start();
    await flush();
    expect(applied).toEqual(['a']);
  });

  it('walks every beat and reports completion', async () => {
    const applied: string[] = [];
    const done = vi.fn();
    runWorldWalk(
      BEATS,
      0,
      {
        // No voice: each beat lands at once and is paced by its reading length.
        apply: (b) => applied.push(b.nodeId),
        isCancelled: () => false,
      },
      done,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(applied).toEqual(['a', 'b', 'c']);
    expect(done).toHaveBeenCalledExactlyOnceWith('complete');
  });

  it('paces a voiceless walk rather than racing through it', async () => {
    const applied: string[] = [];
    runWorldWalk(
      BEATS,
      0,
      { apply: (b) => applied.push(b.nodeId), isCancelled: () => false },
      () => {},
    );
    await flush();
    expect(applied).toEqual(['a']);
    // The floor is 1500ms per line (walkSync's spokenMs), so nothing has advanced yet.
    await vi.advanceTimersByTimeAsync(400);
    expect(applied).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(applied).toEqual(['a', 'b']);
  });

  it('stops at the first wait after it is cancelled, and says so exactly once', async () => {
    const applied: string[] = [];
    const done = vi.fn();
    let cancelled = false;
    runWorldWalk(
      BEATS,
      0,
      {
        apply: (b) => applied.push(b.nodeId),
        isCancelled: () => cancelled,
      },
      done,
    );
    await flush();
    expect(applied).toEqual(['a']);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(applied).toEqual(['a']);
    expect(done).toHaveBeenCalledExactlyOnceWith('cancelled');
  });

  it('does not move the world when cancelled while the line was still queueing', async () => {
    const applied: string[] = [];
    const line = deferredLine();
    let cancelled = false;
    runWorldWalk(
      BEATS,
      0,
      {
        speakLine: () => line.line,
        apply: (b) => applied.push(b.nodeId),
        isCancelled: () => cancelled,
      },
      () => {},
    );
    await flush();
    cancelled = true;
    line.start(); // the audio arrives AFTER the walk was torn down
    await vi.advanceTimersByTimeAsync(5_000);
    expect(applied).toEqual([]);
  });

  it('starts where it is told, so a seek does not replay the walk from the top', async () => {
    const applied: string[] = [];
    runWorldWalk(
      BEATS,
      2,
      { apply: (b) => applied.push(b.nodeId), isCancelled: () => false },
      () => {},
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(applied).toEqual(['c']);
  });

  it('falls back to reading-length pacing for a line the voice never played', async () => {
    const applied: string[] = [];
    // A handle that resolves `started` FALSE is a line that was never heard — Kokoro down, or a
    // muted output. The walk must still advance.
    const unheard: SpokenLine = {
      started: Promise.resolve(false),
      finished: Promise.resolve(true),
    };
    runWorldWalk(
      BEATS,
      0,
      {
        speakLine: () => unheard,
        apply: (b) => applied.push(b.nodeId),
        isCancelled: () => false,
      },
      () => {},
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(applied).toEqual(['a', 'b', 'c']);
  });

  it('treats a null handle as this line having no voice, so muting mid-walk still advances', async () => {
    const applied: string[] = [];
    let voice = true;
    const live = deferredLine();
    runWorldWalk(
      BEATS,
      0,
      {
        speakLine: () => (voice ? live.line : null),
        apply: (b) => applied.push(b.nodeId),
        isCancelled: () => false,
      },
      () => {},
    );
    await flush();
    live.start();
    live.finish();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(applied).toEqual(['a', 'b']);
    voice = false; // muted from here on
    await vi.advanceTimersByTimeAsync(10_000);
    expect(applied).toEqual(['a', 'b', 'c']);
  });

  it('reports nothing to walk as an immediate, single completion', async () => {
    const done = vi.fn();
    runWorldWalk([], 0, { apply: () => {}, isCancelled: () => false }, done);
    await flush();
    expect(done).toHaveBeenCalledExactlyOnceWith('complete');
  });
});
