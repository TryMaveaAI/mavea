import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { EmbedMapProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EmbedMapProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

export function EmbedMap({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  clusters,
  points,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const [hover, setHover] = useState<number | null>(null);
  // default: dim none; legend lets you focus a cluster
  const [focus, setFocus] = useState<number | null>(null);

  const colorOf = (cl: number) => clusters[cl]?.color || PALETTE[cl % PALETTE.length];
  const W = 540,
    H = 300,
    PAD = 14;
  const px = (x: number) => PAD + x * (W - PAD * 2);
  const py = (y: number) => PAD + (1 - y) * (H - PAD * 2);

  const active = hover != null ? points[hover] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ai-em-legend">
        {clusters.map((cl, i) => (
          <button
            key={i}
            className={
              'ai-em-leg' +
              (focus === i ? ' is-on' : '') +
              (focus != null && focus !== i ? ' muted' : '')
            }
            onClick={() => setFocus(focus === i ? null : i)}
          >
            <span className="ai-em-swatch" style={{ background: colorOf(i) }} />
            {cl.name}
          </button>
        ))}
      </div>

      <div className="ai-em-wrap">
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          className="ai-em-svg"
          style={{ display: 'block' }}
        >
          {[0.25, 0.5, 0.75].map((g) => (
            <g key={g}>
              <line
                x1={px(g)}
                y1={PAD}
                x2={px(g)}
                y2={H - PAD}
                stroke="var(--grid-line)"
                strokeWidth="1"
              />
              <line
                x1={PAD}
                y1={py(g)}
                x2={W - PAD}
                y2={py(g)}
                stroke="var(--grid-line)"
                strokeWidth="1"
              />
            </g>
          ))}
          {points.map((p, i) => {
            const c = colorOf(p.cluster);
            const dim = focus != null && focus !== p.cluster;
            const on = hover === i;
            if (p.query) {
              return (
                <g
                  key={i}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    cx={px(p.x)}
                    cy={py(p.y)}
                    r={on ? 11 : 9}
                    fill="none"
                    stroke="var(--presence)"
                    strokeWidth="2"
                    opacity={dim ? 0.3 : 1}
                  />
                  <Icon.spark
                    x={px(p.x) - 6}
                    y={py(p.y) - 6}
                    width="12"
                    height="12"
                    style={{ color: 'var(--presence)', opacity: dim ? 0.3 : 1 }}
                  />
                </g>
              );
            }
            return (
              <circle
                key={i}
                cx={px(p.x)}
                cy={py(p.y)}
                r={on ? 7 : 4.5}
                fill={c}
                opacity={dim ? 0.18 : on ? 1 : 0.82}
                stroke={on ? 'var(--text-primary)' : 'transparent'}
                strokeWidth={on ? 1.5 : 0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer', transition: 'r var(--m-fast) var(--ease-out)' }}
              />
            );
          })}
        </svg>
      </div>

      <div className="insight-summary" style={{ marginTop: 12 }}>
        {active ? (
          <span>
            <span
              className="ai-em-swatch"
              style={{
                background: colorOf(active.cluster),
                display: 'inline-block',
                verticalAlign: 'middle',
                marginRight: 6,
              }}
            />
            <strong style={{ color: 'var(--text-primary)' }}>{active.label}</strong>
            <span className="faint">
              {' '}
              · {clusters[active.cluster]?.name || `cluster ${active.cluster}`}
            </span>
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">
            Hover a point for its label · click a legend chip to isolate a cluster
          </span>
        )}
      </div>
    </div>
  );
}
