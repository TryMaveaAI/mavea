import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { ExpressionHeatmapProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ExpressionHeatmapProps & { delay?: number };

const LEGEND_STOPS = [-1, -0.5, 0, 0.5, 1];

/** Sign-formatted fold-change to one decimal — "+2.3" / "−1.1" / "0.0", a real minus (matching
 *  ablationtable's delta convention), not a hyphen. A hair-below-zero reading rounds back to a
 *  plain "0.0" rather than a misleading "−0.0". */
function fmtFold(v: number): string {
  if (!Number.isFinite(v)) return '0.0';
  const rounded = Math.round(v * 10) / 10;
  if (rounded === 0) return '0.0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
}

/** The diverging fill for an already-normalized t ∈ [-1, 1]: blue toward −1 (down-regulated),
 *  red toward +1 (up-regulated), and genuinely untinted — not a faint floor of either color —
 *  at exactly zero, so "unchanged" reads as neutral rather than a washed-out color. */
function fill(t: number): string {
  if (t === 0) return 'transparent';
  const accent = t > 0 ? 'var(--danger)' : 'var(--presence)';
  const strength = Math.abs(t);
  return `color-mix(in oklab, ${accent} ${(strength * 88).toFixed(1)}%, transparent)`;
}

// A gene-expression heat map: genes × samples, each cell a log2 fold-change tinted on a
// DIVERGING scale centered at zero. Directly extends matrixgrid's cell-grid/hover/tooltip
// technique with a two-sided accent instead of matrixgrid's single-hue sequential ramp, since
// this is a signed comparison against a baseline, not a bounded magnitude.
export function ExpressionHeatmap({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  genes,
  samples,
  values,
  // clusterGenes / clusterSamples are accepted for forward-compatibility only. Real
  // hierarchical-clustering reorder is nontrivial math this component doesn't fabricate — both
  // are currently a no-op reservation; rows and columns always render in the given order.
  scaleLabel = 'log2 fold-change',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  const rows = Array.isArray(genes) ? genes : [];
  const cols = Array.isArray(samples) ? samples : [];
  // A ragged, short, or wrong-shaped `values` (even a flat array where a matrix was expected)
  // is a malformed prop, not a crash: every reading that isn't a real finite number at its
  // (gene, sample) slot renders as an explicit, visible 0 (unchanged) rather than NaN.
  const grid: number[][] = rows.map((_, ri) => {
    const src = Array.isArray(values) ? values[ri] : undefined;
    return cols.map((__, ci) => {
      const v = Array.isArray(src) ? src[ci] : undefined;
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    });
  });

  // The scale's domain is the largest magnitude actually present, so a panel of mild changes
  // doesn't wash out at the same intensity as one with a 6-fold outlier. Floored just above
  // zero so an all-unchanged panel still divides cleanly instead of by zero.
  const maxAbs = Math.max(1e-9, ...grid.flat().map((v) => Math.abs(v)));
  const norm = (v: number) => Math.max(-1, Math.min(1, v / maxAbs));

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {rows.length === 0 || cols.length === 0 ? (
        <BlockEmpty message="Needs at least one gene and one sample to plot" />
      ) : (
        <div className="eh-wrap">
          <div
            className="eh-grid"
            style={{
              gridTemplateColumns: `minmax(0, auto) repeat(${cols.length}, minmax(0, var(--eh-cell)))`,
            }}
          >
            <span className="eh-corner" />
            {cols.map((c, ci) => (
              <span key={ci} className={`eh-colh ${hover?.c === ci ? 'on' : ''}`} title={c}>
                {c}
              </span>
            ))}
            {rows.map((gene, ri) => (
              <Row
                key={ri}
                ri={ri}
                label={gene}
                vals={grid[ri]}
                colCount={cols.length}
                norm={norm}
                hover={hover}
                setHover={setHover}
              />
            ))}
          </div>

          <div className="eh-legend">
            <span className="faint tab-num">{fmtFold(-maxAbs)}</span>
            {LEGEND_STOPS.map((s) => (
              <span key={s} className="eh-swatch" style={{ background: fill(s) }} />
            ))}
            <span className="faint tab-num">{fmtFold(maxAbs)}</span>
            <span className="eh-scale-label faint">{scaleLabel}</span>
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

function Row({
  ri,
  label,
  vals,
  colCount,
  norm,
  hover,
  setHover,
}: {
  ri: number;
  label: string;
  vals: number[];
  colCount: number;
  norm: (v: number) => number;
  hover: { r: number; c: number } | null;
  setHover: (h: { r: number; c: number } | null) => void;
}) {
  return (
    <>
      <span className={`eh-rowh ${hover?.r === ri ? 'on' : ''}`} title={label}>
        {label}
      </span>
      {Array.from({ length: colCount }).map((_, ci) => {
        const v = vals[ci] ?? 0;
        const t = norm(v);
        const on = hover?.r === ri && hover?.c === ci;
        const cross = hover && (hover.r === ri || hover.c === ci);
        return (
          <div
            key={ci}
            className={`eh-cell ${on ? 'hot' : ''} ${cross && !on ? 'cross' : ''}`}
            style={{
              background: fill(t),
              color: Math.abs(t) > 0.55 ? 'var(--surface-deep)' : 'var(--text-secondary)',
            }}
            onMouseEnter={() => setHover({ r: ri, c: ci })}
            onMouseLeave={() => setHover(null)}
          >
            <span className="eh-v tab-num">{fmtFold(v)}</span>
            {on && <span className="eh-tip tab-num">{fmtFold(v)}</span>}
          </div>
        );
      })}
    </>
  );
}
