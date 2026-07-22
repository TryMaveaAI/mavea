import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LessonplanProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LessonplanProps & { delay?: number };

export function Lessonplan({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  subject,
  gradeLevel,
  duration,
  objectives,
  materials,
  procedure,
  assessment,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  // Falls back to the procedure's own time budget when no overall duration was given, so a
  // plan built step-by-step still shows an honest total instead of an empty meta row.
  const totalMinutes = procedure.reduce((sum, p) => sum + (p.minutes || 0), 0);
  const shownDuration = duration || (totalMinutes > 0 ? `${totalMinutes} min` : undefined);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lp-paper">
        {(subject || gradeLevel || shownDuration) && (
          <div className="lp-meta">
            {subject && <span className="lp-meta-chip">{subject}</span>}
            {gradeLevel && <span className="lp-meta-chip">{gradeLevel}</span>}
            {shownDuration && <span className="lp-meta-chip">{shownDuration}</span>}
          </div>
        )}

        {objectives.length > 0 && (
          <section className="lp-section">
            <div className="lp-section-label">Objectives</div>
            <ul className="lp-list">
              {objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </section>
        )}

        {!!materials?.length && (
          <section className="lp-section">
            <div className="lp-section-label">Materials</div>
            <div className="lp-materials">
              {materials.map((m, i) => (
                <span key={i} className="lp-material">
                  {m}
                </span>
              ))}
            </div>
          </section>
        )}

        {procedure.length > 0 && (
          <section className="lp-section">
            <div className="lp-section-label">Procedure</div>
            <div className="lp-steps">
              {procedure.map((p, i) => (
                <div
                  key={i}
                  className="lp-step m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <span className="lp-step-num">{i + 1}</span>
                  <div className="lp-step-body">
                    <div className="lp-step-top">
                      <span className="lp-step-text">{p.step}</span>
                      {!!p.minutes && <span className="lp-step-min">{p.minutes} min</span>}
                    </div>
                    {p.detail && <div className="lp-step-detail">{p.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {assessment && (
          <section className="lp-section">
            <div className="lp-section-label">Assessment</div>
            <div className="lp-assessment">{assessment}</div>
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
