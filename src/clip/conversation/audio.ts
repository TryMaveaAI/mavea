import type { TurnFrame } from '../../live/history';
import type { TurnAudio } from '../../live/scrubvoice/recorder';
import { sharedAudioContext } from '../../voice/voiceEnergy';
import { synthesizeVoiceLine } from '../reel/audioTrack';
import { CONVERSATION_VIDEO_MAX_MS } from './timeline';
import type {
  ConversationAudioSpan,
  ConversationTurnAudio,
  PreparedConversationAudio,
} from './types';

const RATE = 24_000;
const LEAD_S = 0.65;
const LINE_GAP_S = 0.18;
const TAIL_S = 0.35;
const TARGET_PEAK = 0.89;
const MAX_GAIN = 6;

export class RequiredConversationAudioError extends Error {
  constructor(
    public readonly turnIndex: number,
    public readonly question: string,
  ) {
    super(`Narration is unavailable for “${question || `turn ${turnIndex + 1}`}”.`);
    this.name = 'RequiredConversationAudioError';
  }
}

interface PcmLine {
  text: string;
  pcm: Float32Array;
  rate: number;
}

interface PcmTurn {
  lines: PcmLine[];
  durationS: number;
  spans: ConversationAudioSpan[];
}

function narrationLines(frame: TurnFrame): string[] {
  return [
    frame.spoken ?? frame.narration,
    ...frame.tour.map((step) => step.saySpoken ?? step.say ?? ''),
  ]
    .map((text) => text.trim())
    .filter(Boolean);
}

function normalizedLine(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Recorder snapshots publish after every spoken line. Export can open while a live walk is still
 *  speaking, so retained PCM is complete only when it covers every authored narration line. */
export function retainedAudioCoversFrame(frame: TurnFrame, audio: TurnAudio): boolean {
  const expected = narrationLines(frame);
  return (
    expected.length > 0 &&
    audio.pcm.length > 0 &&
    audio.spans.length === expected.length &&
    expected.every(
      (text, index) =>
        normalizedLine(audio.spans[index]?.text ?? '') === normalizedLine(text) &&
        audio.spans[index].t1 > audio.spans[index].t0,
    )
  );
}

function retainedTurn(audio: TurnAudio): PcmTurn {
  const spans = audio.spans.map((span) => ({
    text: span.text,
    startMs: Math.round((LEAD_S + span.t0) * 1_000),
    endMs: Math.round((LEAD_S + span.t1) * 1_000),
  }));
  return {
    lines: [
      { text: spans.map((span) => span.text).join(' '), pcm: audio.pcm, rate: audio.sampleRate },
    ],
    durationS: LEAD_S + audio.duration + TAIL_S,
    spans,
  };
}

async function synthesizedTurn(
  frame: TurnFrame,
  index: number,
  signal?: AbortSignal,
): Promise<PcmTurn> {
  const texts = narrationLines(frame);
  if (!texts.length) throw new RequiredConversationAudioError(index, frame.question);
  const lines: PcmLine[] = [];
  for (const text of texts) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const pcm = await synthesizeVoiceLine(text, signal);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!pcm.length) throw new RequiredConversationAudioError(index, frame.question);
    lines.push({ text, pcm, rate: RATE });
  }
  const spans: ConversationAudioSpan[] = [];
  let at = LEAD_S;
  for (const line of lines) {
    const start = at;
    at += line.pcm.length / line.rate;
    spans.push({
      text: line.text,
      startMs: Math.round(start * 1_000),
      endMs: Math.round(at * 1_000),
    });
    at += LINE_GAP_S;
  }
  return { lines, durationS: at + TAIL_S, spans };
}

export async function prepareConversationAudio(
  frames: readonly TurnFrame[],
  retained: (frame: TurnFrame) => TurnAudio | null,
  signal?: AbortSignal,
): Promise<PreparedConversationAudio> {
  const ctx = sharedAudioContext();
  if (!ctx || typeof OfflineAudioContext === 'undefined') {
    throw new Error('audio-encoding-unavailable');
  }
  const turns: PcmTurn[] = [];
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const kept = retained(frame);
    turns.push(
      kept && retainedAudioCoversFrame(frame, kept)
        ? retainedTurn(kept)
        : await synthesizedTurn(frame, index, signal),
    );
  }
  const totalS = turns.reduce((sum, turn) => sum + turn.durationS, 0);
  if (totalS * 1_000 > CONVERSATION_VIDEO_MAX_MS) throw new Error('conversation-too-long');

  let peak = 0;
  for (const turn of turns) {
    for (const line of turn.lines) {
      for (let i = 0; i < line.pcm.length; i++) peak = Math.max(peak, Math.abs(line.pcm[i]));
    }
  }
  const gain = peak > 0 ? Math.min(MAX_GAIN, TARGET_PEAK / peak) : 1;
  const offline = new OfflineAudioContext(1, Math.ceil(totalS * ctx.sampleRate), ctx.sampleRate);
  const master = offline.createGain();
  master.gain.value = gain;
  master.connect(offline.destination);
  let turnAt = 0;
  for (const turn of turns) {
    let lineAt = turnAt + LEAD_S;
    for (const line of turn.lines) {
      const sourceBuffer = offline.createBuffer(1, line.pcm.length, line.rate);
      sourceBuffer.getChannelData(0).set(line.pcm);
      const source = offline.createBufferSource();
      source.buffer = sourceBuffer;
      source.connect(master);
      source.start(lineAt);
      lineAt += line.pcm.length / line.rate + LINE_GAP_S;
    }
    turnAt += turn.durationS;
  }
  const buffer = await offline.startRendering();
  const layouts: ConversationTurnAudio[] = turns.map((turn) => ({
    durationMs: Math.round(turn.durationS * 1_000),
    spans: turn.spans,
  }));
  return { buffer, turns: layouts, durationMs: Math.round(totalS * 1_000) };
}
