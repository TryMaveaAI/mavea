import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { estimateTextWidth } from '../../lib/fitText';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { ParetoProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ParetoProps & { delay?: number };

const W = 340;
const PAD = { l: 34, r: 38, t: 14, b: 28 };
const PLOT_H = 178;
const TICK_FS = 9.5; // .cx-tick at its widest
const ANGLE = 40; // degrees, when the category names will not sit flat
const MAX_ROTATED_W = 100;

/** Cut a label to fit `maxW` user units, ellipsis included. */
function fitWidth(label: string, maxW: number): string {
  if (estimateTextWidth(label, TICK_FS) <= maxW) return label;
  let n = label.length;
  while (n > 2 && estimateTextWidth(label.slice(0, n) + '…', TICK_FS) > maxW) n--;
  return label.slice(0, n).trimEnd() + '…';
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

    const ve = extent(rows.map((r) => r.value));
    const [, vTop] = niceDomain(0, ve ? Math.max(ve[1], 0) : 1);
    const n = Math.max(1, rows.length);
    let padL = PAD.l;
    let pitch = (W - padL - PAD.r) / n;

    // Flat when every name fits its own band; otherwise slanted, and the bottom margin grows to
    // what the slanted names actually need. Each one is cut only at what it can reach — the
    // first band's name runs down-left toward the card edge, so it has the least room — instead
    // of every name at ten characters, which left "Price inc…" and "Cheaper t…" unreadable.
    const widths = rows.map((r) => estimateTextWidth(r.label, TICK_FS));
    const rotateLabels = widths.some((w) => w + 4 > pitch);
    const cos = Math.cos((ANGLE * Math.PI) / 180);
    const sin = Math.sin((ANGLE * Math.PI) / 180);
    if (rotateLabels && widths.length) {
      // Widen the left margin so the first name slants into it whole (within MAX_ROTATED_W).
      const need = Math.min(widths[0], MAX_ROTATED_W) * cos + 2;
      padL = Math.max(PAD.l, Math.ceil(need - pitch / 2));
      padL = Math.max(PAD.l, Math.ceil(need - (W - padL - PAD.r) / n / 2));
      pitch = (W - padL - PAD.r) / n;
    }
    const sxBand = (i: number) => padL + (i + 0.5) * pitch;
    const labels = rows.map((r, i) =>
      rotateLabels ? fitWidth(r.label, Math.min(MAX_ROTATED_W, (sxBand(i) - 2) / cos)) : r.label,
    );
    const longest = rotateLabels
      ? Math.max(...labels.map((l) => estimateTextWidth(l, TICK_FS)))
      : 0;
    const padB = rotateLabels ? Math.ceil(8 + longest * sin + TICK_FS) : PAD.b;
    const H = PAD.t + PLOT_H + padB;
    const syL = scaleLinear([0, vTop], [H - padB, PAD.t]);
    const syR = scaleLinear([0, 100], [H - padB, PAD.t]);

    return {
      rows,
      labels,
      rotateLabels,
      padL,
      padB,
      H,
      sxBand,
      syL,
      syR,
      vTicks: syL.ticks(4),
    };
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

  const { rows, labels, sxBand, syL, syR, vTicks, rotateLabels, padL, padB, H } = geom;
  const bandW = ((W - padL - PAD.r) / Math.max(1, rows.length)) * 0.6;
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
              <line x1={padL} y1={syL(t)} x2={W - PAD.r} y2={syL(t)} className="cx-grid-l" />
              <text x={padL - 4} y={syL(t) + 3} className="cx-tick" textAnchor="end">
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
            <line x1={padL} y1={y80} x2={W - PAD.r} y2={y80} className="c2-pt-guide" />
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
            const label = labels[i];
            const long = label !== r.label;
            const lx = sxBand(i);
            const ly = H - padB + (rotateLabels ? 8 : 14);
            return (
              <text
                key={`t${i}`}
                x={lx}
                y={ly}
                className="cx-tick"
                textAnchor={rotateLabels ? 'end' : 'middle'}
                transform={rotateLabels ? `rotate(-${ANGLE}, ${lx}, ${ly})` : undefined}
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
