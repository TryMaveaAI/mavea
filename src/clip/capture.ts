// Renders the on-screen "Mavéa Story" stage to a real MP4 — WITHOUT screen capture. The stage is
// genuine DOM (real components), so we rasterize that element to a canvas each frame (modern-
// screenshot, via an SVG <foreignObject> snapshot of the live node), draw it onto a fixed-aspect
// output canvas, and feed that canvas + the narration audio to mediabunny, which encodes H.264 +
// AAC and muxes an MP4 in memory. Where WebCodecs/H.264 isn't available we fall back to
// MediaRecorder (WebM). The narration is tapped from the shared WebAudio graph (no tab audio), so
// nothing leaves the page and the browser never prompts to "share your screen". Every resource is
// released on stop/cancel.
//
// Both encoders are ordinary bundled dependencies, loaded lazily via a dynamic import() at export
// time so Vite code-splits them into their own chunk — fetched only when the user actually exports
// a clip, never weighing down the eager bundle.
import type * as Mediabunny from 'mediabunny';
import type * as ModernScreenshot from 'modern-screenshot';
import type { ClipAspect, ClipQuality, ClipResult } from './types';

/** Quality tiers → frame rate CEILING + video bitrate (bps). 30 fps keeps the offscreen rasterizer
 *  from saturating the main thread (which would stretch the real-time timeline out of sync with the
 *  narration); Ultra opts into 60 fps + max bitrate for a fast machine. The rate is a ceiling, not a
 *  promise: every frame is a full DOM rasterization, so a slow machine simply lands fewer of them —
 *  each stamped with its real elapsed time, so the clip stays in sync either way. */
export const QUALITY: Record<ClipQuality, { fps: number; bitrate: number }> = {
  balanced: { fps: 30, bitrate: 6_000_000 },
  high: { fps: 30, bitrate: 10_000_000 },
  ultra: { fps: 60, bitrate: 16_000_000 },
};

/** The tier's one-line hint, DERIVED from the table above so the picker can never advertise a frame
 *  rate or bitrate the encoder isn't actually configured with (it claimed 60 fps for a 30 fps tier). */
export function qualityHint(q: ClipQuality): string {
  const { fps, bitrate } = QUALITY[q];
  return `up to ${fps} fps · ${Math.round(bitrate / 1e6)} Mbps`;
}

type MediabunnyRuntime = Pick<
  typeof Mediabunny,
  | 'Output'
  | 'Mp4OutputFormat'
  | 'BufferTarget'
  | 'CanvasSource'
  | 'MediaStreamAudioTrackSource'
  | 'canEncodeVideo'
>;

async function loadMediabunny(): Promise<MediabunnyRuntime | null> {
  try {
    // Select only the MP4/WebCodecs surface used below. Returning the full dynamic-import namespace
    // makes every export observable and prevents the bundler from tree-shaking Mediabunny's many
    // demuxers, HLS helpers, and unrelated container writers into the reel chunk.
    const {
      Output,
      Mp4OutputFormat,
      BufferTarget,
      CanvasSource,
      MediaStreamAudioTrackSource,
      canEncodeVideo,
    } = await import('mediabunny');
    return {
      Output,
      Mp4OutputFormat,
      BufferTarget,
      CanvasSource,
      MediaStreamAudioTrackSource,
      canEncodeVideo,
    };
  } catch {
    return null;
  }
}

async function loadScreenshot(): Promise<typeof ModernScreenshot | null> {
  try {
    return await import('modern-screenshot');
  } catch {
    return null;
  }
}

const DIMS: Record<ClipAspect, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

/**
 * True when the browser can render a clip at all. The offscreen path needs only a canvas plus an
 * encoder (WebCodecs or MediaRecorder) — no screen-capture permission — so support is near-universal.
 */
export function captureSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canRecord = typeof MediaRecorder !== 'undefined';
  const canEncode =
    typeof VideoEncoder !== 'undefined' && typeof globalThis.AudioEncoder !== 'undefined';
  return canRecord || canEncode;
}

export interface StoryRecorder {
  /** Stop and resolve the finished clip. */
  stop(): Promise<ClipResult>;
  /** Abort without producing a clip; releases everything. */
  cancel(): void;
}

export interface StartOpts {
  /** The stage frame to rasterize, read fresh each frame as it animates. */
  el: HTMLElement;
  /** Narration as a MediaStream — the reel renders its whole voiceover to one buffer up front and
   *  plays it into this stream, so the muxed track is complete and in sync (null = silent clip). */
  audioStream: MediaStream | null;
  aspect: ClipAspect;
  /** Quality tier (fps + bitrate). Defaults to 'high'. `fps` overrides the tier's frame rate. */
  quality?: ClipQuality;
  fps?: number;
  /** Hard cap on the recording's wall-clock length (ms) — the known narration duration. The capture
   *  stops here even if the timeline runs slow, so the muxed video can't outlast its audio. */
  maxDurationMs?: number;
}

