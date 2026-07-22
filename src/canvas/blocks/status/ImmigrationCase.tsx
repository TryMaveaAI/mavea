import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ImmigrationcaseProps, ImmigrationStage, ImmigrationStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ImmigrationcaseProps & { delay?: number };

const META: Record<ImmigrationStatus, { c: string; label: string }> = {
  done: { c: 'var(--insight)', label: 'Done' },
  current: { c: 'var(--presence)', label: 'In progress' },
  pending: { c: 'var(--text-muted)', label: 'Pending' },
  failed: { c: 'var(--danger)', label: 'Denied' },
};
const ORDER: ImmigrationStatus[] = ['current', 'failed', 'done', 'pending'];

// A model can emit a status outside our enum (a typo); fall back to the neutral 'pending'
// styling rather than crashing the META lookup.
function normStatus(s: unknown): ImmigrationStatus {
  return s === 'done' || s === 'current' || s === 'pending' || s === 'failed' ? s : 'pending';
}

// Real calendar math against the caller's own date, nothing invented — the same "how far
// from right now" a paper wall calendar would show. Null for an unparseable/missing date.
function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? Math.ceil((t - Date.now()) / 86_400_000) : null;
}

export function ImmigrationCase({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  visaCategory,
  stages,
  priorityDate,
  rfeDeadline,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const rows: ImmigrationStage[] = Array.isArray(stages) ? stages : [];

  // Mavéa's gesture circles the most newsworthy stage: the current one, else a denial,
  // else the most recently completed one, else the first.
  const salient = (() => {
    for (const s of ORDER) {
      const i = rows.findIndex((r) => normStatus(r.status) === s);
      if (i !== -1) return i;
    }
    return 0;
  })();

  const rfeDays = daysUntil(rfeDeadline);
  const rfeTone =
    rfeDays == null
      ? 'var(--presence)'
      : rfeDays < 0
        ? 'var(--danger)'
        : rfeDays <= 30
          ? 'var(--warning)'
          : 'var(--insight)';
  const rfeCountdown =
    rfeDays == null
      ? null
      : rfeDays < 0
        ? `${Math.abs(rfeDays)}d overdue`
        : rfeDays === 0
          ? 'due today'
          : `${rfeDays}d left`;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(visaCategory || priorityDate) && (
        <div className="imc-sub">
          {visaCategory && <span className="imc-visa">{visaCategory}</span>}
          {priorityDate && (
            <span className="imc-priority faint">
              Priority date <span className="tab-num">{priorityDate}</span>
            </span>
          )}
        </div>
      )}

      <div className="imc-list">
        {rows.map((s, i) => {
          const status = normStatus(s.status);
          const meta = META[status];
          return (
            <div
              className="imc-row m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: i, ['--ev-c' as string]: meta.c } as CSSProperties}
            >
              <span className="imc-rail">
                <span
                  className={`imc-node ${status}`}
                  data-mark={i === salient ? 'circle' : undefined}
                >
                  {status === 'done' && <Icon.check className="ic" />}
                  {status === 'failed' && <Icon.x className="ic" />}
                  {status === 'current' && <span className="imc-pulse" />}
                </span>
              </span>
              <span className="imc-body">
                <span className="imc-top">
                  <span className="imc-label">{s.name}</span>
                  {s.date && <span className="imc-date faint tab-num">{s.date}</span>}
                </span>
                <span className="imc-state">{meta.label}</span>
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <div className="imc-empty faint">No stages recorded.</div>}
      </div>

      {rfeDeadline && (
        <div className="imc-rfe" style={{ ['--rfe-c' as string]: rfeTone } as CSSProperties}>
          <span className="imc-rfe-dot" />
          <span className="imc-rfe-text">
            RFE response due <span className="tab-num">{rfeDeadline}</span>
          </span>
          {rfeCountdown && <span className="imc-rfe-countdown">{rfeCountdown}</span>}
        </div>
      )}

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
