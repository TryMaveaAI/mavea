import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HealthgridProps, HealthLevel } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HealthgridProps & { delay?: number };

const META: Record<HealthLevel, { c: string; label: string }> = {
  ok: { c: 'var(--insight)', label: 'Operational' },
  warn: { c: 'var(--warning)', label: 'Degraded' },
  down: { c: 'var(--danger)', label: 'Outage' },
};

export function Healthgrid({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  cols = 4,
  cells,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const [hover, setHover] = useState<number | null>(null);

  const okCount = cells.filter((c) => c.level === 'ok').length;
  const allOk = okCount === cells.length;
  // floor the denominator so an empty `cells` array renders 0% instead of NaN%
  const okPct = Math.round((okCount / (cells.length || 1)) * 100);
  // overall banner reflects the worst level present
  const worst: HealthLevel = cells.some((c) => c.level === 'down')
    ? 'down'
    : cells.some((c) => c.level === 'warn')
      ? 'warn'
      : 'ok';
  // Salient cell: first outage, else first degraded, else first cell (all-ok).
  // Mavéa's gesture circles whichever cell is the most newsworthy.
  const salient = (() => {
    for (const lvl of ['down', 'warn'] as HealthLevel[]) {
      const i = cells.findIndex((c) => c.level === lvl);
      if (i !== -1) return i;
    }
    return 0;
  })();

  const hc = hover != null ? cells[hover] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="hg-banner" style={{ ['--hg-c' as string]: META[worst].c } as CSSProperties}>
        <span className="hg-banner-dot" />
        <span className="hg-banner-text">
          {allOk ? 'All systems operational' : `${okCount}/${cells.length} operational`}
        </span>
        <span className="hg-banner-pct tab-num faint">{okPct}%</span>
      </div>

      <div
        className="hg-grid"
        style={{ ['--hg-cols' as string]: cols } as CSSProperties}
        onMouseLeave={() => setHover(null)}
      >
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`hg-cell ${c.level} ${hover === i ? 'on' : ''}`}
            style={{ ['--cell-c' as string]: META[c.level].c } as CSSProperties}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            data-mark={i === salient ? 'circle' : undefined}
          >
            <span className="hg-cell-glow" />
            <span className="hg-cell-label">{c.label}</span>
            {c.value && <span className="hg-cell-val tab-num">{c.value}</span>}
          </button>
        ))}
      </div>

      <div
        className="hg-detail"
        data-open={hc != null}
        style={{ ['--hg-c' as string]: hc ? META[hc.level].c : 'var(--presence)' } as CSSProperties}
      >
        {hc && (
          <>
            <span className="hg-detail-top">
              <span className="hg-detail-name">{hc.label}</span>
              <span className="hg-detail-state">{META[hc.level].label}</span>
            </span>
            <span className="hg-detail-sub faint">
              {hc.detail || `${hc.label} — ${hc.value || META[hc.level].label}`}
            </span>
          </>
        )}
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
