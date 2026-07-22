import { Fragment, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CorrelationHeatmapProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CorrelationHeatmapProps & { delay?: number };

// Cells never collapse narrower than this — below it the grid scrolls instead of squeezing
// digits into unreadable slivers. Matches the row-header cap below: wide enough for "-0.91".
const MIN_CELL = 40;
const MAX_HEADER = 148;

// Same sequential-heat convention the library already uses for magnitude-scaled fills
// (CalendarHeatmap's day cells, ConfusionMatrix's count cells): color-mix the accent against
// transparent, scaled by how strong the value is, so a near-zero reading stays visually
// neutral and only a genuinely strong correlation earns a saturated tint. This is the
// diverging variant — the accent itself flips at zero instead of staying fixed.
function cellFill(value: number): string {
  const v = Math.max(-1, Math.min(1, value));
  const accent = v >= 0 ? 'var(--presence)' : 'var(--danger)';
  const strength = Math.abs(v);
  return `color-mix(in oklab, ${accent} ${(strength * 86).toFixed(1)}%, transparent)`;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const v = Math.max(-1, Math.min(1, value));
  // Drop the leading zero the way correlation tables conventionally do (.86, -.91), but keep
  // it at ±1 so "perfectly correlated" never reads as the easy-to-misread ".00".
  if (Math.abs(v) === 1) return v < 0 ? '-1.00' : '1.00';
  const abs = Math.abs(v).toFixed(2).slice(1); // "0.86" → ".86"
  return v < 0 ? '-' + abs : abs;
}

// Correlation matrices are the caller's own computed statistic (Pearson/Spearman/whatever) —
// there is nothing here to derive or interpolate, only to lay out and tint.
export function CorrelationHeatmap({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  variables,
  matrix,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const n = variables?.length ?? 0;

  // A ragged or short matrix is a malformed prop, not a crash: pad/truncate every row to n and
  // treat a non-finite cell as "no reading" (0 — visually neutral, not a false strong signal).
  const grid: number[][] = variables.map((_, i) => {
    const src = matrix?.[i] ?? [];
    return variables.map((__, j) => {
      const v = src[j];
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    });
  });

  const isWide = n > 6;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {n < 2 ? (
        <p className="c1-corr-empty faint">Needs at least two variables to correlate.</p>
      ) : (
        <>
          <div
            className={['c1-corr-wrap', isWide ? 'c1-corr-scroll' : ''].filter(Boolean).join(' ')}
          >
            <div
              className="c1-corr-grid"
              style={{
                gridTemplateColumns: `minmax(72px, ${MAX_HEADER}px) repeat(${n}, minmax(${MIN_CELL}px, 1fr))`,
              }}
              role="grid"
              aria-label={title}
            >
              <div
                className="c1-corr-cell c1-corr-corner m-fade-rise m-stagger-item"
                role="columnheader"
                aria-label=""
                style={{ ['--i' as string]: 0 }}
              />
              {variables.map((v, ci) => (
                <div
                  key={`ch${ci}`}
                  className="c1-corr-cell c1-corr-colhdr m-fade-rise m-stagger-item"
                  role="columnheader"
                  title={v}
                  style={{ ['--i' as string]: 0 }}
                >
                  <span>{v}</span>
                </div>
              ))}

              {grid.map((row, ri) => (
                <Fragment key={`r${ri}`}>
                  <div
                    className="c1-corr-cell c1-corr-rowhdr m-fade-rise m-stagger-item"
                    role="rowheader"
                    title={variables[ri]}
                    style={{ ['--i' as string]: ri + 1 }}
                  >
                    <span>{variables[ri]}</span>
                  </div>
                  {row.map((value, ci) => {
                    const diag = ri === ci;
                    const strong = Math.abs(value) > 0.55;
                    return (
                      <div
                        key={`c${ri}-${ci}`}
                        className={[
                          'c1-corr-cell',
                          'c1-corr-data',
                          'm-fade-rise',
                          'm-stagger-item',
                          diag ? 'c1-corr-diag' : '',
                          strong ? 'c1-corr-strong' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          background: cellFill(value),
                          ['--i' as string]: ri + 1,
                        }}
                        role="gridcell"
                        title={`${variables[ri]} × ${variables[ci]}: ${fmt(value)}`}
                      >
                        {fmt(value)}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="c1-corr-legend">
            <span className="c1-corr-leg-lbl">−1</span>
            {[-1, -0.5, 0, 0.5, 1].map((lv) => (
              <i key={lv} style={{ background: cellFill(lv) }} />
            ))}
            <span className="c1-corr-leg-lbl">+1</span>
          </div>
        </>
      )}

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
