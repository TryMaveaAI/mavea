import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NotificationProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NotificationProps & { delay?: number };

interface Row {
  avatar?: string;
  icon?: Props['items'][number]['icon'];
  color: string;
  title: string;
  time?: string;
  unread: boolean;
  removed: boolean;
}

export function Notification({
  title,
  icon = 'bell',
  iconColor = 'var(--presence)',
  items,
  markAllLabel = 'Mark all read',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((it) => ({
      avatar: it.avatar,
      icon: it.icon,
      color: it.color || 'var(--presence)',
      title: it.title,
      time: it.time,
      unread: it.unread !== false,
      removed: false,
    })),
  );

  const visible = rows.filter((r) => !r.removed);
  const unreadCount = visible.filter((r) => r.unread).length;
  // first unread row is the highest-priority item (unread = emphasis); -1 means all read
  const firstUnreadIdx = rows.findIndex((r) => !r.removed && r.unread);

  const toggleRead = (idx: number) =>
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, unread: !r.unread } : r)));
  const remove = (idx: number) =>
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, removed: true } : r)));
  const markAll = () => setRows((p) => p.map((r) => ({ ...r, unread: false })));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {unreadCount > 0 && <span className="nf-badge">{unreadCount}</span>}
        <button type="button" className="nf-markall" onClick={markAll} disabled={unreadCount === 0}>
          <Icon.check /> {markAllLabel}
        </button>
      </div>

      <div className="nf-list">
        {visible.length === 0 && <div className="nf-empty faint">You're all caught up.</div>}
        {rows.map((r, i) =>
          r.removed ? null : (
            <div
              key={i}
              className={`nf-row ${r.unread ? 'unread' : ''}`}
              style={{ ['--nf-c' as string]: r.color } as CSSProperties}
            >
              {/* unread dot on the first unread row marks the highest-priority item (<=12 px);
                  it gets a wider halo so the eye lands on it before the rest of the list */}
              <span
                className="nf-unread-dot"
                {...(i === firstUnreadIdx
                  ? {
                      'data-mark': 'point',
                      style: {
                        ['--nf-c' as string]: r.color,
                        boxShadow: `0 0 0 3px color-mix(in oklab, ${r.color} 22%, transparent), 0 0 8px ${r.color}`,
                      } as CSSProperties,
                    }
                  : {})}
              />
              <span className="nf-avatar">
                {r.avatar ? (
                  <span className="nf-avatar-ini">{r.avatar.slice(0, 2).toUpperCase()}</span>
                ) : (
                  (() => {
                    const RIc = Icon[r.icon || 'bell'] || Icon.bell;
                    return <RIc className="nf-avatar-ic" />;
                  })()
                )}
              </span>
              <span className="nf-body">
                <span className="nf-title" dangerouslySetInnerHTML={richInnerHtml(r.title)} />
                {r.time && <span className="nf-time faint">{r.time}</span>}
              </span>
              <span className="nf-actions">
                <button
                  type="button"
                  className="nf-act"
                  onClick={() => toggleRead(i)}
                  title={r.unread ? 'Mark read' : 'Mark unread'}
                  aria-label={r.unread ? 'Mark read' : 'Mark unread'}
                >
                  {r.unread ? <Icon.check /> : <Icon.undo />}
                </button>
                <button
                  type="button"
                  className="nf-act"
                  onClick={() => remove(i)}
                  title="Dismiss"
                  aria-label="Dismiss"
                >
                  <Icon.x />
                </button>
              </span>
            </div>
          ),
        )}
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
