// Renders the on-screen "Mavéa Story" stage to a real video file — WITHOUT screen capture. The
// stage is genuine DOM (real components), so we rasterize that element to a canvas each frame it
// could have changed (modern-screenshot through one persistent context, via an SVG
// <foreignObject> snapshot of the live node; provably-static stretches hold the previous frame
// instead of re-painting it), draw it onto a fixed-aspect output canvas, and feed that canvas +
// the narration audio to mediabunny, which
// encodes the first approved open-media pair the browser offers (MP4 with AV1 + Opus, else WebM —
// see codecs.ts). Where WebCodecs isn't available we use explicit WebM codecs through
// MediaRecorder. The narration is tapped from the shared WebAudio graph (no tab audio), so
// nothing leaves the page and the browser never prompts to "share your screen". Every resource is
// released on stop/cancel.
//
// A pass runs on one of two clocks, and which one it gets is the difference between an export that
// survives a weak machine and one that doesn't:
//
//  • MEDIA clock (deterministic). The caller hands over its timeline as `cues`, and the recorder
//    owns time: frame n is stamped at exactly n/fps, cues land on exact media boundaries, and every
//    CSS animation on the stage is paused and SEEKED to that same media time (see mediaClock.ts).
//    A slow rasterizer then makes the export take longer — it can no longer stretch frame durations
//    into a slideshow — and a fast machine finishes ahead of real time.
//  • WALL clock (the fallback, and what every pass did before). Steps are paced to real time with
//    animations running live. Used when the caller drives its own timeline, when the sink is
//    realtime (MediaRecorder samples the canvas itself and cannot be told when a frame belongs), or
//    when the browser has no getAnimations() to seek through.
//
// Both encoders are ordinary bundled dependencies, loaded lazily via a dynamic import() at export
// time so Vite code-splits them into their own chunk — fetched only when the user actually exports
// a clip, never weighing down the eager bundle.
import type * as Mediabunny from 'mediabunny';
import type * as ModernScreenshot from 'modern-screenshot';
import { currentAppliedTier, type PerfTier } from '../lib/perfTier';
import { bufferToStream } from './reel/audioPlayback';
import { selectOpenEncoding, supportedWebMRecorderMime } from './codecs';
import { realtimeSink, timestampedSink, type FrameSink } from './frameSink';
import { createAnimationRegistry } from './mediaClock';
import { fileBackedTarget, recorderChunkStore } from './storage';
import type { ClipAspect, ClipQuality, ClipResult } from './types';

/** Reel finish choices trade CPU for polish without exceeding the app-wide performance ceiling.
 *  Rasterizing the stage dominates the export's cost and scales linearly with frame rate, so
 *  Balanced paints genuinely fewer frames (15 fps) while High and Ultra keep the full 24 and step
 *  only bitrate (7 → 8 Mbps). Spatial output remains exact 1080p in every case. */
export const QUALITY: Record<ClipQuality, { fps: number; bitrate: number }> = {
  balanced: { fps: 15, bitrate: 6_000_000 },
  high: { fps: 24, bitrate: 7_000_000 },
  ultra: { fps: 24, bitrate: 8_000_000 },
};

export function captureProfile(q: ClipQuality, perf: PerfTier = currentAppliedTier()) {
  const requested = QUALITY[q];
  const cap = perf === 'lite' ? { fps: 12, bitrate: 6_000_000 } : { fps: 24, bitrate: 8_000_000 };
  return {
    fps: Math.min(requested.fps, cap.fps),
    bitrate: Math.min(requested.bitrate, cap.bitrate),
  };
}

/** The hint is derived from the effective machine tier, so the picker never advertises work the
 *  recorder will not perform. */
export function qualityHint(q: ClipQuality): string {
  const { fps, bitrate } = captureProfile(q);
  return `up to ${fps} fps · ${Math.round(bitrate / 1e6)} Mbps`;
}

type MediabunnyRuntime = Pick<
  typeof Mediabunny,
  | 'Output'
  | 'Mp4OutputFormat'
  | 'WebMOutputFormat'
  | 'BufferTarget'
  | 'StreamTarget'
  | 'CanvasSource'
  | 'AudioBufferSource'
  | 'canEncodeVideo'
  | 'canEncodeAudio'
>;

