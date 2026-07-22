import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DoseLadderProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DoseLadderProps & { delay?: number };

// A medication dosing / titration visual. Three honest layers, top to bottom:
//   1. an optional weight/eGFR-based starting-dose readout — input → result with the formula shown,
//      so the computed number is auditable rather than a bare assertion;
//   2. a stepped titration ladder where each rung climbs higher than the last (the rung's height is
//      COMPUTED from its index, not the data) and the ceiling rung is marked "max";
//   3. a banded renal/hepatic adjustment lookup pairing an organ-function band with its dose change.
// Health, pharmacology, clinical reference.
export function DoseLadder({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  drug,
  route,
  computed,
  ladder,
  adjustments,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const rungs = ladder ?? [];
  // Each rung climbs a step toward the top; the visual height is derived from position, not dose
  // text, so a ladder of any length reads as a clean staircase. Floor at 38% so even rung 1 has body.
  const height = (i: number) => (rungs.length > 1 ? 38 + (i / (rungs.length - 1)) * 62 : 100);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="dl-head">
        <span className="dl-drug">{drug}</span>
        {route && <span className="dl-route">{route}</span>}
        {caption && <span className="dl-cap">{caption}</span>}
      </div>

      {computed && (
        <div className="dl-calc">
          <div className="dl-calc-side">
            <span className="dl-calc-tag">Input</span>
            <span className="dl-calc-val">{computed.input}</span>
          </div>
          <div className="dl-calc-op">
            <Icon.chevR className="ic" />
            <span className="dl-calc-formula" title={computed.formula}>
              {computed.formula}
            </span>
            <Icon.chevR className="ic" />
          </div>
          <div className="dl-calc-side dl-calc-out">
            <span className="dl-calc-tag">Starting dose</span>
            <span className="dl-calc-val">{computed.result}</span>
          </div>
        </div>
      )}

      <div className="dl-ladder">
        {rungs.map((r, i) => (
          <div
            key={i}
            className={`dl-rung ${r.ceiling ? 'ceiling' : ''}`}
            style={{ ['--dl-h' as string]: `${height(i)}%` } as CSSProperties}
          >
            <span className="dl-bar" />
            <div className="dl-rung-body">
              <div className="dl-rung-top">
                <span className="dl-step">{r.step}</span>
                <span className="dl-dose">{r.dose}</span>
                {r.ceiling && (
                  <span className="dl-ceiling-tag">
                    <Icon.alert className="ic" /> Max
                  </span>
                )}
              </div>
              {r.note && <span className="dl-note">{r.note}</span>}
            </div>
          </div>
        ))}
      </div>

      {adjustments && adjustments.length > 0 && (
        <div className="dl-adjust">
          <div className="dl-adjust-h">Dose adjustments</div>
          <ul className="dl-adjust-list">
            {adjustments.map((a, i) => (
              <li key={i} className="dl-adjust-row">
                <span className="dl-adjust-cond">{a.condition}</span>
                <span className="dl-adjust-change">{a.change}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
