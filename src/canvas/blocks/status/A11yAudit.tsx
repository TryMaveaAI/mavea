import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { A11yAuditProps, A11yStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = A11yAuditProps & { delay?: number };

// pass reads good (insight), warn reads caution, fail reads danger. The badge glyph
// matches: a tick for pass, an alert for warn, an x for fail.
const META: Record<A11yStatus, { c: string; label: string; icon: keyof typeof Icon }> = {
  pass: { c: 'var(--insight)', label: 'Pass', icon: 'check' },
  warn: { c: 'var(--warning)', label: 'Warn', icon: 'alert' },
  fail: { c: 'var(--danger)', label: 'Fail', icon: 'x' },
};
const ORDER: A11yStatus[] = ['fail', 'warn', 'pass'];

export function A11yAudit({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  checks,
  score,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const rows = checks ?? [];

  const counts = ORDER.reduce<Record<A11yStatus, number>>(
    (m, s) => {
      m[s] = rows.filter((r) => r.status === s).length;
      return m;
    },
    { fail: 0, warn: 0, pass: 0 },
  );
  // The banner reflects the worst level present, so a single failure never hides
  // behind a wall of green.
  const worst: A11yStatus = counts.fail > 0 ? 'fail' : counts.warn > 0 ? 'warn' : 'pass';
  const allPass = rows.length > 0 && counts.pass === rows.length;
  const summary = allPass ? 'All checks pass' : `${counts.pass}/${rows.length} checks pass`;

  // Mavéa's gesture circles the most newsworthy row: the first failure, else the
  // first warning, else the first row.
  const salient = (() => {
    for (const lvl of ['fail', 'warn'] as A11yStatus[]) {
      const i = rows.findIndex((r) => r.status === lvl);
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

      <div className="a11-banner" style={{ ['--a11-c' as string]: META[worst].c } as CSSProperties}>
        <span className="a11-banner-dot" />
        <span className="a11-banner-text">{summary}</span>
        {score && <span className="a11-score tab-num">{score}</span>}
      </div>

      {rows.length > 0 && (
        <div className="a11-tally">
          {ORDER.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className="a11-tally-pill"
              style={{ ['--a11-c' as string]: META[s].c } as CSSProperties}
            >
              <span className="a11-tally-dot" />
              <span className="a11-tally-n tab-num">{counts[s]}</span>
              <span className="a11-tally-label">{META[s].label}</span>
            </span>
          ))}
        </div>
      )}

      <ul className="a11-list">
        {rows.map((r, i) => {
          // A model can emit a status outside our enum (a typo, "warning"); fall back to
          // the neutral 'warn' styling rather than crashing on META[unknown].
          const m = META[r.status] ?? META.warn;
          const BadgeIcon = Icon[m.icon] || Icon.alert;
          return (
            <li className="a11-row" key={i} style={{ ['--a11-c' as string]: m.c } as CSSProperties}>
              <span
                className={`a11-badge ${r.status}`}
                data-mark={i === salient ? 'circle' : undefined}
              >
                <BadgeIcon className="ic a11-badge-ic" style={{ width: 13, height: 13 }} />
              </span>
              <span className="a11-body">
                <span className="a11-top">
                  <span className="a11-label">{r.label}</span>
                  <span className="a11-state">{m.label}</span>
                </span>
                {r.note && <span className="a11-note faint">{r.note}</span>}
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="a11-empty faint">No checks to report.</li>}
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
