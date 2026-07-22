// Adapters that turn what's on screen into the TurnFrame[] the story stage plays. Live already
// captures TurnFrames; the scripted demo has a ConversationSpec, so we wrap it as one frame whose
// tour walks the canvas in reading order — "play back what was shown."
import type { ConversationSpec } from '../data/conversation';
import type { TurnFrame, FrameTourStep } from '../live/history';

/** One frame from a scripted/demo canvas: its spoken line + a spotlight walk over every card. */
export function framesFromSpec(spec: ConversationSpec): TurnFrame[] {
  if (!spec || !spec.blocks?.length) return [];
  const tour: FrameTourStep[] = spec.blocks.map((_, index) => ({ index }));
  return [
    {
      question: spec.opener || spec.title || '',
      narration: spec.found || spec.sub || spec.opener || spec.title || '',
      mode: 'replace',
      tour,
      spec,
      at: 0,
    },
  ];
}
