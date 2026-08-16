// LeverRail.tsx — the causes a reader may push on. One slider per root cause, in percent of its
// own observed strength: 100% is the world as measured, so the rail starts inert and Reset stays
// disabled until something has actually been moved. Built on ParamSlider, so every lever is
// keyboard-operable and labelled for free.
import { memo, type ReactElement } from 'react';
import { ParamSlider } from '../../canvas/controls/ParamSlider';
import './trust.css';

/** A lever at rest: the cause at its full, observed strength. */
export const FULL_PCT = 100;

export interface Lever {
  id: string;
  label: string;
  /** 0–100 percent of the cause's own strength. */
  pct: number;
}

interface LeverRailProps {
  levers: Lever[];
  onSet: (id: string, pct: number) => void;
  onReset: () => void;
}

/** Why there is nothing to pull. A bare "WHAT IF" over empty space reads as a section that failed
 *  to load; the answer is that the web has no established cause yet, which is a real state — an
 *  outcome can arrive before anything behind it does — and worth one line. */
const NO_CAUSES = 'No cause is established yet, so there is nothing to push on.';

function LeverRailView({ levers, onSet, onReset }: LeverRailProps): ReactElement {
  const untouched = levers.every((l) => l.pct === FULL_PCT);
  return (
    <div className="tr-levers">
      <div className="tr-levers-head">
        <h3 className="tr-sec-title">WHAT IF</h3>
        <button type="button" className="tr-reset" onClick={onReset} disabled={untouched}>
          Reset
        </button>
      </div>
      {levers.length === 0 && <p className="tr-levers-empty">{NO_CAUSES}</p>}
      {levers.map((l) => (
        <ParamSlider
          key={l.id}
          label={l.label}
          min={0}
          max={FULL_PCT}
          value={l.pct}
          onChange={(v) => onSet(l.id, v)}
          format={(v) => `${v}%`}
        />
      ))}
    </div>
  );
}

/** Memoized: the rail lives beside a spatial canvas whose camera state re-renders its host on
 *  every frame of a pan, and none of that has anything to do with the levers. */
export const LeverRail = memo(LeverRailView);
