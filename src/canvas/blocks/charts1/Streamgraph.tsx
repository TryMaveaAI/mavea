import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StreamgraphProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StreamgraphProps & { delay?: number };

const W = 540,
  H = 240,
  PAD = { l: 30, r: 30, t: 12, b: 28 };
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--insight-soft)',
];

// Catmull-Rom → smooth path through points
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function Streamgraph({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  ticks,
  series,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null); // hovered tick (crosshair)
  const [hotBand, setHotBand] = useState<number | null>(null); // hovered series band

  const model = useMemo(() => {
    const n = ticks.length;
    const plotW = W - PAD.l - PAD.r,
      plotH = H - PAD.t - PAD.b;
    const colX = (i: number) => PAD.l + (n <= 1 ? 0.5 : i / (n - 1)) * plotW;
    // total per tick → wiggle baseline centered (themeriver: baseline = -total/2)
    const totals = ticks.map((_, t) => series.reduce((s, ser) => s + (ser.values[t] || 0), 0));
    const maxTotal = Math.max(...totals, 1);
    const sy = (plotH * 0.92) / maxTotal;
    const mid = PAD.t + plotH / 2;
    // build stacked bands (themeriver) with centered wiggle baseline
    const areas: {
      color: string;
      top: [number, number][];
      bottom: [number, number][];
      total: number;
    }[] = [];
    series.forEach((ser, si) => {
      const top: [number, number][] = [];
      const bottom: [number, number][] = [];
      let bandTotal = 0;
      ticks.forEach((_, t) => {
        let below = 0;
        for (let k = 0; k < si; k++) below += series[k].values[t] || 0;
        const baseline = mid - (totals[t] * sy) / 2;
        const y0 = baseline + below * sy;
        const y1 = y0 + (ser.values[t] || 0) * sy;
        top.push([colX(t), y0]);
        bottom.push([colX(t), y1]);
        bandTotal += ser.values[t] || 0;
      });
      areas.push({
        color: ser.color || PALETTE[si % PALETTE.length],
        top,
        bottom,
        total: bandTotal,
      });
    });
    // Densely-ticked timelines (24+ points) collide if every label draws — thin them to a
    // budget that keeps ~10-12 labels legible at the card's typical width, always keeping the
    // first and last so the timeline's extent still reads.
    const maxLabels = 12;
    const tickStep = n > maxLabels ? Math.ceil(n / maxLabels) : 1;
    return { colX, areas, totals, tickStep };
  }, [ticks, series]);

  // Largest-by-total band — the one Mavéa would circle when narrating the river.
  const salientBand = model.areas.reduce(
    (best, a, i) => (a.total > (model.areas[best]?.total ?? -1) ? i : best),
    0,
  );

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}
      >
        {model.areas.map((a, si) => {
          // with no ticks there are no points to close the band, and a.bottom[-1] would throw.
          if (!a.bottom.length) return null;
          const top = smooth(a.top);
          const bottomRev = smooth([...a.bottom].reverse());
          const d = `${top} L${a.bottom[a.bottom.length - 1][0]} ${a.bottom[a.bottom.length - 1][1]} ${bottomRev.replace(/^M[^C]*/, '')} Z`;
          // Dim non-hovered bands on either a tick hover (crosshair) or a direct band hover, so
          // pointing at a river or its timeline both read the same "spotlight" language.
          const dim = hover != null || (hotBand != null && hotBand !== si);
          const lifted = hotBand === si;
          // Origin for the entrance bloom + hover-lift scale: each band's own vertical mid-line
          // (from its middle tick), not the SVG corner, so it grows/lifts in place like the
          // ring and treemap-cell entrances elsewhere in this family.
          const mid = a.top[Math.floor(a.top.length / 2)];
          const originY = mid ? (mid[1] + a.bottom[Math.floor(a.bottom.length / 2)][1]) / 2 : H / 2;
          return (
            <path
              key={si}
              className="c1-ts-ring"
              d={d}
              fill={`color-mix(in oklab, ${a.color} ${dim && !lifted ? 46 : 62}%, transparent)`}
              stroke={a.color}
              strokeWidth={lifted ? 1.4 : 0.8}
              strokeOpacity={lifted ? 0.8 : 0.5}
              data-mark={si === salientBand ? 'circle' : undefined}
              style={
                {
                  ['--i' as string]: si,
                  transformOrigin: `${W / 2}px ${originY}px`,
                  transform: lifted ? 'scale(1.015)' : undefined,
                  transition:
                    'fill var(--m-fast), stroke-width var(--m-fast), stroke-opacity var(--m-fast), transform var(--m-fast) var(--ease-out)',
                  cursor: 'pointer',
                } as CSSProperties
              }
            />
          );
        })}
        {/* hover hit-zones + crosshair. These sit on top of the bands (so the crosshair always
            wins the hit-test at that x), but each zone also hit-tests its own y against every
            band's top/bottom edge at that tick to tell which band is under the cursor — that's
            what drives the per-band highlight/lift, since the bands themselves are covered. */}
        {ticks.map((_, t) => (
          <rect
            key={t}
            x={model.colX(t) - W / ticks.length / 2}
            y={0}
            width={W / ticks.length}
            height={H - PAD.b}
            fill="transparent"
            onMouseEnter={() => setHover(t)}
            onMouseMove={(e) => {
              // Hit-test the pointer's y against each band's top/bottom edge at this tick,
              // in viewBox units, via the zone's own rendered box — no SVG CTM math needed,
              // and it degrades gracefully (band stays unset) in environments without layout.
              const box = e.currentTarget.getBoundingClientRect();
              if (!box.height) return;
              const localY = ((e.clientY - box.top) / box.height) * (H - PAD.b);
              const band = model.areas.findIndex(
                (a) => localY >= a.top[t][1] && localY <= a.bottom[t][1],
              );
              setHotBand(band >= 0 ? band : null);
            }}
            onMouseLeave={() => setHotBand(null)}
            style={{ cursor: 'crosshair' }}
          />
        ))}
        {hover != null && (
          <line
            x1={model.colX(hover)}
            x2={model.colX(hover)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--hover-line)"
            strokeWidth={1.4}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}
        {ticks.map((tk, t) => {
          // Dense timelines (24+ points) thin to every Nth label so neighbours can't overlap —
          // the first, last, and whichever tick is under the crosshair always draw regardless of
          // step, so the extent and the hovered value never silently disappear.
          const onStep = t % model.tickStep === 0 || t === ticks.length - 1;
          if (!onStep && hover !== t) return null;
          return (
            <text
              key={t}
              x={model.colX(t)}
              y={H - 8}
              textAnchor="middle"
              // Scales with the card's own width (cqi resolves against the .card container) so
              // labels shrink gracefully on a narrow card instead of the fixed 10px overlapping.
              style={{ fontSize: 'clamp(8px, 1.2cqi, 10px)' }}
              fill={hover === t ? 'var(--text-primary)' : 'var(--text-muted)'}
              pointerEvents="none"
            >
              {tk}
            </text>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hover != null ? (
          <span className="tab-num">
            <strong style={{ color: 'var(--text-primary)' }}>{ticks[hover]}</strong> ·{' '}
            {series.map((s, si) => (
              <span key={si} style={{ marginRight: 10 }}>
                <span
                  className="c1-swatch-inline"
                  style={{ background: s.color || PALETTE[si % PALETTE.length] }}
                />
                {s.label} {unit}
                {(s.values[hover] || 0).toLocaleString()}
              </span>
            ))}
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Hover the timeline for a crosshair breakdown</span>
        )}
      </div>
    </div>
  );
}
