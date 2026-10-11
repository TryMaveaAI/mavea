import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { Legend } from '../../lib/axis';
import { estimateTextWidth } from '../../lib/fitText';
import { boxHits, placeClear } from './chartMath';
import type { Box } from './chartMath';
import type { BubbleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BubbleProps & { delay?: number };

// Fixed pixel geometry (like Plot) so a non-square card never stretches the bubbles into
// ellipses — the old `preserveAspectRatio="none"` did exactly that.
const W = 320;
const H = 220;
// The top pad is a row for the y-axis title, so it never sits on the top tick's label.
const PAD = { l: 34, r: 12, t: 20, b: 26 };
const NAME_FS = 9;
const NAME_MAX_W = 84;

/** Cut a name to `maxW` user units, ellipsis included. */
function fitName(name: string): string {
  if (estimateTextWidth(name, NAME_FS) <= NAME_MAX_W) return name;
  let n = name.length;
  while (n > 2 && estimateTextWidth(name.slice(0, n) + '…', NAME_FS) > NAME_MAX_W) n--;
  return name.slice(0, n).trimEnd() + '…';
}

export function Bubble({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  categories,
  points,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});

  const catColor = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => (m[c.name] = c.color));
    return m;
  }, [categories]);

  // The bubble with the largest size is visually dominant and the most salient datum.
  const salient = points.reduce((best, p, i) => (p.size > points[best].size ? i : best), 0);

  const geom = useMemo(() => {
    const xe = extent(points.map((p) => p.x));
    const ye = extent(points.map((p) => p.y));
    const [xLo, xHi] = xDomain ?? niceDomain(Math.min(xe ? xe[0] : 0, 0), xe ? xe[1] : 1);
    const [yLo, yHi] = yDomain ?? niceDomain(Math.min(ye ? ye[0] : 0, 0), ye ? ye[1] : 1);
    const sx = scaleLinear([xLo, xHi], [PAD.l, W - PAD.r]);
    const sy = scaleLinear([yLo, yHi], [H - PAD.b, PAD.t]);
    const maxSize = Math.max(...points.map((p) => p.size), 1);
    const pr = (s: number) => 4 + (s / maxSize) * 14;
    return { sx, sy, pr, xTicks: sx.ticks(4), yTicks: sy.ticks(4) };
  }, [points, xDomain, yDomain]);
  const { sx, sy, pr, xTicks, yTicks } = geom;

  // Each bubble is named beside itself, biggest first, in the first spot around it that touches no
  // other bubble, no name already placed, and stays inside the plot. A bubble with no clear spot
  // keeps its name on hover rather than printing it over a neighbour.
  const names = useMemo(() => {
    const shown = points
      .map((p, i) => ({ p, i, cx: sx(p.x), cy: sy(p.y), r: pr(p.size) }))
      .filter((b) => !off[b.p.cat]);
    const disc = (b: (typeof shown)[number]): Box => ({
      x: b.cx - b.r,
      y: b.cy - b.r,
      w: b.r * 2,
      h: b.r * 2,
    });
    const bounds: Box = { x: PAD.l + 1, y: PAD.t, w: W - PAD.r - PAD.l - 1, h: H - PAD.b - PAD.t };
    const placed: Box[] = [];
    const out = new Map<number, { text: string; full: string; box: Box }>();
    for (const b of [...shown].sort((a, c) => c.r - a.r)) {
      const full = typeof b.p.label === 'string' ? b.p.label.trim() : '';
      if (!full) continue;
      const text = fitName(full);
      const w = estimateTextWidth(text, NAME_FS);
      const h = NAME_FS + 2;
      const g = 3;
      const d = b.r * 0.72;
      const candidates: Box[] = [
        { x: b.cx + b.r + g, y: b.cy - h / 2, w, h },
        { x: b.cx - b.r - g - w, y: b.cy - h / 2, w, h },
        { x: b.cx - w / 2, y: b.cy - b.r - g - h, w, h },
        { x: b.cx - w / 2, y: b.cy + b.r + g, w, h },
        { x: b.cx + d + g, y: b.cy - d - h, w, h },
        { x: b.cx - d - g - w, y: b.cy - d - h, w, h },
        { x: b.cx + d + g, y: b.cy + d, w, h },
        { x: b.cx - d - g - w, y: b.cy + d, w, h },
      ];
      const others = [...shown.filter((o) => o.i !== b.i).map(disc), ...placed];
      const box = placeClear(candidates, bounds, [], others);
      const inside =
        box.x >= bounds.x &&
        box.y >= bounds.y &&
        box.x + box.w <= bounds.x + bounds.w &&
        box.y + box.h <= bounds.y + bounds.h;
      if (!inside || boxHits(box, [], others) > 0) continue;
      placed.push(box);
      out.set(b.i, { text, full, box });
    }
    return out;
  }, [points, off, sx, sy, pr]);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-bub" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="c2-bub-svg" role="img">
          {/* gridlines + axis tick labels */}
          {xTicks.map((t, i) => (
            <g key={`gx${i}`}>
              <line x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} className="cx-grid-l" />
              <text x={sx(t)} y={H - PAD.b + 12} className="cx-tick" textAnchor="middle">
                {formatValue(t)}
              </text>
            </g>
          ))}
          {yTicks.map((t, i) => (
            <g key={`gy${i}`}>
              <line x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} className="cx-grid-l" />
              <text x={PAD.l - 5} y={sy(t) + 3} className="cx-tick" textAnchor="end">
                {formatValue(t)}
              </text>
            </g>
          ))}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="cx-axis-l" />
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="cx-axis-l" />
          {points.map((p, i) => {
            if (off[p.cat]) return null;
            const col = catColor[p.cat] || 'var(--presence)';
            const active = hot === i;
            return (
              <circle
                key={i}
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={pr(p.size)}
                fill={`color-mix(in oklab, ${col} ${active ? 55 : 32}%, transparent)`}
                stroke={col}
                strokeWidth={active ? 1.6 : 1}
                onMouseEnter={() => setHot(i)}
                style={{ transition: 'fill var(--m-fast)', cursor: 'pointer' }}
                data-mark={i === salient ? 'circle' : undefined}
              />
            );
          })}
          {points.map((_, i) => {
            const n = names.get(i);
            if (!n) return null;
            return (
              <text
                key={`n${i}`}
                x={n.box.x}
                y={n.box.y + n.box.h - 2.5}
                className={'c2-bub-name' + (hot === i ? ' on' : '')}
                aria-hidden="true"
              >
                {n.text !== n.full && <title>{n.full}</title>}
                {n.text}
              </text>
            );
          })}
          {xLabel && (
            <text x={W - PAD.r} y={H - 2} className="cx-axlbl" textAnchor="end">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text x={PAD.l - 2} y={PAD.t - 9} className="cx-axlbl" textAnchor="start">
              {yLabel}
            </text>
          )}
        </svg>
        {hot != null && !off[points[hot].cat] && (
          <div
            className="c2-bub-tip"
            style={{
              left: `${(sx(points[hot].x) / W) * 100}%`,
              top: `${(sy(points[hot].y) / H) * 100}%`,
              // The tip is `position: absolute` with no intrinsic width cap, so a long point
              // label (real-world names run much longer than the demo fixture) pushes past the
              // card edge instead of wrapping — cap + ellipsize it here, same fix as
              // TamSam/Treemap's fixed-position labels.
              maxWidth: 200,
            }}
          >
            <b
              style={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              {points[hot].label}
            </b>
            <span className="faint tab-num">
              {xLabel || 'x'} {formatValue(points[hot].x)} · {yLabel || 'y'}{' '}
              {formatValue(points[hot].y)} · {formatValue(points[hot].size)}
            </span>
          </div>
        )}
      </div>
      <Legend
        items={categories.map((c) => ({ label: c.name, color: c.color }))}
        off={new Set(categories.map((c, i) => (off[c.name] ? i : -1)).filter((i) => i >= 0))}
        onToggle={(i) => {
          const name = categories[i]?.name;
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
