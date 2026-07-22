import { type CSSProperties } from 'react';
import { richInnerHtml } from '../../../lib/richText';
import { Icon } from '../../../icons/icons';
import type {
  LabProtocolProps,
  ProtocolCycleStep,
  ProtocolReagent,
  ProtocolStep,
  ReagentHazard,
} from './types';

type Props = LabProtocolProps & { delay?: number };

const HAZARD_LABEL: Record<ReagentHazard, string> = {
  flammable: 'Flammable',
  corrosive: 'Corrosive',
  toxic: 'Toxic',
  oxidizer: 'Oxidizer',
  irritant: 'Irritant',
};

// Corrosive and toxic reagents can cause severe, sometimes irreversible harm on contact or
// exposure — the danger token. Flammable, oxidizer, and irritant call for real caution but not
// that severity, so they share the milder warning token (mirrors ReactionMechanism's convention
// of tinting an unstable intermediate with `var(--warning)`).
const SEVERE_HAZARDS: ReadonlySet<ReagentHazard> = new Set(['corrosive', 'toxic']);

function CondChip({
  duration,
  temp,
  small,
}: {
  duration?: string;
  temp?: string;
  small?: boolean;
}) {
  if (!duration && !temp) return null;
  return (
    <span className={`labp-cond${small ? ' labp-cond--sm' : ''}`}>
      {duration}
      {duration && temp ? ' · ' : ''}
      {temp}
    </span>
  );
}

// A lab-bench procedure/SOP: hazard-tagged reagents and equipment beside numbered steps,
// general enough for a chemistry synthesis prep or a molecular-biology protocol. A `cycles`
// group — repeated sub-steps run some number of times — renders as its own bracketed section
// so a thermal-cycling protocol (PCR, a Western blot wash) reads as distinct from an ordinary
// linear procedure instead of just more numbered steps.
export function LabProtocol({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  reagents,
  equipment,
  steps,
  cycles,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const safeReagents: ProtocolReagent[] = Array.isArray(reagents) ? reagents : [];
  const safeEquipment: string[] = Array.isArray(equipment) ? equipment : [];
  const safeSteps: ProtocolStep[] = Array.isArray(steps) ? steps : [];
  const cycleSteps: ProtocolCycleStep[] = cycles && Array.isArray(cycles.steps) ? cycles.steps : [];
  // A repeat count must be a real positive integer to mean anything on the card — a fractional,
  // zero, or negative value from a loose model payload collapses the whole group rather than
  // rendering a nonsensical "Repeat ×0" or "Repeat ×-3" label.
  const repeatCount =
    cycles && Number.isFinite(cycles.repeat) && cycles.repeat > 0 ? Math.round(cycles.repeat) : 0;
  const hasCycle = cycleSteps.length > 0 && repeatCount > 0;
  const hasSidebar = safeReagents.length > 0 || safeEquipment.length > 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className={hasSidebar ? 'labp-body' : 'labp-body labp-body--full'}>
        {hasSidebar && (
          <div className="labp-sidebar">
            {safeReagents.length > 0 && (
              <div className="labp-section">
                <div className="labp-section-label">Reagents</div>
                <ul className="labp-reagent-list">
                  {safeReagents.map((r, i) => (
                    <li key={i} className="labp-reagent">
                      <div className="labp-reagent-row">
                        {(r.amount || r.conc) && (
                          <span className="labp-reagent-qty">
                            {r.amount}
                            {r.amount && r.conc ? ' · ' : ''}
                            {r.conc}
                          </span>
                        )}
                        <span className="labp-reagent-name">{r.name}</span>
                      </div>
                      {r.hazard && HAZARD_LABEL[r.hazard] && (
                        <span
                          className={
                            SEVERE_HAZARDS.has(r.hazard)
                              ? 'labp-hazard labp-hazard--danger'
                              : 'labp-hazard labp-hazard--warning'
                          }
                        >
                          <Icon.alert className="ic" style={{ width: 10, height: 10 }} />
                          {HAZARD_LABEL[r.hazard]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {safeEquipment.length > 0 && (
              <div className="labp-section">
                <div className="labp-section-label">Equipment</div>
                <ul className="labp-equip-list">
                  {safeEquipment.map((e, i) => (
                    <li key={i} className="labp-equip">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="labp-procedure">
          <div className="labp-section-label">Procedure</div>
          <ol className="labp-step-list">
            {safeSteps.map((s, i) => (
              <li
                key={i}
                className="labp-step m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span className="labp-step-num">{i + 1}</span>
                <div className="labp-step-body">
                  <div className="labp-step-row">
                    <span className="labp-step-text">{s.text}</span>
                    <CondChip duration={s.duration} temp={s.temp} />
                  </div>
                  {s.caution && (
                    <div className="labp-caution">
                      <Icon.alert className="ic" style={{ width: 11, height: 11 }} /> {s.caution}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {hasCycle && (
            <div className="labp-cycle">
              <div className="labp-cycle-header">
                <Icon.refresh className="ic" />
                <span>Repeat ×{repeatCount}</span>
              </div>
              <ol className="labp-cycle-list">
                {cycleSteps.map((s, i) => (
                  <li key={i} className="labp-cycle-step">
                    <span className="labp-cycle-num">{i + 1}</span>
                    <span className="labp-cycle-text">{s.text}</span>
                    <CondChip duration={s.duration} temp={s.temp} small />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

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
