import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RadarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RadarProps & { delay?: number };

const CX = 150,
  CY = 150,
  R = 110;
const LABEL_R = R + 18; // radius at which axis labels are anchored, just outside the outer ring
const LABEL_FONT = 13; // in viewBox units — scales up with the SVG's rendered width (bigger card → bigger labels)
const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)'];

function pt(angle: number, radius: number) {
  return [CX + radius * Math.cos(angle - Math.PI / 2), CY + radius * Math.sin(angle - Math.PI / 2)];
}

// Past ~10 axes the angular gap between neighbours (360°/n) shrinks faster than label text
// does, so fixed-size labels start overlapping each other around the ring. Shrink the font
// (and with it the per-char width estimate below) once the axis count crosses that point —
// dense radars stay legible instead of smearing into an unreadable ring of text.
function labelFontSize(axisCount: number): number {
  if (axisCount <= 10) return LABEL_FONT;
  return Math.max(9, LABEL_FONT - (axisCount - 10) * 0.3);
}

export function Radar({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  axes,
  series,
  max,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [off, setOff] = useState<Set<number>>(new Set());
  const [hoverAxis, setHoverAxis] = useState<number | null>(null);

  const maxV = max || Math.max(...series.flatMap((s) => s.values), 1);
  const angles = useMemo(() => axes.map((_, i) => (i / axes.length) * Math.PI * 2), [axes]);
  const fontSize = labelFontSize(axes.length);
  const charW = fontSize * 0.6; // generous per-char width estimate so labels never clip (text can't be measured pre-render)
  // Vertex with the highest normalised score on the first visible series — Mavéa's drawn
  // gesture circles the standout data point while talking.
  const salientAxis = (() => {
    const first = series.find((_, i) => !off.has(i));
    if (!first) return 0;
    return first.values.reduce((best, v, i) => (v > (first.values[best] ?? -1) ? i : best), 0);
  })();

  const toggle = (i: number) => {
    const n = new Set(off);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    // keep at least one on
    if (n.size >= series.length) return;
    setOff(n);
  };

  const rings = [0.25, 0.5, 0.75, 1];

  // Axis labels sit outside the rings and can be wider than the base 300×300 box — long ones
  // ("Semiconductors", "Cloud Computing") would clip at the viewBox edge. Grow the viewBox to
  // exactly contain every label's estimated extent, so it scales to fit instead of clipping. Short
  // labels leave the box at its base size (chart unchanged); only long ones shrink it a touch.
  const viewBox = useMemo(() => {
    let minX = 0,
      minY = 0,
      maxX = 300,
      maxY = 300;
    angles.forEach((a, i) => {
      const [x, y] = pt(a, LABEL_R);
      const w = (axes[i]?.length ?? 0) * charW;
      const anchorMid = Math.abs(x - CX) < 8;
      const left = anchorMid ? x - w / 2 : x > CX ? x : x - w;
      const right = anchorMid ? x + w / 2 : x > CX ? x + w : x;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, y - fontSize);
      maxY = Math.max(maxY, y + fontSize);
    });
    const pad = 4;
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }, [angles, axes, charW, fontSize]);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c1-radar-wrap">
        <svg role="img" aria-label={title} viewBox={viewBox} width="100%" className="c1-radar">
          {rings.map((r, i) => (
            <polygon
              key={i}
              points={angles.map((a) => pt(a, R * r).join(',')).join(' ')}
              fill="none"
              stroke="var(--grid-line)"
              strokeWidth={1}
            />
          ))}
          {angles.map((a, i) => {
            const [x, y] = pt(a, R);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--grid-line)" />;
          })}
          {series.map((s, si) => {
            if (off.has(si)) return null;
            const col = s.color || PALETTE[si % PALETTE.length];
            const poly = angles
              .map((a, ai) => pt(a, R * ((s.values[ai] || 0) / maxV)).join(','))
              .join(' ');
            return (
              <g key={si} style={{ transition: 'opacity var(--m-normal)' }}>
                <polygon
                  points={poly}
                  fill={col}
                  fillOpacity={0.14}
                  stroke={col}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {angles.map((a, ai) => {
                  const [x, y] = pt(a, R * ((s.values[ai] || 0) / maxV));
                  return (
                    <circle
                      key={ai}
                      cx={x}
                      cy={y}
                      r={hoverAxis === ai ? 4.5 : 3}
                      fill={col}
                      data-mark={si === 0 && ai === salientAxis ? 'circle' : undefined}
                    />
                  );
                })}
              </g>
            );
          })}
          {axes.map((label, i) => {
            const a = angles[i];
            const [x, y] = pt(a, R + 18);
            return (
              <text
                key={i}
                x={x}
                y={y}
                textAnchor={Math.abs(x - CX) < 8 ? 'middle' : x > CX ? 'start' : 'end'}
                dominantBaseline="middle"
                fontSize={fontSize}
                fill={hoverAxis === i ? 'var(--text-primary)' : 'var(--text-muted)'}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverAxis(i)}
                onMouseLeave={() => setHoverAxis(null)}
              >
                {label}
              </text>
            );
          })}
        </svg>

        <div className="c1-radar-legend">
          {series.map((s, si) => {
            const col = s.color || PALETTE[si % PALETTE.length];
            const on = !off.has(si);
            return (
              <button
                key={si}
                className={'c1-legend-row' + (on ? '' : ' muted')}
                onClick={() => toggle(si)}
              >
                <span className="c1-swatch" style={{ background: on ? col : 'var(--track)' }} />
                <span className="c1-legend-label">{s.label}</span>
                <Icon.check className="c1-legend-check" style={{ opacity: on ? 1 : 0.15 }} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hoverAxis != null ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{axes[hoverAxis]}</strong> ·{' '}
            {series
              .filter((_, i) => !off.has(i))
              .map((s) => `${s.label} ${s.values[hoverAxis]}`)
              .join(' · ')}
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Toggle a series in the legend · hover an axis</span>
        )}
      </div>
    </div>
  );
}
