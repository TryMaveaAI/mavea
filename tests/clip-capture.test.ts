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
import { QUALITY, qualityHint, startStoryRecording } from '../src/clip/capture';
import type { ClipQuality } from '../src/clip/types';

/** Frames handed to the muxer by the MP4 path: [timestamp, duration], in seconds. */
const mp4 = vi.hoisted(() => ({ added: [] as [number, number][], finalized: 0 }));

vi.mock('modern-screenshot', () => ({
  // A rasterized snapshot is just a source image to the recorder — a bare {width,height} stands in.
  domToCanvas: vi.fn(async () => ({ width: 540, height: 960 }) as unknown as HTMLCanvasElement),
}));

vi.mock('mediabunny', () => {
  class CanvasSource {
    async add(timestamp: number, duration: number): Promise<void> {
      mp4.added.push([timestamp, duration]);
    }
  }
  class Output {
    target = { buffer: new ArrayBuffer(2048) };
    async start(): Promise<void> {}
    addVideoTrack(): void {}
    addAudioTrack(): void {}
    async finalize(): Promise<void> {
      mp4.finalized++;
    }
    cancel(): void {}
  }
  return {
    CanvasSource,
    Output,
    Mp4OutputFormat: class {},
    BufferTarget: class {},
    MediaStreamAudioTrackSource: class {
      errorPromise = Promise.resolve();
    },
    canEncodeVideo: async () => true,
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
  mp4.added = [];
  mp4.finalized = 0;
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
});

describe('startStoryRecording — MP4 path (WebCodecs + mediabunny)', () => {
  beforeEach(() => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('AudioEncoder', class {});
  });

  it('never encodes the poster inside the frame loop, and stamps the first frame at zero', async () => {
    const rec = await startStoryRecording({
      el: stage(),
      audioStream: null,
      aspect: '9:16',
      // Past the ≈1.2s mark where the poster is banked, so a poster encode in the loop would show up.
      maxDurationMs: 1500,
    });
    await new Promise((r) => setTimeout(r, 1400));
    expect(toBlob).not.toHaveBeenCalled(); // the loop banks a cheap blit, it does not encode

    const clip = await rec.stop();
    expect(toBlob).toHaveBeenCalledTimes(1); // encoded exactly once, after the pass
    expect(clip.poster.size).toBeGreaterThan(0);

    expect(mp4.finalized).toBe(1);
    expect(clip.type).toBe('video/mp4');
    expect(clip.blob.size).toBeGreaterThan(0);
    // A real pass, not one frozen frame — and it opens at 0, in step with the audio track.
    expect(mp4.added.length).toBeGreaterThan(3);
    expect(mp4.added[0][0]).toBe(0);
    const stamps = mp4.added.map(([t]) => t);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  }, 15_000);
});

describe('startStoryRecording — MediaRecorder fallback (no WebCodecs)', () => {
  it('still resolves stop() when the duration cap already stopped the recorder', async () => {
    const rec = await startStoryRecording({
      el: stage(),
      audioStream: null,
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
    const rec = await startStoryRecording({ el: stage(), audioStream: null, aspect: '1:1' });
    await new Promise((r) => setTimeout(r, 60));
    expect(() => rec.cancel()).not.toThrow();
  });
});

describe('quality tiers', () => {
  it('advertises the frame rate the encoder is actually configured with', () => {
    // The picker used to hand-write "60 fps" against a tier the encoder renders at 30.
    for (const q of Object.keys(QUALITY) as ClipQuality[]) {
      const { fps, bitrate } = QUALITY[q];
      expect(qualityHint(q)).toContain(`${fps} fps`);
      expect(qualityHint(q)).toContain(`${Math.round(bitrate / 1e6)} Mbps`);
    }
    expect(qualityHint('high')).toBe('up to 30 fps · 10 Mbps');
  });
});
