import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PopoverProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PopoverProps & { delay?: number };

export function Popover({
  title,
  icon = 'bell',
  iconColor = 'var(--presence)',
  trigger = 'Notifications',
  triggerIcon = 'bell',
  description = 'An anchored panel opens beside the trigger with a pointer arrow.',
  heading = "What's new",
  body = '3 sources finished syncing and <strong>2 new findings</strong> are ready to review in your workspace.',
  stat = '+2',
  statLabel = 'new findings',
  action = 'Review now',
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  const TrigIc = Icon[triggerIcon] || Icon.bell;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

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

      <div className="ov-anchor" ref={ref}>
        <button
          type="button"
          className={'ov-trigger' + (open ? ' active' : '')}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <TrigIc className="ic" /> {trigger}
          <span className="ov-trigger-badge">{stat}</span>
        </button>
        <p className="ov-desc" dangerouslySetInnerHTML={richInnerHtml(description)} />

        {open && (
          <div className="ov-pop" role="dialog" aria-label={heading}>
            <div className="ov-pop-arrow" />
            <div className="ov-pop-head">{heading}</div>
            <div className="ov-pop-stat">
              <span className="ov-pop-stat-val tab-num">{stat}</span>
              <span className="ov-pop-stat-label">{statLabel}</span>
            </div>
            <div className="ov-pop-body" dangerouslySetInnerHTML={richInnerHtml(body)} />
            <button type="button" className="ov-pop-action" onClick={() => setOpen(false)}>
              {action} <Icon.chevR className="ic" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
