// Shared vocabulary for the Replay "Mavéa Story": a cinematic clip of the real components, rendered
// offscreen (no screen capture). Output shape and the finished artifact.

/** Output shape — vertical (story), square, or wide. */
export type ClipAspect = '9:16' | '1:1' | '16:9';

/** Export quality tier — trades file size / render time against frame rate + bitrate. */
export type ClipQuality = 'balanced' | 'high' | 'ultra';

/**
 * Color + motion theme for the Mavéa Story stage.
 * - aurora  : deep blue-black space, mood-based lighting, rise+clip-wipe (default)
 * - ember   : warm amber/crimson dark, horizontal push (Stories energy)
 * - ocean   : deep teal navy, depth zoom (Apple Keynote feel)
 * - chalk   : warm off-white cream, pure crossfade (editorial, Anthropic minimal)
 */
export type ClipTheme = 'aurora' | 'ember' | 'ocean' | 'chalk';

/** The finished artifact: an approved open-codec video Blob (MP4 with AV1 + Opus when the
 *  browser can encode it, WebM otherwise). Large local exports may keep that Blob
 *  browser-file-backed until the download/share path releases it. */
export interface ClipResult {
  blob: Blob;
  /** The resolved container MIME — drives the download extension. */
  type: string;
  /** A representative still (or the clip itself) for share previews. */
  poster: Blob;
  hasAudio: boolean;
  durationMs: number;
  /** Release temporary browser-backed storage, when the producer needed it. */
  dispose?: () => void | Promise<void>;
}
