import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { CandlestickProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CandlestickProps & { delay?: number };

// .c2-cs-axis is a `justify-content: space-between` row holding the first/last candle's period
// label. Real date/period strings run much longer than the short demo fixture ("Jan '24" vs.
// "Week ending March 3rd, 2024 (pre-market)") and would otherwise wrap or push the opposite
// label past the card edge — cap each label at half the row and ellipsize, same fix as
// Bubble's point-label tip in this family.
const AXIS_LABEL_STYLE: CSSProperties = {
  maxWidth: '48%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function Candlestick({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = '',
  candles,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const [showVol, setShowVol] = useState(true);
  const fmt = (v: number) => formatValue(v, { unit: unit || undefined });

  const hasVol = candles.some((c) => c.vol != null);
  const H = 180;
  const volH = 34;
  const maxVol = Math.max(...candles.map((c) => c.vol || 0), 1);

  // A nice price domain so the wicks have headroom and the y-axis carries real price labels,
  // instead of unlabelled quarter-gridlines pinned to the data extremes. Candlesticks don't
  // floor at 0 — price ranges sit where the data is.
  const { hi, span, priceTicks } = useMemo(() => {
    const ext = extent(candles.flatMap((c) => [c.h, c.l]));
    const [d0, d1] = niceDomain(ext ? ext[0] : 0, ext ? ext[1] : 1);
    const ticks = [d0, d0 + (d1 - d0) / 2, d1];
    return { hi: d1, span: d1 - d0 || 1, priceTicks: ticks };
  }, [candles]);
  const y = (v: number) => ((hi - v) / span) * (H - 10) + 5;
  const step = 100 / (candles.length || 1);
  const bw = Math.min(step * 0.6, 7);

  // The candle with the widest high-low range dominates the chart visually.
  const salient = candles.reduce(
    (best, c, i) => (c.h - c.l > candles[best].h - candles[best].l ? i : best),
    0,
  );

  const sel = hot != null ? candles[hot] : null;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-cs-bar">
        {sel ? (
          <div className="c2-cs-ohlc">
            <span>
              O <b className="tab-num mono">{fmt(sel.o)}</b>
            </span>
            <span>
              H{' '}
              <b className="tab-num mono" style={{ color: 'var(--insight)' }}>
                {fmt(sel.h)}
              </b>
            </span>
            <span>
              L{' '}
              <b className="tab-num mono" style={{ color: 'var(--danger)' }}>
                {fmt(sel.l)}
              </b>
            </span>
            <span>
              C <b className="tab-num mono">{fmt(sel.c)}</b>
            </span>
          </div>
        ) : (
          <span className="faint">{candles.length} periods · hover a candle</span>
        )}
        {hasVol && (
          <button className="mini-btn c2-cs-vol-btn" onClick={() => setShowVol((v) => !v)}>
            {showVol ? <Icon.eye /> : <Icon.eyeOff />} Volume
          </button>
        )}
      </div>
      <div className="c2-cs-wrap">
        <div className="c2-cs-yaxis" aria-hidden="true">
          {priceTicks
            .slice()
            .reverse()
            .map((t) => (
              <span key={t} className="c2-cs-yt" style={{ top: `${(y(t) / H) * 100}%` }}>
                {formatValue(t)}
              </span>
            ))}
        </div>
        <div className="c2-cs" onMouseLeave={() => setHot(null)}>
          <svg
            role="img"
            aria-label={title}
            viewBox={`0 0 100 ${H + (hasVol && showVol ? volH : 0)}`}
            preserveAspectRatio="none"
            className="c2-cs-svg"
          >
            {priceTicks.map((t) => (
              <line
                key={t}
                x1="0"
                y1={y(t)}
                x2="100"
                y2={y(t)}
                stroke="var(--grid-line)"
                strokeWidth="0.3"
              />
            ))}
            {candles.map((c, i) => {
              const cx = step * i + step / 2;
              const up = c.c >= c.o;
              const col = up ? 'var(--insight)' : 'var(--danger)';
              const active = hot === i;
              const top = y(Math.max(c.o, c.c));
              const bot = y(Math.min(c.o, c.c));
              return (
                <g
                  key={i}
                  onMouseEnter={() => setHot(i)}
                  style={{
                    opacity: hot != null && !active ? 0.4 : 1,
                    transition: 'opacity var(--m-fast)',
                  }}
                >
                  <rect x={cx - step / 2} y="0" width={step} height={H} fill="transparent" />
                  <line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} stroke={col} strokeWidth="0.5" />
                  <rect
                    x={cx - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(bot - top, 0.8)}
                    fill={col}
                    rx="0.6"
                    data-mark={i === salient ? 'circle' : undefined}
                  />
                  {hasVol && showVol && (
                    <rect
                      x={cx - bw / 2}
                      y={H + (volH - ((c.vol || 0) / maxVol) * (volH - 4))}
                      width={bw}
                      height={((c.vol || 0) / maxVol) * (volH - 4)}
                      fill={col}
                      opacity="0.4"
                      rx="0.6"
                    />
                  )}
                  {active && (
                    <line
                      x1={cx}
                      y1="0"
                      x2={cx}
                      y2={H}
                      stroke="var(--hover-line)"
                      strokeWidth="0.4"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="c2-cs-axis">
        {/* Real date/period labels run much longer than the demo fixture's short strings —
            each span caps at half the row and ellipsizes instead of wrapping or pushing its
            sibling past the card edge, same fix as Bubble's point-label tip. */}
        <span className="faint" style={AXIS_LABEL_STYLE}>
          {candles[0]?.label}
        </span>
        <span className="faint" style={AXIS_LABEL_STYLE}>
          {candles[candles.length - 1]?.label}
        </span>
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
