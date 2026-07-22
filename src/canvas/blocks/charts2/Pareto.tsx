import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { ParetoProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ParetoProps & { delay?: number };

const W = 340;
const H = 220;
const PAD = { l: 34, r: 38, t: 14, b: 28 };
const PAD_B_ROTATED = 42;
const ROTATE_AT = 6;
const MAX_LABEL_CHARS = 10;

function truncate(label: string): string {
  return label.length > MAX_LABEL_CHARS
    ? `${label.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`
    : label;
}

interface Row {
  label: string;
  value: number;
  cumPct: number;
}

export function Pareto({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  bars,
  cumulative = true,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const clean = (Array.isArray(bars) ? bars : [])
      .map((b) => ({
        label: typeof b?.label === 'string' && b.label.trim() ? b.label.trim() : '—',
        value: Number.isFinite(b?.value) && b.value >= 0 ? b.value : 0,
      }))
      // Highest frequency first — the whole point of a Pareto read.
      .sort((a, b) => b.value - a.value);

    const total = clean.reduce((s, r) => s + r.value, 0);
    let running = 0;
    const rows: Row[] = clean.map((r) => {
      running += r.value;
      return { ...r, cumPct: total > 0 ? (running / total) * 100 : 0 };
    });

    const rotateLabels = rows.length > ROTATE_AT;
    const padB = rotateLabels ? PAD_B_ROTATED : PAD.b;
    const ve = extent(rows.map((r) => r.value));
    const [, vTop] = niceDomain(0, ve ? Math.max(ve[1], 0) : 1);
    const sxBand = (i: number) =>
      PAD.l + ((i + 0.5) / Math.max(1, rows.length)) * (W - PAD.l - PAD.r);
    const syL = scaleLinear([0, vTop], [H - padB, PAD.t]);
    const syR = scaleLinear([0, 100], [H - padB, PAD.t]);

    return { rows, rotateLabels, padB, sxBand, syL, syR, vTicks: syL.ticks(4) };
  }, [bars]);

  if (!hasData(geom.rows.map((r) => r.value))) {
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

  const { rows, sxBand, syL, syR, vTicks, rotateLabels, padB } = geom;
  const bandW = ((W - PAD.l - PAD.r) / Math.max(1, rows.length)) * 0.6;
  const linePts = rows.map((r, i) => `${sxBand(i)},${syR(r.cumPct)}`).join(' ');
  const y80 = syR(80);
  const crossIdx = rows.findIndex((r) => r.cumPct >= 80);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-pt" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="c2-pt-svg" role="img" aria-label={title}>
          {vTicks.map((t, i) => (
            <g key={`l${i}`}>
              <line x1={PAD.l} y1={syL(t)} x2={W - PAD.r} y2={syL(t)} className="cx-grid-l" />
              <text x={PAD.l - 4} y={syL(t) + 3} className="cx-tick" textAnchor="end">
                {formatValue(t)}
              </text>
            </g>
          ))}
          {[0, 20, 40, 60, 80, 100].map((t) => (
            <text
              key={`r${t}`}
              x={W - PAD.r + 4}
              y={syR(t) + 3}
              className="cx-tick"
              textAnchor="start"
            >
              {t}%
            </text>
          ))}

          {cumulative && (
            <line x1={PAD.l} y1={y80} x2={W - PAD.r} y2={y80} className="c2-pt-guide" />
          )}

          {rows.map((r, i) => (
            <rect
              key={i}
              x={sxBand(i) - bandW / 2}
              y={syL(r.value)}
              width={bandW}
              height={Math.max(0, syL(0) - syL(r.value))}
              rx={2}
              className={
                'c2-pt-bar m-stagger-item m-fade-rise' +
                (crossIdx >= 0 && i <= crossIdx ? ' c2-pt-bar-vital' : '') +
                (hot === i ? ' on' : '')
              }
              style={{ ['--i' as string]: i } as CSSProperties}
              onMouseEnter={() => setHot(i)}
            />
          ))}

          {cumulative && (
            <>
              <polyline points={linePts} className="c2-pt-line" />
              {rows.map((r, i) => (
                <circle
                  key={`c${i}`}
                  cx={sxBand(i)}
                  cy={syR(r.cumPct)}
                  r={hot === i ? 4 : 2.6}
                  className="c2-pt-dot"
                  onMouseEnter={() => setHot(i)}
                />
              ))}
            </>
          )}

          {rows.map((r, i) => {
            const label = rotateLabels ? truncate(r.label) : r.label;
            const long = rotateLabels && r.label.length > MAX_LABEL_CHARS;
            const lx = sxBand(i);
            const ly = H - padB + (rotateLabels ? 8 : 14);
            return (
              <text
                key={`t${i}`}
                x={lx}
                y={ly}
                className="cx-tick"
                textAnchor={rotateLabels ? 'end' : 'middle'}
                transform={rotateLabels ? `rotate(-40, ${lx}, ${ly})` : undefined}
              >
                {long && <title>{r.label}</title>}
                {label}
              </text>
            );
          })}

          {hot != null && (
            <text x={sxBand(hot)} y={PAD.t} className="c2-pt-tip" textAnchor="middle">
              {formatValue(rows[hot].value, { unit: unit || undefined })} ·{' '}
              {rows[hot].cumPct.toFixed(0)}% cum.
            </text>
          )}
        </svg>
      </div>
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
