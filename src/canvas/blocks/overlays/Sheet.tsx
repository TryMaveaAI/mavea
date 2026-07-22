import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { OverlayPortal } from './portal';
import type { SheetProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SheetProps & { delay?: number };

const DEFAULT_OPTIONS = [
  { label: 'Copy link', icon: 'link' as const, meta: 'Anyone with the link' },
  { label: 'Share to team', icon: 'share' as const, meta: '12 members', selected: true },
  { label: 'Email a copy', icon: 'mail' as const },
  { label: 'Export as PDF', icon: 'export' as const },
];

export function Sheet({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  trigger = 'Share',
  triggerIcon = 'share',
  description = 'A bottom sheet slides up with a grabber handle — mobile&#8209;style.',
  heading = 'Share this report',
  subhead = 'Choose how you want to send it',
  options = DEFAULT_OPTIONS,
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const TrigIc = Icon[triggerIcon] || Icon.share;
  const [open, setOpen] = useState(false);
  const initial = Math.max(
    0,
    options.findIndex((o) => o.selected),
  );
  const [sel, setSel] = useState(initial === -1 ? 0 : initial);

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
            <div className="ov-sheet" role="dialog" aria-modal="true" aria-label={heading}>
              <div className="ov-sheet-grab" />
              <div className="ov-sheet-head">
                <div className="ov-sheet-title">{heading}</div>
                <div className="ov-sheet-sub">{subhead}</div>
              </div>
              <div className="ov-sheet-list">
                {options.map((o, i) => {
                  const OptIc = o.icon ? Icon[o.icon] : Icon.chevR;
                  return (
                    <button
                      type="button"
                      key={o.label}
                      className={'ov-sheet-opt' + (sel === i ? ' on' : '')}
                      onClick={() => setSel(i)}
                    >
                      <span className="ov-sheet-opt-ic">
                        <OptIc className="ic" />
                      </span>
                      <span className="ov-sheet-opt-meta">
                        <span className="ov-sheet-opt-label">{o.label}</span>
                        {o.meta && <span className="ov-sheet-opt-sub">{o.meta}</span>}
                      </span>
                      <span className="ov-sheet-radio">
                        {sel === i && <Icon.check className="ic" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="ov-btn solid ov-sheet-cta"
                onClick={() => setOpen(false)}
              >
                <Icon.send className="ic" /> Continue
              </button>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
