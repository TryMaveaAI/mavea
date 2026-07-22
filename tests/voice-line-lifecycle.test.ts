import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  speakKokoroLine,
  speakKokoroResult,
  cancelKokoro,
  resetKokoroProbe,
} from '../src/voice/kokoro';

// speakKokoroLine hands the reveal walk a line's two lifecycle moments — `started` (audio first
// audible, or definitively never) and `finished` (played end-to-end, or skipped/cancelled). The
// walk keys the spotlight to `started`, so the ordering guarantee (started settles before
// finished) and the never-hangs guarantee (every failure path resolves BOTH) are load-bearing:
// a line whose promises dangled would freeze the walk on old machines instead of syncing it.

/** Tag each promise's resolution so ordering between them can be asserted. */
function ordered(line: { started: Promise<boolean>; finished: Promise<boolean> }) {
  const order: string[] = [];
  return {
    started: line.started.then((v) => {
      order.push('started');
      return v;
    }),
    finished: line.finished.then((v) => {
      order.push('finished');
      return v;
    }),
    order,
  };
}

describe('speakKokoroLine', () => {
  beforeEach(() => {
    resetKokoroProbe();
  });
  afterEach(() => {
    cancelKokoro();
    resetKokoroProbe();
    vi.unstubAllGlobals();
  });

  it('resolves both promises false immediately for empty/markup-only text', async () => {
    const line = speakKokoroLine('**', 'mavea');
    await expect(line.started).resolves.toBe(false);
    await expect(line.finished).resolves.toBe(false);
  });

  it('with the voice server down, started resolves false BEFORE finished (never hangs)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const line = ordered(speakKokoroLine('Hello there.', 'mavea'));
    expect(await line.started).toBe(false);
    expect(await line.finished).toBe(false);
    expect(line.order).toEqual(['started', 'finished']);
  });

  it('cancelKokoro drains queued lines, resolving both promises false for each', async () => {
    // Hold the health probe open so both lines are still queued when the cancel lands.
    let releaseProbe!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            releaseProbe = resolve;
          }),
      ),
    );
    const a = speakKokoroLine('First line.', 'mavea');
    const b = speakKokoroLine('Second line.', 'user');
    cancelKokoro();
    // The still-queued line resolves from the drain itself — no network needed.
    await expect(b.started).resolves.toBe(false);
    await expect(b.finished).resolves.toBe(false);
    // The line pump already picked up resolves once its gate (the probe) settles.
    releaseProbe(new Response(null, { status: 503 }));
    await expect(a.started).resolves.toBe(false);
    await expect(a.finished).resolves.toBe(false);
  });

  it('the blob fallback reports started the moment play() is accepted, finished on ended', async () => {
    // jsdom has no WebAudio, so the streaming path bows out and the whole-clip path plays —
    // exactly the fallback route old browsers take.
    const audios: FakeAudio[] = [];
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {
        audios.push(this);
      }
      play(): Promise<void> {
        return Promise.resolve();
      }
      pause(): void {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    const urlStub = { createObjectURL: vi.fn(() => 'blob:clip'), revokeObjectURL: vi.fn() };
    vi.stubGlobal('URL', urlStub);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL) => {
        if (String(url).endsWith('/health')) return Promise.resolve(new Response('ok'));
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4])));
      }),
    );

    const line = ordered(speakKokoroLine('A real line.', 'mavea'));
    expect(await line.started).toBe(true);
    // Audio is "playing" now; the clip ending resolves finished.
    expect(line.order).toEqual(['started']);
    audios[0].onended?.();
    expect(await line.finished).toBe(true);
    expect(line.order).toEqual(['started', 'finished']);
  });

  it('speakKokoroResult stays the finished promise (compat for fire-and-forget callers)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('down'))),
    );
    await expect(speakKokoroResult('Hello.', 'mavea')).resolves.toBe(false);
  });
});
