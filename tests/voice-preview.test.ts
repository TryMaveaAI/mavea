import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for a real bug: picking voice B before voice A's audition clip finished
// fetching used to let BOTH eventually construct an <audio> and call .play() — nothing stopped
// A once it was already in flight, so two clips could sound at once. previewVoice() now guards
// every async step with a generation counter (src/voice/preview.ts), so a superseded request
// bails out at its very next checkpoint instead of racing the current one to playback.

class FakeAudio {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
  }
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
}

function mkBlobResponse(tag: string): Response {
  const blob = { size: 1, _tag: tag } as unknown as Blob;
  return { ok: true, blob: () => Promise.resolve(blob) } as unknown as Response;
}

// previewVoice() now hops through an extra async layer (it tries the streaming path first,
// which resolves false in jsdom with no WebAudio, before falling back to the blob fetch this
// file mocks) — a fixed number of `await Promise.resolve()` ticks is too fragile to that
// implementation detail. A macrotask flush drains every pending microtask first, regardless of
// how many hops deep, so it stays correct even if that call chain grows another layer.
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('previewVoice — race safety', () => {
  let constructed: string[];

  beforeEach(() => {
    vi.resetModules();
    constructed = [];
    const AudioCtor = function (this: FakeAudio, src: string) {
      constructed.push(src);
      return new FakeAudio(src);
    } as unknown as typeof Audio;
    vi.stubGlobal('Audio', AudioCtor);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      (b: Blob | MediaSource) => `blob:${(b as unknown as { _tag?: string })._tag ?? 'x'}`,
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('abandons a superseded request before it ever reaches the network, so only the latest pick can play', async () => {
    let resolve!: (r: Response) => void;
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls++;
        return new Promise<Response>((res) => {
          resolve = res;
        });
      }),
    );

    const { previewVoice } = await import('../src/voice/preview');
    const { findPreset } = await import('../src/voice/presets');

    // Two picks in immediate succession, exactly like a user browsing the dropdown: heart is
    // superseded before its own (mocked, streaming-unavailable) attempt even settles, so it must
    // bail out on its own rather than still racing bella to the network.
    previewVoice(findPreset('heart')!);
    previewVoice(findPreset('bella')!);
    await flush();

    expect(calls).toBe(1); // heart's request never happened — only the current pick's did
    resolve(mkBlobResponse('bella'));
    await flush();

    expect(constructed).toEqual(['blob:bella']);
  });

  it('stopPreview aborts an in-flight request', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise<Response>(() => {
          /* never resolves — only the abort matters here */
        });
      }),
    );

    const { previewVoice, stopPreview } = await import('../src/voice/preview');
    const { findPreset } = await import('../src/voice/presets');

    previewVoice(findPreset('heart')!);
    await flush(); // let it reach the (mocked) blob fetch and capture its signal
    expect(signal?.aborted).toBe(false);
    stopPreview();
    expect(signal?.aborted).toBe(true);
  });
});
