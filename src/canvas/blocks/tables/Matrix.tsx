import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MatrixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MatrixProps & { delay?: number };

// Cells hold a wide range of content — a single digit, a fraction, a full word — and the grid
// column floor only guarantees so much width. Clip long values with an ellipsis rather than
// letting them overflow into neighboring cells or blow out the grid track.
const CELL_TEXT_STYLE: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
};

// One general grid that covers a lot of subjects: bracket it for a linear-algebra matrix or
// vector, or give it row/column headers for a truth table, Punnett square, payoff matrix,
// multiplication table, or confusion matrix. Cells can be tinted or emphasized. Pure layout —
// the value/header strings come straight from props, so the same primitive serves math, CS,
// biology, chemistry, and economics without a bespoke component for each.
export function Matrix({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  caption,
  corner,
  cols,
  rows,
  bracket = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const hasColHeaders = !!cols && cols.length > 0;
  const hasRowLabels = rows.some((r) => r.label !== undefined);
  const ncols = Math.max(cols?.length ?? 0, ...rows.map((r) => r.cells.length));
  const gridCols = `${hasRowLabels ? 'minmax(0, auto) ' : ''}repeat(${ncols}, minmax(60px, auto))`;
  // Salient: the cell the model explicitly flagged hot (first one wins).
  const salientKey = (() => {
    for (let ri = 0; ri < rows.length; ri++) {
      const ci = rows[ri].cells.findIndex((c) => c.hot);
      if (ci >= 0) return `${ri}-${ci}`;
    }
    return null;
  })();

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {caption && <div className="tbl-mtx-cap">{caption}</div>}

      <div className="tbl-mtx-frame">
        {bracket && <div className="tbl-mtx-brk l" />}
        <div className="tbl-mtx-grid" style={{ gridTemplateColumns: gridCols }}>
          {hasColHeaders && (
            <>
              {hasRowLabels && (
                <div className="tbl-mtx-corner" style={CELL_TEXT_STYLE} title={corner}>
                  {corner ?? ''}
                </div>
              )}
              {cols!.map((c, i) => (
                <div key={`h${i}`} className="tbl-mtx-colh" style={CELL_TEXT_STYLE} title={c}>
                  {c}
                </div>
              ))}
            </>
          )}
          {rows.map((r, ri) => (
            <Row
              key={ri}
              ri={ri}
              hasRowLabels={hasRowLabels}
              label={r.label}
              cells={r.cells}
              salientKey={salientKey}
            />
          ))}
        </div>
        {bracket && <div className="tbl-mtx-brk r" />}
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

function Row({
  ri,
  hasRowLabels,
  label,
  cells,
  salientKey,
}: {
  ri: number;
  hasRowLabels: boolean;
  label?: string;
  cells: MatrixProps['rows'][number]['cells'];
  salientKey: string | null;
}) {
  return (
    <>
      {hasRowLabels && (
        <div className="tbl-mtx-rowh" style={CELL_TEXT_STYLE} title={label}>
          {label ?? ''}
        </div>
      )}
      {cells.map((cell, ci) => (
        <div
          key={ci}
          className={'tbl-mtx-cell' + (cell.hot ? ' hot' : '')}
          data-mark={`${ri}-${ci}` === salientKey ? 'circle' : undefined}
          style={cell.color ? { ...CELL_TEXT_STYLE, background: cell.color } : CELL_TEXT_STYLE}
          title={typeof cell.v === 'string' ? cell.v : undefined}
        >
          {cell.v}
        </div>
      ))}
    </>
  );
}
