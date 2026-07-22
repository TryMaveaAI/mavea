import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { Legend } from '../../lib/axis';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { GroupedBarsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GroupedBarsProps & { delay?: number };

export function GroupedBars({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = '',
  groups,
  series,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [hot, setHot] = useState<{ g: number; s: number } | null>(null);

  const active = series.filter((s) => !off[s.name]);

  // A nice, rounded y-axis: the ceiling lands on a round number (18 → 20) so bars no longer
  // pin to the tallest datum with empty space above, and the gridlines carry real value
  // labels instead of being unlabelled thirds. The domain floors at 0 for bar charts.
  const { scale, axisTicks } = useMemo(() => {
    const values = active.flatMap((s) => s.data);
    const ext = extent(values);
    const top = ext ? Math.max(ext[1], 0) : 1;
    const [, niceTop] = niceDomain(0, top);
    const sc = scaleLinear([0, niceTop], [0, 100]);
    return { scale: sc, axisTicks: sc.ticks(4) };
  }, [active]);

  // The bar with the highest value across all groups and series is the most prominent shape.
  const salient = (() => {
    let bestG = 0;
    let bestS = 0;
    let bestV = -Infinity;
    series.forEach((s, si) => {
      if (off[s.name]) return;
      s.data.forEach((v, gi) => {
        if (v > bestV) {
          bestV = v;
          bestG = gi;
          bestS = si;
        }
      });
    });
    return { g: bestG, s: bestS };
  })();

  if (!hasData(series.flatMap((s) => s.data))) {
    return (
      <div className="card reveal c2">
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  const fmt = (v: number) => formatValue(v, { unit: unit || undefined });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-gb-wrap">
        {/* y-axis: nice ticks with formatted value labels */}
        <div className="c2-gb-axis" aria-hidden="true">
          {axisTicks
            .slice()
            .reverse()
            .map((t) => (
              <span key={t} className="c2-gb-axis-t" style={{ bottom: `${scale(t)}%` }}>
                {formatValue(t)}
              </span>
            ))}
        </div>
        <div className="c2-gb" onMouseLeave={() => setHot(null)}>
          <div className="c2-gb-grid">
            {axisTicks.map((t) => (
              <span key={t} className="c2-gb-line" style={{ bottom: `${scale(t)}%` }} />
            ))}
          </div>
          {groups.map((g, gi) => (
            <div key={gi} className="c2-gb-group">
              <div className="c2-gb-cluster">
                {series.map((s, si) => {
                  if (off[s.name]) return null;
                  const v = s.data[gi] ?? 0;
                  const h = Math.max(scale(v), v > 0 ? 1 : 0);
                  const isHot = hot && hot.g === gi && hot.s === si;
                  return (
                    <div
                      key={si}
                      className={'c2-gb-bar' + (isHot ? ' on' : '')}
                      style={{
                        height: `${h}%`,
                        background: s.color,
                        ['--bd' as string]: (gi * series.length + si) * 30 + 'ms',
                      }}
                      onMouseEnter={() => setHot({ g: gi, s: si })}
                      data-mark={gi === salient.g && si === salient.s ? 'circle' : undefined}
                    >
                      {isHot && (
                        <div className="c2-gb-tip">
                          <b style={{ color: s.color }}>{s.name}</b>
                          <span className="tab-num mono">{fmt(v)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="c2-gb-glabel faint">{g}</div>
            </div>
          ))}
        </div>
      </div>
      <Legend
        items={series.map((s) => ({ label: s.name, color: s.color }))}
        active={hot ? hot.s : null}
        off={new Set(series.map((s, i) => (off[s.name] ? i : -1)).filter((i) => i >= 0))}
        onToggle={(i) => {
          const name = series[i]?.name;
          if (name) setOff((o) => ({ ...o, [name]: !o[name] }));
        }}
      />
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
