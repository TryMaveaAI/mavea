import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatDate, formatValue, niceDomain, niceStep, ticks } from '../../lib';
import type { FundraisingRoundsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FundraisingRoundsProps & { delay?: number };

// The tallest bar never reaches the very top of the track — a fixed slice stays reserved so
// the always-visible total label above it never has to compete with the fill for room. Nice-
// rounding the domain alone doesn't guarantee this (a top value that already lands near a
// round number leaves almost no margin), so the reservation is enforced here instead.
const BAR_HEADROOM = 0.86;

// One stacked column per round, left→right in the order given (Bridge's start→delta→end
// grammar turned vertical): the pre-money base stacks a raised segment on top of it, reaching
// the round's post-money height. All columns share one $ domain so the growth across rounds
// reads directly from the rising bar heights, not just the labels.
export function FundraisingRounds({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  currency = 'USD',
  rounds,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const model = useMemo(() => {
    const tops = rounds.map((r) => Math.max(0, r.postMoney, r.preMoney + r.raised));
    const [, domainHi] = niceDomain(0, Math.max(1, ...tops, 1));
    const gridTicks = ticks(0, domainHi, niceStep(domainHi, 4)).filter(
      (t) => t > 0 && t < domainHi,
    );
    const fmt = (v: number) => formatValue(v, { currency, compact: v >= 1e6 });
    return {
      domainHi,
      gridTicks,
      cols: rounds.map((r) => {
        const pre = Math.max(0, r.preMoney);
        const raised = Math.max(0, r.raised);
        // One ellipsized line rather than a stacked line per fact — a column is only ~60-130px
        // wide, nowhere near enough for date/lead/step-up on separate rows without ballooning
        // every column's reserved caption height past the chart's fixed track.
        const capParts = [
          r.date ? formatDate(r.date, { style: 'month' }) : null,
          r.leadInvestor,
          r.stepUp != null ? `${r.stepUp.toFixed(1)}x step-up` : null,
        ].filter((p): p is string => !!p);
        return {
          ...r,
          prePct: (pre / domainHi) * 100 * BAR_HEADROOM,
          raisedPct: (raised / domainHi) * 100 * BAR_HEADROOM,
          preLabel: fmt(pre),
          raisedLabel: fmt(raised),
          postLabel: fmt(r.postMoney),
          capLine: capParts.join(' · '),
        };
      }),
    };
  }, [rounds, currency]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fin-fr-scroll">
        <div className="fin-fr-chart" onMouseLeave={() => setHot(null)}>
          <div className="fin-fr-grid" aria-hidden="true">
            {model.gridTicks.map((t, i) => (
              <span
                key={i}
                className="fin-fr-gridline"
                style={{ bottom: `${(t / model.domainHi) * 100 * BAR_HEADROOM}%` }}
              />
            ))}
          </div>
          {model.cols.map((c, i) => {
            const active = hot === i;
            return (
              <div
                className={'fin-fr-col m-stagger-item m-fade-rise' + (active ? ' on' : '')}
                key={i}
                style={{ ['--i' as string]: i } as CSSProperties}
                onMouseEnter={() => setHot(i)}
              >
                <span className="fin-fr-total tab-num">{c.postLabel}</span>
                <div
                  className="fin-fr-seg-raised"
                  style={{ height: `${c.raisedPct}%` }}
                  title={`Raised · ${c.raisedLabel}`}
                >
                  {c.raisedPct >= 14 && <span className="fin-fr-seg-lbl">{c.raisedLabel}</span>}
                </div>
                <div
                  className="fin-fr-seg-pre"
                  style={{ height: `${c.prePct}%` }}
                  title={`Pre-money · ${c.preLabel}`}
                >
                  {c.prePct >= 14 && <span className="fin-fr-seg-lbl faint">{c.preLabel}</span>}
                </div>
                <div className="fin-fr-meta">
                  <div className="fin-fr-name" title={c.name}>
                    {c.name}
                  </div>
                  {c.capLine && (
                    <div className="fin-fr-cap faint" title={c.capLine}>
                      {c.capLine}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="fin-fr-legend">
        <span className="fin-fr-leg">
          <i className="fin-fr-swatch raised" /> raised this round
        </span>
        <span className="fin-fr-leg">
          <i className="fin-fr-swatch pre" /> pre-money
        </span>
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
