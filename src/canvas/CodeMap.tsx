// Radial blast-radius graph: a central node ringed by the files a change touches,
// with hot edges highlighting the ones most affected.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { CodeMapProps } from '../data/conversation';

type Props = CodeMapProps & { delay?: number };

export function CodeMap({
  title = 'What this change touches',
  center,
  nodes,
  footer,
  delay,
}: Props) {
  const W = 360,
    H = 250,
    cx = W / 2,
    cy = H / 2,
    R = 74;
  const placed = nodes.map((n, i) => {
    const a = ((-90 + (360 / nodes.length) * i) * Math.PI) / 180;
    return { ...n, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R * 0.86 };
  });
  // The hot node is the flagged emphasis (most-affected file); if none, the first satellite.
  const salientIdx = Math.max(
    0,
    placed.findIndex((n) => n.hot),
  );
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.layers className="ic" style={{ color: 'var(--presence-soft)' }} /> {title}
      </div>
      <div className="codemap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          {placed.map((n, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={n.x}
              y2={n.y}
              stroke={n.hot ? 'var(--warning)' : 'var(--grid-strong)'}
              strokeWidth={n.hot ? 1.6 : 1}
              strokeDasharray={n.hot ? '0' : '3 3'}
            />
          ))}
          {placed.map((n, i) => (
            <g key={i} transform={`translate(${n.x} ${n.y})`}>
              <circle
                r="6"
                fill={n.hot ? 'var(--warning)' : 'var(--surface-elevated-2)'}
                stroke={n.hot ? 'var(--warning)' : 'var(--line-strong)'}
                strokeWidth="1.5"
                data-mark={i === salientIdx ? 'circle' : undefined}
              />
              <text
                x="0"
                y={n.y > cy ? 20 : -12}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--text-secondary)"
                className="mono"
              >
                {n.label}
              </text>
              {n.note && (
                <text
                  x="0"
                  y={n.y > cy ? 32 : -24}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--text-muted)"
                >
                  {n.note}
                </text>
              )}
            </g>
          ))}
          <g transform={`translate(${cx} ${cy})`}>
            <circle r="11" fill="var(--presence)" stroke="var(--surface-default)" strokeWidth="2" />
            <circle
              r="11"
              fill="none"
              stroke="var(--presence)"
              strokeWidth="1"
              opacity="0.4"
              className="codemap-pulse"
            />
            <text
              x="0"
              y="28"
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="var(--text-primary)"
              className="mono"
            >
              {center}
            </text>
          </g>
        </svg>
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 8 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