async function loadMediabunny(): Promise<MediabunnyRuntime | null> {
  try {
    // Select only the muxing/WebCodecs surface used below. Returning the full dynamic-import
    // namespace makes every export observable and prevents the bundler from tree-shaking
    // Mediabunny's many demuxers, HLS helpers, and unrelated container writers into the reel chunk.
    const {
      Output,
      Mp4OutputFormat,
      WebMOutputFormat,
      BufferTarget,
      StreamTarget,
      CanvasSource,
      AudioBufferSource,
      canEncodeVideo,
      canEncodeAudio,
    } = await import('mediabunny');
    return {
      Output,
      Mp4OutputFormat,
      WebMOutputFormat,
      BufferTarget,
      StreamTarget,
      CanvasSource,
      AudioBufferSource,
      canEncodeVideo,
      canEncodeAudio,
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

/** Consecutive rasterizer failures after which the pass is declared dead. Without this, a machine
 *  where domToCanvas fails every frame ships a background-coloured video with perfect audio and
 *  reports success. */
const RASTER_FAIL_LIMIT = 12;

/** How long the stage must go without a DOM change before a frame may be held. Generously covers
 *  the gap between a mutation landing and the CSS animation it triggers appearing in
 *  getAnimations(). Wall-clock passes only — a media-clock pass knows exactly what is animating. */
const STILL_AFTER_MS = 400;

/** How often the caller's monitor gets a copy of the frame being encoded. Twice a second is enough
 *  to show an export is alive; anything faster is a second full-size blit per frame for a preview
 *  nobody is scrubbing. */
const MONITOR_INTERVAL_MS = 500;

/** Watches the stage for every reason the next frame could differ from the last: DOM mutations
 *  (scene applies, caption typing, ink attribute walks), running CSS animations/transitions
 *  (reveals, the spotlight glide — and the face's bob, so an included Presence keeps every frame
 *  live while the perf-lite stilled face allows holds), plus media loads and scrolls, which
 *  repaint without mutating anything. What it cannot see — a <canvas> or <video> painting
 *  internally — disables holding outright: when in doubt, rasterize. */
function watchStageStillness(
  el: HTMLElement,
  /** The per-frame layer, when the pass has one. Changes inside it are counted separately: they
   *  dirty that layer alone, so a live `--voice-energy` write on the face can't force a full-stage
   *  re-render 24 times a second — which is the entire saving the layer exists for. */
  layer: Element | null,
): {
  still: () => boolean;
  /** Monotonic counts of everything above; a media-clock pass compares them against the counts at
   *  the last painted frame rather than against a settle window. */
  changes: () => number;
  layerChanges: () => number;
  hasLiveMedia: () => boolean;
  dispose: () => void;
} {
  let dirtyAt = performance.now();
  let changes = 0;
  let layerChanges = 0;
  const markDirty = (): void => {
    dirtyAt = performance.now();
    changes++;
  };
  const observer = new MutationObserver((records) => {
    dirtyAt = performance.now();
    for (const record of records) {
      if (layer && (record.target === layer || layer.contains(record.target))) layerChanges++;
      else changes++;
    }
  });
  observer.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  // 'load' and 'scroll' don't bubble; capturing reaches subtree targets.
  el.addEventListener('load', markDirty, true);
  el.addEventListener('scroll', markDirty, true);
  return {
    still() {
      if (performance.now() - dirtyAt < STILL_AFTER_MS) return false;
      if (typeof el.getAnimations !== 'function') return false;
      if (el.querySelector('canvas, video')) return false;
      return el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running');
    },
    changes: () => changes,
    layerChanges: () => layerChanges,
    hasLiveMedia: () => !!el.querySelector('canvas, video'),
    dispose() {
      observer.disconnect();
      el.removeEventListener('load', markDirty, true);
      el.removeEventListener('scroll', markDirty, true);
    },
  };
}

/**
 * True when the browser can render a clip at all. The offscreen path needs only a canvas plus an
 * encoder (WebCodecs or MediaRecorder) — no screen-capture permission — so support is near-universal.
 */
export function captureSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canRecord = supportedWebMRecorderMime() !== null;
  const canEncode =
    typeof VideoEncoder !== 'undefined' && typeof globalThis.AudioEncoder !== 'undefined';
  return canRecord || canEncode;
}

export interface StoryRecorder {
  /** Resolves when the pass has covered the whole clip; rejects if the gate aborted it or the
   *  rasterizer died. A caller driving its own timeline can ignore it. */
  done(): Promise<void>;
  /** Stop and resolve the finished clip. */
  stop(): Promise<ClipResult>;
  /** Abort without producing a clip; releases everything. */
  cancel(): void;
}

/** One DOM change the recorder itself performs, at an exact point on the media clock. */
export interface CaptureCue {
  /** Media time (ms from the start of the clip) at which this change belongs on screen. */
  atMs: number;
  /** Mutate the stage. Awaited — and the frame at `atMs` is rasterized only once it resolves. */
  apply: () => Promise<void>;
}

export interface StartOpts {
  /** The stage frame to rasterize, read fresh each frame as it animates. */
  el: HTMLElement;
  /** The narration, fully rendered offline into one clean buffer (null = silent clip). Muxed
   *  DETERMINISTICALLY on the WebCodecs path — never replayed through a realtime stream, which used to
   *  drop samples whenever the rasterizer saturated the main thread (the choppy exported audio
   *  on slower machines). */
  audioBuffer: AudioBuffer | null;
  aspect: ClipAspect;
  /** Exact output pixel size, overriding the aspect's default 1080p-class dimensions. */
  dims?: { w: number; h: number };
  /** Quality tier (fps + bitrate). Defaults to 'high'. `fps` overrides the tier's frame rate. */
  quality?: ClipQuality;
  fps?: number;
  /** Encoder bitrate override — callers rendering smaller rasters scale the tier's figure down. */
  bitrate?: number;
  /** Fill behind every frame and the rasterizer's backdrop. Defaults to the Reel's cinematic
   *  dark; a theme-following stage passes its own computed background so letterboxing and
   *  unpainted regions match the surface instead of flashing black in light mode. */
  background?: string;
  /** Hard cap on the recording's length (ms) — the known narration duration. The capture stops
   *  here even if the timeline runs slow, so the muxed video can't outlast its audio. */
  maxDurationMs?: number;
  /** The caller's timeline, handed over. Supplying it (with a finite `maxDurationMs`) is what puts
   *  the pass on the media clock: cues are applied at exact media boundaries rather than raced
   *  against `performance.now()`. Without it the caller is still driving its own scene changes on
   *  wall clock, so the recorder must stay on wall clock too. */
  cues?: readonly CaptureCue[];
  /** Awaited before every step. Throw to end the pass (cancellation, or a hidden window that
   *  cannot paint) — the rejection surfaces through done(). */
  gate?: () => Promise<void>;
  /** A small, permanently-moving overlay inside the stage (the face). On a media-clock pass that
   *  subtree is rasterized as its OWN layer each frame and composited over a cached base, which is
   *  the difference between re-rendering 2 megapixels 24 times a second and re-rendering about a
   *  hundredth of that. Painter's order, no blend modes — the composite is pixel-identical. */
  liveLayer?: {
    selector: string;
    /** How far the layer's paint reaches beyond its own box (a blur halo, a drop-shadow), in the
     *  stage's CSS pixels. A node is rasterized to its BOX, so without this the glow is sliced off
     *  at the edge and a soft face gets a hard rectangular border. */
    bleed: number;
  };
  /** Handed the output canvas a couple of times a second, so a caller can show what is being
   *  encoded without keeping a second live copy of the stage rendered beside it. */
  onFrame?: (frame: HTMLCanvasElement) => void;
}

/**
 * Begin rendering the stage offscreen. Returns a controller; call stop() when the story finishes.
 * Throws if the DOM rasterizer can't be loaded (offline / CSP) — the caller surfaces that to the user.
 */
export async function startStoryRecording(opts: StartOpts): Promise<StoryRecorder> {
  const tier = captureProfile(opts.quality ?? 'high');
  const fps = opts.fps ?? tier.fps;
  const bitrate = opts.bitrate ?? tier.bitrate;
  const background = opts.background ?? '#05070c';
  const { w, h } = opts.dims ?? DIMS[opts.aspect];
  const capMs = opts.maxDurationMs ?? Infinity;
  const capS = capMs / 1000;

  const screenshot = await loadScreenshot();
  if (!screenshot) throw new Error('rasterizer-unavailable');

  const MB =
    typeof VideoEncoder !== 'undefined' && typeof globalThis.AudioEncoder !== 'undefined'
      ? await loadMediabunny()
      : null;
  const encoding = MB
    ? await selectOpenEncoding(MB, {
        width: w,
        height: h,
        videoBitrate: bitrate,
        audio: opts.audioBuffer,
      })
    : null;

  // The media clock needs all four: a timeline to own, a known length to render, timestamped frames
  // to stamp, and a Web Animations API to seek through. Missing any one of them, the pass runs
  // exactly as it always has — never worse than before, just with the persistent context.
  const timestamped = !!(encoding && MB);
  const onMediaClock =
    !!opts.cues &&
    Number.isFinite(capMs) &&
    timestamped &&
    typeof opts.el.getAnimations === 'function';

  // Snapshot at a scale that lands near the output width — crisp text without paying for needless
  // supersampling on a big screen. The stage's aspect already matches the output, so we cover-fit.
  const elW = opts.el.clientWidth || w;
  const snapScale = Math.min(3, Math.max(1, w / elW));
  // The per-frame layer, when there is one to split off.
  const layerEl =
    onMediaClock && opts.liveLayer ? opts.el.querySelector(opts.liveLayer.selector) : null;
  const padEl = layerEl instanceof HTMLElement ? layerEl : null;
  const bleed = padEl ? (opts.liveLayer?.bleed ?? 0) : 0;
  // The layer's raster is its box grown by the bleed on every side. modern-screenshot drops the
  // clone root's position and margins and forces border-box sizing, so an explicit width/height
  // plus a padding of the same bleed reproduces the element at its true size, inset by the bleed —
  // the glow gets room to spread instead of being clipped, and the face does not move a pixel.
  const padRect = padEl?.getBoundingClientRect();
  const padSize = padRect
    ? { w: Math.ceil(padRect.width + bleed * 2), h: Math.ceil(padRect.height + bleed * 2) }
    : null;
  // The layered pass's cached still: everything except the face, kept so a frame where only the
  // face moved costs one small raster plus two small blits instead of a full-stage re-render.
  const baseCanvas = padEl ? document.createElement('canvas') : null;
  if (baseCanvas) {
    baseCanvas.width = w;
    baseCanvas.height = h;
  }
  const baseCtx = baseCanvas?.getContext('2d', { alpha: false }) ?? null;
  // Decided ONCE, before either context is built: excluding the face from the base without then
  // compositing it back would ship a video with no face in it at all.
  const wantsLayers = !!(padEl && padSize && baseCtx);

  // One persistent rasterizer context per layer for the whole pass. Handing domToCanvas an options
  // object makes modern-screenshot build AND tear down its sandbox iframe — and re-resolve the
  // default style map — on every single frame; createContext pays that setup once, and repeated
  // captures through it stay correct (each call re-reads the live DOM). Destroyed on stop and
  // cancel alike.
  let baseContext: ModernScreenshot.Context<HTMLElement>;
  let padContext: ModernScreenshot.Context<HTMLElement> | null = null;
  try {
    baseContext = await screenshot.createContext(opts.el, {
      scale: snapScale,
      backgroundColor: background,
      // The face is composited on top from its own layer, so it must not also be baked into the
      // base — a stale pose showing through the new one's transparent pixels is a double exposure.
      filter: wantsLayers ? (node) => node !== padEl : undefined,
    });
    if (wantsLayers && padEl && padSize) {
      padContext = await screenshot.createContext(padEl, {
        scale: snapScale,
        // Transparent: the layer is composited over the base, not pasted onto it.
        backgroundColor: null,
        width: padSize.w,
        height: padSize.h,
        style: { padding: `${bleed}px` },
      });
    }
  } catch {
    throw new Error('rasterizer-unavailable');
  }
  // Everything the two-layer composite needs, resolved once: either the whole kit is here or the
  // pass paints single-layer, so there is no path where the base is missing its face.
  const layers =
    padEl && padContext && baseCanvas && baseCtx
      ? { el: padEl, context: padContext, canvas: baseCanvas, ctx: baseCtx }
      : null;
  // Track rasterizer health: a steady stream of failures (CSP/cross-origin) means a blank export,
  // which we surface as an error rather than silently shipping black.
  let painted = 0;
  let failStreak = 0;
  let fatal: Error | null = null;
  const recordFailure = (): void => {
    failStreak++;
    if (failStreak >= RASTER_FAIL_LIMIT && !fatal) fatal = new Error('rasterizer-failed');
  };
  const stillness = watchStageStillness(opts.el, layers?.el ?? null);
  const releaseRaster = (): void => {
    stillness.dispose();
    screenshot.destroyContext(baseContext);
    if (padContext) screenshot.destroyContext(padContext);
  };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = background;
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

  /** Rasterize one layer. Failures (a transient layout / cross-origin tile) return null and are
   *  counted; the caller leaves the previous frame up rather than flashing a hole. */
  const rasterize = async (
    context: ModernScreenshot.Context<HTMLElement>,
  ): Promise<HTMLCanvasElement | null> => {
    let snap: HTMLCanvasElement;
    try {
      snap = await screenshot.domToCanvas(context);
    } catch {
      recordFailure();
      return null;
    }
    if (!snap.width || !snap.height) {
      recordFailure();
      return null;
    }
    failStreak = 0;
    return snap;
  };

  let lastMonitorAt = 0;
  const committed = (): void => {
    painted++;
    if (!opts.onFrame) return;
    const now = performance.now();
    if (now - lastMonitorAt < MONITOR_INTERVAL_MS) return;
    lastMonitorAt = now;
    opts.onFrame(canvas);
  };

  // How the stage's pixels map onto the output canvas: cover-fit and centred, so a stage whose
  // aspect drifts from the file's is cropped rather than letterboxed with stretched content. The
  // mapping is kept because the face layer has to land on the same grid as the base it sits on.
  let cover = { scale: 1, offsetX: 0, offsetY: 0 };
  const coverInto = (target: CanvasRenderingContext2D, snap: HTMLCanvasElement): void => {
    const scale = Math.max(w / snap.width, h / snap.height);
    const dw = snap.width * scale;
    const dh = snap.height * scale;
    cover = { scale, offsetX: (w - dw) / 2, offsetY: (h - dh) / 2 };
    target.fillStyle = background;
    target.fillRect(0, 0, w, h);
    target.drawImage(snap, cover.offsetX, cover.offsetY, dw, dh);
  };

  /** Rasterize the whole live node onto the output canvas — the single-layer pass. */
  const paintWhole = async (): Promise<boolean> => {
    const snap = await rasterize(baseContext);
    if (!snap) return false;
    coverInto(ctx, snap);
    committed();
    return true;
  };

  // Where the layer's bled box sits inside the stage, in the stage's own CSS pixels. Its SIZE is
  // fixed at the size the layer's context was built with — the composite has to land on the raster
  // it actually gets — while the position is re-read after every cue and never per frame: a
  // getBoundingClientRect between two rasters is a forced layout the frame budget doesn't need.
  let padBox = { x: 0, y: 0, w: padSize?.w ?? 0, h: padSize?.h ?? 0 };
  const measurePad = (): void => {
    if (!layers) return;
    const host = opts.el.getBoundingClientRect();
    const box = layers.el.getBoundingClientRect();
    padBox = {
      ...padBox,
      x: box.left - host.left - bleed,
      y: box.top - host.top - bleed,
    };
  };
  measurePad();

  /**
   * Two layers, painter's order (no blend modes are involved, so the composite is pixel-identical
   * to rasterizing the stage whole). The base is re-rasterized only when something outside the face
   * actually changed at this media time; otherwise the face's old pixels are wiped by blitting that
   * one small rectangle back from the cached base, and the fresh face is drawn over it.
   */
  const paintLayered = async (needBase: boolean, needFace: boolean): Promise<boolean> => {
    if (!layers) return paintWhole();
    const base = needBase ? await rasterize(baseContext) : null;
    if (needBase && !base) return false;
    const face = needFace ? await rasterize(layers.context) : null;
    if (needFace && !face) return false;
    // Nothing is drawn until BOTH layers are in hand: a half-committed frame is the stage with a
    // hole where the face belongs.
    if (base) coverInto(layers.ctx, base);
    const out = cover.scale * snapScale;
    const dx = Math.round(cover.offsetX + padBox.x * out);
    const dy = Math.round(cover.offsetY + padBox.y * out);
    const dw = Math.round(padBox.w * out);
    const dh = Math.round(padBox.h * out);
    if (base) ctx.drawImage(layers.canvas, 0, 0);
    else ctx.drawImage(layers.canvas, dx, dy, dw, dh, dx, dy, dw, dh);
    if (face) ctx.drawImage(face, dx, dy, dw, dh);
    committed();
    return true;
  };

  // ---- the pass: one loop shape, two clocks ----

  /** Media time (ms) the pass has covered so far — the clip's real length, which on the media clock
   *  has nothing to do with how long the export took. */
  let coveredMs = 0;
  /** When the wall-clock pacer started, if that is the regime: there, the two are the same number
   *  and the answer has to include the moment between the last frame and stop(). */
  let wallStart: number | null = null;
  const coveredNowMs = (): number =>
    wallStart === null ? coveredMs : performance.now() - wallStart;
  let running = true;
  let cueIndex = 0;
  const cues = opts.cues ?? [];
  const applyDueCues = async (tMs: number): Promise<boolean> => {
    let applied = false;
    while (cueIndex < cues.length && cues[cueIndex].atMs <= tMs) {
      await cues[cueIndex].apply();
      cueIndex++;
      applied = true;
    }
    return applied;
  };

  /**
   * The deterministic stepper. Frame n belongs at n/fps and is stamped there no matter how long it
   * took to draw, so a rasterizer that can't keep up costs the user TIME, never frames — the old
   * wall-clock stamping quietly turned a slow machine's export into a slideshow with correct audio.
   */
  const stepMediaClock = async (sink: FrameSink): Promise<void> => {
    const registry = createAnimationRegistry(opts.el);
    // Change counts at the last registry re-scan and at the last painted frame, base and layer kept
    // apart so each is re-rasterized only for what actually touched it.
    let seenChanges = -1;
    let paintedChanges = -1;
    let paintedLayerChanges = -1;
    let baseWasLive = false;
    let faceWasLive = false;
    try {
      for (let n = 0; running && sink.accepting() && !fatal; n++) {
        const t = n / fps;
        if (t >= capS) break;
        const tMs = t * 1000;
        if (opts.gate) await opts.gate();
        if (!running) break;
        const cued = await applyDueCues(tMs);
        if (cued) measurePad();
        // Anything that mutated the DOM — a cue, or a stage timer such as the ink re-measure —
        // may have created animations that are still on the browser's clock. Adopt them at the
        // media time they appeared, which is also their baseline: they start from zero here.
        if (cued || stillness.changes() + stillness.layerChanges() !== seenChanges) {
          registry.refresh(tMs);
          seenChanges = stillness.changes() + stillness.layerChanges();
        }
        registry.seek(tMs);

        // Read the change counts BEFORE rasterizing: a mutation that lands mid-raster may or may
        // not have made it into the clone, so the next frame has to assume it didn't.
        const mark = stillness.changes();
        const layerMark = stillness.layerChanges();
        const changed = mark !== paintedChanges;
        const layerChanged = layerMark !== paintedLayerChanges;
        const baseLive = registry.activeOutside(layers?.el ?? null);
        const faceLive = layers ? registry.activeInside(layers.el) : false;
        // A <canvas> or <video> paints on its own schedule; nothing here can prove it didn't.
        const opaque = stillness.hasLiveMedia();
        // The frame after an animation's last is a new pose too, hence the `WasLive` terms.
        const needBase = n === 0 || changed || baseLive || baseWasLive || opaque;
        // A repainted base arrives with a face-shaped hole in it (the face is filtered out of that
        // layer), so it always drags the face layer along with it.
        const needFace = !!layers && (needBase || layerChanged || faceLive || faceWasLive);
        baseWasLive = baseLive;
        faceWasLive = faceLive;

        if (needBase || needFace) {
          // End the held frame at exactly this boundary BEFORE repainting — the muxer reads the
          // canvas here, so a held stretch lands as one sample with a long duration.
          await sink.end(t);
          const drew = layers ? await paintLayered(needBase, needFace) : await paintWhole();
          if (!running || !sink.accepting() || fatal) break;
          if (drew) {
            paintedChanges = mark;
            paintedLayerChanges = layerMark;
          }
          sink.begin(t);
        }
        coveredMs = Math.min((n + 1) / fps, capS) * 1000;
        // Bank the poster from an early CONTENT frame rather than the blank opening beat.
        if (!posterTaken && t > 1.2 && painted > 2 && failStreak === 0) bankPoster();
        // Yield a macrotask between frames: React commits, timers and the muxer's own work all
        // need the main thread back, and a tight await-only loop can starve them.
        await new Promise((res) => setTimeout(res, 0));
      }
    } finally {
      registry.release();
    }
  };

  /**
   * The wall-clock pacer — what every pass did before the media clock, and what a realtime sink or
   * a browser without getAnimations still gets. Frames are stamped at their real elapsed time and
   * the stage animates on the browser's own clock; a macrotask is always yielded between frames so
   * a caller-driven setTimeout timeline keeps advancing instead of being starved by the rasterizer.
   */
  const stepWallClock = async (sink: FrameSink): Promise<void> => {
    const t0 = performance.now();
    wallStart = t0;
    let firstFrame = true;
    while (running && sink.accepting() && !fatal) {
      const frameStart = performance.now();
      if (opts.gate) await opts.gate();
      if (!running) break;
      await applyDueCues(performance.now() - t0);
      if (firstFrame || !stillness.still()) {
        await sink.end((performance.now() - t0) / 1000);
        await paintWhole();
        if (!running || !sink.accepting() || fatal) break;
        // The audio track opens at zero, but the first rasterization takes a moment to land —
        // stamp it at zero anyway, or the clip opens on however long that took with no picture
        // at all. (On a paint failure the canvas still holds the previous frame; re-stamping it
        // keeps that frame up rather than flashing black.)
        sink.begin(firstFrame ? 0 : (performance.now() - t0) / 1000);
        firstFrame = false;
      }
      const elapsed = performance.now() - t0;
      coveredMs = elapsed;
      if (elapsed >= capMs) break;
      // Bank the poster from the first successfully-painted frame of the early content beats
      // (≈1.2s in), so it's a real content frame rather than the blank/partway-rendered opening.
      if (!posterTaken && elapsed > 1200 && painted > 2 && failStreak === 0) bankPoster();
      const spent = performance.now() - frameStart;
      await new Promise((res) => setTimeout(res, Math.max(0, 1000 / fps - spent)));
    }
  };

  const runPass = (sink: FrameSink): Promise<void> =>
    onMediaClock && !sink.realtime ? stepMediaClock(sink) : stepWallClock(sink);

  // ---- Muxed path (mediabunny / WebCodecs): MP4 with AV1 + Opus, or WebM ----
  if (encoding && MB) {
    const fileTarget = await fileBackedTarget(MB.StreamTarget, encoding.container);
    const bufferTarget = fileTarget ? null : new MB.BufferTarget();
    const output = new MB.Output({
      format: encoding.container === 'mp4' ? new MB.Mp4OutputFormat() : new MB.WebMOutputFormat(),
      target: fileTarget?.target ?? bufferTarget!,
    });
    const videoSource = new MB.CanvasSource(canvas, {
      codec: encoding.video,
      bitrate,
    });
    output.addVideoTrack(videoSource);
    // The narration buffer is muxed deterministically, decoupled from wall-clock and from the
    // rasterization loop — the same guarantee the video path gets from timestamped add() calls.
    // (The realtime MediaStream capture it replaces pulled samples on the main thread while
    // domToCanvas saturated it, and every dropped pull baked a gap into the exported track.)
    let feedAudio: (() => Promise<void>) | null = null;
    if (opts.audioBuffer) {
      const audioSource = new MB.AudioBufferSource({ codec: encoding.audio, bitrate: 192e3 });
      output.addAudioTrack(audioSource);
      const buffer = opts.audioBuffer;
      feedAudio = async () => {
        try {
          await audioSource.add(buffer);
          audioSource.close();
        } catch {
          /* output cancelled before the track finished — nothing to release */
        }
      };
    }
    await output.start();
    void feedAudio?.();

    const sink = timestampedSink(videoSource, { fps, capS });
    const pass = runPass(sink);
    // A pass the caller never waits on (the reel drives its own timeline) must not raise an
    // unhandled rejection; done() still hands the real outcome to callers that do wait.
    pass.catch(() => {});

    const teardown = (): void => {
      running = false;
      releaseRaster();
      canvas.width = canvas.height = 0;
      posterCanvas.width = posterCanvas.height = 0;
      if (layers) layers.canvas.width = layers.canvas.height = 0;
    };

    return {
      done: () => pass,
      async stop() {
        running = false;
        // A pass whose rasterizer died — or that never painted at all — must fail loudly: the
        // muxer would happily finalize a background-coloured video over a perfect narration track.
        if (fatal || painted === 0) {
          output.cancel?.();
          void fileTarget?.discard();
          teardown();
          throw fatal ?? new Error('rasterizer-failed');
        }
        await sink.end(coveredNowMs() / 1000);
        const poster = await encodePoster();
        // Signal stream end before finalizing: MP4 finalization waits for closed sources to
        // write its sample tables (WebM merely tolerated the omission).
        sink.finish();
        await output.finalize();
        const stored = fileTarget ? await fileTarget.finish() : null;
        teardown();
        const blob =
          stored?.blob ??
          new Blob([bufferTarget?.buffer ?? new ArrayBuffer(0)], { type: encoding.mimeType });
        return {
          blob,
          type: encoding.mimeType,
          poster,
          hasAudio: !!opts.audioBuffer,
          // The clip's own length, not the export's: on the media clock they are different numbers.
          durationMs: Math.round(coveredNowMs()),
          dispose: stored?.dispose,
        };
      },
      cancel() {
        running = false;
        output.cancel?.();
        void fileTarget?.discard();
        teardown();
      },
    };
  }

  // ---- Fallback path (MediaRecorder → WebM) ----
  // captureStream samples the output canvas at `fps`; we just keep painting the latest snapshot.
  // MediaRecorder can only mux a LIVE stream, so this path alone still replays the narration
  // buffer in realtime (and keeps that fragility on a saturated main thread) — it only runs
  // where WebCodecs is unavailable at all.
  const outStream = canvas.captureStream(fps);
  const combined = new MediaStream(outStream.getVideoTracks());
  const rtAudio = opts.audioBuffer ? bufferToStream(opts.audioBuffer) : null;
  const audioTrack = rtAudio?.stream.getAudioTracks()[0] ?? null;
  if (audioTrack) combined.addTrack(audioTrack);
  const mime = supportedWebMRecorderMime();
  if (!mime) {
    releaseRaster();
    canvas.width = canvas.height = 0;
    posterCanvas.width = posterCanvas.height = 0;
    throw new Error('open-codec-unavailable');
  }
  const rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunkStore = await recorderChunkStore();
  rec.ondataavailable = (e) => chunkStore.write(e.data);
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
  rec.start(1000);
  // Start the realtime replay only once the recorder is consuming the track, so the muxed
  // narration opens at the top of the clip rather than mid-word.
  rtAudio?.start();

  const pass = runPass(realtimeSink()).finally(() => {
    // The cap and a dead rasterizer both have to stop the recorder itself — nothing else will.
    if (fatal || coveredMs >= capMs) requestStop();
  });
  pass.catch(() => {});

  const teardown = (): void => {
    running = false;
    releaseRaster();
    for (const t of combined.getTracks()) t.stop();
    rtAudio?.stop();
    canvas.width = canvas.height = 0;
    posterCanvas.width = posterCanvas.height = 0;
    if (layers) layers.canvas.width = layers.canvas.height = 0;
  };

  return {
    done: () => pass,
    async stop() {
      running = false;
      // Same loud failure as the muxed path: never hand back a video no frame was painted into.
      if (fatal || painted === 0) {
        requestStop();
        void chunkStore.discard();
        teardown();
        throw fatal ?? new Error('rasterizer-failed');
      }
      // Encode the still BEFORE teardown zeroes the canvases; the recorder may already have stopped
      // itself at the duration cap, in which case `stopped` is already settled and this just falls through.
      const poster = await encodePoster();
      requestStop();
      await stopped;
      try {
        const stored = await chunkStore.finish();
        const durationMs = Math.round(coveredNowMs());
        teardown();
        return {
          blob: stored.blob,
          type: mime,
          poster,
          hasAudio: !!audioTrack,
          durationMs,
          dispose: stored.dispose,
        };
      } catch (error) {
        await chunkStore.discard();
        teardown();
        throw error;
      }
    },
    cancel() {
      running = false;
      requestStop();
      void chunkStore.discard();
      teardown();
    },
  };
}
