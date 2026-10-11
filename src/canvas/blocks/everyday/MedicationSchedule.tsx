import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { timeIcon } from './timeOfDay';
import type { MedicationScheduleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MedicationScheduleProps & { delay?: number };

export function MedicationSchedule({
  title,
  icon = 'bell',
  iconColor = 'var(--presence)',
  medications,
  startDate,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {startDate && <div className="ms-start">Starting {startDate}</div>}

      <div className="ms-meds">
        {medications.map((med, i) => (
          <div key={i} className="ms-med">
            <div className="ms-med-header">
              <div className="ms-med-name">{med.name}</div>
              <div className="ms-med-dose">{med.dose}</div>
            </div>
            <div className="ms-times">
              {med.times.map((t, j) => {
                const key = timeIcon(t);
                const TIcon = Icon[key];
                return (
                  <span key={j} className="ms-time-chip">
                    <TIcon className="ic" style={{ width: 11, height: 11 }} /> {t}
                  </span>
                );
              })}
              {med.withFood && <span className="ms-food-chip">with food</span>}
            </div>
            {(med.frequency || med.notes) && (
              <div className="ms-meta">
                {med.frequency && <span className="ms-freq">{med.frequency}</span>}
                {med.notes && <span className="ms-note">{med.notes}</span>}
              </div>
            )}
          </div>
        ))}
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
