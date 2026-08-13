// The turn-audio recorder behind "scrub the voice, the canvas time-travels". While a turn
// speaks, the streaming TTS tap feeds every decoded PCM chunk in here; alongside it the
// surface marks how many blocks were on screen as the audio advanced. When the turn settles
// the whole spoken track — narration plus each tour line, gaps removed — becomes one
// scrubbable timeline whose positions map back to real canvas states. Only the LAST turn is
// kept (the thing you'd scrub), so memory stays bounded however long a session runs.
import { getVoiceSpeed, type StreamTap } from '../../voice/streamTts';

/** Kokoro's PCM rate — the recorder's clock counts samples at this rate. */
const SAMPLE_RATE = 24000;
/** Hard cap on retained audio (~3 minutes) so a runaway turn can't balloon memory. */
const MAX_SAMPLES = SAMPLE_RATE * 180;

/** One spoken line inside the turn's timeline (narration first, then each tour stop). */
export interface SpokenSpan {
  text: string;
  t0: number;
  t1: number;
}

/** A canvas state the audio passed through: from `t`, the screen held `blocks` blocks. */
export interface BlockMark {
  t: number;
  blocks: number;
}

/** The finished, scrubbable record of one turn's voice. */
export interface TurnAudio {
  /** The whole spoken track, lines concatenated (gaps removed). */
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
  spans: SpokenSpan[];
  marks: BlockMark[];
  /** The voice speed the turn was SPOKEN at (Kokoro rendered the PCM at this rate). Replay divides
   *  the current voice speed by this so a later speed change re-times the recording correctly,
   *  instead of stacking on top of a rate already baked into the samples. Optional so retained
   *  tracks created before speed controls existed continue to replay at the 1× fallback. */
  speed?: number;
}

interface ClipInProgress {
  text: string;
  chunks: Float32Array[];
  samples: number;
}

let clips: { text: string; chunks: Float32Array[]; samples: number }[] = [];
let current: ClipInProgress | null = null;
let marks: BlockMark[] = [];
let totalSamples = 0;
let recording = false;
// Speech that is NOT this turn's: replaying an older answer narrates through the very same
// streaming TTS tap, so without a suspension the replayed lines would append themselves to the
// live turn's track and the retained snapshot would be overwritten with audio from the past.
let suspended = false;
// The voice speed in force when the turn began — the rate Kokoro rendered its PCM at.
let turnSpeed = 1;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Subscribe to recorder changes that can make a snapshot newly available. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** External-store snapshot for React; increments when recording starts or a line settles. */
export function getVersion(): number {
  return version;
}

/** Seconds of audio recorded so far (the live position marks are stamped against). */
function recordedSeconds(): number {
  return totalSamples / SAMPLE_RATE;
}

/** Start capturing a new turn — drops whatever the previous turn left behind. */
export function beginTurn(): void {
  clips = [];
  current = null;
  marks = [];
  totalSamples = 0;
  turnSpeed = getVoiceSpeed();
  recording = true;
  emit();
}

/** Close the recording: the turn has settled and the voice has gone quiet. Anything spoken after
 *  this — a voice-preset audition, the Watch-Me-Think settle line — belongs to no turn and must
 *  never append itself to the answer the user is about to scrub. */
export function endTurn(): void {
  recording = false;
  current = null;
  emit();
}

/** Make the tap deaf while audio that isn't this turn's is playing (replaying an older answer).
 *  Left open rather than closed, so the turn's own tour can keep speaking after the canvas
 *  settles and still land in the track. */
export function setTapSuspended(on: boolean): void {
  suspended = on;
}

/** The surface saw `blocks` blocks on screen right now — stamp it against the audio clock.
 *  Consecutive identical counts collapse; marks are monotonic by construction. */
export function markBlocks(blocks: number): void {
  if (!recording || suspended) return;
  const last = marks[marks.length - 1];
  if (last && last.blocks === blocks) return;
  marks.push({ t: recordedSeconds(), blocks });
}

/** The tap streamTts feeds: one clip per spoken line. */
export const recorderTap: StreamTap = {
  begin(text: string): void {
    if (!recording || suspended) return;
    current = { text, chunks: [], samples: 0 };
  },
  push(samples: Float32Array): void {
    if (!recording || suspended || !current) return;
    if (totalSamples + samples.length > MAX_SAMPLES) return; // cap, don't grow
    current.chunks.push(samples);
    current.samples += samples.length;
    totalSamples += samples.length;
  },
  end(heard: boolean): void {
    if (!recording || !current) return;
    // Suspended part-way through a line (a replay opened mid-sentence): drop it outright — no
    // clip, no version bump — and hand its samples back to the clock so later spans stay aligned.
    if (suspended) {
      totalSamples -= current.samples;
      current = null;
      return;
    }
    // A line that never made a sound contributes nothing to the timeline.
    if (heard && current.samples > 0) clips.push(current);
    else totalSamples -= current.samples;
    current = null;
    emit();
  },
};

/**
 * The turn's spoken track so far: every HEARD line concatenated, spans + marks frozen at
 * this moment. Non-destructive — the recording stays open (a turn's tour keeps speaking
 * after the canvas settles, so the surface snapshots when the voice actually goes quiet).
 * Returns null when nothing was recorded (muted, whole-clip fallback, no TTS) — the
 * surface simply offers no scrubber then.
 */
export function snapshot(): TurnAudio | null {
  const settled = clips.reduce((a, c) => a + c.samples, 0);
  if (settled === 0) return null;
  const pcm = new Float32Array(settled);
  const spans: SpokenSpan[] = [];
  let off = 0;
  for (const clip of clips) {
    const t0 = off / SAMPLE_RATE;
    for (const chunk of clip.chunks) {
      pcm.set(chunk, off);
      off += chunk.length;
    }
    spans.push({ text: clip.text, t0, t1: off / SAMPLE_RATE });
  }
  const duration = settled / SAMPLE_RATE;
  // Marks were stamped against the live clock (which includes a possibly-unheard line in
  // flight); clamp into the settled track so the un-build lookup can't point past the end.
  const clamped = marks.map((m) => ({ t: Math.min(m.t, duration), blocks: m.blocks }));
  return { pcm, sampleRate: SAMPLE_RATE, duration, spans, marks: clamped, speed: turnSpeed };
}

/** How many blocks the canvas held at time `t` — the un-build lookup. Before the first mark
 *  nothing had landed; past the last, everything had. */
export function blocksAt(audio: TurnAudio, t: number): number {
  let n = 0;
  for (const m of audio.marks) {
    if (m.t > t) break;
    n = m.blocks;
  }
  return n;
}
