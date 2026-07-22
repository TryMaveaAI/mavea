import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { InterviewScorecardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = InterviewScorecardProps & { delay?: number };

// Loose model output can put a number (or worse) where a string is expected — coerce rather
// than let `.trim()` throw.
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Band a rating within [min, max] into the low/mid/high accent a hiring panel scans for —
 *  the same 3-stop read as a risk heat map, just inverted (high is good here). */
function ratingColor(rating: number, min: number, max: number): string {
  const span = max - min || 1;
  const t = Math.max(0, Math.min(1, (rating - min) / span));
  if (t >= 0.66) return 'var(--insight)';
  if (t >= 0.33) return 'var(--warning)';
  return 'var(--danger)';
}

// An HR interview evaluation — candidates × criteria, each cell a numeric rating (color-scaled
// across the scale) with an optional note. A structural clone of clearancematrix: cells name
// their own candidate + criterion, so a rating lands in the right square regardless of emit
// order. Hiring, people ops — "how did the panel score each candidate".
export function InterviewScorecard({
  title,
  icon = 'chat',
  iconColor = 'var(--presence)',
  candidates,
  criteria,
  cells,
  scale,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chat;
  // Stable empty-array fallbacks so a caller who omits candidates/criteria doesn't invalidate
  // the memos below on every render (a fresh `?? []` literal is a new reference each time).
  // Also defends against a loose model reply sending a bare string instead of a one-item array.
  const people = useMemo(
    () => (Array.isArray(candidates) ? candidates : candidates ? [String(candidates)] : []),
    [candidates],
  );
  const dims = useMemo(
    () => (Array.isArray(criteria) ? criteria : criteria ? [String(criteria)] : []),
    [criteria],
  );
  const min = scale?.min ?? 1;
  const max = scale?.max ?? 5;

  const byPair = useMemo(() => {
    const key = (c: unknown, d: unknown) =>
      `${str(c).trim().toLowerCase()} ${str(d).trim().toLowerCase()}`;
    const m = new Map<string, { rating: number; note?: string }>();
    for (const cell of cells ?? []) {
      if (!cell?.candidate || !cell?.criterion || !Number.isFinite(cell.rating)) continue;
      m.set(key(cell.candidate, cell.criterion), { rating: cell.rating, note: cell.note });
    }
    return m;
  }, [cells]);

  // Per-candidate average across the criteria they were actually scored on — the one number a
  // panel scans first when comparing candidates.
  const avgByCandidate = useMemo(() => {
    const m = new Map<string, number>();
    for (const person of people) {
      const key = str(person).trim().toLowerCase();
      const ratings = dims
        .map((d) => byPair.get(`${key} ${str(d).trim().toLowerCase()}`)?.rating)
        .filter((v): v is number => v != null);
      if (ratings.length > 0) m.set(person, ratings.reduce((a, b) => a + b, 0) / ratings.length);
    }
    return m;
  }, [people, dims, byPair]);

  if (people.length === 0 || dims.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No candidates or criteria to score" />
      </div>
    );
  }

  const gridCols = `minmax(128px, 1.1fr) repeat(${dims.length}, minmax(130px, 1fr))`;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="isc-scroll">
        <div className="isc-grid" style={{ gridTemplateColumns: gridCols }} role="grid">
          <div className="isc-corner" role="columnheader" />
          {dims.map((d, di) => (
            <div key={di} className="isc-colh" role="columnheader" title={str(d)}>
              {str(d)}
            </div>
          ))}

          {people.map((person, pi) => {
            const avg = avgByCandidate.get(person);
            return (
              <div
                key={pi}
                className="isc-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: pi } as CSSProperties}
                role="row"
              >
                <div className="isc-rowh" role="rowheader" title={str(person)}>
                  <span className="isc-name">{str(person)}</span>
                  {avg != null && (
                    <span
                      className="isc-avg"
                      style={{ ['--isc-c' as string]: ratingColor(avg, min, max) } as CSSProperties}
                    >
                      {avg.toFixed(1)}
                    </span>
                  )}
                </div>
                {dims.map((d, di) => {
                  const cell = byPair.get(
                    `${str(person).trim().toLowerCase()} ${str(d).trim().toLowerCase()}`,
                  );
                  if (!cell) {
                    return (
                      <div key={di} className="isc-cell isc-empty" role="gridcell">
                        <span className="isc-dash">—</span>
                      </div>
                    );
                  }
                  const c = ratingColor(cell.rating, min, max);
                  return (
                    <div
                      key={di}
                      className="isc-cell"
                      style={{ ['--isc-c' as string]: c } as CSSProperties}
                      role="gridcell"
                    >
                      <span className="isc-badge tab-num">
                        {cell.rating}
                        <span className="isc-scale">/{max}</span>
                      </span>
                      {cell.note && <span className="isc-note">{cell.note}</span>}
                    </div>
                  );
                })}
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
