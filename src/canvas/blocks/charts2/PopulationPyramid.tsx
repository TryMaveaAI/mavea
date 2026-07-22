import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { PopulationPyramidProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PopulationPyramidProps & { delay?: number };

interface Band {
  label: string;
  left: number;
  right: number;
}

export function PopulationPyramid({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  bands,
  leftLabel,
  rightLabel,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const list: Band[] = (Array.isArray(bands) ? bands : []).map((b) => ({
      label: typeof b?.label === 'string' && b.label.trim() ? b.label.trim() : '—',
      left: Number.isFinite(b?.left) && b.left >= 0 ? b.left : 0,
      right: Number.isFinite(b?.right) && b.right >= 0 ? b.right : 0,
    }));
    // Both halves share one scale (the larger side of any band) so a longer bar always means
    // a genuinely larger count, comparable across the whole chart, not just within its row.
    const maxVal = list.reduce((m, b) => Math.max(m, b.left, b.right), 0) || 1;
    return { list, maxVal };
  }, [bands]);

  if (!hasData(geom.list.flatMap((b) => [b.left, b.right]))) {
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

  const lLabel = typeof leftLabel === 'string' && leftLabel.trim() ? leftLabel : 'Left';
  const rLabel = typeof rightLabel === 'string' && rightLabel.trim() ? rightLabel : 'Right';
  const fmt = (v: number) =>
    formatValue(v, { unit: unit || undefined, compact: geom.maxVal >= 100_000 });
  const pct = (v: number) => Math.min(100, (v / geom.maxVal) * 100);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-pp-head">
        <span className="c2-pp-head-lbl left">{lLabel}</span>
        <span className="c2-pp-head-lbl right">{rLabel}</span>
      </div>
      <div className="c2-pp" onMouseLeave={() => setHot(null)}>
        {geom.list.map((b, i) => {
          const active = hot === i;
          return (
            <div
              key={i}
              className={'c2-pp-row' + (active ? ' on' : '')}
              onMouseEnter={() => setHot(i)}
            >
              <span className="c2-pp-val left tab-num mono">{fmt(b.left)}</span>
              <div className="c2-pp-track left">
                <span
                  className="c2-pp-bar left m-stagger-item m-scale-in"
                  style={{ width: `${pct(b.left)}%`, ['--i' as string]: i } as CSSProperties}
                />
              </div>
              <span className="c2-pp-band-lbl">{b.label}</span>
              <div className="c2-pp-track right">
                <span
                  className="c2-pp-bar right m-stagger-item m-scale-in"
                  style={{ width: `${pct(b.right)}%`, ['--i' as string]: i } as CSSProperties}
                />
              </div>
              <span className="c2-pp-val right tab-num mono">{fmt(b.right)}</span>
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
