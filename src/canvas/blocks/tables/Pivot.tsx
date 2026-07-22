import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PivotProps } from './types';

type Props = PivotProps & { delay?: number };

export function Pivot({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  rowGroup,
  colHeaders,
  measures,
  rows,
  measure = 0,
  accent = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [mi, setMi] = useState(Math.max(0, Math.min(measure, measures.length - 1)));
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  // measures can be empty → measures[mi] is undefined; fall back to a safe key
  // so value lookups stay defined (yields 0) instead of throwing on m.key.
  const m = measures[mi];
  const mKey = m?.key ?? '';

  // Cells are typed numeric, but the model sometimes routes a TEXT matrix (e.g. language forms)
  // through this pivot. Treat each value defensively: only finite numbers feed the sums, the
  // heatmap, and the "% of total" — text renders as-is, and the totals row/column disappears
  // entirely when nothing is numeric (a sum of words is meaningless, not "NaN" or "0aa…").
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const raw = (r: number, c: number): unknown => rows[r]?.cells[c]?.values[mKey];

  const numbers = rows
    .flatMap((r) => r.cells.map((c) => num(c.values[mKey])))
    .filter((v) => v !== null);
  const anyNumeric = numbers.length > 0;
  const max = Math.max(1, ...(numbers as number[]));

  const fmtNum = (v: number) => `${m?.prefix || ''}${v.toLocaleString()}${m?.unit || ''}`;
  const colTotals = colHeaders.map((_, ci) =>
    rows.reduce((s, r) => s + (num(r.cells[ci]?.values[mKey]) ?? 0), 0),
  );
  const grand = colTotals.reduce((s, v) => s + v, 0);

  // Don't compute totals the data already carries, and don't print a misleading total for a slice
  // with no numbers: (1) if the model already supplied a totals row (last row labelled Total/Sum/
  // …) or a Total column, reuse it instead of stacking a second one; (2) a column with no numeric
  // cells under the current measure shows "—", not "$0" (a real "sum of nothing" reads as a bug).
  const isTotalLabel = (s: string) => /^(totals?|grand\s*total|sum|all)$/i.test(s.trim());
  const hasTotalRow = rows.length > 0 && isTotalLabel(rows[rows.length - 1]?.label ?? '');
  const hasTotalCol = colHeaders.some((h) => isTotalLabel(String(h)));
  const colHasNums = colHeaders.map((_, ci) =>
    rows.some((r) => num(r.cells[ci]?.values[mKey]) !== null),
  );
  const showTotalRow = anyNumeric && !hasTotalRow;
  const showTotalCol = anyNumeric && !hasTotalCol;

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="tbl-head">
        <div className="card-eyebrow" style={{ marginBottom: 0 }}>
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        {/* Only show the measure switcher when there's something to switch BETWEEN. A lone tab
            (e.g. "Sound") toggles nothing and reads as a broken action button. */}
        {measures.length > 1 && (
          <div className="seg" role="tablist">
            {measures.map((mm, i) => (
              <button
                // Models can repeat a measure key in malformed/extreme input. The selected state is
                // index-based, so include the index to keep React identity deterministic too.
                key={`${mm.key}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === mi}
                className={`seg-btn ${i === mi ? 'on' : ''}`}
                onClick={() => setMi(i)}
              >
                {mm.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="dt-scroll">
        <table className="pv">
          <thead>
            <tr>
              <th className="pv-corner">{rowGroup}</th>
              {colHeaders.map((h, ci) => (
                <th key={ci} className={`pv-colh ${hover?.c === ci ? 'on' : ''}`}>
                  {h}
                </th>
              ))}
              {showTotalCol && <th className="pv-colh tot">Total</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const rowTot = r.cells.reduce((s, c) => s + (num(c.values[mKey]) ?? 0), 0);
              return (
                <tr key={ri}>
                  <th className={`pv-rowh ${hover?.r === ri ? 'on' : ''}`}>{r.label}</th>
                  {r.cells.map((_c, ci) => {
                    const value = raw(ri, ci);
                    const n = num(value);
                    const op = n === null ? 0 : (n / max) * 0.82 + 0.04;
                    const on = hover?.r === ri && hover?.c === ci;
                    return (
                      <td
                        key={ci}
                        className={`pv-cell ${on ? 'hot' : ''}`}
                        style={{
                          background:
                            n === null
                              ? undefined
                              : `color-mix(in oklab, ${accent} ${op * 100}%, transparent)`,
                        }}
                        onMouseEnter={() => setHover({ r: ri, c: ci })}
                        onMouseLeave={() => setHover(null)}
                      >
                        <span className={n === null ? 'pv-v' : 'pv-v tab-num'}>
                          {n === null ? String(value ?? '') : fmtNum(n)}
                        </span>
                        {on && n !== null && grand > 0 && (
                          <span className="pv-tip">{((n / grand) * 100).toFixed(1)}% of total</span>
                        )}
                      </td>
                    );
                  })}
                  {showTotalCol && <td className="pv-cell tot tab-num">{fmtNum(rowTot)}</td>}
                </tr>
              );
            })}
            {showTotalRow && (
              <tr>
                <th className="pv-rowh tot">Total</th>
                {colTotals.map((t, ci) => (
                  <td key={ci} className="pv-cell tot tab-num">
                    {colHasNums[ci] ? fmtNum(t) : '—'}
                  </td>
                ))}
                {showTotalCol && <td className="pv-cell tot grand tab-num">{fmtNum(grand)}</td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
