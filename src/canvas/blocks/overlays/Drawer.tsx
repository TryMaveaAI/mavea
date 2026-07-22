import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useFocusTrap } from '../../../live/useFocusTrap';
import { OverlayPortal } from './portal';
import type { DrawerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DrawerProps & { delay?: number };

const DEFAULT_ROWS = [
  { label: 'Status', value: 'In review', icon: 'clock' as const },
  { label: 'Owner', value: 'Maya Chen', icon: 'mail' as const },
  { label: 'Pages', value: '24', icon: 'doc' as const },
  { label: 'Last edited', value: '2h ago', icon: 'edit' as const },
  { label: 'Visibility', value: 'Team', icon: 'eye' as const },
  { label: 'Sources', value: '8 linked', icon: 'link' as const },
  { label: 'Confidence', value: 'Strong', icon: 'shield' as const },
];

export function Drawer({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  trigger = 'View details',
  triggerIcon = 'external',
  description = 'A right&#8209;side drawer slides in with a header, scrollable body, and footer.',
  heading = 'Q3 Forecast.pdf',
  subhead = 'Document properties',
  rows = DEFAULT_ROWS,
  confirm = 'Open document',
  cancel = 'Close',
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const TrigIc = Icon[triggerIcon] || Icon.external;
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Trap focus inside the drawer while open and restore it to the trigger on close.
  useFocusTrap(dialogRef, { active: open });

  // Escape closes the drawer from anywhere (focus may sit on the backdrop), so the listener lives on
  // window rather than the drawer node — matching the app's other dialogs.
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
        <p className="ov-desc" dangerouslySetInnerHTML={richInnerHtml(description)} />
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
              className="ov-drawer"
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={heading}
            >
              <div className="ov-drawer-head">
                <div className="ov-drawer-titles">
                  <div className="ov-drawer-sub">{subhead}</div>
                  <div className="ov-drawer-title">{heading}</div>
                </div>
                <button
                  type="button"
                  className="ov-x"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <Icon.x className="ic" />
                </button>
              </div>
              <div className="ov-drawer-body">
                {rows.map((r) => {
                  const RowIc = r.icon ? Icon[r.icon] : null;
                  return (
                    <div className="ov-drawer-row" key={r.label}>
                      <span className="ov-drawer-row-l">
                        {RowIc && <RowIc className="ic" />} {r.label}
                      </span>
                      <span className="ov-drawer-row-v">{r.value}</span>
                    </div>
                  );
                })}
              </div>
              <div className="ov-drawer-foot">
                <button type="button" className="ov-btn ghost" onClick={() => setOpen(false)}>
                  {cancel}
                </button>
                <button type="button" className="ov-btn solid" onClick={() => setOpen(false)}>
                  <Icon.external className="ic" /> {confirm}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
