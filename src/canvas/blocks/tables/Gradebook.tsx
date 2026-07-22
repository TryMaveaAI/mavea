import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import { useCountUp } from '../../lib/motion';
import type { GradebookProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GradebookProps & { delay?: number };

/** Standard US letter scale from a percentage — the convention every gradebook uses. */
function letterGrade(pct: number): string {
  if (pct >= 97) return 'A+';
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 63) return 'D';
  if (pct >= 60) return 'D-';
  return 'F';
}
function gradeColor(letter: string): string {
  const base = letter[0];
  if (base === 'A') return 'var(--insight)';
  if (base === 'B') return 'var(--presence)';
  if (base === 'C') return 'var(--warning)';
  return 'var(--danger)';
}

// A class gradebook — students × assignments, each cell a score with its derived letter grade.
// Cells name their own student + assignment so alignment survives loose model output, and an
// optional trailing column rolls each student up to a class-average readout. Education,
// teaching — "how is the class doing, and where does each student stand".
export function Gradebook({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  students,
  assignments,
  cells,
  showClassAverage = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  // Stable empty-array fallbacks so a caller who omits students/assignments doesn't invalidate
  // the memo below on every render (a fresh `?? []` literal is a new reference each time).
  const roster = useMemo(() => students ?? [], [students]);
  const work = useMemo(() => assignments ?? [], [assignments]);

  const byPair = useMemo(() => {
    const key = (s: string, a: string) => `${s.trim().toLowerCase()} ${a.trim().toLowerCase()}`;
    const m = new Map<string, { score: number; maxScore: number }>();
    for (const cell of cells ?? []) {
      if (!cell?.student || !cell?.assignment || !Number.isFinite(cell.score)) continue;
      m.set(key(cell.student, cell.assignment), {
        score: cell.score,
        maxScore: cell.maxScore ?? 100,
      });
    }
    return m;
  }, [cells]);

  // Per-student average percentage across whatever assignments they have a score for, and the
  // whole-class average across every recorded cell — the two numbers a teacher checks first.
  const { avgByStudent, classAvg } = useMemo(() => {
    const perStudent = new Map<string, number>();
    const allPct: number[] = [];
    for (const student of roster) {
      const key = student.trim().toLowerCase();
      const pcts = work
        .map((a) => byPair.get(`${key} ${a.trim().toLowerCase()}`))
        .filter((v): v is { score: number; maxScore: number } => v != null)
        .map((v) => (v.score / (v.maxScore || 1)) * 100);
      if (pcts.length > 0) {
        perStudent.set(student, pcts.reduce((a, b) => a + b, 0) / pcts.length);
        allPct.push(...pcts);
      }
    }
    const overall = allPct.length > 0 ? allPct.reduce((a, b) => a + b, 0) / allPct.length : 0;
    return { avgByStudent: perStudent, classAvg: overall };
  }, [roster, work, byPair]);

  const classAvgShown = useCountUp(classAvg, { duration: 900, decimals: 0 });

  if (roster.length === 0 || work.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No students or assignments to grade" />
      </div>
    );
  }

  const hasAvgCol = showClassAverage;
  const gridCols = `minmax(128px, 1.1fr) repeat(${work.length}, minmax(104px, 1fr))${
    hasAvgCol ? ' minmax(84px, 0.6fr)' : ''
  }`;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {showClassAverage && (
          <span
            className="gb-total"
            style={{ ['--gb-c' as string]: gradeColor(letterGrade(classAvg)) } as CSSProperties}
          >
            class avg {classAvgShown}%
          </span>
        )}
      </div>

      <div className="gb-scroll">
        <div className="gb-grid" style={{ gridTemplateColumns: gridCols }} role="grid">
          <div className="gb-corner" role="columnheader" />
          {work.map((a, ai) => (
            <div key={ai} className="gb-colh" role="columnheader" title={a}>
              {a}
            </div>
          ))}
          {hasAvgCol && <div className="gb-colh gb-avg-h">Average</div>}

          {roster.map((student, si) => {
            const avg = avgByStudent.get(student);
            return (
              <div
                key={si}
                className="gb-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: si } as CSSProperties}
                role="row"
              >
                <div className="gb-rowh" role="rowheader" title={student}>
                  {student}
                </div>
                {work.map((a, ai) => {
                  const cell = byPair.get(
                    `${student.trim().toLowerCase()} ${a.trim().toLowerCase()}`,
                  );
                  if (!cell) {
                    return (
                      <div key={ai} className="gb-cell gb-empty" role="gridcell">
                        <span className="gb-dash">—</span>
                      </div>
                    );
                  }
                  const pct = (cell.score / (cell.maxScore || 1)) * 100;
                  const letter = letterGrade(pct);
                  return (
                    <div
                      key={ai}
                      className="gb-cell"
                      style={{ ['--gb-c' as string]: gradeColor(letter) } as CSSProperties}
                      role="gridcell"
                    >
                      <span className="gb-score tab-num">
                        {cell.score}/{cell.maxScore}
                      </span>
                      <span className="gb-letter">{letter}</span>
                    </div>
                  );
                })}
                {hasAvgCol && (
                  <div className="gb-cell gb-avg-cell" role="gridcell">
                    {avg != null ? (
                      <>
                        <span className="gb-score tab-num">{avg.toFixed(0)}%</span>
                        <span
                          className="gb-letter"
                          style={
                            { ['--gb-c' as string]: gradeColor(letterGrade(avg)) } as CSSProperties
                          }
                        >
                          {letterGrade(avg)}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                )}
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
