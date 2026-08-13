import type { TurnFrame } from '../../live/history';
import type { InkRequest } from '../../live/annotate/AnnotationLayer';
import type { ClipQuality, ClipResult } from '../types';

export type VideoStudioMode = 'conversation' | 'reel';

/** Conversation cuts are plain screen video — 16:9 at a familiar resolution, not a social reel. */
export type ConversationVideoSize = '1080p' | '720p';

export interface ConversationVideoOptions {
  size: ConversationVideoSize;
  quality: ClipQuality;
  captions: boolean;
  spotlights: boolean;
  penMarks: boolean;
  presence: boolean;
}

export interface ConversationAudioSpan {
  text: string;
  startMs: number;
  endMs: number;
}

export interface ConversationTurnAudio {
  durationMs: number;
  spans: ConversationAudioSpan[];
}

export interface PreparedConversationAudio {
  buffer: AudioBuffer;
  turns: ConversationTurnAudio[];
  durationMs: number;
}

export interface ConversationScene {
  frame: TurnFrame;
  turnIndex: number;
  startMs: number;
  durationMs: number;
  spot: string | null;
  caption: string | null;
  ink: InkRequest[];
  questionOnly: boolean;
}

export type ConversationExportPhase = 'audio' | 'render' | 'encode' | 'ready';

export interface ConversationExportProgress {
  phase: ConversationExportPhase;
  completed: number;
  total: number;
}

export interface ConversationExportResult extends ClipResult {
  width: number;
  height: number;
}
