import type { ReactElement } from 'react';
import { BriefingPlayer } from './BriefingPlayer';
import type { BriefingBeat } from './types';

export interface PrismBriefingPlayerProps {
  beats: BriefingBeat[];
  onBeat: (beat: BriefingBeat) => void;
  onExit: () => void;
  /** See BriefingPlayer: on for a briefing the reader asked for, off for the tour's own flight. */
  audioDefault?: boolean;
}

/** Keeps the briefing UI and optional narration runtime behind the Brief-me interaction. */
export function PrismBriefingPlayer({
  beats,
  onBeat,
  onExit,
  audioDefault,
}: PrismBriefingPlayerProps): ReactElement {
  return (
    <BriefingPlayer
      beats={beats}
      onBeat={onBeat}
      onExit={onExit}
      audioDefault={audioDefault}
      // Hand the LINE back, not just a fire-and-forget: its lifecycle is what paces the flight,
      // so a beat ends when its narration ends rather than on a character-count guess.
      speak={(text) =>
        import('../../../voice/kokoro').then(
          (m) => m.speakKokoroLine(text, 'mavea'),
          () => null,
        )
      }
      cancelSpeak={() => {
        void import('../../../voice/kokoro').then((m) => m.cancelKokoro());
      }}
    />
  );
}
