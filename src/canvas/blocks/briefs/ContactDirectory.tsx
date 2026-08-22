import { BriefFrame, ScopeNote } from './BriefFrame';
import type { ContactDirectoryProps } from './types';

export function ContactDirectory({
  entries,
  privacyNote,
  ...frame
}: ContactDirectoryProps & { delay?: number }) {
  const supplementalPrivacyNote = privacyNote?.trim();

  return (
    <BriefFrame {...frame} className="brf-directory">
      <div className="brf-contact-grid">
        {entries.map((entry, index) => (
          <article key={index}>
            <div className="brf-avatar" aria-hidden="true">
              {entry.name.trim().charAt(0).toUpperCase() || '•'}
            </div>
            <div className="brf-contact-body">
              <strong>{entry.name}</strong>
              {(entry.role || entry.organization) && (
                <span>{[entry.role, entry.organization].filter(Boolean).join(' · ')}</span>
              )}
              <dl>
                {entry.methods.map((method, methodIndex) => (
                  <div key={methodIndex}>
                    <dt>{method.label}</dt>
                    <dd>{method.value}</dd>
                  </div>
                ))}
              </dl>
              {entry.availability && <small>{entry.availability}</small>}
              {entry.note && <p>{entry.note}</p>}
            </div>
          </article>
        ))}
      </div>
      <ScopeNote>
        Share personal contact information only with the intended recipients.
        {supplementalPrivacyNote ? ` ${supplementalPrivacyNote}` : ''}
      </ScopeNote>
    </BriefFrame>
  );
}
