import { replayFrame } from '../../live/replay';
import type { TurnFrame } from '../../live/history';
import type { ConversationScene, ConversationTurnAudio, ConversationVideoOptions } from './types';

export const CONVERSATION_VIDEO_MAX_MS = 180_000;
const QUESTION_LEAD_MS = 650;
const TURN_TAIL_MS = 350;
/** The closing beat plays WIDE. A cut that ends mid-spotlight leaves the reader looking at one lit
 *  card with the rest of the answer dimmed out behind it, which is the last thing a viewer should
 *  be left with. The finale is carved out of the last scene rather than appended, so handing the
 *  canvas back costs the export no extra time and never runs the picture past the narration. */
const FINALE_WIDE_MS = 700;

export function estimateTurnDurationMs(frame: TurnFrame): number {
  const lines = [
    frame.spoken ?? frame.narration,
    ...frame.tour.map((t) => t.saySpoken ?? t.say ?? ''),
  ];
  const characters = lines.reduce((sum, line) => sum + line.trim().length, 0);
  return QUESTION_LEAD_MS + TURN_TAIL_MS + Math.max(1_800, (characters / 14) * 1_000);
}

export function estimateConversationDurationMs(frames: readonly TurnFrame[]): number {
  return frames.reduce((sum, frame) => sum + estimateTurnDurationMs(frame), 0);
}

/**
 * An audio-off export has no narration buffer to time against, so the character-count estimate
 * that already drives the duration meter becomes the clock: the turn's total is laid out per line
 * (opener, then tour lines) in proportion to each line's length, so captions still cover every
 * line at a reading pace.
 */
export function estimateTurnAudio(frame: TurnFrame): ConversationTurnAudio {
  const durationMs = estimateTurnDurationMs(frame);
  const lines = [
    frame.spoken ?? frame.narration,
    ...frame.tour.map((t) => t.saySpoken ?? t.say ?? ''),
  ]
    .map((line) => line.trim())
    .filter(Boolean);
  const characters = lines.reduce((sum, line) => sum + line.length, 0);
  const body = durationMs - QUESTION_LEAD_MS - TURN_TAIL_MS;
  let at = QUESTION_LEAD_MS;
  const spans = lines.map((text) => {
    const startMs = Math.round(at);
    at += characters ? (body * text.length) / characters : 0;
    return { text, startMs, endMs: Math.round(at) };
  });
  return { durationMs, spans };
}

export function currentTopicStart(frames: readonly TurnFrame[]): number {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (
      frame?.topicShift === true ||
      (frame?.topicShift === undefined && frame?.mode === 'replace')
    ) {
      return i;
    }
  }
  return 0;
}

function cueStart(cueIndex: number, cueCount: number, audio: ConversationTurnAudio): number {
  // Retained/synthesized spans put the opener first and tour lines after it. When a stop has no
  // spoken line, distribute it through the voiced body so it still gets a visible moment.
  const spoken = audio.spans[cueIndex + 1];
  if (spoken) return spoken.startMs;
  const body = Math.max(0, audio.durationMs - QUESTION_LEAD_MS - TURN_TAIL_MS);
  return QUESTION_LEAD_MS + (body * (cueIndex + 1)) / (cueCount + 1);
}

export function buildConversationTimeline(
  frames: readonly TurnFrame[],
  audio: readonly ConversationTurnAudio[],
  options: ConversationVideoOptions,
): ConversationScene[] {
  const scenes: ConversationScene[] = [];
  let globalAt = 0;
  frames.forEach((frame, turnIndex) => {
    const turnAudio = audio[turnIndex];
    if (!turnAudio) return;
    const replay = replayFrame(frame);
    const cueTimes = replay.cues.map((_, i) => cueStart(i, replay.cues.length, turnAudio));
    const boundaries = [0, QUESTION_LEAD_MS, ...cueTimes, turnAudio.durationMs]
      .map((value) => Math.max(0, Math.min(turnAudio.durationMs, value)))
      .filter((value, index, all) => index === 0 || value > all[index - 1]);
    let ink: ConversationScene['ink'] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const localAt = boundaries[i];
      const next = boundaries[i + 1];
      const cueIndex = cueTimes.findIndex((value) => value === localAt);
      const cue = cueIndex >= 0 ? replay.cues[cueIndex] : undefined;
      if (cue && options.penMarks) {
        ink = [
          ...ink,
          ...cue.marks.map((mark, markIndex) => ({
            spot: cue.spot,
            line: cue.say,
            mark,
            delayMs: markIndex * 240,
            ...(mark.kind === 'connect' && typeof mark.onIndex === 'number'
              ? { toSpot: frame.spec.blocks[mark.onIndex]?.id }
              : {}),
          })),
        ];
      }
      const currentSpan = [...turnAudio.spans]
        .reverse()
        .find((span) => span.startMs <= localAt && span.endMs > localAt);
      scenes.push({
        frame,
        turnIndex,
        startMs: globalAt + localAt,
        durationMs: Math.max(1, next - localAt),
        spot: options.spotlights ? (cue?.spot ?? null) : null,
        caption: options.captions ? (currentSpan?.text ?? null) : null,
        ink,
        questionOnly: i === 0,
      });
    }
    globalAt += turnAudio.durationMs;
  });
  return releaseClosingSpotlight(scenes);
}

/**
 * Hand the canvas back for the last beat of the cut. Mid-video the spotlight already clears itself
 * — the next turn opens on its question, which carries no cue — so only the very end can strand a
 * viewer inside a spotlight. A final scene with room to spare keeps its spotlight for all but the
 * closing FINALE_WIDE_MS; a short one simply plays wide throughout, since splitting it would flash
 * two scenes where the eye reads one. Timings are preserved exactly: no scene moves, none is
 * dropped, and the total is untouched.
 */
function releaseClosingSpotlight(scenes: ConversationScene[]): ConversationScene[] {
  const last = scenes[scenes.length - 1];
  if (!last?.spot) return scenes;
  if (last.durationMs <= FINALE_WIDE_MS * 2) {
    scenes[scenes.length - 1] = { ...last, spot: null };
    return scenes;
  }
  const heldMs = last.durationMs - FINALE_WIDE_MS;
  scenes[scenes.length - 1] = { ...last, durationMs: heldMs };
  // The caption and ink ride along: only the CAMERA lets go, so the closing line still reads and
  // the pen marks stay on the cards they were drawn against.
  scenes.push({
    ...last,
    startMs: last.startMs + heldMs,
    durationMs: FINALE_WIDE_MS,
    spot: null,
  });
  return scenes;
}
