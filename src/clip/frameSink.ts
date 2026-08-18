// Where a rendered frame GOES. The recorder paints one output canvas; a sink decides what happens
// to the picture sitting on it. Two exist, and they differ in the only way that matters — whether a
// frame carries its own timestamp:
//
//  • the muxed sink (mediabunny / WebCodecs) is handed an explicit start time and duration per
//    frame, so the recorder is free to step a MEDIA clock and finish faster (or slower) than the
//    clip it renders;
//  • the realtime sink (MediaRecorder's captureStream) samples the canvas on wall clock and cannot
//    be told when a frame belongs, so the recorder has to pace itself to real time for it.
//
// Extracting the seam is what lets one loop drive both paths — the paint/hold/flush bookkeeping
// used to be written twice, in two subtly different dialects, inside the recorder.
export interface FrameSink {
  /** True when the sink samples the canvas on WALL clock. The recorder must then pace its steps to
   *  real time and leave animations running, because it cannot stamp what it produces. */
  readonly realtime: boolean;
  /** False once the sink stopped taking frames (the muxer closed under us). */
  accepting(): boolean;
  /**
   * End the frame currently on the canvas at media time `endS` (seconds), handing it over.
   *
   * This is where the muxer READS the canvas, so it must be called BEFORE the canvas is repainted —
   * deferring the handover this way is exactly what lets an unchanged stage hold one frame with a
   * long duration instead of re-rasterizing and re-encoding the same pixels every tick.
   */
  end(endS: number): Promise<void>;
  /** Declare that the canvas's current content is the frame beginning at media time `startS`. */
  begin(startS: number): void;
  /** No more frames are coming. */
  finish(): void;
}

/** The muxer surface a timestamped sink needs — mediabunny's CanvasSource, narrowed to it. */
export interface TimestampedFrameTarget {
  add(timestamp: number, duration: number): Promise<void>;
  close(): void;
}

/**
 * Frames carry their own timestamps, so the recorder's clock is free of the machine's.
 * A frame is never shorter than one step (a zero-length sample is not a frame) and never runs past
 * the clip's known length, so the video can't outlast the narration it was timed to.
 */
export function timestampedSink(
  target: TimestampedFrameTarget,
  { fps, capS }: { fps: number; capS: number },
): FrameSink {
  let pendingT: number | null = null;
  let open = true;
  return {
    realtime: false,
    accepting: () => open,
    async end(endS) {
      if (pendingT === null || !open) return;
      const startS = pendingT;
      // Cleared BEFORE the await: stop() and the frame loop can both reach here, and the frame
      // must be handed over exactly once.
      pendingT = null;
      try {
        await target.add(startS, Math.max(1 / fps, Math.min(endS, capS) - startS));
      } catch {
        open = false; // the output was cancelled under us
      }
    },
    begin(startS) {
      if (open) pendingT = startS;
    },
    finish() {
      if (!open) return;
      open = false;
      try {
        target.close();
      } catch {
        /* already closed with the output */
      }
    },
  };
}

/**
 * MediaRecorder's captureStream pulls whole frames off the canvas on its own schedule, so there is
 * nothing to stamp and nothing to defer: keeping the canvas current IS presenting the frame.
 */
export function realtimeSink(): FrameSink {
  return {
    realtime: true,
    accepting: () => true,
    async end() {},
    begin() {},
    finish() {},
  };
}
