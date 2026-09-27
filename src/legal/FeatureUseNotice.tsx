import { useCallback, useId, useState, type ReactElement } from 'react';
import { FEATURE_NOTICE_COPY, type FeatureNoticeKind } from './featureRiskAudit';
import './feature-use-notice.css';

const DISMISSAL_STORAGE_PREFIX = 'mavea-feature-notice-dismissed-v1:';

/** Kinds the user may dismiss: notices describing a standing capability, which would otherwise
 *  reappear every session for the life of the feature. Dismissing is an acknowledgment, so the
 *  notice goes away for good — the full text stays one click away on the legal page, which every
 *  surface links to. Warnings attached to an act the user is about to take (upload, export, share,
 *  storing a key) can be closed only for the session: each describes THAT act, so retiring one for
 *  good would silence the next one too. */
const DISMISSIBLE_KINDS: ReadonlySet<FeatureNoticeKind> = new Set([
  'learning',
  'monitoring',
  'simulation',
  // Shown on every Live session that has speech available — a capability, not a pending action.
  'voice-data',
]);

/** A standing notice leads with its title and one line, and opens in place: at a desktop width its
 *  whole body ran 250+ characters to a line across the top of the surface it was guarding. The
 *  full text stays in the DOM (and the accessibility tree) either way; only its paint is clamped.
 *  A notice about an act the reader is about to take stays open — it describes THAT act. */
const COLLAPSED_KINDS = DISMISSIBLE_KINDS;

function storageKey(kind: Exclude<FeatureNoticeKind, 'global'>): string {
  return `${DISMISSAL_STORAGE_PREFIX}${kind}`;
}

/** Where a dismissal is kept. A notice about a standing capability is retired for good once read;
 *  a notice about an ACT — uploading a file, connecting a repository, storing a key — is retired
 *  only for this session, so the next visit's first upload still says where the file goes. Every
 *  notice can be closed; what differs is how long the closing lasts. */
function storeFor(kind: Exclude<FeatureNoticeKind, 'global'>): Storage {
  return DISMISSIBLE_KINDS.has(kind) ? localStorage : sessionStorage;
}

function readDismissed(kind: Exclude<FeatureNoticeKind, 'global'>): boolean {
  try {
    return storeFor(kind).getItem(storageKey(kind)) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(kind: Exclude<FeatureNoticeKind, 'global'>): void {
  try {
    storeFor(kind).setItem(storageKey(kind), '1');
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
  const [dismissed, setDismissed] = useState(() => readDismissed(kind));
  const [open, setOpen] = useState(false);
  // Whether the clamp (this kind's default, or a short window's) is actually hiding anything —
  // a toggle that reveals nothing is a control that lies.
  const [clipped, setClipped] = useState(false);
  const descriptionId = useId();
  const measure = useCallback((p: HTMLParagraphElement | null) => {
    if (!p) return;
    const check = () => setClipped(p.scrollHeight > p.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(p);
    return () => ro.disconnect();
  }, []);

  if (dismissed) return null;

  return (
    <aside
      className={`feature-use-notice ${className}`.trim()}
      data-kind={kind}
      data-collapsed={COLLAPSED_KINDS.has(kind) || undefined}
      data-open={open || undefined}
      role="note"
    >
      <span className="feature-use-notice-dot" aria-hidden />
      <p id={descriptionId} ref={measure}>
        <strong>{copy.title}.</strong> {copy.body}
      </p>
      <div className="feature-use-notice-actions">
        {(open || clipped) && (
          <button
            type="button"
            className="feature-use-notice-more"
            aria-expanded={open}
            aria-controls={descriptionId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Less' : 'More'}
          </button>
        )}
        <a href={`#/legal?from=${from}`}>Details</a>
        {
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
        }
      </div>
    </aside>
  );
}
