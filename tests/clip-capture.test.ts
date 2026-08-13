// The offscreen recorder — the part of the share pipeline nobody can eyeball. These pin the three
// ways a render could look fine in code and still produce a broken (or never-arriving) clip:
//  • the poster still must never be ENCODED inside the frame loop (a full-size PNG encode costs ~1s,
//    and awaiting one per frame froze seconds of the exported video right where the reel opens);
//  • the first video frame must be stamped at 0, so the clip doesn't open with no picture while the
//    audio track — which always starts at 0 — is already talking;
//  • stop() must resolve even when the duration cap already stopped the MediaRecorder, or the export
//    hangs on "Finishing the file…" forever with the recorder still open.
// The encoders are stubbed; what's under test is capture.ts's own bookkeeping.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureProfile, QUALITY, qualityHint, startStoryRecording } from '../src/clip/capture';
import type { ClipQuality } from '../src/clip/types';

/** Frames handed to the muxer: [timestamp, duration], in seconds. */
const webm = vi.hoisted(() => ({ added: [] as [number, number][], finalized: 0, closed: 0 }));
/** Audio buffers handed to the deterministic mux (never a realtime stream on this path). */
const aud = vi.hoisted(() => ({ added: [] as unknown[], closed: 0 }));
/** Per-test control over which approved open video codecs the fake WebCodecs can encode. */
const enc = vi.hoisted(() => ({ video: vi.fn<(codec: string) => Promise<boolean>>() }));
/** Codecs actually handed to the muxer sources, distinct from capability probes. */
const mux = vi.hoisted(() => ({ video: [] as string[], audio: [] as string[] }));

vi.mock('modern-screenshot', () => ({
  // A rasterized snapshot is just a source image to the recorder — a bare {width,height} stands in.
  domToCanvas: vi.fn(async () => ({ width: 540, height: 960 }) as unknown as HTMLCanvasElement),
}));

vi.mock('mediabunny', () => {
  class CanvasSource {
    constructor(_canvas: HTMLCanvasElement, { codec }: { codec: string }) {
      mux.video.push(codec);
    }
    async add(timestamp: number, duration: number): Promise<void> {
      webm.added.push([timestamp, duration]);
    }
    close(): void {
      webm.closed++;
    }
  }
  class BufferTarget {
    buffer = new ArrayBuffer(2048);
  }
  class Output {
    target: unknown;
    constructor({ target }: { target: unknown }) {
      this.target = target;
    }
    async start(): Promise<void> {}
    addVideoTrack(): void {}
    addAudioTrack(): void {}
    async finalize(): Promise<void> {
      webm.finalized++;
    }
    cancel(): void {}
  }
  class AudioBufferSource {
    constructor({ codec }: { codec: string }) {
      mux.audio.push(codec);
    }
    async add(buffer: unknown): Promise<void> {
      aud.added.push(buffer);
    }
    close(): void {
      aud.closed++;
    }
  }
  return {
    CanvasSource,
    Output,
    Mp4OutputFormat: class {},
    WebMOutputFormat: class {},
    BufferTarget,
    StreamTarget: class {},
    AudioBufferSource,
    canEncodeVideo: (codec: string) => enc.video(codec),
    canEncodeAudio: async () => true,
  };
});

const toBlob = vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' })));

/** A MediaRecorder that behaves like the real one where it matters: 'stop' fires exactly ONCE. */
class FakeRecorder extends EventTarget {
  static isTypeSupported = (): boolean => true;
  state: 'recording' | 'inactive' = 'recording';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  start(): void {}
  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['webm'], { type: 'video/webm' }) });
    this.dispatchEvent(new Event('stop'));
  }
}

const track = (): MediaStreamTrack => ({ stop: vi.fn() }) as unknown as MediaStreamTrack;

class FakeMediaStream {
  private tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }
  addTrack(t: MediaStreamTrack): void {
    this.tracks.push(t);
  }
  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
}

const stage = (): HTMLElement => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
};

beforeEach(() => {
  webm.added = [];
  webm.finalized = 0;
  webm.closed = 0;
  aud.added = [];
  aud.closed = 0;
  mux.video = [];
  mux.audio = [];
  enc.video.mockReset();
  enc.video.mockResolvedValue(true);
  toBlob.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  HTMLCanvasElement.prototype.toBlob = toBlob;
  HTMLCanvasElement.prototype.captureStream = () =>
    new FakeMediaStream([track()]) as unknown as MediaStream;
  vi.stubGlobal('MediaStream', FakeMediaStream);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.perf;
});

