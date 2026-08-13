import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  selectOpenEncoding,
  supportedWebMRecorderMime,
  WEBM_RECORDER_MIME_TYPES,
} from '../src/clip/codecs';

afterEach(() => vi.unstubAllGlobals());

describe('approved open-media policy', () => {
  it('permits MP4 only with AV1 and Opus', async () => {
    const probe = {
      canEncodeVideo: vi.fn(async () => true),
      canEncodeAudio: vi.fn(async () => true),
    };
    const encoding = await selectOpenEncoding(probe, {
      width: 1920,
      height: 1080,
      videoBitrate: 8_000_000,
      audio: { numberOfChannels: 1, sampleRate: 24_000 },
    });

    expect(encoding).toEqual({
      container: 'mp4',
      mimeType: 'video/mp4',
      video: 'av1',
      audio: 'opus',
    });
  });

  it('walks the approved-codec ladder in order and lands on WebM VP8 as the floor', async () => {
    const probe = {
      canEncodeVideo: vi.fn(async (codec: string) => codec === 'vp8'),
      canEncodeAudio: vi.fn(async () => true),
    };
    const encoding = await selectOpenEncoding(probe, {
      width: 1920,
      height: 1080,
      videoBitrate: 8_000_000,
      audio: { numberOfChannels: 1, sampleRate: 24_000 },
    });

    expect(encoding).toEqual({
      container: 'webm',
      mimeType: 'video/webm',
      video: 'vp8',
      audio: 'opus',
    });
    expect(probe.canEncodeVideo.mock.calls.map(([codec]) => codec)).toEqual(['av1', 'vp9', 'vp8']);
  });

  it('uses WebM rather than putting VP9 in MP4 when AV1 is unavailable', async () => {
    const probe = {
      canEncodeVideo: vi.fn(async (codec: string) => codec === 'vp9'),
      canEncodeAudio: vi.fn(async () => true),
    };
    await expect(
      selectOpenEncoding(probe, {
        width: 1280,
        height: 720,
        videoBitrate: 4_000_000,
        audio: { numberOfChannels: 1, sampleRate: 24_000 },
      }),
    ).resolves.toEqual({ container: 'webm', mimeType: 'video/webm', video: 'vp9', audio: 'opus' });
  });

  it('fails closed when Opus is unavailable', async () => {
    const probe = {
      canEncodeVideo: vi.fn(async () => true),
      canEncodeAudio: vi.fn(async () => false),
    };
    await expect(
      selectOpenEncoding(probe, {
        width: 1080,
        height: 1080,
        videoBitrate: 6_000_000,
        audio: { numberOfChannels: 2, sampleRate: 48_000 },
      }),
    ).resolves.toBeNull();
    expect(probe.canEncodeVideo).not.toHaveBeenCalled();
  });

  it('never accepts a MediaRecorder container without an explicit approved codec pair', () => {
    const supported = vi.fn((mime: string) => mime === 'video/webm');
    vi.stubGlobal('MediaRecorder', { isTypeSupported: supported });
    expect(supportedWebMRecorderMime()).toBeNull();
    expect(supported.mock.calls.map(([mime]) => mime)).toEqual([...WEBM_RECORDER_MIME_TYPES]);
  });
});
