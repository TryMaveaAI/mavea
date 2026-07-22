import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { AblationTableProps, AblationRow } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AblationTableProps & { delay?: number };
type Direction = 'better' | 'worse' | 'flat';

/** Resolve better/worse/flat from an explicit call, falling back to the delta's sign read
 *  against which direction actually wins for this metric (accuracy-style vs. error-style). */
function resolveDirection(
  delta: number | null,
  given: AblationRow['deltaDirection'],
  higherBetter: boolean,
): Direction {
  if (given === 'better' || given === 'worse') return given;
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 === higherBetter ? 'better' : 'worse';
}

function fmtValue(v: number): string {
  return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—';
}

function fmtDelta(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '±0';
  const sign = v > 0 ? '+' : '−';
  return `${sign}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 3 })}`;
}

// An ML ablation-study comparison: the full model pinned at top, then one row per component
// removed, each diffed against that baseline with a colored ±delta chip. "What does each piece
// actually contribute" — ML/data-science research.
export function AblationTable({
  title,
  icon = 'sliders',
  iconColor = 'var(--presence)',
  baseline,
  baselineValue,
  metric,
  rows,
  higherBetter = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sliders;
  const list = (Array.isArray(rows) ? rows : []).filter(
    (r) =>
      r && typeof r.removed === 'string' && r.removed.trim().length > 0 && Number.isFinite(r.value),
  );
  const hasBaseline = typeof baseline === 'string' && baseline.trim().length > 0;
  const anchor = Number.isFinite(baselineValue) ? baselineValue : null;

  if (!hasBaseline && list.length === 0) {
    return (
      <div
        className="card reveal tbl"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No ablation results to compare" />
      </div>
    );
  }

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {metric && <div className="abl-cap">{metric}</div>}

      <div className="abl-list">
        {hasBaseline && (
          <div className="abl-row abl-baseline">
            <span className="abl-name">{baseline}</span>
            <span className="abl-val tab-num">{anchor != null ? fmtValue(anchor) : '—'}</span>
            <span className="abl-delta flat">baseline</span>
          </div>
        )}
        {list.map((r, i) => {
          const delta = Number.isFinite(r.delta)
            ? (r.delta as number)
            : anchor != null
              ? r.value - anchor
              : null;
          const dir = resolveDirection(delta, r.deltaDirection, higherBetter);
          return (
            <div
              key={i}
              className="abl-row m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i + 1 } as CSSProperties}
            >
              <span className="abl-name">w/o {r.removed}</span>
              <span className="abl-val tab-num">{fmtValue(r.value)}</span>
              <span className={`abl-delta ${dir}`}>{fmtDelta(delta)}</span>
            </div>
          );
        })}
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
