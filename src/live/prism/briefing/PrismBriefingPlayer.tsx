import type { ReactElement } from 'react';
import { BriefingPlayer } from './BriefingPlayer';
import type { BriefingBeat } from './types';

export interface PrismBriefingPlayerProps {
  beats: BriefingBeat[];
  onBeat: (beat: BriefingBeat) => void;
  onExit: () => void;
}

/** Keeps the briefing UI and optional narration runtime behind the Brief-me interaction. */
export function PrismBriefingPlayer({
  beats,
  onBeat,
  onExit,
}: PrismBriefingPlayerProps): ReactElement {
  return (
    <BriefingPlayer
      beats={beats}
      onBeat={onBeat}
      onExit={onExit}
      speak={(text) => {
        void import('../../../voice/kokoro').then((m) => m.speakKokoroResult(text, 'mavea'));
      }}
      cancelSpeak={() => {
        void import('../../../voice/kokoro').then((m) => m.cancelKokoro());
      }}
    />
  );
}
