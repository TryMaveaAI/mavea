import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TooltipProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TooltipProps & { delay?: number };

const DEFAULT_TARGETS = [
  {
    label: 'Share',
    icon: 'share' as const,
    tip: 'Share with your team',
    placement: 'top' as const,
  },
  {
    label: 'Export',
    icon: 'export' as const,
    tip: 'Download as PDF or CSV',
    placement: 'bottom' as const,
  },
  {
    label: 'Sources',
    icon: 'link' as const,
    tip: '8 verified sources linked',
    placement: 'left' as const,
  },
  {
    label: 'Lock',
    icon: 'lock' as const,
    tip: 'Restrict editing to owners',
    placement: 'right' as const,
  },
];

export function Tooltip({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  prompt = 'Hover any control to see a placed tooltip.',
  targets = DEFAULT_TARGETS,
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ov-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <p className="ov-desc ov-tip-prompt" dangerouslySetInnerHTML={richInnerHtml(prompt)} />

      <div className="ov-tip-grid">
        {targets.map((t, i) => {
          const TgtIc = t.icon ? Icon[t.icon] : Icon.spark;
          const place = t.placement || 'top';
          return (
            <div className="ov-tip-cell" key={t.label}>
              <button
                type="button"
                className={'ov-tip-target' + (hover === i ? ' on' : '')}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
              >
                <TgtIc className="ic" />
                <span>{t.label}</span>
              </button>
              {hover === i && (
                <span className={'ov-tip-bubble place-' + place} role="tooltip">
                  {t.tip}
                  <span className="ov-tip-arrow" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
