import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, niceStep, ticks } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { useHostWidth } from '../../lib/useBoxSize';
import { labelStride } from './chartMath';
import type { CandlestickProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CandlestickProps & { delay?: number };

// The plot stretches to its box (preserveAspectRatio="none"), so strokes are drawn with
// non-scaling-stroke: in viewBox units a wick was several pixels wide on a wide card.
const X_LABEL_PX = 11; // .c2-cs-xt at --fs-xs

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
  const [axisRef, axisW] = useHostWidth<HTMLDivElement>();
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
    // The same round step niceDomain snapped to, so each gridline is a price worth reading
    // (500, 1,000…) rather than the domain's midpoint (1,250).
    return { hi: d1, span: d1 - d0 || 1, priceTicks: ticks(d0, d1, niceStep(d1 - d0)) };
  }, [candles]);
  const y = (v: number) => ((hi - v) / span) * (H - 10) + 5;
  const volOn = hasVol && showVol;
  // Everything positioned in HTML over the plot is a share of the WHOLE viewBox height, which
  // grows by the volume band when it shows.
  const totalH = H + (volOn ? volH : 0);
  const step = 100 / (candles.length || 1);
  const stride = labelStride(
    candles.map((c) => c.label),
    axisW * (1 - step / 100),
    X_LABEL_PX,
  );
  const lastI = candles.length - 1;
  const showX = (i: number) => i === lastI || (i % stride === 0 && lastI - i >= stride);
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
            {sel.vol != null && (
              <span>
                Vol <b className="tab-num mono">{formatValue(sel.vol, { compact: true })}</b>
              </span>
            )}
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
              <span key={t} className="c2-cs-yt" style={{ top: `${(y(t) / totalH) * 100}%` }}>
                {formatValue(t)}
              </span>
            ))}
          {volOn && (
            // The volume band's own scale: its tallest bar is this much.
            <span className="c2-cs-yt c2-cs-vt" style={{ top: `${(H / totalH) * 100}%` }}>
              <span>vol</span>
              {formatValue(maxVol, { compact: true })}
            </span>
          )}
        </div>
        <div className="c2-cs" onMouseLeave={() => setHot(null)}>
          <svg
            role="img"
            aria-label={title}
            viewBox={`0 0 100 ${totalH}`}
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
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {volOn && (
              <line
                x1="0"
                y1={H}
                x2="100"
                y2={H}
                stroke="var(--line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}
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
                  <line
                    x1={cx}
                    y1={y(c.h)}
                    x2={cx}
                    y2={y(c.l)}
                    stroke={col}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={cx - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(bot - top, 0.8)}
                    fill={col}
                    rx="0.6"
                    data-mark={i === salient ? 'circle' : undefined}
                  />
                  {volOn && (
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
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="c2-cs-axis" ref={axisRef}>
        {candles.map((c, i) =>
          showX(i) ? (
            <span
              key={i}
              className="c2-cs-xt faint"
              // The CSS ellipsis can cut an over-long period; the full name stays on hover.
              title={c.label}
              style={{ ['--at' as string]: `${step * i + step / 2}%` } as CSSProperties}
            >
              {c.label}
            </span>
          ) : null,
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
