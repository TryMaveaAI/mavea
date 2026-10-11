import { Fragment, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatDate, formatValue } from '../../lib';
import type { VestingScheduleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { pctVested } from './vesting';

type Props = VestingScheduleProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4368875; // average Gregorian month

/** Fractional months from `a` to `b`, or null when either date fails to parse. */
function monthsBetween(a: Date, b: Date): number | null {
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b.getTime() - a.getTime()) / MS_PER_MONTH;
}

// One row per equity grant, all sharing a single calendar timeline (like a Gantt track) so a
// "today" needle can cross every row at once. Each bar marks its cliff, and its fill is the share
// vested: nothing until the cliff, then the whole cliff tranche at once and the rest at the
// calendar rate, so from the cliff on the fill edge sits under the needle.
export function VestingSchedule({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  grants,
  asOf,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;

  const model = useMemo(() => {
    const now = asOf ? new Date(asOf) : new Date();
    // Anchor every grant's start on one absolute clock (months before/after "now", which sits
    // at 0) so every row shares a single domain and the needle means the same thing on all of
    // them — a grant started two years ago and one started yesterday still line up correctly.
    const rows = grants.map((g, i) => {
      const start = new Date(g.grantDate);
      const elapsedToNow = monthsBetween(start, now);
      const cliff = Math.max(0, g.cliffMonths);
      const vest = Math.max(0, g.vestMonths);
      const startAbs = elapsedToNow == null ? 0 : -elapsedToNow;
      return {
        ...g,
        start,
        cliff,
        vest,
        pct: elapsedToNow == null ? 0 : pctVested(elapsedToNow, cliff, vest),
        cliffLocalPct: vest > 0 ? Math.min(100, (cliff / vest) * 100) : 100,
        color: g.color || PALETTE[i % PALETTE.length],
        startAbs,
        endAbs: startAbs + vest,
      };
    });

    const domainLo = Math.min(0, ...rows.map((r) => r.startAbs));
    const domainHi = Math.max(0, ...rows.map((r) => r.endAbs), 1);
    const span = domainHi - domainLo || 1;

    return {
      rows: rows.map((r) => ({
        ...r,
        leftPct: ((r.startAbs - domainLo) / span) * 100,
        widthPct: (Math.max(r.vest, 0.001) / span) * 100,
      })),
      needlePct: ((0 - domainLo) / span) * 100, // "now" is absolute position 0
      asOfLabel: formatDate(now, { style: 'day' }),
    };
  }, [grants, asOf]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fin-vs-body">
        {model.rows.map((r, i) => (
          // A Fragment (not a wrapping div) so who/track/readout land as direct grid items —
          // the needle cell below shares the same 3-column template, so its horizontal extent
          // is pixel-identical to every row's track column with no separate alignment math.
          <Fragment key={i}>
            <div
              className="fin-vs-who m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i, gridRow: i + 1 } as CSSProperties}
            >
              <span className="fin-vs-name" title={r.holder}>
                {r.holder}
              </span>
              <span className="fin-vs-sub faint">
                {formatDate(r.start, { style: 'month' })} ·{' '}
                {formatValue(r.totalShares, { compact: r.totalShares >= 1e6 })} sh
              </span>
            </div>
            <div
              className="fin-vs-track m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i, gridRow: i + 1 } as CSSProperties}
            >
              <div
                className="fin-vs-bar"
                style={{ left: `${r.leftPct}%`, width: `${Math.max(r.widthPct, 1.5)}%` }}
              >
                <div className="fin-vs-cliff" style={{ width: `${r.cliffLocalPct}%` }} />
                <span className="fin-vs-fill" style={{ width: `${r.pct}%`, background: r.color }} />
                <span className="fin-vs-cliff-mark" style={{ left: `${r.cliffLocalPct}%` }} />
              </div>
            </div>
            <div
              className="fin-vs-readout m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i, gridRow: i + 1 } as CSSProperties}
            >
              <span className="fin-vs-pct tab-num" style={{ color: r.color }}>
                {r.pct.toFixed(0)}%
              </span>
              <span className="fin-vs-shares faint tab-num">
                {formatValue(Math.round((r.pct / 100) * r.totalShares), {
                  compact: r.totalShares >= 1e6,
                })}
              </span>
            </div>
          </Fragment>
        ))}
        {model.rows.length > 0 && (
          <div
            className="fin-vs-needle-col"
            style={{ gridRow: `1 / ${model.rows.length + 1}` } as CSSProperties}
          >
            <span
              className="fin-vs-needle"
              style={{ left: `${Math.min(99, Math.max(0, model.needlePct))}%` }}
              title={`Today · ${model.asOfLabel}`}
            />
          </div>
        )}
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
