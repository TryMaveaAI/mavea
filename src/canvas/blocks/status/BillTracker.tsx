import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BilltrackerProps, BillStage, BillStageStatus, BillVoteTally } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BilltrackerProps & { delay?: number };

const STATUS_META: Record<BillStageStatus, { c: string; label: string }> = {
  done: { c: 'var(--insight)', label: 'Passed' },
  current: { c: 'var(--presence)', label: 'In progress' },
  pending: { c: 'var(--text-muted)', label: 'Pending' },
  failed: { c: 'var(--danger)', label: 'Failed' },
};

// A model can emit a status outside our enum (a typo, "active"); fall back to the neutral
// 'pending' styling rather than crashing on STATUS_META[unknown].
function normStatus(s: unknown): BillStageStatus {
  return s === 'done' || s === 'current' || s === 'pending' || s === 'failed' ? s : 'pending';
}

// A recorded vote is only shown once both counts are real, finite numbers — a partial or
// malformed tally renders no chip at all rather than a "NaN–NaN" line.
function safeTally(v: BillVoteTally | undefined): { yea: number; nay: number } | null {
  if (!v || typeof v.yea !== 'number' || typeof v.nay !== 'number') return null;
  if (!Number.isFinite(v.yea) || !Number.isFinite(v.nay)) return null;
  return { yea: v.yea, nay: v.nay };
}

export function BillTracker({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  bill,
  stages,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const rows: BillStage[] = Array.isArray(stages) ? stages : [];

  // Once a stage has failed the bill is dead — every later stage is moot regardless of
  // whatever status it was individually given, so the rail visually terminates there.
  const deadIdx = rows.findIndex((s) => normStatus(s.status) === 'failed');
  const currentIdx = rows.findIndex((s) => normStatus(s.status) === 'current');
  const allDone = rows.length > 0 && rows.every((s) => normStatus(s.status) === 'done');

  const banner = (() => {
    if (deadIdx !== -1) {
      const name = rows[deadIdx]?.name || 'this stage';
      return { text: `Failed at ${name}`, c: STATUS_META.failed.c };
    }
    if (currentIdx !== -1) {
      const name = rows[currentIdx]?.name || 'this stage';
      return { text: `Currently at ${name}`, c: STATUS_META.current.c };
    }
    if (allDone) {
      const last = rows[rows.length - 1]?.name;
      return { text: last ? `Signed — ${last}` : 'Signed into law', c: STATUS_META.done.c };
    }
    if (rows.length === 0) return { text: 'No stages recorded', c: 'var(--text-muted)' };
    return { text: 'Not yet introduced', c: 'var(--text-muted)' };
  })();

  // Mavéa's gesture circles whichever stage is most newsworthy: the failure, else the
  // in-progress stage, else the most recently completed one.
  const salientIdx =
    deadIdx !== -1
      ? deadIdx
      : currentIdx !== -1
        ? currentIdx
        : (() => {
            for (let i = rows.length - 1; i >= 0; i--) {
              if (normStatus(rows[i].status) === 'done') return i;
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
      {bill && <div className="bt-bill faint">{bill}</div>}

      <div className="bt-banner" style={{ ['--bt-c' as string]: banner.c } as CSSProperties}>
        <span className="bt-banner-dot" />
        <span className="bt-banner-text">{banner.text}</span>
      </div>

      <div className="bt-rail">
        {rows.map((s, i) => {
          const status = normStatus(s.status);
          const meta = STATUS_META[status];
          const moot = deadIdx !== -1 && i > deadIdx;
          const tally = safeTally(s.voteTally);
          const total = tally ? tally.yea + tally.nay : 0;
          const yeaPct = total > 0 && tally ? (tally.yea / total) * 100 : 0;
          return (
            <div
              className="bt-unit m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              {i > 0 && (
                <span className={`bt-connector ${deadIdx === i - 1 ? 'dead' : ''}`}>
                  {deadIdx === i - 1 && <Icon.x className="bt-dead-ic" aria-hidden="true" />}
                </span>
              )}
              <div
                className={`bt-stage ${status} ${moot ? 'moot' : ''}`}
                style={{ ['--st-c' as string]: meta.c } as CSSProperties}
                data-mark={i === salientIdx ? 'circle' : undefined}
              >
                <span className="bt-node">
                  {status === 'done' && <Icon.check className="ic" />}
                  {status === 'failed' && <Icon.x className="ic" />}
                  {status === 'current' && <span className="bt-pulse" />}
                </span>
                <span className="bt-name">{s.name}</span>
                {tally && (
                  <span className="bt-vote">
                    <span className="bt-vote-n tab-num">
                      {tally.yea}–{tally.nay}
                    </span>
                    <span className="bt-vote-bar">
                      <span className="bt-vote-fill" style={{ width: yeaPct + '%' }} />
                    </span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="bt-empty faint">No stages to show.</div>}
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
