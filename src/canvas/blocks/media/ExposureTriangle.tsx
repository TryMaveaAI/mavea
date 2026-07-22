import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ExposureTriangleProps, ExposureAxis } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ExposureTriangleProps & { delay?: number };

// The three exposure controls, each at a corner of the triangle. The geometry (corner points, the
// connecting trade-off arrows, the centre EV) is COMPUTED here; the settings + the EV read straight
// from props. Each corner carries the one trade it governs, so the panel reads as a wired system,
// not three loose numbers.
const CORNERS: {
  axis: ExposureAxis;
  label: string;
  /** apex position in the 0–100 viewBox */
  x: number;
  y: number;
  /** the variable this corner trades against, shown beneath the value */
  trade: string;
  accent: string;
}[] = [
  {
    axis: 'aperture',
    label: 'Aperture',
    x: 50,
    y: 16,
    trade: 'depth of field',
    accent: 'var(--presence)',
  },
  { axis: 'shutter', label: 'Shutter', x: 16, y: 78, trade: 'motion', accent: 'var(--insight)' },
  { axis: 'iso', label: 'ISO', x: 84, y: 78, trade: 'noise', accent: 'var(--warning)' },
];

export function ExposureTriangle({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  aperture,
  shutter,
  iso,
  ev,
  effects,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;

  const value: Record<ExposureAxis, string> = {
    aperture,
    shutter,
    iso: `ISO ${iso}`,
  };

  // Pair each corner with its side-effect note (if the model tagged one to that axis).
  const effectFor = (axis: ExposureAxis) => effects?.find((e) => e.axis === axis)?.note;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="ex-figwrap">
        <svg viewBox="0 0 100 96" className="ex-svg" role="img" aria-label={title}>
          {/* the triangle joining the three controls */}
          <polygon points={CORNERS.map((c) => `${c.x},${c.y}`).join(' ')} className="ex-tri" />

          {/* trade-off arrows running along each edge — two controls always balance the third */}
          {CORNERS.map((c, i) => {
            const next = CORNERS[(i + 1) % CORNERS.length];
            const mx = (c.x + next.x) / 2;
            const my = (c.y + next.y) / 2;
            return (
              <line
                key={`e${i}`}
                x1={c.x}
                y1={c.y}
                x2={mx}
                y2={my}
                className="ex-edge"
                markerEnd="url(#ex-arrow)"
              />
            );
          })}

          <defs>
            <marker
              id="ex-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {/* centre EV — the exposure all three settings sum to */}
          <circle cx={50} cy={57} r={13} className="ex-ev" />
          <text x={50} y={54} className="ex-ev-k">
            EXPOSURE
          </text>
          <text x={50} y={62} className="ex-ev-v">
            {ev || 'balanced'}
          </text>

          {/* the three control nodes */}
          {CORNERS.map((c, i) => (
            <g key={c.axis} style={{ ['--cc' as string]: c.accent } as CSSProperties}>
              <circle
                cx={c.x}
                cy={c.y}
                r={4}
                className="ex-node"
                {...(i === 0 ? { 'data-mark': 'point' } : {})}
              />
              <text x={c.x} y={c.y - 7} className="ex-node-k">
                {c.label.toUpperCase()}
              </text>
              <text x={c.x} y={c.y + (c.y < 40 ? -14 : 11)} className="ex-node-v">
                {value[c.axis]}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="ex-cues">
        {CORNERS.map((c) => {
          const note = effectFor(c.axis);
          return (
            <div
              key={c.axis}
              className="ex-cue"
              style={{ ['--cc' as string]: c.accent } as CSSProperties}
            >
              <span className="ex-cue-dot" />
              <span className="ex-cue-body">
                <span className="ex-cue-k">{c.trade}</span>
                <span className="ex-cue-v">{note || value[c.axis]}</span>
              </span>
            </div>
          );
        })}
      </div>

      {caption && <div className="ex-caption">{caption}</div>}

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
