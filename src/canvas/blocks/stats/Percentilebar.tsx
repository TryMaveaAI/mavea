import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PercentilebarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PercentilebarProps & { delay?: number };

export function Percentilebar({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  percentile,
  value,
  unit,
  lowLabel = 'p0',
  highLabel = 'p100',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState(false);
  const p = Math.max(0, Math.min(100, percentile));
  const top = Math.max(1, Math.round(100 - p));

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="pb-head">
        {/* the measured value is the one datum Mavéa's drawn gesture underlines */}
        <span className="pb-value tab-num" data-mark="underline" style={{ color }}>
          {value}
        </span>
        {unit && <span className="pb-unit faint">{unit}</span>}
        <span className="pb-pct tab-num">{Math.round(p)}th pct</span>
      </div>

      <div
        className="pb-track"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="pb-grad" />
        {/* tick gridlines at quartiles */}
        {[25, 50, 75].map((q) => (
          <span key={q} className="pb-tick" style={{ left: q + '%' }} />
        ))}
        <div
          className="pb-fill"
          style={{ width: p + '%', background: `color-mix(in oklab, ${color} 22%, transparent)` }}
        />
        <div className="pb-marker" style={{ left: p + '%', background: color }}>
          {/* Keep the tip inside the track: near an end the centered pill would spill past
              the edge, so bias its anchor toward the interior the closer the marker gets. */}
          <span
            className={`pb-tip ${hover ? 'on' : ''}`}
            style={{ borderColor: color, ['--pb-tip-bias' as string]: `${50 - p}%` }}
          >
            top {top}%
          </span>
        </div>
      </div>

      <div className="pb-axis faint">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>

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
