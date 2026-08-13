import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipFileName, downloadClip, shareClip, videoFileBase } from '../src/clip/share';

describe('clip download', () => {
  it('names the file by the clip container — .mp4 for approved MP4, .webm otherwise', () => {
    expect(clipFileName('mavea-replay', 'video/mp4')).toBe('mavea-replay.mp4');
    expect(clipFileName('mavea-replay', 'video/webm')).toBe('mavea-replay.webm');
  });

  describe('video file base', () => {
    const day = new Date(2026, 7, 8);

    it('names the file after the conversation and the day it was made', () => {
      expect(videoFileBase('Three Days in Lisbon', day)).toBe(
        'mavea-three-days-in-lisbon-2026-08-08',
      );
    });

    it('folds accents rather than dropping the letters under them', () => {
      expect(videoFileBase('Três Dias', day)).toBe('mavea-tres-dias-2026-08-08');
    });

    it('falls back to a generic name when the turn has no usable title', () => {
      expect(videoFileBase(undefined, day)).toBe('mavea-conversation-2026-08-08');
      expect(videoFileBase('—  ///  —', day)).toBe('mavea-conversation-2026-08-08');
    });

    it('bounds a long title and never leaves a trailing separator', () => {
      const base = videoFileBase('word '.repeat(40), day);
      expect(base.startsWith('mavea-word-word')).toBe(true);
      expect(base.endsWith('-2026-08-08')).toBe(true);
      expect(base).not.toContain('--');
      // Title slug is capped, so the name stays comfortably inside every filesystem's limit.
      expect(base.length).toBeLessThanOrEqual(70);
    });

    it('keeps model-authored titles from escaping into path or shell characters', () => {
      expect(videoFileBase('../../etc/passwd', day)).toBe('mavea-etc-passwd-2026-08-08');
      expect(videoFileBase('A "quoted" <title>', day)).toBe('mavea-a-quoted-title-2026-08-08');
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the object URL alive while the browser takes ownership of the download', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:mavea-video');
    const revokeObjectURL = vi.fn();
    const dispose = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadClip(new Blob(['video'], { type: 'video/webm' }), 'conversation.webm', dispose);

    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(59_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mavea-video');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('reports a dismissed native share as cancelled without consuming the clip', async () => {
    const dispose = vi.fn(async () => {});
    const share = vi.fn(async () => {
      throw new DOMException('The user dismissed the share sheet', 'AbortError');
    });
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        canShare: vi.fn(() => true),
        share,
      }),
    );

    const how = await shareClip({
      blob: new Blob(['video'], { type: 'video/webm' }),
      type: 'video/webm',
      poster: new Blob(),
      hasAudio: true,
      durationMs: 1_000,
      dispose,
    });

    expect(how).toBe('cancelled');
    expect(share).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
  });
});
