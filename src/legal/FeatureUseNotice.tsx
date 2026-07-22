import { useId, useState, type ReactElement } from 'react';
import { FEATURE_NOTICE_COPY, type FeatureNoticeKind } from './featureRiskAudit';
import './feature-use-notice.css';

const DISMISSAL_STORAGE_PREFIX = 'mavea-feature-notice-dismissed-v1:';

const DISMISSIBLE_NOTICE_LABELS: Partial<Record<Exclude<FeatureNoticeKind, 'global'>, string>> = {
  learning: 'AI learning aid',
  monitoring: 'Not real-time',
  simulation: 'Simulation',
};

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

function rememberDismissed(kind: Exclude<FeatureNoticeKind, 'global'>, value: boolean): void {
  try {
    if (value) localStorage.setItem(storageKey(kind), '1');
    else localStorage.removeItem(storageKey(kind));
  } catch {
    // Storage can be unavailable or full. The notice still collapses for this mount.
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
}): ReactElement {
  const copy = FEATURE_NOTICE_COPY[kind];
  const compactLabel = DISMISSIBLE_NOTICE_LABELS[kind];
  const dismissible = compactLabel !== undefined;
  const [dismissed, setDismissed] = useState(() => dismissible && readDismissed(kind));
  const descriptionId = useId();

  if (dismissed && compactLabel) {
    return (
      <aside
        className={`feature-use-notice feature-use-notice--compact ${className}`.trim()}
        data-kind={kind}
        role="note"
      >
        <button
          type="button"
          className="feature-use-notice-reopen"
          aria-label={`Show full notice: ${copy.title}`}
          onClick={() => {
            setDismissed(false);
            rememberDismissed(kind, false);
          }}
        >
          <span className="feature-use-notice-dot" aria-hidden />
          <span>{compactLabel}</span>
        </button>
        <a href={`#/legal?from=${from}`}>Details</a>
      </aside>
    );
  }

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
              rememberDismissed(kind, true);
            }}
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </div>
    </aside>
  );
}
