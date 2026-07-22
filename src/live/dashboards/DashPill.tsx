// DashPill — the quiet floating confirmation that a card was added to a dashboard. Mirrors the
// house .cards-pill idiom used elsewhere in Live (flashcards, checkpoint suggestions): fixed
// bottom-center, announces itself once to screen readers, and clears itself so it never demands a
// dismissal click. Self-contained (owns its own timer) so any caller can drop it in without wiring
// up a ref — the caller just holds "what to show" state and nulls it out on onDismiss.
import { useEffect, useRef, type ReactElement } from 'react';
import { Icon } from '../../icons/icons';
import { dashHref } from './route';

const AUTO_DISMISS_MS = 6000;

export function DashPill({
  dashboardId,
  dashboardTitle,
  onDismiss,
}: {
  dashboardId: string;
  dashboardTitle: string;
  onDismiss: () => void;
}): ReactElement {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const t = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [dashboardId]);

  return (
    <div className="cards-pill dash-pill" role="status" aria-live="polite">
      <Icon.check />
      <span className="cards-pill-text dash-pill-text">
        Added to <strong>{dashboardTitle}</strong>
      </span>
      <a
        className="cards-pill-btn cards-pill-primary"
        href={dashHref.detail(dashboardId)}
        onClick={onDismiss}
      >
        Open <Icon.chevR />
      </a>
    </div>
  );
}
