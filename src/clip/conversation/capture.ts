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

export interface ExportConversationOptions {
  el: HTMLElement;
  scenes: readonly ConversationScene[];
  audioBuffer: AudioBuffer;
  durationMs: number;
  size: ConversationVideoSize;
  quality: ClipQuality;
  signal: AbortSignal;
  applyScene: (scene: ConversationScene, index: number) => Promise<void>;
  onProgress?: (progress: ConversationExportProgress) => void;
}

/**
 * Record the LIVING stage — reveals, ink drawing on, captions, the face, the spotlight glide —
 * the way Live performs it: scenes are applied on their real timeline while the recorder
 * rasterizes the animating DOM at the tier's frame rate. (An earlier encoder emitted one sharp
 * still per scene; it was cheap, but a conversation video has to move the way Live does.)
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
  });
  const started = performance.now();
  try {
    for (let index = 1; index < opts.scenes.length; index++) {
      const scene = opts.scenes[index];
      while (performance.now() - started < scene.startMs) {
        if (opts.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        await waitUntilVisible(opts.signal);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await opts.applyScene(scene, index);
      opts.onProgress?.({ phase: 'render', completed: index + 1, total: opts.scenes.length });
    }
    while (performance.now() - started < opts.durationMs) {
      if (opts.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      await waitUntilVisible(opts.signal);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    opts.onProgress?.({ phase: 'encode', completed: 0, total: 1 });
    const result = await recorder.stop();
    opts.onProgress?.({ phase: 'ready', completed: 1, total: 1 });
    return { ...result, ...dims };
  } catch (error) {
    recorder.cancel();
    throw error;
  }
}
