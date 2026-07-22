import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BannerProps, BannerTone } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BannerProps & { delay?: number };

const TONE: Record<BannerTone, { c: string; icon: keyof typeof Icon }> = {
  info: { c: 'var(--presence)', icon: 'bell' },
  success: { c: 'var(--insight)', icon: 'check' },
  warning: { c: 'var(--warning)', icon: 'alert' },
  promo: { c: 'var(--presence-soft)', icon: 'spark' },
};

export function Banner({
  title,
  icon = 'bell',
  iconColor = 'var(--presence)',
  tone = 'info',
  bannerIcon,
  message,
  detail,
  action,
  dismissible = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  const t = TONE[tone];
  const BIc = Icon[bannerIcon || t.icon] || Icon[t.icon];
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {!dismissed ? (
        <div
          className={`bn-banner tone-${tone}`}
          style={{ ['--bn-c' as string]: t.c } as CSSProperties}
          role="status"
        >
          <span className="bn-icon">
            <BIc />
          </span>
          <span className="bn-body">
            {/* banner message is the primary text datum the component exists to communicate */}
            <span
              className="bn-message"
              data-mark="underline"
              dangerouslySetInnerHTML={richInnerHtml(message)}
            />
            {detail && (
              <span className="bn-detail" dangerouslySetInnerHTML={richInnerHtml(detail)} />
            )}
          </span>
          {action && (
            <button
              type="button"
              className={`bn-action ${done ? 'done' : ''}`}
              onClick={() => setDone(true)}
            >
              {done ? (
                <>
                  <Icon.check /> Done
                </>
              ) : (
                action
              )}
            </button>
          )}
          {dismissible && (
            <button
              type="button"
              className="bn-dismiss"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
            >
              <Icon.x />
            </button>
          )}
        </div>
      ) : (
        <div className="bn-dismissed">
          <span className="faint">Banner dismissed.</span>
          <button type="button" className="bn-restore" onClick={() => setDismissed(false)}>
            <Icon.undo /> Restore
          </button>
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
