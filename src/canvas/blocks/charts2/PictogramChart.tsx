import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { IconKey } from '../../../icons/icons';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { PictogramChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PictogramChartProps & { delay?: number };

const DEFAULT_ICON: IconKey = 'sparkle';
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
  'var(--danger)',
];

interface Cell {
  cat: string;
  color: string;
  icon: IconKey | null;
}

export function PictogramChart({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  categories,
  unitValue,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hot, setHot] = useState<string | null>(null);

  const geom = useMemo(() => {
    const list = (Array.isArray(categories) ? categories : []).map((c, i) => {
      const label = typeof c?.label === 'string' && c.label.trim() ? c.label.trim() : 'Category';
      const count = Number.isFinite(c?.count) && c.count > 0 ? c.count : 0;
      const color = c?.color || PALETTE[i % PALETTE.length];
      const iconKey: IconKey =
        typeof c?.icon === 'string' && c.icon in Icon ? c.icon : DEFAULT_ICON;
      return { label, count, color, iconKey };
    });

    const total = list.reduce((s, c) => s + c.count, 0);
    const unit =
      Number.isFinite(unitValue) && (unitValue as number) > 0
        ? (unitValue as number)
        : Math.max(1, Math.ceil(total / 100) || 1);

    const cells: Cell[] = [];
    for (const c of list) {
      if (c.count <= 0) continue;
      const n = Math.round(c.count / unit);
      for (let i = 0; i < n && cells.length < 100; i++) {
        cells.push({ cat: c.label, color: c.color, icon: c.iconKey });
      }
    }
    while (cells.length < 100) cells.push({ cat: '', color: 'var(--cell-empty)', icon: null });

    return { list, total, unit, cells: cells.slice(0, 100) };
  }, [categories, unitValue]);

  if (!hasData(geom.list.map((c) => c.count))) {
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
      <div className="c2-pic-wrap">
        <div className="c2-pic-grid" onMouseLeave={() => setHot(null)}>
          {geom.cells.map((c, i) => {
            const isEmpty = !c.cat;
            const active = hot === c.cat;
            const dim = hot != null && !active && !isEmpty;
            if (isEmpty) {
              return <span key={i} className="c2-pic-cell c2-pic-cell-empty" />;
            }
            const GlyphIcon = c.icon ? Icon[c.icon] : Icon[DEFAULT_ICON];
            return (
              <span
                key={i}
                className="c2-pic-cell m-stagger-item m-scale-in"
                style={
                  {
                    color: c.color,
                    opacity: dim ? 0.22 : 1,
                    transform: active ? 'scale(1.12)' : undefined,
                    ['--i' as string]: i,
                    ['--stagger' as string]: '4ms',
                  } as CSSProperties
                }
                onMouseEnter={() => setHot(c.cat)}
              >
                <GlyphIcon className="c2-pic-glyph" />
              </span>
            );
          })}
        </div>
        <div className="c2-pic-legend">
          {geom.list.map((c) => {
            if (c.count <= 0) return null;
            const active = hot === c.label;
            const GlyphIcon = Icon[c.iconKey];
            const pct = geom.total > 0 ? (c.count / geom.total) * 100 : 0;
            return (
              <button
                key={c.label}
                type="button"
                className={'c2-pic-leg' + (active ? ' on' : '')}
                onMouseEnter={() => setHot(c.label)}
                onMouseLeave={() => setHot(null)}
              >
                <GlyphIcon className="c2-pic-leg-ic" style={{ color: c.color }} />
                <span className="c2-pic-leg-name">{c.label}</span>
                <span className="tab-num mono c2-pic-leg-val">
                  {c.count.toLocaleString()} · {Math.round(pct)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="c2-pic-key faint">
        1 glyph = {geom.unit.toLocaleString()} unit{geom.unit === 1 ? '' : 's'}
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
