// BendStrip — the drag handle of a bendable answer. Renders under the block it bends:
// one labeled slider plus the outputs that follow it, recomputed locally on every move
// through the whitelist evaluator. Each readout's tooltip shows the model-authored
// formula, so the math is auditable rather than magical.
import { useState, type ReactElement } from 'react';
import type { BendSpec } from '../data/conversation';
import { evaluateBend, formatBendValue } from '../lib/bend';
import './bend.css';

export function BendStrip({
  bend,
  value,
  onChange,
}: {
  bend: BendSpec;
  value?: number;
  onChange?: (value: number) => void;
}): ReactElement {
  const [localValue, setLocalValue] = useState(bend.param.value);
  const x = value ?? localValue;
  const unit = bend.param.unit ?? '';
  return (
    <div className="bend-strip" data-bend>
      <div className="bend-head">
        <span className="bend-kicker">BEND IT</span>
        <span className="bend-label">{bend.label}</span>
        <span className="bend-value">
          {formatBendValue(x)}
          {unit && <em>{unit}</em>}
        </span>
      </div>
      <input
        className="bend-slider"
        type="range"
        min={bend.param.min}
        max={bend.param.max}
        step={bend.param.step}
        value={x}
        onChange={(e) => {
          const next = Number(e.target.value);
          setLocalValue(next);
          onChange?.(next);
        }}
        aria-label={`Bend ${bend.label}`}
      />
      <ul className="bend-outputs">
        {bend.outputs.map((o) => {
          const v = evaluateBend(o.formula, x);
          if (v === null) return null;
          return (
            <li key={o.label} title={`= ${o.formula.replaceAll('x', `(${bend.label})`)}`}>
              <span className="bend-out-label">{o.label}</span>
              <span className="bend-out-value">
                {formatBendValue(v)}
                {o.unit && <em>{o.unit}</em>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
