import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CaregiverCoordProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CaregiverCoordProps & { delay?: number };

// An eldercare / multi-person care-team coordination card. Distinct from medicationschedule's
// patient-self view: every section here answers "who is handling this", not just "what to take
// when" — a medication names who administers it, an appointment names the provider, and the
// contacts list is the care team itself. Each of the three sections is independently optional,
// so a caregiver tracking only appointments (say) still gets a clean card, not empty stubs.
export function CaregiverCoord({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  personName,
  relation,
  medications,
  appointments,
  contacts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const safeMeds = Array.isArray(medications) ? medications : [];
  const safeAppts = Array.isArray(appointments) ? appointments : [];
  const safeContacts = Array.isArray(contacts) ? contacts : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cg-person">
        <span className="cg-person-name">{personName}</span>
        <span className="cg-person-relation">{relation}</span>
      </div>

      <div className="cg-sections">
        {safeMeds.length > 0 && (
          <div className="cg-section">
            <div className="cg-section-label">
              <Icon.bell className="ic" style={{ width: 12, height: 12 }} /> Medications
            </div>
            <ul className="cg-list">
              {safeMeds.map((med, i) => {
                const times = Array.isArray(med?.times) ? med.times : [];
                return (
                  <li key={i} className="cg-med-row">
                    <span className="cg-med-name">{med?.name}</span>
                    <span className="cg-med-times">
                      {times.map((t, j) => (
                        <span key={j} className="cg-time-chip">
                          {t}
                        </span>
                      ))}
                    </span>
                    {med?.takenBy && <span className="cg-taken-by">{med.takenBy}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {safeAppts.length > 0 && (
          <div className="cg-section">
            <div className="cg-section-label">
              <Icon.clock className="ic" style={{ width: 12, height: 12 }} /> Appointments
            </div>
            <ul className="cg-list">
              {safeAppts.map((appt, i) => (
                <li key={i} className="cg-appt-row">
                  <span className="cg-appt-date">{appt?.date}</span>
                  <span className="cg-appt-body">
                    <span className="cg-appt-provider">{appt?.provider}</span>
                    <span className="cg-appt-purpose">{appt?.purpose}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {safeContacts.length > 0 && (
          <div className="cg-section">
            <div className="cg-section-label">
              <Icon.mail className="ic" style={{ width: 12, height: 12 }} /> Care team
            </div>
            <ul className="cg-contact-list">
              {safeContacts.map((c, i) => (
                <li key={i} className="cg-contact">
                  <span className="cg-contact-name">{c?.name}</span>
                  <span className="cg-contact-role">{c?.role}</span>
                  <span className="cg-contact-phone">{c?.phone}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
