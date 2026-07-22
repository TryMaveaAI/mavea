import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import { useCountUp } from '../../lib/motion';
import type { RubricProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RubricProps & { delay?: number };

// Loose model output can put a number (or worse) where a string is expected — coerce rather
// than let `.trim()` throw.
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

// A grading rubric — criteria × performance levels, each cell the prose describing what that
// level looks like. Cells name their own criterion + level so alignment survives loose model
// output; the level actually earned gets a presence-tinted background and a check glyph, and an
// optional trailing score column totals the result. Education, hiring, any structured
// evaluation — "how is this graded, and where did the points come from".
export function Rubric({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  criteria,
  levels,
  cells,
  scores,
  maxScore,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  // criteria/levels are plain string arrays with no itemShapes entry to repair them, so a
  // loose model reply that sends a single string instead of a one-item array reaches here
  // unnormalized — coerce defensively rather than let `.map` throw on a bare string.
  const rows = Array.isArray(criteria) ? criteria : criteria ? [String(criteria)] : [];
  const cols = Array.isArray(levels) ? levels : levels ? [String(levels)] : [];

  const byPair = useMemo(() => {
    const key = (c: string, l: string) =>
      `${str(c).trim().toLowerCase()} ${str(l).trim().toLowerCase()}`;
    const m = new Map<string, { descriptor: string; achieved?: boolean }>();
    for (const cell of cells ?? []) {
      if (!cell?.criterion || !cell?.level) continue;
      m.set(key(cell.criterion, cell.level), {
        descriptor: cell.descriptor,
        achieved: cell.achieved,
      });
    }
    return m;
  }, [cells]);

  // A confused model can send a bare number for `scores` (it does read like a scalar count) —
  // guard the array read so that reaches an empty state instead of throwing on `.reduce`.
  // Memoized so a stable empty-array fallback doesn't invalidate the dependent memos below
  // on every render (a fresh `[]` literal is a new reference each time).
  const safeScores = useMemo(() => (Array.isArray(scores) ? scores : []), [scores]);

  const scoreByCriterion = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of safeScores) {
      if (!s?.criterion) continue;
      m.set(str(s.criterion).trim().toLowerCase(), s.score);
    }
    return m;
  }, [safeScores]);

  const hasScores = safeScores.length > 0;
  const total = useMemo(
    () => safeScores.reduce((sum, s) => sum + (Number.isFinite(s.score) ? s.score : 0), 0),
    [safeScores],
  );
  const totalMax = maxScore != null ? maxScore * rows.length : undefined;
  const totalShown = useCountUp(total, { duration: 900, decimals: total % 1 === 0 ? 0 : 1 });

  if (rows.length === 0 || cols.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No criteria or levels to score" />
      </div>
    );
  }

  const gridCols = `minmax(130px, 1.1fr) repeat(${cols.length}, minmax(150px, 1fr))${
    hasScores ? ' minmax(64px, 0.5fr)' : ''
  }`;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {hasScores && (
          <span className="rub-total">
            {totalShown}
            {totalMax != null ? ` / ${totalMax}` : ''} pts
          </span>
        )}
      </div>

      <div className="rub-scroll">
        <div className="rub-grid" style={{ gridTemplateColumns: gridCols }} role="grid">
          <div className="rub-corner" role="columnheader" />
          {cols.map((l, li) => (
            <div key={li} className="rub-colh" role="columnheader" title={str(l)}>
              {str(l)}
            </div>
          ))}
          {hasScores && <div className="rub-colh rub-score-h">Score</div>}

          {rows.map((criterion, ci) => {
            const key = str(criterion).trim().toLowerCase();
            const score = scoreByCriterion.get(key);
            return (
              <div
                key={ci}
                className="rub-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: ci } as CSSProperties}
                role="row"
              >
                <div className="rub-rowh" role="rowheader" title={str(criterion)}>
                  {str(criterion)}
                </div>
                {cols.map((level, li) => {
                  const cell = byPair.get(`${key} ${str(level).trim().toLowerCase()}`);
                  return (
                    <div
                      key={li}
                      className={'rub-cell' + (cell?.achieved ? ' achieved' : '')}
                      role="gridcell"
                    >
                      {cell?.achieved && <Icon.check className="ic rub-check" />}
                      <span className="rub-desc">{cell?.descriptor || '—'}</span>
                    </div>
                  );
                })}
                {hasScores && (
                  <div className="rub-cell rub-score-cell" role="gridcell">
                    {score != null ? (
                      <span className="tab-num">
                        {score}
                        {maxScore != null ? `/${maxScore}` : ''}
                      </span>
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
