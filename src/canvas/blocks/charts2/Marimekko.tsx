import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MarimekkoProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MarimekkoProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--text-muted)',
];

// A mosaic / Marimekko: column width is proportional to that group's total, and each column
// is split vertically into its category shares. You read magnitude (which group is biggest)
// AND mix (how each splits) in one glance — what a grid of pie charts only hints at. A shared
// category shows the same color in every column, so the eye tracks one band across groups;
// hovering a category lifts that band everywhere and dims the rest.
export function Marimekko({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  columns,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<string | null>(null);

  // Stable color per category label (first occurrence wins; an explicit color overrides).
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    let n = 0;
    for (const col of columns) {
      for (const s of col.segments) {
        if (map.has(s.label)) continue;
        map.set(s.label, s.color || PALETTE[n % PALETTE.length]);
        n += 1;
      }
    }
    return map;
  }, [columns]);

  const totals = columns.map((c) => c.segments.reduce((sum, s) => sum + Math.max(0, s.value), 0));

  // The largest segment in the largest column dominates both width and height.
  const salient = (() => {
    const bigCol = totals.indexOf(Math.max(...totals, 0));
    const col = columns[bigCol];
    const bigSeg = col
      ? col.segments.reduce((best, s, i) => (s.value > col.segments[best].value ? i : best), 0)
      : 0;
    return { c: bigCol, s: bigSeg };
  })();

  // Legend in first-seen order so it matches how the bands read left → right.
  const legend = [...colorOf.entries()];

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c2-mek" onMouseLeave={() => setHot(null)}>
        {columns.map((col, ci) => {
          const total = totals[ci] || 1;
          return (
            <div
              key={ci}
              className="c2-mek-col"
              style={{ flexGrow: total, flexBasis: 0 }}
              title={`${col.label} · ${total}${unit}`}
            >
              <div className="c2-mek-stack">
                {col.segments.map((s, si) => {
                  const c = colorOf.get(s.label)!;
                  const active = hot === s.label;
                  const dim = hot !== null && !active;
                  const pct = (Math.max(0, s.value) / total) * 100;
                  return (
                    <div
                      key={si}
                      className="c2-mek-seg"
                      style={{ height: `${pct}%`, background: c, opacity: dim ? 0.22 : 1 }}
                      onMouseEnter={() => setHot(s.label)}
                      data-mark={ci === salient.c && si === salient.s ? 'circle' : undefined}
                    >
                      {pct >= 14 && <span className="c2-mek-seg-v">{Math.round(pct)}%</span>}
                    </div>
                  );
                })}
              </div>
              <div className="c2-mek-col-lbl">
                <span className="c2-mek-col-name">{col.label}</span>
                <span className="tab-num mono c2-mek-col-tot">
                  {total}
                  {unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="c2-mek-legend">
        {legend.map(([label, c]) => (
          <button
            key={label}
            className={'c2-mek-leg' + (hot === label ? ' on' : '')}
            onMouseEnter={() => setHot(label)}
            onMouseLeave={() => setHot(null)}
          >
            <i style={{ background: c }} />
            {label}
          </button>
        ))}
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
