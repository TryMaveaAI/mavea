import { useCallback, type ReactElement } from 'react';
import { useLiveConfig } from './useLiveConfig';
import type { ExplainLevel } from './select';

/** The persistent explanation-level control in the dock, beside the voice-speed and model chips.
 *  Tap to cycle Standard → In-depth → Simple without leaving the conversation for Settings — the
 *  same field voice ("explain it simpler" / "go deeper") and the Settings picker both read and
 *  write, so all three stay in lockstep. */
const CYCLE: Record<ExplainLevel, ExplainLevel> = {
  standard: 'deep',
  deep: 'simple',
  simple: 'standard',
};
const LABEL: Record<ExplainLevel, string> = {
  simple: 'Simple',
  standard: 'Standard',
  deep: 'In-depth',
};

export function ExplainLevelChip(): ReactElement {
  const [cfg, setCfg] = useLiveConfig();
  const level = cfg.explainLevel;
  const cycle = useCallback(() => setCfg({ explainLevel: CYCLE[level] }), [setCfg, level]);
  return (
    <button
      type="button"
      className={
        'explain-chip' + (level === 'simple' ? ' is-simple' : level === 'deep' ? ' is-deep' : '')
      }
      onClick={cycle}
      aria-label={`Explanation level: ${LABEL[level]}. Tap for ${LABEL[CYCLE[level]]}.`}
      title="How plain or rigorous the words and visuals are — or just say 'explain it simpler' / 'go deeper'"
    >
      {/* The value alone ("Standard") named no setting, so the one control in the dock that is
          not self-evident from its icon read as a mystery word. The tag says which knob this is;
          the aria-label already did. */}
      <span className="explain-chip-tag">Explain</span>
      {LABEL[level]}
    </button>
  );
}
