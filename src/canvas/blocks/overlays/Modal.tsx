import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useFocusTrap } from '../../../live/useFocusTrap';
import { OverlayPortal } from './portal';
import type { ModalProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ModalProps & { delay?: number };

export function Modal({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  trigger = 'Open dialog',
  triggerIcon = 'external',
  description = 'A centered modal dialog with a focus ring, backdrop, and Escape&#8209;to&#8209;close.',
  heading = 'Publish this version?',
  body = 'Publishing makes <strong>Revision 12</strong> the live version everyone sees. You can roll back to any earlier revision at any time.',
  confirm = 'Publish',
  cancel = 'Cancel',
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const TrigIc = Icon[triggerIcon] || Icon.external;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Trap focus inside the dialog while open and restore it to the trigger on close.
  useFocusTrap(dialogRef, { active: open });

  // Escape closes the dialog from anywhere (focus may sit on the backdrop), so the listener lives on
  // window rather than the dialog node — matching the app's other dialogs.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ov-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ov-trigger-wrap">
        <button type="button" className="ov-trigger" onClick={() => setOpen(true)}>
          <TrigIc className="ic" /> {trigger}
        </button>
        <p
          className="ov-desc"
          dangerouslySetInnerHTML={richInnerHtml(
            done ? 'Published — <strong>Revision 12</strong> is now live.' : description,
          )}
        />
      </div>

      {open && (
        <OverlayPortal accent={color}>
          <div className="ov-portal">
            <div
              className="ov-backdrop"
              onClick={() => setOpen(false)}
              role="button"
              tabIndex={0}
              aria-label="Close"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
            />
            <div
              className="ov-dialog"
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={heading}
            >
              <div className="ov-dialog-head">
                <div className="ov-dialog-title">{heading}</div>
                <button
                  type="button"
                  className="ov-x"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <Icon.x className="ic" />
                </button>
              </div>
              <div className="ov-dialog-body" dangerouslySetInnerHTML={richInnerHtml(body)} />
              <div className="ov-dialog-foot">
                <button type="button" className="ov-btn ghost" onClick={() => setOpen(false)}>
                  {cancel}
                </button>
                <button
                  type="button"
                  className="ov-btn solid"
                  onClick={() => {
                    setDone(true);
                    setOpen(false);
                  }}
                >
                  {confirm}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
