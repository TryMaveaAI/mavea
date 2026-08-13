import { useId, useState, type ReactElement } from 'react';
import { FEATURE_NOTICE_COPY, type FeatureNoticeKind } from './featureRiskAudit';
import './feature-use-notice.css';

const DISMISSAL_STORAGE_PREFIX = 'mavea-feature-notice-dismissed-v1:';

/** Kinds the user may dismiss: notices describing a standing capability, which would otherwise
 *  reappear every session for the life of the feature. Dismissing is an acknowledgment, so the
 *  notice goes away for good — the full text stays one click away on the legal page, which every
 *  surface links to. Warnings attached to an act the user is about to take (upload, export, share,
 *  storing a key) stay non-dismissible: each describes THAT act, so retiring one would silence the
 *  next one too. */
const DISMISSIBLE_KINDS: ReadonlySet<FeatureNoticeKind> = new Set([
  'learning',
  'monitoring',
  'simulation',
  // Shown on every Live session that has speech available — a capability, not a pending action.
  'voice-data',
]);

function storageKey(kind: Exclude<FeatureNoticeKind, 'global'>): string {
  return `${DISMISSAL_STORAGE_PREFIX}${kind}`;
}

function readDismissed(kind: Exclude<FeatureNoticeKind, 'global'>): boolean {
  try {
    return localStorage.getItem(storageKey(kind)) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(kind: Exclude<FeatureNoticeKind, 'global'>): void {
  try {
    localStorage.setItem(storageKey(kind), '1');
  } catch {
    // Storage can be unavailable or full. The notice still hides for this mount.
  }
}

export function FeatureUseNotice({
  kind,
  from = 'home',
  className = '',
}: {
  kind: Exclude<FeatureNoticeKind, 'global'>;
  from?: 'home' | 'live';
  className?: string;
}): ReactElement | null {
  const copy = FEATURE_NOTICE_COPY[kind];
  const dismissible = DISMISSIBLE_KINDS.has(kind);
  const [dismissed, setDismissed] = useState(() => dismissible && readDismissed(kind));
  const descriptionId = useId();

  if (dismissed) return null;

  return (
    <aside className={`feature-use-notice ${className}`.trim()} data-kind={kind} role="note">
      <span className="feature-use-notice-dot" aria-hidden />
      <p id={descriptionId}>
        <strong>{copy.title}.</strong> {copy.body}
      </p>
      <div className="feature-use-notice-actions">
        <a href={`#/legal?from=${from}`}>Details</a>
        {dismissible && (
          <button
            type="button"
            className="feature-use-notice-dismiss"
            aria-label={`Dismiss ${copy.title} notice`}
            aria-describedby={descriptionId}
            onClick={() => {
              setDismissed(true);
              rememberDismissed(kind);
            }}
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </div>
    </aside>
  );
}
