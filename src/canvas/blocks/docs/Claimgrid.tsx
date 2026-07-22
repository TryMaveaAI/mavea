import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ClaimgridProps, CellState } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ClaimgridProps & { delay?: number };

const CELL: Record<CellState, { c: string; icon: keyof typeof Icon | null; t: string }> = {
  yes: { c: 'var(--insight)', icon: 'check', t: 'Supported' },
  no: { c: 'var(--danger)', icon: 'x', t: 'Contradicted' },
  partial: { c: 'var(--warning)', icon: 'alert', t: 'Partial' },
  na: { c: 'var(--text-muted)', icon: null, t: 'No data' },
};

export function Claimgrid({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  columns,
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  // default hover = first informative cell, so a tooltip shows on reveal
  const [hover, setHover] = useState<{ r: number; c: number } | null>({ r: 0, c: 0 });

  const hovered =
    hover && rows[hover.r] && rows[hover.r].cells[hover.c] ? rows[hover.r].cells[hover.c] : null;
  const hMeta = hovered ? CELL[hovered.state] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cg-scroll">
        <table
          className="cg-table"
          style={{ ['--cols' as string]: columns.length } as CSSProperties}
        >
          <thead>
            <tr>
              <th className="cg-corner" />
              {columns.map((c, i) => (
                <th key={i} className="cg-colh">
                  <span>{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <th className="cg-rowh" scope="row">
                  {row.claim}
                </th>
                {columns.map((_, ci) => {
                  const cell = row.cells[ci];
                  const st = cell?.state ?? 'na';
                  const m = CELL[st];
                  const CI = m.icon ? Icon[m.icon] : null;
                  const on = hover?.r === ri && hover?.c === ci;
                  return (
                    <td
                      key={ci}
                      className={`cg-cell ${st} ${on ? 'on' : ''}`}
                      style={{ ['--cc' as string]: m.c } as CSSProperties}
                      onMouseEnter={() => setHover({ r: ri, c: ci })}
                    >
                      <span className="cg-mark">
                        {CI ? <CI className="cg-mark-ic" /> : <span className="cg-dash">–</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hovered && hMeta && (
        <div className="cg-tip" style={{ ['--cc' as string]: hMeta.c } as CSSProperties}>
          <span className="cg-tip-tag" style={{ color: hMeta.c }}>
            {hMeta.t}
          </span>
          {hovered.note ? (
            <span className="cg-tip-note" dangerouslySetInnerHTML={richInnerHtml(hovered.note)} />
          ) : (
            <span className="cg-tip-note faint">
              {rows[hover!.r].claim} × {columns[hover!.c]}
            </span>
          )}
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