/**
 * Begin rendering the stage offscreen. Returns a controller; call stop() when the story finishes.
 * Throws if the DOM rasterizer can't be loaded (offline / CSP) — the caller surfaces that to the user.
 */
export async function startStoryRecording(opts: StartOpts): Promise<StoryRecorder> {
  const tier = QUALITY[opts.quality ?? 'high'];
  const fps = opts.fps ?? tier.fps;
  const { w, h } = DIMS[opts.aspect];
  const audioTrack = opts.audioStream?.getAudioTracks()[0] ?? null;

  const screenshot = await loadScreenshot();
  if (!screenshot) throw new Error('rasterizer-unavailable');

  // Snapshot at a scale that lands near the output width — crisp text without paying for needless
  // supersampling on a big screen. The stage's aspect already matches the output, so we cover-fit.
  const elW = opts.el.clientWidth || w;
  const snapScale = Math.min(3, Math.max(1, w / elW));
  // Track rasterizer health: a steady stream of failures (CSP/cross-origin) means a blank export, which
  // we surface rather than silently shipping black.
  let painted = 0;
  let failStreak = 0;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, w, h);

  // The share preview's representative still. Banking the frame is a cheap blit; ENCODING it is not —
  // a full-size PNG encode costs the better part of a second, and the old code awaited one on every
  // frame of the early content window, which froze the exported video for whole seconds exactly where
  // the reel opens (the audio kept running, so the clip opened on a stutter). So: blit one early
  // content frame aside at half size, and encode it once, after the recording pass is over.
  const posterCanvas = document.createElement('canvas');
  posterCanvas.width = Math.round(w / 2);
  posterCanvas.height = Math.round(h / 2);
  const posterCtx = posterCanvas.getContext('2d');
  let posterTaken = false;
  const bankPoster = (): void => {
    if (!posterCtx) return;
    posterCtx.drawImage(canvas, 0, 0, posterCanvas.width, posterCanvas.height);
    posterTaken = true;
  };
  const emptyPoster = (): Blob => new Blob([], { type: 'image/png' });
  /** Encode the banked still — called once the pass has stopped, never from inside the frame loop. */
  const encodePoster = async (): Promise<Blob> => {
    // A clip too short to reach the content window still deserves a poster: use whatever it painted.
    if (!posterTaken && painted > 0) bankPoster();
    if (!posterTaken) return emptyPoster();
    const blob = await new Promise<Blob | null>((res) => posterCanvas.toBlob(res, 'image/png'));
    return blob ?? emptyPoster();
  };

  // Rasterize the live node and paint it onto the output canvas, cover-fit and centred. Failures
  // (a transient layout / cross-origin tile) leave the previous frame up rather than flashing black.
  const paintSnapshot = async (): Promise<void> => {
    let snap: HTMLCanvasElement;
    try {
      snap = await screenshot.domToCanvas(opts.el, {
        scale: snapScale,
        backgroundColor: '#05070c',
      });
    } catch {
      failStreak++;
      return;
    }
    if (!snap.width || !snap.height) {
      failStreak++;
      return;
    }
    failStreak = 0;
    painted++;
    const s = Math.max(w / snap.width, h / snap.height);
    const dw = snap.width * s;
    const dh = snap.height * s;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(snap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };

  const MB =
    typeof VideoEncoder !== 'undefined' && typeof globalThis.AudioEncoder !== 'undefined'
      ? await loadMediabunny()
      : null;
  const useMp4 = !!MB && (await MB.canEncodeVideo('avc').catch(() => false));

  // ---- MP4 path (mediabunny / WebCodecs) ----
  if (useMp4 && MB) {
    const output = new MB.Output({
      format: new MB.Mp4OutputFormat(),
      target: new MB.BufferTarget(),
    });
    const videoSource = new MB.CanvasSource(canvas, { codec: 'avc', bitrate: tier.bitrate });
    output.addVideoTrack(videoSource);
    if (audioTrack) {
      const audioSource = new MB.MediaStreamAudioTrackSource(audioTrack, {
        codec: 'aac',
        bitrate: 192e3,
      });
      audioSource.errorPromise.catch(() => {});
      output.addAudioTrack(audioSource);
    }
    await output.start();

    let running = true;
    let firstFrame = true;
    const t0 = performance.now();
    let lastT = 0;
    const minFrameMs = 1000 / fps;
    const capMs = opts.maxDurationMs ?? Infinity;
    // Snapshot each frame stamped with its real elapsed time so the video tracks the real-time
    // narration. We ALWAYS yield a macrotask between frames (even when the rasterizer is slower than
    // the frame budget) so the reel's setTimeout-driven timeline keeps advancing on schedule instead
    // of being starved — otherwise the visuals would lag the audio. A hard cap stops the pass at the
    // narration's true length so the video can never outlast its audio.
    const loop = async (): Promise<void> => {
      while (running) {
        const frameStart = performance.now();
        await paintSnapshot();
        if (!running) break;
        // The audio track opens at zero, but the first rasterization takes a moment to land — stamp
        // it at zero anyway, or the clip opens on however long that took with no picture at all.
        const t = firstFrame ? 0 : (performance.now() - t0) / 1000;
        firstFrame = false;
        try {
          await videoSource.add(t, Math.max(1 / fps, t - lastT));
        } catch {
          break; // output closed
        }
        lastT = t;
        if (t * 1000 >= capMs) break;
        // Bank the poster from the first successfully-painted frame of the early content beats
        // (≈1.2s in), so it's a real content frame rather than the blank/partway-rendered opening.
        if (!posterTaken && t > 1.2 && painted > 2 && failStreak === 0) bankPoster();
        const spent = performance.now() - frameStart;
        await new Promise((res) => setTimeout(res, Math.max(0, minFrameMs - spent)));
      }
    };
    void loop();

    const teardown = (): void => {
      running = false;
      audioTrack?.stop();
      canvas.width = canvas.height = 0;
      posterCanvas.width = posterCanvas.height = 0;
    };

    return {
      async stop() {
        running = false;
        const poster = await encodePoster();
        await output.finalize();
        const buf = output.target.buffer;
        teardown();
        const blob = new Blob([buf ?? new ArrayBuffer(0)], { type: 'video/mp4' });
        return {
          blob,
          type: 'video/mp4',
          poster,
          hasAudio: !!audioTrack,
          durationMs: Math.round(performance.now() - t0),
        };
      },
      cancel() {
        running = false;
        output.cancel?.();
        teardown();
      },
    };
  }

  // ---- Fallback path (MediaRecorder → WebM) ----
  // captureStream samples the output canvas at `fps`; we just keep painting the latest snapshot.
  const outStream = canvas.captureStream(fps);
  const combined = new MediaStream(outStream.getVideoTracks());
  if (audioTrack) combined.addTrack(audioTrack);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';
  const rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: tier.bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  // Latch the stop event ONCE, up front. The duration cap below can stop the recorder from inside the
  // paint loop, and 'stop' fires exactly once — an `onstop` handler installed later (in stop(), the
  // way this used to work) would then never run, leaving its promise pending forever: the export hung
  // on "Finishing the file…" with the recorder and its tracks still open.
  const stopped = new Promise<void>((resolve) => {
    rec.addEventListener('stop', () => resolve(), { once: true });
  });
  const requestStop = (): void => {
    try {
      if (rec.state !== 'inactive') rec.stop();
    } catch {
      /* already stopped */
    }
  };
  rec.start();

  let running = true;
  const t0 = performance.now();
  const capMs = opts.maxDurationMs ?? Infinity;
  const minFrameMs = 1000 / fps;
  const loop = async (): Promise<void> => {
    while (running) {
      const frameStart = performance.now();
      await paintSnapshot();
      const elapsed = performance.now() - t0;
      if (elapsed >= capMs) {
        requestStop();
        break;
      }
      if (!posterTaken && elapsed > 1200 && painted > 2 && failStreak === 0) bankPoster();
      const spent = performance.now() - frameStart;
      // Always yield a macrotask so the reel's timeline isn't starved by the rasterizer (see MP4 path).
      await new Promise((res) => setTimeout(res, Math.max(0, minFrameMs - spent)));
    }
  };
  void loop();

  const teardown = (): void => {
    running = false;
    for (const t of combined.getTracks()) t.stop();
    audioTrack?.stop();
    canvas.width = canvas.height = 0;
    posterCanvas.width = posterCanvas.height = 0;
  };

  return {
    async stop() {
      running = false;
      // Encode the still BEFORE teardown zeroes the canvases; the recorder may already have stopped
      // itself at the duration cap, in which case `stopped` is already settled and this just falls through.
      const poster = await encodePoster();
      requestStop();
      await stopped;
      const blob = new Blob(chunks, { type: mime });
      const durationMs = Math.round(performance.now() - t0);
      teardown();
      return { blob, type: mime, poster, hasAudio: !!audioTrack, durationMs };
    },
    cancel() {
      running = false;
      requestStop();
      teardown();
    },
  };
}
