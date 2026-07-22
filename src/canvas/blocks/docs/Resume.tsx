import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ResumeProps, ResumeExperience, ResumeEducation } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ResumeProps & { delay?: number };

// A formatted CV on Docview's paper-surface shell. There is no separate `title` prop for the
// card eyebrow — `name` IS the document's identity, so it fills that role directly (a resume
// is always "someone's resume", never a generically-titled card).
export function Resume({
  name,
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  contact,
  summary,
  experience,
  education,
  skills,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {name}
      </div>

      <div className="rz-paper">
        <div className="rz-head">
          <div className="rz-name">{name}</div>
          {title && <div className="rz-title">{title}</div>}
          {!!contact?.length && (
            <div className="rz-contact">
              {contact.map((c, i) => (
                <span key={i} className="rz-contact-item">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {summary && <p className="rz-summary">{summary}</p>}

        {experience.length > 0 && (
          <section className="rz-section">
            <div className="rz-section-label">Experience</div>
            <div className="rz-exp-list">
              {experience.map((e, i) => (
                <ExperienceRow key={i} exp={e} i={i} />
              ))}
            </div>
          </section>
        )}

        {!!education?.length && (
          <section className="rz-section">
            <div className="rz-section-label">Education</div>
            <div className="rz-edu-list">
              {education.map((e, i) => (
                <EducationRow key={i} ed={e} i={i} />
              ))}
            </div>
          </section>
        )}

        {!!skills?.length && (
          <section className="rz-section">
            <div className="rz-section-label">Skills</div>
            <div className="rz-skills">
              {skills.map((s, i) => (
                <span
                  key={i}
                  className="rz-skill m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  {s}
                </span>
              ))}
            </div>
          </section>
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

function ExperienceRow({ exp, i }: { exp: ResumeExperience; i: number }) {
  const range = [exp.start, exp.end || 'Present'].filter(Boolean).join(' – ');
  return (
    <div
      className="rz-exp m-stagger-item m-fade-rise"
      style={{ ['--i' as string]: i } as CSSProperties}
    >
      <div className="rz-exp-top">
        <div className="rz-exp-who">
          <span className="rz-exp-role">{exp.role}</span>
          <span className="rz-exp-org">{exp.org}</span>
        </div>
        <div className="rz-exp-when">
          <span className="rz-exp-range">{range}</span>
          {exp.location && <span className="rz-exp-loc">{exp.location}</span>}
        </div>
      </div>
      {!!exp.bullets?.length && (
        <ul className="rz-bullets">
          {exp.bullets.map((b, bi) => (
            <li key={bi}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EducationRow({ ed, i }: { ed: ResumeEducation; i: number }) {
  const range = [ed.start, ed.end].filter(Boolean).join(' – ');
  return (
    <div
      className="rz-edu m-stagger-item m-fade-rise"
      style={{ ['--i' as string]: i } as CSSProperties}
    >
      <div className="rz-exp-top">
        <div className="rz-exp-who">
          <span className="rz-exp-role">{ed.school}</span>
          <span className="rz-exp-org">{ed.credential}</span>
        </div>
        {range && (
          <div className="rz-exp-when">
            <span className="rz-exp-range">{range}</span>
          </div>
        )}
      </div>
      {ed.detail && <div className="rz-edu-detail">{ed.detail}</div>}
    </div>
  );
}
