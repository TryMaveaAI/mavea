// MindShapeCanvas.tsx — live "Watch Me Think" surface.
// Wraps <MindShape asBlock={false}> with the live phase from useMindShape,
// fires the settle TTS line once, manages the reveal animation window, drives
// signal chips via useSignals, and exposes the four post-settle actions.
import { useEffect, useRef, useState } from 'react';
import type {
  MindAction,
  MindActionDetail,
  MindActivity,
} from '../../canvas/blocks/diagrams/MindShape';
import { MindShape } from '../../canvas/blocks/diagrams/MindShape';
import type { VoicePhase } from '../../voice/types';
import type { UseMindShapeReturn } from './useMindShape';
import { useSignals } from './useSignals';

export interface MindShapeCanvasProps {
  mindShape: UseMindShapeReturn;
  /** Called once when the canvas transitions to 'settled', so the parent can speak
   *  the narration line: "I think this is the shape of it." */
  onSettled?: () => void;
  onAction?: (action: MindAction, detail?: MindActionDetail) => void;
  /** Number of distinct thoughts heard — shown under the face during listening. */
  thoughtCount?: number;
  /** What the microphone is doing. The map's own phase stays 'listening' for the whole session, so
   *  this is the only thing that knows the speaker has stopped. */
  voicePhase?: VoicePhase;
  /** The VAD's provisional end-of-speech guess (~300ms after the last word, visual only). It lands
   *  well before the 1.6s redemption window closes, which is the whole point: the map reacts while
   *  the speaker is still looking at it. */
  speechEnding?: boolean;
  /** Called when the user confirms the unsaid observation ("yes, that's it"). */
  onConfirmUnsaid?: () => void;
  /** Called when the user dismisses the unsaid card ("not quite"). */
  onDismissUnsaid?: () => void;
}

export function MindShapeCanvas({
  mindShape,
  onSettled,
  onAction,
  thoughtCount,
  voicePhase,
  speechEnding = false,
  onConfirmUnsaid,
  onDismissUnsaid,
}: MindShapeCanvasProps) {
  const { phase, spec, intent } = mindShape;
  const settledFiredRef = useRef(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase === 'settled' && !settledFiredRef.current) {
      settledFiredRef.current = true;
      onSettled?.();
      // Trigger the 1.8s reveal sequence
      setIsRevealing(true);
      revealTimerRef.current = setTimeout(() => setIsRevealing(false), 1800);
    }
  }, [phase, onSettled]);

  // Reset fired flags when the canvas returns to idle
  useEffect(() => {
    if (phase === 'idle') {
      settledFiredRef.current = false;
      setIsRevealing(false);
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    }
  }, [phase]);

  // Clean up reveal timer on unmount
  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    [],
  );

  const { currentSignal } = useSignals(spec, phase);

  // Speech in progress outranks a call in flight: the mic being open is what the face should show
  // then, and a patch fired two utterances ago must not make a talking speaker look unheard.
  const activity: MindActivity =
    speechEnding || voicePhase === 'transcribing'
      ? 'transcribing'
      : voicePhase === 'listening'
        ? 'idle'
        : mindShape.refining
          ? 'asking'
          : 'idle';

  return (
    <MindShape
      asBlock={false}
      phase={phase}
      center={spec?.center ?? ''}
      atoms={spec?.atoms ?? []}
      links={spec?.links ?? []}
      modelStatus={mindShape.modelStatus}
      activity={phase !== 'settled' ? activity : 'idle'}
      clusters={spec?.clusters}
      unsaid={spec?.unsaid}
      intent={intent}
      isRevealing={isRevealing}
      currentSignal={currentSignal}
      onAction={onAction}
      onRemoveAtom={mindShape.removeAtom}
      onConfirmUnsaid={onConfirmUnsaid}
      onDismissUnsaid={onDismissUnsaid}
      thoughtCount={thoughtCount}
    />
  );
}
