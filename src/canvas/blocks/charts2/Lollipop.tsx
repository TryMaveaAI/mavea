import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { LollipopProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LollipopProps & { delay?: number };
type Sort = 'orig' | 'desc' | 'asc';

export function Lollipop({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = '',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>('desc');

  // A nice domain so the longest stem isn't pinned hard to the track's right edge.
  const scale = useMemo(() => {
    const ext = extent(rows.map((r) => r.value));
    const top = ext ? Math.max(ext[1], 0) : 1;
    return scaleLinear(niceDomain(0, top), [0, 100]);
  }, [rows]);

  // The row with the highest value has the longest stem — the most salient datum.
  const salient = rows.reduce((best, r, i) => (r.value > rows[best].value ? i : best), 0);
  const fmt = (v: number) => formatValue(v, { unit: unit || undefined });
  const ordered = useMemo(() => {
    const idx = rows.map((_, i) => i);
    if (sort === 'desc') idx.sort((a, b) => rows[b].value - rows[a].value);
    if (sort === 'asc') idx.sort((a, b) => rows[a].value - rows[b].value);
    return idx;
  }, [rows, sort]);

  const cycle = () => setSort((s) => (s === 'desc' ? 'asc' : s === 'asc' ? 'orig' : 'desc'));
  const sortLbl = sort === 'desc' ? 'High → low' : sort === 'asc' ? 'Low → high' : 'Original';

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <button className="mini-btn c2-sort-btn" onClick={cycle}>
        <Icon.arrowDown /> {sortLbl}
      </button>
      <div className="c2-lp" onMouseLeave={() => setHot(null)}>
        {ordered.map((oi) => {
          const r = rows[oi];
          const col = r.color || 'var(--presence)';
          const w = scale(r.value);
          const active = hot === oi;
          return (
            <div
              key={oi}
              className={'c2-lp-row' + (active ? ' on' : '')}
              onMouseEnter={() => setHot(oi)}
            >
              <div className="c2-lp-name">{r.label}</div>
              <div className="c2-lp-track">
                <div className="c2-lp-stem" style={{ width: `${w}%`, background: col }} />
                <div
                  className="c2-lp-circ"
                  style={{
                    left: `${w}%`,
                    borderColor: col,
                    background: active ? col : 'var(--surface-elevated)',
                  }}
                  data-mark={oi === salient ? 'point' : undefined}
                />
                {active && (
                  <div className="c2-lp-tip" style={{ left: `${w}%` }}>
                    <span className="tab-num mono" style={{ color: col }}>
                      {fmt(r.value)}
                    </span>
                    {r.sub && <span className="faint">· {r.sub}</span>}
                  </div>
                )}
              </div>
              <div className="c2-lp-val tab-num mono">{fmt(r.value)}</div>
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
