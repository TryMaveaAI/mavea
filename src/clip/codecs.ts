/**
 * Media codecs and containers allowed for generated files. The project chooses AV1/VP9/VP8 and
 * Opus because their stewards publish open implementations and patent commitments. Those
 * commitments reduce risk but are not a universal patent-clearance opinion. Common patent-pool
 * formats and unspecified browser defaults remain excluded. MP4 is deliberately narrower than
 * WebM: it may contain only AV1 video and Opus audio.
 */
export type OpenVideoCodec = 'av1' | 'vp9' | 'vp8';
const OPEN_AUDIO_CODEC = 'opus' as const;

export type OpenEncoding =
  | {
      container: 'mp4';
      mimeType: 'video/mp4';
      video: 'av1';
      audio: typeof OPEN_AUDIO_CODEC;
    }
  | {
      container: 'webm';
      mimeType: 'video/webm';
      video: 'vp9' | 'vp8';
      audio: typeof OPEN_AUDIO_CODEC;
    };

/** Best-first: an .mp4 shares more easily, AV1 compresses better than VP9, and WebM VP8 is the
 *  compatibility floor. Each entry is an explicit policy choice; none is an unspecified fallback. */
const OPEN_ENCODINGS: readonly OpenEncoding[] = [
  { container: 'mp4', mimeType: 'video/mp4', video: 'av1', audio: OPEN_AUDIO_CODEC },
  { container: 'webm', mimeType: 'video/webm', video: 'vp9', audio: OPEN_AUDIO_CODEC },
  { container: 'webm', mimeType: 'video/webm', video: 'vp8', audio: OPEN_AUDIO_CODEC },
];

export const WEBM_RECORDER_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
] as const;

interface CodecProbe {
  canEncodeVideo(
    codec: OpenVideoCodec,
    options: { width: number; height: number; bitrate: number },
  ): Promise<boolean>;
  canEncodeAudio(
    codec: typeof OPEN_AUDIO_CODEC,
    options: { numberOfChannels: number; sampleRate: number; bitrate: number },
  ): Promise<boolean>;
}

export interface OpenEncodingOptions {
  width: number;
  height: number;
  videoBitrate: number;
  audio?: Pick<AudioBuffer, 'numberOfChannels' | 'sampleRate'> | null;
  audioBitrate?: number;
}

/** Select the best explicitly permitted container + codec pair, or null without widening policy. */
export async function selectOpenEncoding(
  probe: CodecProbe,
  options: OpenEncodingOptions,
): Promise<OpenEncoding | null> {
  if (
    options.audio &&
    !(await probe
      .canEncodeAudio(OPEN_AUDIO_CODEC, {
        numberOfChannels: options.audio.numberOfChannels,
        sampleRate: options.audio.sampleRate,
        bitrate: options.audioBitrate ?? 192_000,
      })
      .catch(() => false))
  ) {
    return null;
  }

  for (const encoding of OPEN_ENCODINGS) {
    const supported = await probe
      .canEncodeVideo(encoding.video, {
        width: options.width,
        height: options.height,
        bitrate: options.videoBitrate,
      })
      .catch(() => false);
    if (supported) return encoding;
  }
  return null;
}

/** MediaRecorder is accepted only when it advertises a complete approved video+audio codec pair —
 *  its container is always WebM here, because recorder MP4 support implies patent-pool codecs. */
export function supportedWebMRecorderMime(): (typeof WEBM_RECORDER_MIME_TYPES)[number] | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  return WEBM_RECORDER_MIME_TYPES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}
