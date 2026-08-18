import { currentAppliedTier, type PerfTier } from '../../lib/perfTier';
import { captureProfile, startStoryRecording } from '../capture';
import { supportedWebMRecorderMime } from '../codecs';
import type { ClipQuality } from '../types';
import type {
  ConversationExportProgress,
  ConversationExportResult,
  ConversationScene,
  ConversationVideoSize,
} from './types';

export const CONVERSATION_DIMENSIONS: Record<
  ConversationVideoSize,
  { width: number; height: number }
> = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
};

/** Encoder bitrate for a conversation cut: the reel quality tiers, scaled to the smaller raster. */
export function conversationBitrate(
  quality: ClipQuality,
  size: ConversationVideoSize,
  perf: PerfTier = currentAppliedTier(),
): number {
  const { bitrate } = captureProfile(quality, perf);
  return size === '720p' ? Math.round(bitrate * 0.55) : bitrate;
}

async function waitUntilVisible(signal: AbortSignal): Promise<void> {
  if (document.visibilityState !== 'hidden') return;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') finish();
    };
    const finish = (error?: Error) => {
      document.removeEventListener('visibilitychange', onVisible);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    document.addEventListener('visibilitychange', onVisible);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function conversationCaptureSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    ((typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') ||
      supportedWebMRecorderMime() !== null)
  );
}

/** The face gets its own raster layer: it is the one thing on the stage that moves in every single
 *  frame, and it occupies about a hundredth of the picture. Everything else is cached between
 *  changes. The bleed covers what the bell paints OUTSIDE that box, and it is sized from the worst
 *  case rather than the typical one, because the failure mode is a square edge cut through the
 *  glow of the product's signature element: at capture width the box clamps to 150×170
 *  (video-studio.css), the aura sits at inset -24% (≈41px on the taller axis), CSS `blur(12px)` is
 *  a Gaussian with σ=12 and so carries visible energy to ~3σ = 36px, and the bell adds an 8px
 *  drop-shadow — ~85px, with the rest headroom. The layer is still ~340×360 against 1920×1080,
 *  which is where the ~19× saving comes from; buying certainty here costs almost nothing. */
const PRESENCE_LAYER = { selector: '.cvs-presence', bleed: 96 };

export interface ExportConversationOptions {
  el: HTMLElement;
  scenes: readonly ConversationScene[];
  /** Null on an audio-off export: the timeline's estimated durations become the clock. */
  audioBuffer: AudioBuffer | null;
  durationMs: number;
  size: ConversationVideoSize;
  quality: ClipQuality;
  signal: AbortSignal;
  applyScene: (scene: ConversationScene, index: number) => Promise<void>;
  onProgress?: (progress: ConversationExportProgress) => void;
  /** Handed the frame being encoded a couple of times a second, so the sheet can show the render
   *  without keeping a second live copy of the 1080p stage mounted beside the capture host. */
  onFrame?: (frame: HTMLCanvasElement) => void;
}

/**
 * Record the LIVING stage — reveals, ink drawing on, captions, the face, the spotlight glide —
 * the way Live performs it. (An earlier encoder emitted one sharp still per scene; it was cheap,
 * but a conversation video has to move the way Live does.)
 *
 * The scene timeline is handed to the recorder rather than raced against `performance.now()` here:
 * that is what lets the pass run on a media clock, where a scene lands at its exact millisecond and
 * a machine too slow to rasterize 24 fps spends longer rendering instead of shipping a slideshow.
 */
export async function exportConversationVideo(
  opts: ExportConversationOptions,
): Promise<ConversationExportResult> {
  const tier = currentAppliedTier();
  const dims = CONVERSATION_DIMENSIONS[opts.size];
  const first = opts.scenes[0];
  if (first) await opts.applyScene(first, 0);
  // The conversation stage follows the app theme — fill letterboxing and unpainted regions with
  // its real background, or a light-mode cut gets the Reel's dark void behind cream cards.
  const styleBackground = getComputedStyle(opts.el).backgroundColor;
  const recorder = await startStoryRecording({
    el: opts.el,
    audioBuffer: opts.audioBuffer,
    aspect: '16:9',
    dims: { w: dims.width, h: dims.height },
    quality: opts.quality,
    bitrate: conversationBitrate(opts.quality, opts.size, tier),
    background:
      styleBackground && styleBackground !== 'rgba(0, 0, 0, 0)' ? styleBackground : undefined,
    maxDurationMs: opts.durationMs,
    liveLayer: PRESENCE_LAYER,
    onFrame: opts.onFrame,
    // The opening beat is already on screen, so the cues are the CHANGES from here on.
    cues: opts.scenes.slice(1).map((scene, offset) => ({
      atMs: scene.startMs,
      apply: async () => {
        const index = offset + 1;
        await opts.applyScene(scene, index);
        opts.onProgress?.({ phase: 'render', completed: index + 1, total: opts.scenes.length });
      },
    })),
    // Checked before every frame. A hidden window cannot paint, so the pass deliberately holds
    // there rather than filling the file with whatever a throttled tab hands back.
    gate: async () => {
      if (opts.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      await waitUntilVisible(opts.signal);
    },
  });
  try {
    await recorder.done();
    opts.onProgress?.({ phase: 'encode', completed: 0, total: 1 });
    const result = await recorder.stop();
    opts.onProgress?.({ phase: 'ready', completed: 1, total: 1 });
    return { ...result, ...dims };
  } catch (error) {
    recorder.cancel();
    throw error;
  }
}
