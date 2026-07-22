// tableLook.ts — maps a moment at the table (whose turn, who's mid-line, how it ended) to how
// each seat looks: the jelly's state/emotion/gaze. Pure so the choreography is unit-testable
// apart from the panel's timers and streaming (mirrors live/presenceMap.ts). The two seats are
// deliberately asymmetric: only "yours" ever tables an offer with `acting` or closes the run
// with `celebrate` — the stand-in reacts (curious, focused, warm) but never gets the real thing.
import type { Emotion, Gaze, PresenceState } from '../../types/mavea';
import type { NegotiationSide } from './negotiate';

export interface SeatLook {
  state: PresenceState;
  emotion: Emotion;
  gaze: Gaze;
}

export interface TableLook {
  yours: SeatLook;
  theirs: SeatLook;
}

export type TablePhase =
  | {
      kind: 'running';
      whoseTurn: NegotiationSide;
      /** The most recent event was an engine boundary withhold and yours hasn't replied yet —
       *  only ever true while `whoseTurn === 'yours'`. */
      guarded: boolean;
      /** The line currently landing, and whether it carried an offer. Null between lines,
       *  while whoever's turn it is thinks. */
      speaking: { side: NegotiationSide; offer: boolean; pointing: boolean } | null;
    }
  | { kind: 'deal' }
  | { kind: 'approved' }
  | { kind: 'nodeal'; boundaryHeld: boolean }
  | { kind: 'stopped' };

/** How long a landed line holds the talking look before yielding back to thinking/listening. */
export const SAY_MS = 1600;
/** How long yours holds the "pointing at the offer" look after a line that tabled one. */
export const POINT_MS = 1300;

type RunningPhase = Extract<TablePhase, { kind: 'running' }>;

function yoursLook(phase: RunningPhase): SeatLook {
  const gaze: Gaze = 'right';
  const sp = phase.speaking;
  if (sp?.side === 'yours') {
    return sp.pointing
      ? { state: 'acting', emotion: 'focused', gaze }
      : { state: 'speaking', emotion: 'focused', gaze };
  }
  if (sp?.side === 'theirs') {
    return { state: 'idle', emotion: sp.offer ? 'curious' : 'neutral', gaze };
  }
  if (phase.whoseTurn === 'yours') {
    return { state: 'thinking', emotion: phase.guarded ? 'concerned' : 'focused', gaze };
  }
  return { state: 'idle', emotion: 'neutral', gaze };
}

function theirsLook(phase: RunningPhase): SeatLook {
  const gaze: Gaze = 'left';
  const sp = phase.speaking;
  if (sp?.side === 'theirs') {
    return { state: 'speaking', emotion: sp.offer ? 'focused' : 'neutral', gaze };
  }
  if (sp?.side === 'yours') {
    return { state: 'idle', emotion: sp.offer ? 'curious' : 'neutral', gaze };
  }
  if (phase.whoseTurn === 'theirs') {
    return { state: 'thinking', emotion: 'neutral', gaze };
  }
  // yours is thinking — curious while guarded (watching the retry), otherwise a plain listener.
  return { state: 'idle', emotion: phase.guarded ? 'curious' : 'neutral', gaze };
}

export function tableLook(phase: TablePhase): TableLook {
  switch (phase.kind) {
    case 'running':
      return { yours: yoursLook(phase), theirs: theirsLook(phase) };
    case 'deal':
      // The only celebrate on this surface — theirs warms to it, never lights up.
      return {
        yours: { state: 'idle', emotion: 'celebrate', gaze: 'center' },
        theirs: { state: 'idle', emotion: 'warm', gaze: 'center' },
      };
    case 'approved':
      return {
        yours: { state: 'idle', emotion: 'warm', gaze: 'center' },
        theirs: { state: 'idle', emotion: 'neutral', gaze: 'center' },
      };
    case 'nodeal':
      return {
        yours: {
          state: 'idle',
          emotion: phase.boundaryHeld ? 'focused' : 'concerned',
          gaze: 'center',
        },
        theirs: { state: 'idle', emotion: 'neutral', gaze: 'center' },
      };
    case 'stopped':
      return {
        yours: { state: 'idle', emotion: 'sleepy', gaze: 'down' },
        theirs: { state: 'idle', emotion: 'sleepy', gaze: 'down' },
      };
  }
}
