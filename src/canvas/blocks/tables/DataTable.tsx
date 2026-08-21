import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { resolveTableAnnotations } from '../../lib/annotate/tableAnnotations';
import { BlockEmpty } from '../../lib/BlockEmpty';
import { hasKeyedRows } from '../../lib/empty';
import type { DataTableProps } from './types';

type Props = DataTableProps & { delay?: number };

const num = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
};

export function DataTable({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  columns,
  rows,
  sortKey,
  sortDir = 'desc',
  searchable = true,
  searchPlaceholder = 'Filter rows…',
  footer,
  annotations,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [sk, setSk] = useState(sortKey || columns[0]?.key);
  const [dir, setDir] = useState<'asc' | 'desc'>(sortDir);
  const [q, setQ] = useState('');

  const colFor = (k: string) => columns.find((c) => c.key === k);
  const labelKey = columns[0]?.key ?? '';
  // The annotation view (formatters, tones, in-cell bars, emphasis, computed summary rows). Memoized
  // on the inputs — annotations ADAPT this base table into a receipt/ledger/scorecard.
  const ann = useMemo(
    () => resolveTableAnnotations(annotations, columns, rows),
    [annotations, columns, rows],
  );

  const view = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let r = rows;
    if (ql)
      r = rows.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(ql)),
      );
    const col = colFor(sk);
    const sorted = [...r].sort((a, b) => {
      const av = a[sk] ?? '';
      const bv = b[sk] ?? '';
      const cmp = col?.numeric ? num(av) - num(bv) : String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sk, dir]);

  const onSort = (k: string) => {
    if (k === sk) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSk(k);
      setDir(colFor(k)?.numeric ? 'desc' : 'asc');
    }
  };

  // Rows are looked up by column key, so a set of rows keyed differently — or not keyed at all —
  // resolves every cell to '' while still counting as rows: a card of blank lines under a header,
  // with a footer confidently reporting "5 of 5 rows". Say there is nothing here instead, the same
  // way the other tables in this family do (Raci, Gradebook).
  if (
    !hasKeyedRows(
      rows,
      columns.map((c) => c.key),
    )
  ) {
    return (
      <div
        className="card reveal tbl"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No rows to show" />
      </div>
    );
  }

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="tbl-head">
        <div className="card-eyebrow" style={{ marginBottom: 0 }}>
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        {searchable && (
          <label className="tbl-search">
            <Icon.eye className="tbl-search-ic" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
            />
            {q && (
              <button className="tbl-search-x" onClick={() => setQ('')} aria-label="clear">
                <Icon.x />
              </button>
            )}
          </label>
        )}
      </div>

      <div className="dt-scroll">
        <table className="dt">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`dt-th ${c.align === 'right' ? 'r' : ''} ${sk === c.key ? 'on' : ''}`}
                  onClick={() => onSort(c.key)}
                >
                  <span className="dt-th-in">
                    {c.label}
                    <span className={`dt-sort ${sk === c.key ? dir : ''}`}>
                      {sk === c.key ? (
                        dir === 'asc' ? (
                          <Icon.arrowUp />
                        ) : (
                          <Icon.arrowDown />
                        )
                      ) : (
                        <Icon.arrowDown />
                      )}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, ri) => {
              const rowTone = ann.active ? ann.rowTone(row[labelKey] ?? '') : undefined;
              const dim = ann.dimUnmatched && !rowTone;
              return (
                <tr
                  key={ri}
                  className={`dt-row${rowTone ? ' dt-row-emph' : ''}${dim ? ' dt-row-dim' : ''}`}
                  style={rowTone ? ({ ['--emph' as string]: rowTone } as CSSProperties) : undefined}
                >
                  {columns.map((c) => {
                    const raw = row[c.key] ?? '';
                    const text = ann.active ? ann.formatCell(c.key, raw) : raw;
                    const tone = ann.active ? ann.cellTone(c.key, raw) : undefined;
                    const bar = ann.active ? ann.cellBar(c.key, raw) : undefined;
                    return (
                      <td
                        key={c.key}
                        className={`dt-td ${c.align === 'right' ? 'r tab-num' : ''} ${sk === c.key ? 'on' : ''}`}
                        style={{
                          ...(c.color ? { color: c.color } : {}),
                          ...(tone ? { color: tone } : {}),
                        }}
                      >
                        {bar !== undefined && (
                          <span className="dt-bar" style={{ width: `${Math.round(bar * 100)}%` }} />
                        )}
                        <span className="dt-cell-v">{text}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {view.length === 0 && (
              <tr>
                <td className="dt-empty" colSpan={columns.length}>
                  No rows match “{q}”.
                </td>
              </tr>
            )}
          </tbody>
          {ann.summaryRows.length > 0 && view.length > 0 && (
            <tfoot>
              {ann.summaryRows.map((sr, i) => (
                <tr key={i} className="dt-summary">
                  {columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={`dt-td dt-summary-td ${c.align === 'right' ? 'r tab-num' : ''}`}
                    >
                      {sr.cells[c.key] ?? (ci === 0 ? sr.label : '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      <div className="tbl-foot-meta faint">
        {view.length} of {rows.length} rows · sorted by {colFor(sk)?.label}{' '}
        {dir === 'asc' ? '↑' : '↓'}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
