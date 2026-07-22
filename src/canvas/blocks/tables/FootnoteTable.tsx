import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FootnoteTableProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FootnoteTableProps & { delay?: number };

export function FootnoteTable({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  columns,
  rows,
  notes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  // active footnote (sticky on click), plus transient hover.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? pinned;

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dt-scroll">
        <table className="dt ft">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={`dt-th ${i === 0 ? '' : 'r'}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="dt-row">
                {row.cells.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`dt-td ${ci === 0 ? '' : 'r tab-num'}`}
                    style={cell.color ? { color: cell.color } : undefined}
                  >
                    {cell.v}
                    {cell.note != null && (
                      <button
                        className={`ft-anchor ${active === cell.note ? 'on' : ''} ${pinned === cell.note ? 'pin' : ''}`}
                        onMouseEnter={() => setHovered(cell.note!)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setPinned((p) => (p === cell.note ? null : cell.note!))}
                        aria-label={`footnote ${cell.note}`}
                      >
                        {cell.note}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ft-notes">
        {notes.map((n, i) => {
          const idx = i + 1;
          const on = active === idx;
          return (
            <div key={i} className={`ft-note ${on ? 'on' : ''}`}>
              <span className="ft-note-i">{idx}</span>
              <span className="ft-note-t" dangerouslySetInnerHTML={richInnerHtml(n)} />
            </div>
          );
        })}
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
