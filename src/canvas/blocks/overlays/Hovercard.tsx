import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HovercardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HovercardProps & { delay?: number };

const DEFAULT_STATS = [
  { label: 'Reports', value: '47' },
  { label: 'Sources', value: '312' },
  { label: 'Followers', value: '1.2k' },
];

export function Hovercard({
  title,
  icon = 'chat',
  iconColor = 'var(--presence)',
  mention = '@maya.chen',
  lead = 'Reviewed and approved by ',
  name = 'Maya Chen',
  handle = '@maya.chen',
  bio = 'Lead research analyst. Covers macro &amp; market intelligence for the strategy team.',
  avatar = 'MC',
  stats = DEFAULT_STATS,
  action = 'Follow',
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chat;
  const [open, setOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 320);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 140);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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

      <p className="ov-hc-lead">
        <span dangerouslySetInnerHTML={richInnerHtml(lead)} />
        <span className="ov-hc-anchor" onMouseEnter={enter} onMouseLeave={leave}>
          <button
            type="button"
            className={'ov-mention' + (open ? ' active' : '')}
            onClick={() => setOpen((o) => !o)}
          >
            {mention}
          </button>

          {open && (
            <span
              className="ov-hc-card"
              role="dialog"
              aria-label={name}
              onMouseEnter={enter}
              onMouseLeave={leave}
            >
              <span className="ov-hc-top">
                <span className="ov-hc-avatar">{avatar}</span>
                <span className="ov-hc-names">
                  <span className="ov-hc-name">{name}</span>
                  <span className="ov-hc-handle">{handle}</span>
                </span>
                <button
                  type="button"
                  className={'ov-hc-follow' + (following ? ' on' : '')}
                  onClick={() => setFollowing((f) => !f)}
                >
                  {following ? (
                    <>
                      <Icon.check className="ic" /> Following
                    </>
                  ) : (
                    action
                  )}
                </button>
              </span>
              <span className="ov-hc-bio" dangerouslySetInnerHTML={richInnerHtml(bio)} />
              <span className="ov-hc-stats">
                {stats.map((s) => (
                  <span className="ov-hc-stat" key={s.label}>
                    <span className="ov-hc-stat-val tab-num">{s.value}</span>
                    <span className="ov-hc-stat-label">{s.label}</span>
                  </span>
                ))}
              </span>
            </span>
          )}
        </span>
        <span> after a full source audit.</span>
      </p>
      <p className="ov-desc ov-hc-hint">Hover the mention to preview the profile card.</p>
    </div>
  );
}
