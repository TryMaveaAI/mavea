import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { DataDictionaryProps, DictDtype } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DataDictionaryProps & { delay?: number };

// A fixed, cosmetic-only color per dtype (not tied to AccentVar's authored-data restriction —
// these are hardcoded tokens the component chooses itself, the same way ClearanceMatrix's
// LEVEL map and RiskMatrix's BAND_COLOR map do).
const DTYPE_COLOR: Record<DictDtype, string> = {
  int: 'var(--presence)',
  float: 'var(--presence-deep)',
  str: 'var(--insight-soft)',
  bool: 'var(--warning)',
  category: 'var(--insight)',
  datetime: 'var(--presence-soft)',
};
const DTYPE_SET = new Set<DictDtype>(['int', 'float', 'str', 'bool', 'category', 'datetime']);

/** A loose/misspelled dtype from the model still lands on a real pill instead of an undefined one. */
function toDtype(v: unknown): DictDtype {
  return typeof v === 'string' && DTYPE_SET.has(v as DictDtype) ? (v as DictDtype) : 'str';
}

/** Clamp a loose missing-percent into 0..100. Returns null (not 0) when it's absent/unparsable, so
 *  "no data given" never draws as "confirmed zero missing". */
function clampPct(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

/** Higher missing share reads hotter — a glance tells you which columns need cleaning. */
function missingColor(pct: number): string {
  if (pct >= 40) return 'var(--danger)';
  if (pct >= 15) return 'var(--warning)';
  return 'var(--insight)';
}

function nonNegInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
}

// A dataset codebook: one row per variable, a monospace name, a colored dtype pill, unit +
// description, and a thin missing-data bar. Data science, research — "what's in this dataset".
export function DataDictionary({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  source,
  nRows,
  nCols,
  variables,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const list = Array.isArray(variables) ? variables : [];
  const rows = list.filter((v) => typeof v?.name === 'string' && v.name.trim().length > 0);

  const rowsN = nonNegInt(nRows);
  const colsN = nonNegInt(nCols) ?? (rows.length || null);
  const meta: string[] = [];
  if (source) meta.push(source);
  if (rowsN != null) meta.push(`${formatValue(rowsN, { compact: rowsN >= 100_000 })} rows`);
  if (colsN != null) meta.push(`${formatValue(colsN)} cols`);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {meta.length > 0 && <div className="dd-cap">{meta.join(' · ')}</div>}

      {rows.length === 0 ? (
        <BlockEmpty message="No variables documented" />
      ) : (
        <div className="dd-scroll">
          <div className="dd-grid" role="grid">
            <div className="dd-colh" role="columnheader">
              Variable
            </div>
            <div className="dd-colh" role="columnheader">
              Type
            </div>
            <div className="dd-colh" role="columnheader">
              Unit
            </div>
            <div className="dd-colh dd-colh-desc" role="columnheader">
              Description
            </div>
            <div className="dd-colh dd-colh-miss" role="columnheader">
              Missing
            </div>

            {rows.map((v, i) => {
              const dtype = toDtype(v.dtype);
              const pct = clampPct(v.missingPct);
              return (
                <div
                  key={`${v.name}-${i}`}
                  className="dd-row m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                  role="row"
                >
                  <div className="dd-name" role="gridcell" title={v.name}>
                    {v.name}
                  </div>
                  <div role="gridcell">
                    <span
                      className="dd-pill"
                      style={{ ['--dd-c' as string]: DTYPE_COLOR[dtype] } as CSSProperties}
                    >
                      {dtype}
                    </span>
                  </div>
                  <div className="dd-unit" role="gridcell">
                    {v.unit || '—'}
                  </div>
                  <div className="dd-desc" role="gridcell">
                    {v.description || '—'}
                  </div>
                  <div className="dd-miss" role="gridcell">
                    {pct == null ? (
                      <span className="dd-miss-dash">—</span>
                    ) : (
                      <>
                        <div className="dd-miss-track">
                          <div
                            className="dd-miss-fill"
                            style={
                              {
                                width: `${pct}%`,
                                background: missingColor(pct),
                              } as CSSProperties
                            }
                          />
                        </div>
                        <span className="dd-miss-pct tab-num">
                          {pct % 1 === 0 ? pct : pct.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
