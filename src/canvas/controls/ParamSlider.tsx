import type { CSSProperties } from 'react';
import type { AccentVar } from '../../data/conversation';

export interface ParamSliderProps {
  /** Short control label, e.g. "Volume" or "Threshold". */
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  /** Format the live value readout (defaults to a locale number). */
  format?: (value: number) => string;
  /** Accent token for the filled track + thumb. */
  color?: AccentVar;
}

/**
 * A token-styled range slider for "what-if" exploration. Built on a native `<input type="range">`
 * so it is keyboard-operable and screen-reader-labelled for free (the `BendStrip` idiom). Only use
 * it where the recompute is a pure deterministic function of the data the model already supplied —
 * never to invent underlying data.
 */
export function ParamSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format,
  color = 'var(--presence)',
}: ParamSliderProps) {
  const span = max - min || 1;
  const pct = ((value - min) / span) * 100;
  return (
    <label
      className="viz-ctl"
      style={{ ['--ctl-c' as string]: color, ['--ctl-pct' as string]: pct + '%' } as CSSProperties}
    >
      <span className="viz-ctl-label">{label}</span>
      <input
        type="range"
        className="viz-ctl-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="viz-ctl-val tab-num">{format ? format(value) : value.toLocaleString()}</span>
    </label>
  );
}
