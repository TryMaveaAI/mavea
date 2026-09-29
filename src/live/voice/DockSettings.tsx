// The dock's quiet settings: voice, speed, explanation level and model live behind one button in
// the input row instead of a standing strip above it. A 13–14in laptop window has little height
// to give, and these are set once and rarely revisited — the same reasoning as the mic-mode badge.
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../../icons/icons';

export function DockSettings({
  children,
  active = false,
}: {
  children: ReactNode;
  /** Mavéa is speaking, preparing or paused. The status pill has no room on a phone row, so the
   *  button carries a pulsing dot instead. */
  active?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dock-settings" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          'mark-toggle dock-settings-btn' + (open ? ' on' : '') + (active ? ' has-status' : '')
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Voice, speed, explanation level and model"
        title="Voice, speed, explanation level and model"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon.sliders />
        <span className="mark-toggle-label">Settings</span>
      </button>
      {open && (
        <div className="dock-settings-pop" role="dialog" aria-label="Conversation settings">
          {children}
        </div>
      )}
    </div>
  );
}
