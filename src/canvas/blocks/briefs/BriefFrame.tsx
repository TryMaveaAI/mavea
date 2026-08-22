import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../types/mavea';
import type { BriefStatus } from './types';

interface BriefFrameProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  footer?: HtmlString;
  delay?: number;
  className: string;
  children: ReactNode;
}

const STATUS_LABEL: Record<BriefStatus, string> = {
  done: 'Done',
  active: 'Active',
  pending: 'Pending',
  blocked: 'Blocked',
  unknown: 'Unknown',
};

export function BriefFrame({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  footer,
  delay,
  className,
  children,
}: BriefFrameProps) {
  const EyebrowIcon = Icon[icon] || Icon.doc;
  return (
    <div
      className={`card reveal brf ${className}`}
      style={{ ['--delay' as string]: `${delay ?? 0}ms` } as CSSProperties}
    >
      <div className="card-eyebrow">
        <EyebrowIcon className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {children}
      {footer && (
        <div
          className="insight-summary brf-footer"
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status?: BriefStatus }) {
  if (!status) return null;
  const safeStatus: BriefStatus = Object.hasOwn(STATUS_LABEL, status) ? status : 'unknown';
  return <span className={`brf-status brf-status--${safeStatus}`}>{STATUS_LABEL[safeStatus]}</span>;
}

export function ScopeNote({ children }: { children: ReactNode }) {
  return (
    <div className="brf-scope">
      <Icon.alert className="ic" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
