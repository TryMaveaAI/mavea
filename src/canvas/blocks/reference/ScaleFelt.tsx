import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScaleFeltProps, ScaleComparison } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScaleFeltProps & { delay?: number };

// Makes an abstract magnitude tangible: the raw figure shown big, then a stack of
// relatable equivalences ("as tall as ~12 double-decker buses") that give it a feel.
// Each comparison gets a small proportional cue — a bar scaled to its `howMany`
// relative to the largest numeric count in the set, so the eye reads the relative
// reach at a glance. Comparisons with a non-numeric `howMany` (e.g. "a lifetime")
// keep the row but skip the bar, since there is no honest length to draw.
export function ScaleFelt({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  value,
  unit,
  comparisons,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const rows: ScaleComparison[] = comparisons ?? [];

  // A comparison's count is "drawable" only when it parses to a positive, finite
  // number. We accept both real numbers and numeric strings ("12", "177") so a model
  // that emits text still gets a bar; anything else ("a lifetime") draws no bar.
  const countOf = (c: ScaleComparison): number | null => {
    const raw = typeof c.howMany === 'number' ? c.howMany : Number(String(c.howMany).trim());
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  };

  // Scale every drawable bar against the largest count, so the biggest equivalence
  // fills the track and the rest read proportionally. With no drawable counts the
  // bars are simply omitted.
  const maxCount = rows.reduce((m: number, c: ScaleComparison) => {
    const n = countOf(c);
    return n !== null && n > m ? n : m;
  }, 0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* the raw figure, rendered big — underline gesture resolves to the headline */}
      <div className="scf-figure" data-mark="underline">
        <span className="scf-value">{value}</span>
        {unit && <span className="scf-unit">{unit}</span>}
      </div>

      {rows.length > 0 && (
        <div className="scf-rows">
          {rows.map((c, i) => {
            const n = countOf(c);
            const pct = n !== null && maxCount > 0 ? Math.max((n / maxCount) * 100, 4) : 0;
            return (
              <div key={i} className="scf-row">
                <div className="scf-line">
                  <span className="scf-count">{c.howMany}</span>
                  <span className="scf-to">{c.to}</span>
                </div>
                {pct > 0 && (
                  <div className="scf-track" aria-hidden="true">
                    <div className="scf-bar" style={{ width: pct + '%' }} />
                  </div>
                )}
                {c.note && <div className="scf-note">{c.note}</div>}
              </div>
            );
          })}
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
