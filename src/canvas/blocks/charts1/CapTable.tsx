import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue, formatPercent } from '../../lib/format';
import type { CapTableProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CapTableProps & { delay?: number };

// Accent cycle for the ownership segments — same token family the rest of charts1 uses, so the
// bar and ledger read consistently in light and dark.
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--text-muted)',
];

export function CapTable({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  holders,
  totalShares,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [hot, setHot] = useState<number | null>(null);

  const model = useMemo(() => {
    const sumShares = holders.reduce((s, h) => s + Math.max(0, h.shares), 0);
    // The % base: an explicit cap (e.g. fully-diluted incl. an unallocated pool) wins; else the
    // sum of holder shares. Guard a zero base so every percent stays finite.
    const base = Math.max(totalShares ?? sumShares, 1);
    const rows = holders.map((h, i) => {
      // Fully-diluted % is authored when given, otherwise derived from shares over the base.
      const pct = h.fdPct != null ? h.fdPct : (Math.max(0, h.shares) / base) * 100;
      return { ...h, pct, color: h.color || PALETTE[i % PALETTE.length] };
    });
    return { rows, base, sumShares };
  }, [holders, totalShares]);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* stacked ownership bar — one segment per holder, width = their fully-diluted share */}
      <div
        className="c1-cap-bar"
        onMouseLeave={() => setHot(null)}
        role="img"
        aria-label={`${title} ownership split`}
      >
        {model.rows.map((r, i) => (
          <div
            key={i}
            className="c1-cap-seg"
            style={{
              width: `${Math.max(0, r.pct)}%`,
              background: r.color,
              opacity: hot != null && hot !== i ? 0.4 : 1,
            }}
            onMouseEnter={() => setHot(i)}
            title={`${r.name} · ${formatPercent(r.pct, { decimals: 1 })}`}
          >
            {/* show the % inside the segment only when it is wide enough to fit */}
            {r.pct >= 9 && (
              <span className="c1-cap-seg-pct">{formatPercent(r.pct, { decimals: 0 })}</span>
            )}
          </div>
        ))}
      </div>

      {/* ledger — holder · class · shares · fully-diluted % */}
      <div className="c1-cap-scroll">
        <table className="c1-cap-table">
          <thead>
            <tr>
              <th>Holder</th>
              <th>Class</th>
              <th className="num">Shares</th>
              <th className="num">FD %</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((r, i) => (
              <tr
                key={i}
                className={hot === i ? 'on' : undefined}
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
              >
                <td>
                  <span className="c1-cap-dot" style={{ background: r.color }} />
                  <span className="c1-cap-name">{r.name}</span>
                </td>
                <td className="c1-cap-class">{r.class || '—'}</td>
                <td className="num tab-num">
                  {formatValue(r.shares, { compact: r.shares >= 1e6 })}
                </td>
                <td className="num tab-num">{formatPercent(r.pct, { decimals: 1 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td />
              <td className="num tab-num">
                {formatValue(model.base, { compact: model.base >= 1e6 })}
              </td>
              <td className="num tab-num">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {footer ? (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      ) : caption ? (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          <span className="faint">{caption}</span>
        </div>
      ) : null}
    </div>
  );
}
