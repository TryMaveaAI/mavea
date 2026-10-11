import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import type { BurnRunwayProps } from './types';
import { labelStride } from './chartMath';
import { richInnerHtml } from '../../../lib/richText';

type Props = BurnRunwayProps & { delay?: number };

const W = 340;
const H = 220;
const PAD_L = 52;
const PAD_R = 16;
// A row above the plot holds the runway figure, so the balance line can never run under it.
const PAD_T = 30;
const TICK_FS = 9;
const PAD_B = 24;
const PW = W - PAD_L - PAD_R;
const PH = H - PAD_T - PAD_B;

function fmtCash(v: number, currency = '$'): string {
  if (Math.abs(v) >= 1_000_000)
    return `${currency}${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(v) >= 1_000) return `${currency}${Math.round(v / 1_000)}K`;
  return `${currency}${Math.round(v)}`;
}

export function BurnRunway({
  title = 'Cash Runway',
  icon = 'chart',
  iconColor = 'var(--presence)',
  months,
  initialCash,
  runwayMonths: runwayOverride,
  currency = '$',
  footer,
  delay,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const Ic = Icon[icon] ?? Icon.chart;

  const model = useMemo(() => {
    if (!months.length) return null;

    // Compute running balance: use explicit balance if provided, else subtract burn
    let running =
      initialCash ?? (months[0].balance !== undefined ? months[0].balance + months[0].burn : 0);
    const data = months.map((m) => {
      if (m.balance !== undefined) {
        running = m.balance;
      } else {
        running = running - m.burn;
      }
      return { label: m.label, burn: m.burn, balance: running };
    });

    const maxBurn = Math.max(...data.map((d) => d.burn), 1);
    const maxBal = Math.max(...data.map((d) => d.balance), 0);
    // The domain ends ON a tick, so the highest point sits under the top gridline rather than
    // in an unlabelled band above it.
    const raw = Math.max(maxBal, maxBurn) * 1.05;
    const step = niceStep(raw);
    const yHi = Math.ceil(raw / step) * step;
    const yTicks = ticks(0, yHi, step);

    const sy = (v: number) => PAD_T + PH - (Math.max(0, v) / yHi) * PH;
    const barSpacing = PW / months.length;
    const barW = barSpacing * 0.55;
    const toX = (i: number) => PAD_L + i * barSpacing + barSpacing / 2;

    // One vertex per month and nothing before the first: an opening stub from the plot edge
    // read as a month with no label.
    const balancePts = data.map((d, i) => `${toX(i)},${sy(d.balance)}`).join(' ');
    const stride = labelStride(
      data.map((d) => d.label),
      toX(data.length - 1) - toX(0),
      TICK_FS,
    );

    // Runway: extrapolate if balance never reaches zero
    let runway = runwayOverride;
    if (runway == null) {
      const lastBal = data[data.length - 1].balance;
      if (lastBal <= 0) {
        // Find first negative month
        const idx = data.findIndex((d) => d.balance <= 0);
        runway = idx >= 0 ? idx + 1 : months.length;
      } else {
        const avgBurn = data.reduce((s, d) => s + d.burn, 0) / data.length;
        runway = avgBurn > 0 ? Math.round(lastBal / avgBurn) + months.length : 99;
      }
    }

    return { data, yTicks, yHi, toX, sy, balancePts, barW, runway, stride };
  }, [months, initialCash, runwayOverride]);

  if (!model) return null;
  const { data, yTicks, yHi, toX, sy, balancePts, barW, runway, stride } = model;
  const clipId = `br-${uid}`;
  const lastBal = data[data.length - 1].balance;
  const runwayColor =
    runway < 12 ? 'var(--danger)' : runway < 18 ? 'var(--warning)' : 'var(--insight)';

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        {title}
      </div>

      <div className="canvas-figure">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={title}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD_L} y={PAD_T} width={PW} height={PH} />
            </clipPath>
          </defs>

          {/* Grid lines + y-axis labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                y1={sy(t)}
                x2={W - PAD_R}
                y2={sy(t)}
                stroke="var(--grid-line)"
                strokeWidth={0.8}
              />
              <text
                x={PAD_L - 4}
                y={sy(t) + 4}
                textAnchor="end"
                fontSize={9}
                fill="var(--text-muted)"
                fontFamily="inherit"
              >
                {fmtCash(t, currency)}
              </text>
            </g>
          ))}

          {/* Zero baseline */}
          <line
            x1={PAD_L}
            y1={sy(0)}
            x2={W - PAD_R}
            y2={sy(0)}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />

          {/* Burn bars */}
          {data.map((d, i) => {
            const bH = (d.burn / yHi) * PH;
            const bY = sy(0) - bH;
            return (
              <rect
                key={i}
                x={toX(i) - barW / 2}
                y={bY}
                width={barW}
                height={bH}
                fill="var(--danger)"
                fillOpacity={0.22}
                rx={2}
              />
            );
          })}

          {/* Balance line (polyline) */}
          <polyline
            points={balancePts}
            fill="none"
            stroke="var(--insight)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${clipId})`}
          />

          {/* Balance dots */}
          {data.map((d, i) => (
            <circle
              key={i}
              cx={toX(i)}
              cy={sy(d.balance)}
              r={2.5}
              fill="var(--insight)"
              clipPath={`url(#${clipId})`}
            />
          ))}

          {/* X-axis labels, thinned only as far as their measured widths need */}
          {data.map((d, i) => {
            if (i % stride !== 0) return null;
            return (
              <text
                key={i}
                x={toX(i)}
                y={H - PAD_B + 13}
                textAnchor="middle"
                fontSize={TICK_FS}
                fill="var(--text-muted)"
                fontFamily="inherit"
              >
                {d.label}
              </text>
            );
          })}

          {/* Runway annotation (top-right) */}
          <text
            x={W - PAD_R}
            y={PAD_T - 12}
            textAnchor="end"
            fontSize={12}
            fontWeight="600"
            fill={runwayColor}
            fontFamily="inherit"
          >
            ≈ {runway}mo runway
          </text>

          {/* Current cash label near last balance dot */}
          <text
            x={toX(data.length - 1)}
            y={sy(Math.max(0, lastBal)) - 8}
            textAnchor="middle"
            fontSize={9}
            fill="var(--insight)"
            fontFamily="inherit"
          >
            {fmtCash(Math.max(0, lastBal), currency)}
          </text>
        </svg>
      </div>

      <div className="c2-brw-legend">
        <span>
          <i className="c2-brw-sw-line" aria-hidden="true" />
          Cash balance
        </span>
        <span>
          <i className="c2-brw-sw-bar" aria-hidden="true" />
          Monthly burn
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
