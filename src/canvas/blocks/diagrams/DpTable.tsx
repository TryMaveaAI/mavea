// DpTable — a dynamic-programming memoization table for teaching classic DP problems
// (LCS, edit distance, knapsack, coin change). Step-through mode (steps[]) drives a
// Prev/Next stepper that spotlights the current cell (presence tint) and its recurrence
// dependencies (insight tint). Static mode uses highlight/path for a one-shot view.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DpTableProps, DpTableStep } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DpTableProps & { delay?: number };

// ── layout constants ────────────────────────────────────────────────────────
const CELL = 44; // data-cell side length (viewBox units)
const HDR_W = 48; // row-header column width
const HDR_H = 36; // col-header row height
const PAD = 12; // outer padding
const MAX_COLS = 12;
const MAX_ROWS = 10;

// The model can hand back header labels ("knapsack[7]") or cell values (large memoized
// counts) far longer than the demo fixture's single characters. SVG text neither wraps nor
// clips itself, so an unbudgeted string bleeds past its fixed-width cell into its neighbours.
// Truncate to a conservative per-role character budget (derived from each box's width at its
// class's font-size) and keep the full string as a native <title> tooltip — same idiom as
// EtymTree/CircuitDiagram's fixed-width boxes.
const HDR_MAX_CHARS = 6; // .dp-hdr-val: 13px/700, fits HDR_W(48)/CELL(44) with padding
const VAL_MAX_CHARS = 5; // .dp-val: 15px/600, fits CELL(44) with padding

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function toKey(r: number, c: number) {
  return `${r},${c}`;
}

export function DpTable({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  rows,
  cols,
  cells,
  steps,
  highlight,
  path,
  recurrence,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.table;
  const [idx, setIdx] = useState(0);
  const total = steps?.length ?? 0;
  const safeIdx = Math.min(idx, Math.max(0, total - 1));
  const cur: DpTableStep | undefined = steps?.[safeIdx];
  const at = (i: number) => setIdx(Math.min(total - 1, Math.max(0, i)));

  const { vbW, vbH, clampedRows, clampedCols, clampedCells, pathSet, hlKey, depSet } =
    useMemo(() => {
      const cr = rows.slice(0, MAX_ROWS);
      const cc = cols.slice(0, MAX_COLS);
      const numR = cr.length;
      const numC = cc.length;

      const clampedCells = cells.slice(0, numR).map((row) => row.slice(0, numC));

      const vbW = PAD * 2 + HDR_W + numC * CELL;
      const vbH = PAD * 2 + HDR_H + numR * CELL;

      const pathSet = new Set<string>();
      for (const [r, c] of path ?? []) {
        if (r < numR && c < numC) pathSet.add(toKey(r, c));
      }

      // Active cell: step takes priority over static highlight
      const activePair = cur?.current ?? highlight;
      const hlKey =
        activePair && activePair[0] < numR && activePair[1] < numC
          ? toKey(activePair[0], activePair[1])
          : null;

      const depSet = new Set<string>();
      for (const [r, c] of cur?.deps ?? []) {
        const k = toKey(r, c);
        if (r < numR && c < numC && k !== hlKey) depSet.add(k);
      }

      return { vbW, vbH, clampedRows: cr, clampedCols: cc, clampedCells, pathSet, hlKey, depSet };
    }, [rows, cols, cells, highlight, path, cur]);

  const numC = clampedCols.length;
  const numR = clampedRows.length;

  const cellX = (c: number) => PAD + HDR_W + c * CELL;
  const cellY = (r: number) => PAD + HDR_H + r * CELL;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {recurrence && (
        <div className="dp-recurrence">
          <code>{recurrence}</code>
        </div>
      )}

      {cur?.caption && (
        <p className="dg-at-caption" aria-live="polite">
          {cur.caption}
        </p>
      )}

      <div className="dp-wrap">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="dp-svg"
          role="img"
          aria-label={title ?? 'DP table'}
        >
          {/* corner cell */}
          <rect x={PAD} y={PAD} width={HDR_W} height={HDR_H} className="dp-corner" />

          {/* column headers */}
          {clampedCols.map((col, c) => (
            <g key={`ch-${c}`}>
              <rect x={cellX(c)} y={PAD} width={CELL} height={HDR_H} className="dp-header" />
              <text
                x={cellX(c) + CELL / 2}
                y={PAD + HDR_H / 2 + 5}
                textAnchor="middle"
                className="dp-hdr-val"
              >
                {col.length > HDR_MAX_CHARS && <title>{col}</title>}
                {truncate(col, HDR_MAX_CHARS)}
              </text>
            </g>
          ))}

          {/* row headers */}
          {clampedRows.map((row, r) => (
            <g key={`rh-${r}`}>
              <rect x={PAD} y={cellY(r)} width={HDR_W} height={CELL} className="dp-header" />
              <text
                x={PAD + HDR_W / 2}
                y={cellY(r) + CELL / 2 + 5}
                textAnchor="middle"
                className="dp-hdr-val"
              >
                {row.length > HDR_MAX_CHARS && <title>{row}</title>}
                {truncate(row, HDR_MAX_CHARS)}
              </text>
            </g>
          ))}

          {/* data cells */}
          {Array.from({ length: numR }, (_, r) =>
            Array.from({ length: numC }, (_, c) => {
              const key = toKey(r, c);
              const isHL = key === hlKey;
              const isDep = depSet.has(key);
              const isPath = !isHL && !isDep && pathSet.has(key);
              const val = clampedCells[r]?.[c];
              const valStr = val !== null && val !== undefined ? String(val) : '';

              let cls = 'dp-cell';
              if (isHL) cls += ' dp-active';
              else if (isDep) cls += ' dp-dep';
              else if (isPath) cls += ' dp-path';

              return (
                <g key={key}>
                  <rect x={cellX(c)} y={cellY(r)} width={CELL} height={CELL} className={cls} />
                  {val !== null && val !== undefined && (
                    <text
                      x={cellX(c) + CELL / 2}
                      y={cellY(r) + CELL / 2 + 5}
                      textAnchor="middle"
                      className={
                        'dp-val' +
                        (isHL
                          ? ' dp-val-active'
                          : isDep
                            ? ' dp-val-dep'
                            : isPath
                              ? ' dp-val-path'
                              : '')
                      }
                    >
                      {valStr.length > VAL_MAX_CHARS && <title>{valStr}</title>}
                      {truncate(valStr, VAL_MAX_CHARS)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {/* Stepper — only when steps are provided */}
      {steps && steps.length > 0 && (
        <div className="dg-at-controls">
          <button
            type="button"
            className="dg-at-btn"
            onClick={() => at(safeIdx - 1)}
            disabled={safeIdx === 0}
            aria-label="previous step"
          >
            <Icon.chevL className="ic" /> Prev
          </button>
          <div className="dg-at-progress" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={'dg-at-dot' + (i === safeIdx ? ' on' : i < safeIdx ? ' done' : '')}
              />
            ))}
          </div>
          <span className="dg-at-count">
            {safeIdx + 1} / {total}
          </span>
          <button
            type="button"
            className="dg-at-btn"
            onClick={() => at(safeIdx + 1)}
            disabled={safeIdx >= total - 1}
            aria-label="next step"
          >
            Next <Icon.chevR className="ic" />
          </button>
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
