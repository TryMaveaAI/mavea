import { useCallback, type ReactElement } from 'react';
import { useLiveConfig } from './useLiveConfig';

/** The persistent explanation-level control in the dock, beside the voice-speed and model chips.
 *  Tap to flip Standard/Simple without leaving the conversation for Settings — the same field
 *  voice ("explain it simpler" / "go deeper") and the Settings toggle both read and write, so all
 *  three stay in lockstep. */
export function ExplainLevelChip(): ReactElement {
  const [cfg, setCfg] = useLiveConfig();
  const simple = cfg.explainLevel === 'simple';
  const toggle = useCallback(
    () => setCfg({ explainLevel: simple ? 'standard' : 'simple' }),
    [setCfg, simple],
  );
  return (
    <button
      type="button"
      className={'explain-chip' + (simple ? ' is-simple' : '')}
      onClick={toggle}
      aria-pressed={simple}
      aria-label={`Explanation level: ${simple ? 'Simple' : 'Standard'}. Tap to switch.`}
      title="How plain the words and visuals are — or just say 'explain it simpler' / 'go deeper'"
    >
      {simple ? 'Simple' : 'Standard'}
    </button>
  );
}
