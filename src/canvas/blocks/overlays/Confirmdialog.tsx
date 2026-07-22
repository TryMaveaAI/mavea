import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { OverlayPortal } from './portal';
import type { ConfirmdialogProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ConfirmdialogProps & { delay?: number };

export function Confirmdialog({
  title,
  icon = 'alert',
  iconColor = 'var(--danger)',
  trigger = 'Delete project',
  triggerIcon = 'x',
  description = 'A destructive&#8209;action confirm with a warning badge, Cancel, and Confirm.',
  heading = 'Delete “Q3 Forecast”?',
  body = 'This permanently removes the project and all <strong>34 documents</strong> inside it. This action cannot be undone.',
  alertIcon = 'alert',
  confirm = 'Delete forever',
  cancel = 'Cancel',
  color = 'var(--danger)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.alert;
  const TrigIc = Icon[triggerIcon] || Icon.x;
  const AlertIc = Icon[alertIcon] || Icon.alert;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
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
        <button
          type="button"
          className={'ov-trigger danger' + (done ? ' is-done' : '')}
          onClick={() => !done && setOpen(true)}
        >
          {done ? <Icon.check className="ic" /> : <TrigIc className="ic" />}{' '}
          {done ? 'Deleted' : trigger}
        </button>
        <p
          className="ov-desc"
          dangerouslySetInnerHTML={richInnerHtml(
            done ? 'Project deleted. <strong>34 documents</strong> removed.' : description,
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
              className="ov-dialog ov-alert"
              role="alertdialog"
              aria-modal="true"
              aria-label={heading}
            >
              <div className="ov-alert-badge">
                <AlertIc className="ic" />
              </div>
              <div className="ov-dialog-title ov-alert-title">{heading}</div>
              <div
                className="ov-dialog-body ov-alert-body"
                dangerouslySetInnerHTML={richInnerHtml(body)}
              />
              <div className="ov-dialog-foot">
                <button type="button" className="ov-btn ghost" onClick={() => setOpen(false)}>
                  {cancel}
                </button>
                <button
                  type="button"
                  className="ov-btn solid danger"
                  onClick={() => {
                    setDone(true);
                    setOpen(false);
                  }}
                >
                  <Icon.x className="ic" /> {confirm}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
