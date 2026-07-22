import { useCallback, useEffect, type ReactElement } from 'react';
import { useLiveConfig } from '../useLiveConfig';
import { setVoiceSpeed } from '../../voice/streamTts';
import { clampSpeed, formatRate, nextRate } from './voiceSpeed';

/** The persistent voice-speed control in the dock. Governs how fast Mavéa speaks — the synth
 *  renders each line at this rate, so the voice never chipmunks — and, because it is the one
 *  persisted speed, the replay scrubber reads it too. A mid-speech change lands on the next clause. */
export function VoiceSpeedChip(): ReactElement {
  const [cfg, setCfg] = useLiveConfig();
  const speed = clampSpeed(cfg.voiceSpeed);
  // Mirror the persisted speed into the audio layer so the next synthesized clause adopts it (and
  // so a fresh load with a remembered speed speaks at it from the first word).
  useEffect(() => {
    setVoiceSpeed(speed);
  }, [speed]);
  const cycle = useCallback(() => setCfg({ voiceSpeed: nextRate(speed) }), [setCfg, speed]);
  return (
    <button
      type="button"
      className="voice-speed"
      onClick={cycle}
      aria-label={`Voice speed, currently ${formatRate(speed)}. Tap to change.`}
      title="How fast Mavéa speaks"
    >
      {formatRate(speed)}
    </button>
  );
}
