import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { UsabilityfindingsProps, UsabilityIssue, UsabilitySeverity } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = UsabilityfindingsProps & { delay?: number };

const META: Record<UsabilitySeverity, { c: string; label: string; letter: string }> = {
  critical: { c: 'var(--danger)', label: 'Critical', letter: 'C' },
  major: { c: 'var(--warning)', label: 'Major', letter: 'M' },
  minor: { c: 'var(--text-muted)', label: 'Minor', letter: 'm' },
};
const ORDER: UsabilitySeverity[] = ['critical', 'major', 'minor'];

// A model can emit a severity outside our enum (a typo, "high"); fall back to the neutral
// 'major' tier rather than crashing the META lookup.
function normSeverity(s: unknown): UsabilitySeverity {
  return s === 'critical' || s === 'major' || s === 'minor' ? s : 'major';
}

export function Usabilityfindings({
  title,
  icon = 'eye',
  iconColor = 'var(--presence)',
  taskSuccessRate,
  avgTimeOnTask,
  issues,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.eye;
  const rows: UsabilityIssue[] = Array.isArray(issues) ? issues : [];

  const counts = ORDER.reduce<Record<UsabilitySeverity, number>>(
    (m, s) => {
      m[s] = rows.filter((r) => normSeverity(r.severity) === s).length;
      return m;
    },
    { critical: 0, major: 0, minor: 0 },
  );
  const worst: UsabilitySeverity =
    counts.critical > 0 ? 'critical' : counts.major > 0 ? 'major' : 'minor';
  const summary =
    rows.length === 0
      ? 'No usability issues found'
      : `${rows.length} issue${rows.length === 1 ? '' : 's'} found` +
        (counts.critical > 0 ? `, ${counts.critical} critical` : '');

  const successPct = Number.isFinite(taskSuccessRate)
    ? Math.round(Math.min(100, Math.max(0, taskSuccessRate as number)))
    : null;

  // Mavéa's gesture circles the most newsworthy row: the first critical issue, else the
  // first major one, else the first row.
  const salient = (() => {
    for (const lvl of ['critical', 'major'] as UsabilitySeverity[]) {
      const i = rows.findIndex((r) => normSeverity(r.severity) === lvl);
      if (i !== -1) return i;
    }
    return 0;
  })();

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(successPct != null || avgTimeOnTask) && (
        <div className="uf-stats">
          {successPct != null && (
            <span className="uf-stat">
              <span className="uf-stat-val tab-num">{successPct}%</span>
              <span className="uf-stat-label faint">task success</span>
            </span>
          )}
          {avgTimeOnTask && (
            <span className="uf-stat">
              <span className="uf-stat-val tab-num">{avgTimeOnTask}</span>
              <span className="uf-stat-label faint">avg time on task</span>
            </span>
          )}
        </div>
      )}

      <div className="uf-banner" style={{ ['--uf-c' as string]: META[worst].c } as CSSProperties}>
        <span className="uf-banner-dot" />
        <span className="uf-banner-text">{summary}</span>
      </div>

      {rows.length > 0 && (
        <div className="uf-tally">
          {ORDER.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className="uf-tally-pill"
              style={{ ['--uf-c' as string]: META[s].c } as CSSProperties}
            >
              <span className="uf-tally-dot" />
              <span className="uf-tally-n tab-num">{counts[s]}</span>
              <span className="uf-tally-label">{META[s].label}</span>
            </span>
          ))}
        </div>
      )}

      <ul className="uf-list">
        {rows.map((r, i) => {
          const sev = normSeverity(r.severity);
          const m = META[sev];
          const affected = Number.isFinite(r.affectedUsers)
            ? Math.max(0, r.affectedUsers as number)
            : null;
          return (
            <li
              className="uf-row m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: i, ['--uf-c' as string]: m.c } as CSSProperties}
            >
              <span className="uf-badge" data-mark={i === salient ? 'circle' : undefined}>
                {m.letter}
              </span>
              <span className="uf-body">
                <span className="uf-top">
                  <span className="uf-label">{r.label}</span>
                  <span className="uf-state">{m.label}</span>
                </span>
                {(affected != null || r.note) && (
                  <span className="uf-note faint">
                    {affected != null && (
                      <span className="uf-affected tab-num">
                        {affected} user{affected === 1 ? '' : 's'}
                      </span>
                    )}
                    {affected != null && r.note ? ' · ' : ''}
                    {r.note}
                  </span>
                )}
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="uf-empty faint">No issues to report.</li>}
      </ul>

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
