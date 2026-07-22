import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { JourneyMapProps } from './types';

type Props = JourneyMapProps & { delay?: number };

const emoColor = (e: number) =>
  e >= 1 ? 'var(--insight)' : e <= -1 ? 'var(--danger)' : 'var(--warning)';

export function JourneyMap({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  persona,
  stages,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const [hover, setHover] = useState<number | null>(0);
  const n = stages.length;
  // The stage with the lowest emotion score is the pain point Mavéa most naturally points to.
  const salient = stages.reduce((idx, s, i) => (s.emotion < stages[idx].emotion ? i : idx), 0);

  // emotion polyline points in 0..100 box; emotion -2..2 -> y 90..10.
  // x is inset 2% on each side so the end dots (centered at 0%/100% with translate(-50%,-50%))
  // don't extend past the fl-jm overflow:hidden boundary.
  const pts = stages.map((s, i) => {
    const x = n > 1 ? 2 + (i / (n - 1)) * 96 : 50;
    const y = 50 - (s.emotion / 2) * 40;
    return { x, y };
  });
  const path = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {persona && <span className="fl-jm-persona">{persona}</span>}
      </div>

      <div className="fl-jm" style={{ ['--n' as string]: n } as CSSProperties}>
        {/* stage headers */}
        <div className="fl-jm-row fl-jm-stages">
          {stages.map((s, i) => (
            <button
              key={i}
              className={'fl-jm-cell fl-jm-stage' + (hover === i ? ' is-on' : '')}
              onMouseEnter={() => setHover(i)}
            >
              <span className="fl-jm-stage-idx tab-num">{i + 1}</span>
              {s.name}
            </button>
          ))}
        </div>
        {/* actions */}
        <div className="fl-jm-row">
          <div className="fl-jm-rowlbl">Actions</div>
          {stages.map((s, i) => (
            <div
              key={i}
              className={'fl-jm-cell' + (hover === i ? ' is-on' : '')}
              onMouseEnter={() => setHover(i)}
            >
              {s.action}
            </div>
          ))}
        </div>
        {/* emotion line */}
        <div className="fl-jm-row fl-jm-emorow">
          <div className="fl-jm-rowlbl">Emotion</div>
          <div className="fl-jm-emo">
            <svg
              role="img"
              aria-label={title}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="fl-jm-emo-svg"
            >
              <line x1="0" y1="50" x2="100" y2="50" stroke="var(--grid-line)" strokeWidth="0.5" />
              <path
                d={path}
                fill="none"
                stroke="var(--presence)"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {pts.map((p, i) => (
              <button
                key={i}
                className={'fl-jm-emodot' + (hover === i ? ' is-on' : '')}
                onMouseEnter={() => setHover(i)}
                data-mark={i === salient ? 'point' : undefined}
                style={
                  {
                    left: p.x + '%',
                    top: p.y + '%',
                    ['--c' as string]: emoColor(stages[i].emotion),
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
        {/* touchpoints */}
        <div className="fl-jm-row">
          <div className="fl-jm-rowlbl">Touchpoints</div>
          {stages.map((s, i) => (
            <div
              key={i}
              className={'fl-jm-cell' + (hover === i ? ' is-on' : '')}
              onMouseEnter={() => setHover(i)}
            >
              <div className="fl-jm-tps">
                {s.touchpoints.map((t, j) => (
                  <span className="fl-jm-tp" key={j}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {hover != null && stages[hover]?.opportunity && (
        <div className="fl-jm-opp" key={hover}>
          <Icon.spark className="ic" />
          <span>
            <strong>{stages[hover].name}:</strong> {stages[hover].opportunity}
          </span>
        </div>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
