import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CarePlanProps, CarePlanEntry } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CarePlanProps & { delay?: number };

// Outcome chrome per evaluation status. A goal that's been met reads as the calm "good" accent;
// partial holds attention in warning; ongoing is the neutral, in-progress presence tone.
const STATUS: Record<NonNullable<CarePlanEntry['status']>, { color: string; label: string }> = {
  met: { color: 'var(--insight)', label: 'Met' },
  partial: { color: 'var(--warning)', label: 'Partial' },
  ongoing: { color: 'var(--presence)', label: 'Ongoing' },
};

// A nursing care-plan board. Each entry is one patient problem, read left→right through the nursing
// process — Assessment/Dx → Goal → Interventions → Rationale → Evaluation. The columns share a grid
// so the whole plan aligns as a single board, and each goal carries an outcome chip so "where does
// this stand" reads at a glance. Health, nursing, clinical education.
export function CarePlan({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  entries,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const rows = entries ?? [];

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
      {caption && <div className="fs-cap">{caption}</div>}

      <div className="cp-scroll">
        <div className="cp-grid" role="table">
          <div className="cp-head" role="row">
            <span className="cp-colh" role="columnheader">
              Assessment / Dx
            </span>
            <span className="cp-colh" role="columnheader">
              Goal
            </span>
            <span className="cp-colh" role="columnheader">
              Interventions
            </span>
            <span className="cp-colh" role="columnheader">
              Rationale
            </span>
          </div>

          {rows.map((e, i) => {
            // Default an unspecified outcome to "ongoing" — a plan in progress, not a silent gap.
            const s = STATUS[e.status ?? 'ongoing'];
            return (
              <div
                key={i}
                className="cp-row"
                role="row"
                style={{ ['--cp-c' as string]: s.color } as CSSProperties}
              >
                <div className="cp-cell cp-assess" role="cell">
                  <span className="cp-assess-text">{e.assessment}</span>
                  {e.diagnosis && <span className="cp-dx">{e.diagnosis}</span>}
                </div>

                <div className="cp-cell cp-goal" role="cell">
                  <span className="cp-goal-text">{e.goal}</span>
                  <span className="cp-status">
                    <span className="cp-status-dot" />
                    {s.label}
                  </span>
                </div>

                <div className="cp-cell" role="cell">
                  <ul className="cp-intervs">
                    {(e.interventions ?? []).map((iv, k) => (
                      <li key={k} className="cp-interv">
                        {iv}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="cp-cell cp-rationale" role="cell">
                  {e.rationale || <span className="cp-dash">—</span>}
                </div>
              </div>
            );
          })}
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
