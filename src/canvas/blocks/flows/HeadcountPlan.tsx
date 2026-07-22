import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HeadcountPlanProps } from './types';

type Props = HeadcountPlanProps & { delay?: number };

/** Guard a model-supplied number: only a finite, non-negative count is real headcount. */
function count(n: number | undefined): number {
  return Number.isFinite(n) ? Math.max(0, n as number) : 0;
}

// Filled-vs-budgeted ratio drives the meter's color, the same read as PackList's per-group
// bar: comfortably under plan reads as the calm default, close to full reads healthy, and
// over budget (more filled seats than the plan allows — a real state right after a re-org)
// flags amber rather than pretending the meter caps at 100.
function meterColor(filled: number, budgeted: number): string {
  if (budgeted <= 0) return 'var(--text-muted)';
  const ratio = filled / budgeted;
  if (ratio > 1) return 'var(--warning)';
  if (ratio >= 0.85) return 'var(--insight)';
  return 'var(--presence)';
}

export function HeadcountPlan({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  depts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const rows = Array.isArray(depts) ? depts : [];

  // Totals are summed from the rows every render, never a separately-authored figure, so
  // they can never drift from what the meters actually show.
  const totals = rows.reduce(
    (acc, d) => {
      acc.budgeted += count(d?.budgeted);
      acc.filled += count(d?.filled);
      acc.openReqs += count(d?.openReqs);
      return acc;
    },
    { budgeted: 0, filled: 0, openReqs: 0 },
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {rows.length === 0 ? (
        <div className="fl-hc-empty">No department plan yet.</div>
      ) : (
        <>
          <div className="fl-hc-rows">
            {rows.map((d, i) => {
              const budgeted = count(d?.budgeted);
              const filled = count(d?.filled);
              const openReqs = count(d?.openReqs);
              const pct = budgeted > 0 ? Math.min(100, (filled / budgeted) * 100) : 0;
              const over = budgeted > 0 && filled > budgeted;
              return (
                <div
                  className="fl-hc-row m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                  key={(d && d.name) || i}
                >
                  <div className="fl-hc-head">
                    <span className="fl-hc-name">{(d && d.name) || 'Untitled team'}</span>
                    <span className="fl-hc-count tab-num">
                      {filled} / {budgeted}
                      {over && <span className="fl-hc-over"> over</span>}
                    </span>
                  </div>
                  <div className="fl-hc-bar" role="progressbar" aria-valuenow={Math.round(pct)}>
                    <span
                      className="fl-hc-bar-fill"
                      style={{ width: pct + '%', background: meterColor(filled, budgeted) }}
                    />
                  </div>
                  {openReqs > 0 && (
                    <div className="fl-hc-reqs">
                      <Icon.plus className="ic" /> {openReqs} open req{openReqs === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="fl-hc-totals">
            <span className="fl-hc-totals-label">Total</span>
            <span className="fl-hc-totals-count tab-num">
              {totals.filled} / {totals.budgeted} filled
            </span>
            {totals.openReqs > 0 && (
              <span className="fl-hc-totals-reqs tab-num">
                {totals.openReqs} open req{totals.openReqs === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
