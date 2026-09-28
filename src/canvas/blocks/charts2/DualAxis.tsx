import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { estimateTextWidth } from '../../lib/fitText';
import { formatValue } from '../../lib/format';
import { Legend } from '../../lib/axis';
import type { DualAxisProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DualAxisProps & { delay?: number };

const W = 320;
const H = 210;
// The side gutters hold the two axes' tick labels, so each is sized from its own widest label
// (a revenue axis reads "1,500,000", not "15") within these bounds. TICK_FS is .cx-tick's
// ceiling in user units, the largest the labels can render.
const PAD = { t: 14, b: 28 };
const PAD_X_MIN = 24;
const PAD_X_MAX = W * 0.22;
const TICK_FS = 9.5;
const TICK_GAP = 4;
const PAD_B_ROTATED = 40;
// Past this many categories, the fixed-width band the demo fixture (4 items) was tuned for
// gets too narrow for horizontal labels to avoid colliding with their neighbors — rotate them
// onto a diagonal, which reads fine along a narrow slot, same fix as charts2/ControlChart's
// x-axis. Below the threshold, labels stay horizontal (unchanged look for the common case).
const ROTATE_AT = 6;
// Once rotated, a very long label can still run past the card edge at a shallow enough band
// width — clip it to a conservative character budget and keep the full string as a native
// <title> tooltip, same idiom as charts2/IndifferenceCurve's curve/optimal labels.
const MAX_LABEL_CHARS = 10;

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS
    ? `${label.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`
    : label;
}

export function DualAxis({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  categories,
  bar,
  line,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const barCol = bar.color || 'var(--presence)';
  const lineCol = line.color || 'var(--warning)';

  const rotateLabels = categories.length > ROTATE_AT;
  const padB = rotateLabels ? PAD_B_ROTATED : PAD.b;

  const geom = useMemo(() => {
    const be = extent(bar.data);
    const le = extent(line.data);
    const [, bTop] = niceDomain(0, be ? Math.max(be[1], 0) : 1);
    const [lLo, lHi] = niceDomain(le ? le[0] : 0, le ? le[1] : 1);
    const syL = scaleLinear([0, bTop], [H - padB, PAD.t]); // left (bars)
    const syR = scaleLinear([lLo, lHi], [H - padB, PAD.t]); // right (line)
    const bTicks = syL.ticks(4);
    const lTicks = syR.ticks(4);
    const gutter = (ticks: number[]) =>
      Math.min(
        PAD_X_MAX,
        Math.max(
          PAD_X_MIN,
          TICK_GAP +
            2 +
            Math.max(0, ...ticks.map((t) => estimateTextWidth(formatValue(t), TICK_FS))),
        ),
      );
    const padL = gutter(bTicks);
    const padR = gutter(lTicks);
    const plotW = W - padL - padR;
    const sxBand = (i: number) => padL + ((i + 0.5) / Math.max(1, categories.length)) * plotW;
    const bandW = (plotW / Math.max(1, categories.length)) * 0.5;
    return { sxBand, syL, syR, bTicks, lTicks, padL, padR, bandW };
  }, [bar.data, line.data, categories.length, padB]);

  const { sxBand, syL, syR, bTicks, lTicks, padL, padR, bandW } = geom;
  const linePts = line.data.map((v, i) => `${sxBand(i)},${syR(v)}`).join(' ');

  // The tallest bar is the most prominent shape.
  const salient = bar.data.reduce((best, v, i) => (v > bar.data[best] ? i : best), 0);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-da" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="c2-da-svg" role="img" aria-label={title}>
          {/* left-axis gridlines + ticks (bars) */}
          {bTicks.map((t, i) => (
            <g key={`l${i}`}>
              <line x1={padL} y1={syL(t)} x2={W - padR} y2={syL(t)} className="cx-grid-l" />
              <text x={padL - TICK_GAP} y={syL(t) + 3} className="cx-tick" textAnchor="end">
                {formatValue(t)}
              </text>
            </g>
          ))}
          {/* right-axis ticks (line) */}
          {lTicks.map((t, i) => (
            <text
              key={`r${i}`}
              x={W - padR + TICK_GAP}
              y={syR(t) + 3}
              className="cx-tick"
              textAnchor="start"
            >
              {formatValue(t)}
            </text>
          ))}
          {/* bars */}
          {bar.data.map((v, i) => (
            <rect
              key={i}
              x={sxBand(i) - bandW / 2}
              y={syL(v)}
              width={bandW}
              height={Math.max(0, syL(0) - syL(v))}
              rx={2}
              fill={barCol}
              opacity={hot != null && hot !== i ? 0.4 : 0.85}
              onMouseEnter={() => setHot(i)}
              data-mark={i === salient ? 'circle' : undefined}
            />
          ))}
          {/* line */}
          <polyline
            points={linePts}
            fill="none"
            stroke={lineCol}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {line.data.map((v, i) => (
            <circle
              key={`p${i}`}
              cx={sxBand(i)}
              cy={syR(v)}
              r={hot === i ? 4 : 2.6}
              fill={lineCol}
            />
          ))}
          {/* category labels — past ROTATE_AT items the fixed band width can no longer fit
              horizontal text without colliding into its neighbors, so tilt the labels onto a
              diagonal (same fix as charts2/ControlChart's x-axis) and clip any label that's
              still too long for the shallower band at that angle. */}
          {categories.map((c, i) => {
            const label = rotateLabels ? truncateLabel(c) : c;
            const long = rotateLabels && c.length > MAX_LABEL_CHARS;
            const lx = sxBand(i);
            const ly = H - padB + (rotateLabels ? 8 : 14);
            return (
              <text
                key={`c${i}`}
                x={lx}
                y={ly}
                className="cx-tick"
                textAnchor={rotateLabels ? 'end' : 'middle'}
                transform={rotateLabels ? `rotate(-40, ${lx}, ${ly})` : undefined}
              >
                {long && <title>{c}</title>}
                {label}
              </text>
            );
          })}
          {hot != null && (
            <text x={sxBand(hot)} y={PAD.t} className="c2-da-tip" textAnchor="middle">
              {formatValue(bar.data[hot], { unit: bar.unit })} ·{' '}
              {formatValue(line.data[hot], { unit: line.unit })}
            </text>
          )}
        </svg>
      </div>
      <Legend
        items={[
          { label: bar.name, color: barCol },
          { label: line.name, color: lineCol },
        ]}
      />
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
