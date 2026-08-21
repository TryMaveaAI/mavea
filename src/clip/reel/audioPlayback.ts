// Reel narration PLAYBACK — everything that does something with an already-rendered buffer.
//
// Split from audioTrack (which renders one) because rendering pulls the whole speech stack:
// voice/kokoro → voice/tts, plus the pronunciation layer. A reel's first preview is SILENT, and the
// export sheet is a later gesture still, so charging the synthesizer to the payload that merely
// draws the preview was ~5 kB nobody had asked to spend. Nothing here needs a synthesizer — only an
// AudioContext to play a buffer through — so the split falls on a real seam rather than a budget.
import { leaseAudioContext } from '../../voice/voiceEnergy';

export interface ReelAudioStream {
  stream: MediaStream;
  /** Begin playing the buffer into the stream (call once recording is consuming the track). */
  start: () => void;
  /** Stop playback and release the source. */
  stop: () => void;
}

/** Wrap a rendered buffer as a MediaStream the encoder can mux as a deterministic Opus track. */
export function bufferToStream(buffer: AudioBuffer): ReelAudioStream | null {
  // Leased, not taken raw: this plays in real time for the length of the reel, so the idle timer
  // must stay stood down until stop() — and must be free to park again afterwards.
  const lease = leaseAudioContext();
  if (!lease) return null;
  const { ctx, release } = lease;
  if (typeof ctx.createMediaStreamDestination !== 'function') {
    release();
    return null;
  }
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(dest);
  let started = false;
  return {
    stream: dest.stream,
    start() {
      if (started) return;
      started = true;
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      src.start();
    },
    stop() {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* no-op */
      }
      release();
    },
  };
}

/** How far into the buffer playback has reached: the offset it last (re)started from, plus however
 *  much of the context clock has elapsed since. A one-shot `AudioBufferSourceNode` has no "current
 *  position" of its own — this is the standard Web Audio way to reconstruct one. Exported standalone
 *  so the bookkeeping is unit-testable without a real (or mocked) AudioContext. */
export function elapsedOffset(startedAt: number, offsetAtStart: number, now: number): number {
  return offsetAtStart + Math.max(0, now - startedAt);
}

/** Where a resume should restart from, or null when there's nothing left to play. Resuming a one-shot
 *  source AT or PAST its own duration throws in some engines — clamping here keeps `resume()` a safe
 *  no-op instead of a crash on a pause that landed right at the narration's tail. */
export function clampResumeOffset(offset: number, duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0 || offset >= duration) return null;
  return Math.max(0, offset);
}

export interface ReelPreviewAudio {
  /** (Re)start the narration from the top — called on each preview loop, and on replay, so it stays
   *  in sync. */
  play: () => void;
  /** Silence/unsilence without tearing down the graph. */
  setMuted: (muted: boolean) => void;
  /** Freeze exactly where playback is — pairs with the reel's own visual pause. */
  pause: () => void;
  /** Continue from wherever `pause()` left off. A no-op if already playing, or if pause landed at
   *  (or past) the very end of the narration. */
  resume: () => void;
  stop: () => void;
}

/** Audible preview of the narration: the rendered buffer played through a gain (mute) to the speakers,
 *  restarted on each visual loop for rough sync, and pausable in lockstep with the reel's own freeze.
 *  Created on the user's gesture (the sound toggle), so the AudioContext is allowed to resume. */
export function makePreviewAudio(buffer: AudioBuffer): ReelPreviewAudio | null {
  // Same reasoning as bufferToStream: a preview loop can run for minutes, so it leases the
  // context and hands it back on stop() rather than retiring the idle timer for the session.
  const lease = leaseAudioContext();
  if (!lease) return null;
  const { ctx, release } = lease;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  let src: AudioBufferSourceNode | null = null;
  // Where the CURRENT source's playback began within the buffer, and the context-clock time it began
  // at — together they let pause() compute exactly how far in we are and resume() pick up from there.
  let offsetAtStart = 0;
  let startedAt = 0;
  let paused = false;

  const stopSource = () => {
    try {
      src?.stop();
      src?.disconnect();
    } catch {
      /* no active source */
    }
    src = null;
  };

  const startFrom = (offset: number) => {
    stopSource();
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.start(0, offset);
    offsetAtStart = offset;
    startedAt = ctx.currentTime;
    paused = false;
  };

  return {
    play() {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      startFrom(0);
    },
    setMuted(muted) {
      gain.gain.value = muted ? 0 : 1;
    },
    pause() {
      if (paused || !src) return;
      offsetAtStart = Math.min(
        buffer.duration,
        elapsedOffset(startedAt, offsetAtStart, ctx.currentTime),
      );
      stopSource();
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      const target = clampResumeOffset(offsetAtStart, buffer.duration);
      if (target === null) return; // pause landed at the very end — nothing left to resume
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      startFrom(target);
    },
    stop() {
      stopSource();
      try {
        gain.disconnect();
      } catch {
        /* no-op */
      }
      release();
    },
  };
}
