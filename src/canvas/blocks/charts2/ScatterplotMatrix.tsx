import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, scaleLinear } from '../../lib/scale';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { ScatterplotMatrixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScatterplotMatrixProps & { delay?: number };

const CELL = 64;
const INSET = 5;

function readVar(row: unknown, key: string): number | null {
  if (!row || typeof row !== 'object') return null;
  const v = (row as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function ScatterplotMatrix({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  vars,
  rows,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [hotCell, setHotCell] = useState<string | null>(null);

  const geom = useMemo(() => {
    const varList = (Array.isArray(vars) ? vars : []).filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    const rowList = Array.isArray(rows) ? rows : [];

    const domains = new Map<string, { lo: number; hi: number }>();
    let hasAnyPoint = false;
    for (const v of varList) {
      const values = rowList.map((r) => readVar(r, v)).filter((x): x is number => x !== null);
      if (values.length > 0) hasAnyPoint = true;
      const ex = extent(values);
      domains.set(v, ex ? { lo: ex[0], hi: ex[1] } : { lo: 0, hi: 1 });
    }

    return { varList, rowList, domains, hasAnyPoint };
  }, [vars, rows]);

  const n = geom.varList.length;

  // Memoized independently of `hotCell` — hovering a cell only flips a className below and must
  // never re-walk every row for every off-diagonal cell. Before this, the whole grid (including
  // each cell's O(rows) circle list) lived inline in the render body, so it was recomputed on
  // every hover change — O(n²·rows) work per mouse move, not just once per data change.
  const cells = useMemo(() => {
    return geom.varList.flatMap((rowVar, ri) =>
      geom.varList.map((colVar, ci) => {
        const key = `${ri}-${ci}`;
        if (ri === ci) {
          return { key, ri, ci, isDiag: true as const, rowVar, colVar, circles: null };
        }
        const xDom = geom.domains.get(colVar) ?? { lo: 0, hi: 1 };
        const yDom = geom.domains.get(rowVar) ?? { lo: 0, hi: 1 };
        const sx = scaleLinear([xDom.lo, xDom.hi], [INSET, CELL - INSET]);
        const sy = scaleLinear([yDom.lo, yDom.hi], [CELL - INSET, INSET]);
        const circles = geom.rowList.flatMap((r, k) => {
          const xv = readVar(r, colVar);
          const yv = readVar(r, rowVar);
          if (xv === null || yv === null) return [];
          return [{ k, cx: sx(xv), cy: sy(yv) }];
        });
        return { key, ri, ci, isDiag: false as const, rowVar, colVar, circles };
      }),
    );
  }, [geom]);

  if (n === 0 || !geom.hasAnyPoint) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div
        className="c2-spm"
        style={{ ['--n' as string]: n } as CSSProperties}
        onMouseLeave={() => setHotCell(null)}
      >
        {cells.map((cell) => {
          if (cell.isDiag) {
            return (
              <div key={cell.key} className="c2-spm-diag">
                <span>{cell.rowVar}</span>
              </div>
            );
          }
          const active = hotCell === cell.key;
          return (
            <div
              key={cell.key}
              className={'c2-spm-cell m-fade-rise m-stagger-item' + (active ? ' on' : '')}
              style={{ ['--i' as string]: cell.ri * n + cell.ci } as CSSProperties}
              onMouseEnter={() => setHotCell(cell.key)}
              title={`${cell.colVar} vs ${cell.rowVar}`}
            >
              <svg viewBox={`0 0 ${CELL} ${CELL}`} className="c2-spm-svg">
                <rect x={0.5} y={0.5} width={CELL - 1} height={CELL - 1} className="c2-spm-frame" />
                {cell.circles!.map(({ k, cx, cy }) => (
                  <circle key={k} cx={cx} cy={cy} r={1.6} className="c2-spm-dot" fill={color} />
                ))}
              </svg>
            </div>
          );
        })}
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
