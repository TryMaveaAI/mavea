import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import type { PayBandChartProps, PayBandMarker } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PayBandChartProps & { delay?: number };

interface PlacedMarker extends PayBandMarker {
  pct: number | null;
}

export function PayBandChart({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  role,
  min,
  mid,
  max,
  markers,
  currency = 'USD',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const bandMin = Number.isFinite(min) ? min : 0;
    const rawMax = Number.isFinite(max) ? max : bandMin + 1;
    const bandMax = rawMax > bandMin ? rawMax : bandMin + 1;
    const bandMid = Number.isFinite(mid)
      ? Math.min(Math.max(mid, bandMin), bandMax)
      : (bandMin + bandMax) / 2;
    const span = bandMax - bandMin;
    const pct = (v: number) => ((v - bandMin) / span) * 100;

    const list: PlacedMarker[] = (Array.isArray(markers) ? markers : []).map((m) => {
      const name = typeof m?.name === 'string' && m.name.trim() ? m.name.trim() : 'Unnamed';
      const flag = m?.flag === true;
      const value = typeof m?.value === 'number' && Number.isFinite(m.value) ? m.value : NaN;
      const p = Number.isFinite(value) ? Math.min(100, Math.max(0, pct(value))) : null;
      return { name, value, flag, pct: p };
    });

    return { bandMin, bandMid, bandMax, midPct: pct(bandMid), list };
  }, [min, mid, max, markers]);

  const fmt = (v: number) => formatValue(v, { currency, compact: true });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-pb-head">
        <span className="c2-pb-role">{role}</span>
        <span className="c2-pb-range tab-num mono faint">
          {fmt(geom.bandMin)} – {fmt(geom.bandMax)}
        </span>
      </div>
      <div className="c2-pb" onMouseLeave={() => setHot(null)}>
        <div className="c2-pb-track">
          <span className="c2-pb-band c2-pb-band-lo" style={{ width: `${geom.midPct}%` }} />
          <span
            className="c2-pb-band c2-pb-band-hi"
            style={{ left: `${geom.midPct}%`, width: `${100 - geom.midPct}%` }}
          />
          <span
            className="c2-pb-mid"
            style={{ left: `${geom.midPct}%` }}
            title={`Midpoint ${fmt(geom.bandMid)}`}
          />
          {geom.list.map((m, i) => {
            if (m.pct === null) return null;
            const active = hot === i;
            return (
              <button
                key={i}
                type="button"
                className={
                  'c2-pb-marker m-stagger-item m-scale-in' +
                  (m.flag ? ' flagged' : '') +
                  (active ? ' on' : '')
                }
                style={
                  {
                    left: `${m.pct}%`,
                    ['--i' as string]: i,
                  } as CSSProperties
                }
                onMouseEnter={() => setHot(i)}
                onFocus={() => setHot(i)}
                aria-label={`${m.name}: ${Number.isFinite(m.value) ? fmt(m.value) : 'no value'}`}
              >
                {active && (
                  <span className="c2-pb-tip">
                    <b>{m.name}</b>
                    <span className="tab-num mono">
                      {Number.isFinite(m.value) ? fmt(m.value) : '—'}
                    </span>
                    {m.flag && <span className="c2-pb-tip-flag">equity watch</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="c2-pb-ticks">
          <span className="c2-pb-tick" style={{ left: '0%' }}>
            Min · {fmt(geom.bandMin)}
          </span>
          <span className="c2-pb-tick c2-pb-tick-mid" style={{ left: `${geom.midPct}%` }}>
            Mid · {fmt(geom.bandMid)}
          </span>
          <span className="c2-pb-tick c2-pb-tick-end" style={{ left: '100%' }}>
            Max · {fmt(geom.bandMax)}
          </span>
        </div>
      </div>
      {geom.list.length > 0 && (
        <div className="c2-pb-legend">
          {geom.list.map((m, i) => (
            <button
              key={i}
              type="button"
              className={'c2-pb-leg' + (m.flag ? ' flagged' : '') + (hot === i ? ' on' : '')}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
            >
              <i style={{ background: m.flag ? 'var(--warning)' : 'var(--presence)' }} />
              <span className="c2-pb-leg-name">{m.name}</span>
              <span className="tab-num mono c2-pb-leg-val">
                {Number.isFinite(m.value) ? fmt(m.value) : '—'}
              </span>
            </button>
          ))}
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