describe('startStoryRecording — approved open-media muxed path (WebCodecs + mediabunny)', () => {
  beforeEach(() => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('AudioEncoder', class {});
  });

  it('prefers MP4 with AV1 and Opus, then falls back to an approved WebM codec', async () => {
    enc.video.mockImplementation(async (codec) => codec === 'vp8');
    const rec = await startStoryRecording({
      el: stage(),
      audioBuffer: null,
      aspect: '9:16',
      maxDurationMs: 120,
    });
    await new Promise((r) => setTimeout(r, 200));
    const clip = await rec.stop();
    expect(clip.type).toBe('video/webm');
    expect(enc.video.mock.calls.map(([codec]) => codec)).toEqual(['av1', 'vp9', 'vp8']);
    expect(mux.video).toEqual(['vp8']);
  }, 10_000);

  it('never encodes the poster inside the frame loop, and stamps the first frame at zero', async () => {
    const rec = await startStoryRecording({
      el: stage(),
      audioBuffer: null,
      aspect: '9:16',
      // Past the ≈1.2s mark where the poster is banked, so a poster encode in the loop would show up.
      maxDurationMs: 1500,
    });
    await new Promise((r) => setTimeout(r, 1400));
    expect(toBlob).not.toHaveBeenCalled(); // the loop banks a cheap blit, it does not encode

    const clip = await rec.stop();
    expect(toBlob).toHaveBeenCalledTimes(1); // encoded exactly once, after the pass
    expect(clip.poster.size).toBeGreaterThan(0);

    expect(webm.finalized).toBe(1);
    expect(webm.closed).toBe(1); // stream end BEFORE finalize — MP4 finalization waits on it
    expect(clip.type).toBe('video/mp4'); // everything encodable → the shareable MP4 wins
    expect(mux.video).toEqual(['av1']);
    expect(clip.blob.size).toBeGreaterThan(0);
    // A real pass, not one frozen frame — and it opens at 0, in step with the audio track.
    expect(webm.added.length).toBeGreaterThan(3);
    expect(webm.added[0][0]).toBe(0);
    const stamps = webm.added.map(([t]) => t);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  }, 15_000);

  it('muxes the narration buffer deterministically — whole, once, then closed', async () => {
    // The choppy-export bug: the offline-rendered narration used to be REPLAYED through a
    // realtime MediaStream and re-captured while the rasterizer saturated the main thread,
    // dropping samples into the file. The buffer must be handed to the encoder as data.
    const buffer = { duration: 3.2 } as unknown as AudioBuffer;
    const rec = await startStoryRecording({
      el: stage(),
      audioBuffer: buffer,
      aspect: '9:16',
      maxDurationMs: 120,
    });
    await new Promise((r) => setTimeout(r, 200));
    const clip = await rec.stop();

    expect(aud.added).toEqual([buffer]); // the whole buffer, exactly once
    expect(aud.closed).toBe(1); // and the track was closed so finalize can trim cleanly
    expect(mux.video).toEqual(['av1']);
    expect(mux.audio).toEqual(['opus']);
    expect(clip.hasAudio).toBe(true);
  }, 10_000);
});

describe('startStoryRecording — MediaRecorder fallback (no WebCodecs)', () => {
  it('still resolves stop() when the duration cap already stopped the recorder', async () => {
    const rec = await startStoryRecording({
      el: stage(),
      audioBuffer: null,
      aspect: '9:16',
      // So short the paint loop stops the recorder itself, long before the caller asks it to. 'stop'
      // then fires once, before stop() is ever called — the exact shape that used to hang forever.
      maxDurationMs: 40,
    });
    await new Promise((r) => setTimeout(r, 250));

    const clip = await rec.stop();
    expect(clip.type).toContain('webm');
    expect(clip.blob.size).toBeGreaterThan(0);
    expect(clip.durationMs).toBeGreaterThan(0);
  }, 10_000);

  it('cancel() releases the stream without producing a clip', async () => {
    const rec = await startStoryRecording({ el: stage(), audioBuffer: null, aspect: '1:1' });
    await new Promise((r) => setTimeout(r, 60));
    expect(() => rec.cancel()).not.toThrow();
  });
});

describe('quality tiers', () => {
  it('advertises the bounded profile the encoder is actually configured with', () => {
    document.documentElement.dataset.perf = 'full';
    // The picker used to hand-write "60 fps" against a tier the encoder renders at 30.
    for (const q of Object.keys(QUALITY) as ClipQuality[]) {
      const { fps, bitrate } = QUALITY[q];
      expect(qualityHint(q)).toContain(`${fps} fps`);
      expect(qualityHint(q)).toContain(`${Math.round(bitrate / 1e6)} Mbps`);
    }
    expect(qualityHint('high')).toBe('up to 24 fps · 7 Mbps');
    expect(captureProfile('ultra', 'lite')).toEqual({ fps: 12, bitrate: 6_000_000 });
  });
});
