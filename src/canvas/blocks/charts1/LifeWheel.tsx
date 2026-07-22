import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LifeWheelProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LifeWheelProps & { delay?: number };

const CX = 150,
  CY = 150,
  R = 110;
const SCALE = 10; // the felt scale is always 0..10
// Gutters around the wheel so the rim labels (which read outward, left/right by quadrant)
// stay inside the viewBox — the card clips with overflow:hidden, so overflow:visible can't
// save a label. Side gutters are wider because the longest labels are the L/R ones.
const PAD_X = 72;
const PAD_Y = 44;
const VB_W = CX * 2 + PAD_X * 2;
const VB_H = CY * 2 + PAD_Y * 2;

function pt(angle: number, radius: number): [number, number] {
  return [CX + radius * Math.cos(angle - Math.PI / 2), CY + radius * Math.sin(angle - Math.PI / 2)];
}

const clampScore = (n: number) => Math.min(SCALE, Math.max(0, Number.isFinite(n) ? n : 0));

export function LifeWheel({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  domains,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const [hover, setHover] = useState<number | null>(null);

  // One spoke per domain, evenly spaced around the wheel.
  const angles = useMemo(
    () => domains.map((_, i) => (i / domains.length) * Math.PI * 2),
    [domains],
  );
  const scores = useMemo(() => domains.map((d) => clampScore(d.score)), [domains]);

  // Overall balance: the mean felt score (the polygon's average reach). Drives the
  // headline so the card answers "how full is the wheel?" without inventing a figure.
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  // The thinnest spoke is where life is most starved — Mavéa circles it while talking.
  const lowIdx = scores.reduce((lo, v, i) => (v < scores[lo] ? i : lo), 0);

  const rings = [2, 4, 6, 8, 10]; // felt gridlines at every other point

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="c1-radar-wrap">
        <svg
          role="img"
          aria-label={title || 'Wheel of life'}
          viewBox={`${-PAD_X} ${-PAD_Y} ${VB_W} ${VB_H}`}
          width="100%"
          className="c1-radar c1-lw"
        >
          {/* felt-scale rings, faint ticks at 2/4/6/8/10 */}
          {rings.map((r, i) => (
            <polygon
              key={i}
              points={angles.map((a) => pt(a, R * (r / SCALE)).join(',')).join(' ')}
              fill="none"
              stroke="var(--grid-line)"
              strokeWidth={r === SCALE ? 1.25 : 1}
            />
          ))}

          {/* spokes */}
          {angles.map((a, i) => {
            const [x, y] = pt(a, R);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--grid-line)" />;
          })}

          {/* the balance polygon — reach of each spoke = its felt score */}
          <polygon
            points={angles.map((a, i) => pt(a, R * (scores[i] / SCALE)).join(',')).join(' ')}
            fill="var(--presence)"
            fillOpacity={0.16}
            stroke="var(--presence)"
            strokeWidth={2}
            strokeLinejoin="round"
            className="c1-lw-poly"
          />

          {/* score node + on-spoke value per domain — offset away from the node in whichever
              direction points outward from center, so labels fan out instead of stacking on
              top of each other once the wheel is crowded (16+ spokes puts nodes close together). */}
          {angles.map((a, i) => {
            const [x, y] = pt(a, R * (scores[i] / SCALE));
            const active = hover === i;
            const outX = x - CX;
            const outY = y - CY;
            const nearCenterCol = Math.abs(outX) < 8;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={active ? 5 : 3.5}
                  fill="var(--presence)"
                  data-mark={i === lowIdx ? 'circle' : undefined}
                />
                <text
                  x={x}
                  y={y}
                  dx={nearCenterCol ? 0 : outX > 0 ? 4 : -4}
                  dy={outY > 0 ? 12 : -6}
                  fontSize="9"
                  fontWeight={700}
                  textAnchor={nearCenterCol ? 'middle' : outX > 0 ? 'start' : 'end'}
                  fill="var(--text-primary)"
                  className="c1-lw-score"
                  style={{ opacity: active ? 1 : 0.85 }}
                >
                  {scores[i]}
                </text>
              </g>
            );
          })}

          {/* domain labels around the rim — anchored by side so they never clip the card */}
          {domains.map((d, i) => {
            const a = angles[i];
            const [x, y] = pt(a, R + 18);
            return (
              <text
                key={i}
                x={x}
                y={y}
                textAnchor={Math.abs(x - CX) < 8 ? 'middle' : x > CX ? 'start' : 'end'}
                dominantBaseline="middle"
                fontSize="10.5"
                fill={hover === i ? 'var(--text-primary)' : 'var(--text-muted)'}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {d.label}
              </text>
            );
          })}
        </svg>

        <div className="c1-lw-side">
          <div className="c1-lw-balance">
            <span className="c1-lw-avg">{avg.toFixed(1)}</span>
            <span className="c1-lw-avg-lbl">balance · out of {SCALE}</span>
          </div>
          <ul className="c1-lw-legend">
            {domains.map((d, i) => (
              <li
                key={i}
                className={'c1-lw-leg' + (hover === i ? ' on' : '')}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="c1-lw-leg-label">{d.label}</span>
                <span className="c1-lw-leg-track" aria-hidden="true">
                  <span
                    className="c1-lw-leg-fill"
                    style={{ width: (scores[i] / SCALE) * 100 + '%' }}
                  />
                </span>
                <span className="c1-lw-leg-score">{scores[i]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hover != null ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{domains[hover].label}</strong> ·{' '}
            {scores[hover]}/{SCALE}
            {domains[hover].note ? ` — ${domains[hover].note}` : ''}
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : caption ? (
          <span>{caption}</span>
        ) : (
          <span className="faint">Hover a spoke · a round wheel rolls smoothly</span>
        )}
      </div>
    </div>
  );
}
