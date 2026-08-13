// The conversation export must MOVE the way Live does: scenes are applied on their real timeline
// while the story recorder captures the animating stage. These pin the pacing, the recorder
// contract (16:9 dims + quality-scaled bitrate), the progress phases, and cancellation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationScene } from '../src/clip/conversation/types';

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../src/clip/capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/clip/capture')>()),
  startStoryRecording: mocks.record,
}));

import { exportConversationVideo } from '../src/clip/conversation/capture';

const scene = (startMs: number, durationMs: number): ConversationScene =>
  ({ startMs, durationMs, questionOnly: startMs === 0 }) as ConversationScene;

const clip = {
  blob: new Blob(['video'], { type: 'video/mp4' }),
  type: 'video/mp4',
  poster: new Blob(),
  hasAudio: true,
  durationMs: 160,
};

beforeEach(() => {
  document.documentElement.dataset.perf = 'full';
  mocks.stop.mockResolvedValue(clip);
  mocks.record.mockResolvedValue({ stop: mocks.stop, cancel: mocks.cancel });
});

afterEach(() => {
  vi.clearAllMocks();
  delete document.documentElement.dataset.perf;
});

describe('conversation motion capture', () => {
  it('replays every scene, in order, into the story recorder with the sized 16:9 contract', async () => {
    const el = document.createElement('div');
    // The stage follows the app theme — its own background must ride along, or a light-mode
    // export letterboxes the cream surface with the Reel's dark void.
    el.style.backgroundColor = 'rgb(244, 241, 232)';
    const applied: number[] = [];
    const phases: string[] = [];
    const result = await exportConversationVideo({
      el,
      scenes: [scene(0, 40), scene(40, 80)],
      audioBuffer: {} as AudioBuffer,
      durationMs: 160,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async (_next, index) => {
        applied.push(index);
      },
      onProgress: (progress) => phases.push(progress.phase),
    });

    expect(applied).toEqual([0, 1]);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        el,
        aspect: '16:9',
        dims: { w: 1920, h: 1080 },
        quality: 'high',
        bitrate: 7_000_000,
        background: 'rgb(244, 241, 232)',
        maxDurationMs: 160,
      }),
    );
    expect(phases).toEqual(['render', 'encode', 'ready']);
    expect(result).toEqual(
      expect.objectContaining({ width: 1920, height: 1080, type: 'video/mp4' }),
    );
  });

  it('scales the 720p bitrate down instead of spending 1080p bits on a smaller raster', async () => {
    await exportConversationVideo({
      el: document.createElement('div'),
      scenes: [scene(0, 40)],
      audioBuffer: {} as AudioBuffer,
      durationMs: 40,
      size: '720p',
      quality: 'balanced',
      signal: new AbortController().signal,
      applyScene: async () => {},
    });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ dims: { w: 1280, h: 720 }, bitrate: 3_300_000 }),
    );
  });

  it('cancels the recorder and surfaces AbortError when the user aborts mid-render', async () => {
    const controller = new AbortController();
    const exporting = exportConversationVideo({
      el: document.createElement('div'),
      scenes: [scene(0, 40), scene(40, 5_000)],
      audioBuffer: {} as AudioBuffer,
      durationMs: 5_040,
      size: '720p',
      quality: 'balanced',
      signal: controller.signal,
      applyScene: async () => {},
    });
    setTimeout(() => controller.abort(), 60);
    await expect(exporting).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });
});
