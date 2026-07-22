// DashToast — a transient top-right notice, fired today by a fresh tripwire break (see
// useDashboardLoop.ts's onTripwireToast). Auto-dismisses on its own after a few seconds, or
// immediately on the close button; an optional href makes the whole toast a click-through to the
// dashboard it's about, without disturbing the persistent state AlertCard already owns.
import { useEffect, useRef, type ReactElement } from 'react';
import './dash-home.css';

const AUTO_DISMISS_MS = 8_000;

export type DashToastKind = 'presence' | 'insight' | 'warning' | 'danger';

export interface DashToastProps {
  message: string;
  onDismiss: () => void;
  kind?: DashToastKind;
  /** When set, the toast body is a link to the dashboard it's about. */
  href?: string;
}

export function DashToast({
  message,
  onDismiss,
  kind = 'presence',
  href,
}: DashToastProps): ReactElement {
  // A ref so the auto-dismiss timer is set up once at mount, not reset on every render a fresh
  // inline onDismiss closure would otherwise cause.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const t = window.setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={`dash-toast dash-toast--${kind}`} role="status">
      {href ? (
        <a className="dash-toast-text dash-toast-link" href={href}>
          {message}
        </a>
      ) : (
        <span className="dash-toast-text">{message}</span>
      )}
      <button type="button" className="dash-toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
