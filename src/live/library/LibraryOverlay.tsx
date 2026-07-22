// Past conversations, mid-session. The library of saved canvases is shown on the welcome hub, but
// once you're in a session there was no way back to it — so this lifts the same <Library> into a
// frosted overlay (matching the conversation Overview's look) reachable from the session rail. Tap
// any earlier answer to step back into it; Esc or the backdrop closes. Nothing new is stored — it
// just surfaces what Mavéa already keeps on this device.
import { useEffect, useRef, type ReactElement } from 'react';
import { OverlayPortal } from '../../canvas/blocks/overlays/portal';
import { Icon } from '../../icons/icons';
import { Library } from '../Library';
import type { LibraryEntry } from './store';
import './library-overlay.css';

export function LibraryOverlay({
  entries,
  onResume,
  onRemove,
  onClose,
}: {
  entries: LibraryEntry[];
  onResume: (entry: LibraryEntry) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  // Esc closes; on open, remember where focus was and move it into the dialog; restore on close.
  useEffect(() => {
    restoreFocus.current = (document.activeElement as HTMLElement) ?? null;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const first = panelRef.current?.querySelector<HTMLElement>('input, button, [tabindex]');
    first?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      restoreFocus.current?.focus?.();
    };
  }, [onClose]);

  // No saved canvases — nothing to browse (the rail only offers this when entries exist anyway).
  if (entries.length === 0) return null;

  return (
    <OverlayPortal>
      <div
        className="lib-ov-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="button"
        tabIndex={0}
        aria-label="Close"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            onClose();
          }
        }}
      >
        <div
          className="lib-ov-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Past conversations"
          ref={panelRef}
        >
          <button
            type="button"
            className="lib-ov-close"
            onClick={onClose}
            aria-label="Close past conversations"
            title="Close"
          >
            <Icon.x />
          </button>
          <Library
            entries={entries}
            onResume={onResume}
            onRemove={onRemove}
            heading="Past conversations"
            sub="Pick any earlier answer to step back into it — everything stays on this device."
          />
        </div>
      </div>
    </OverlayPortal>
  );
}
