// The bottom dock: the conversation's one fixed anchor. The composer fills it and a quiet
// mono hint advertises the hold-to-talk shortcut; the resting face lives up in the topbar.
// The bar spans the stage (right of the session rail), under the scrubber.
//
// The bar grows when the attach strip or pin dock appears, and every neighbour (scrubber,
// canvas padding, the listen/speak overlays) offsets by --dock-h — so the real rendered
// height is measured back into that variable rather than trusting the CSS floor.
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useHoldToTalk, pttKeyLabel } from './useHoldToTalk';
import type { PttSide } from '../useLiveConfig';

const PTT_KEYS = ['Alt', 'Control', 'Shift'] as const;
type PttKey = (typeof PTT_KEYS)[number];

const PTT_SIDES: { side: PttSide; label: string }[] = [
  { side: 'any', label: 'Either' },
  { side: 'left', label: 'Left' },
  { side: 'right', label: 'Right' },
];

const mac =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

const PTT_KEY_TOOLTIP: Record<PttKey, string> = {
  Alt: mac ? 'Option (⌥)' : 'Alt',
  Control: mac ? 'Control (⌃)' : 'Ctrl',
  Shift: mac ? 'Shift (⇧)' : 'Shift',
};

export function DockBar({
  children,
  holdEnabled,
  showHint = true,
  pttKey,
  pttSide = 'any',
  onHoldStart,
  onHoldEnd,
  onChangePttKey,
  onChangePttSide,
}: {
  children: ReactNode;
  /** Push-to-talk by holding a key — only when STT exists and the mic isn't already always-on.
   *  Arms the actual keyboard listener regardless of `showHint`. */
  holdEnabled: boolean;
  /** Show the inline "Hold ⌥ to talk" hint + key picker. Default true; Live turns this off once
   *  the mic's own MicModePopover covers the same discovery job (its "Hold" row) — key
   *  customization still lives in full in LiveSettings, so nothing is lost by hiding the
   *  duplicate inline picker here. */
  showHint?: boolean;
  /** The KeyboardEvent.key value to use for push-to-talk. Defaults to 'Alt'. */
  pttKey?: string;
  /** Which physical side of the key counts: 'any' (default), 'left', or 'right'. */
  pttSide?: PttSide;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  /** Called when the user picks a new hold-to-talk key from the inline picker. */
  onChangePttKey?: (key: PttKey) => void;
  /** Called when the user picks which side of the key counts. */
  onChangePttSide?: (side: PttSide) => void;
}): ReactElement {
  useHoldToTalk({ enabled: holdEnabled, pttKey, pttSide, onStart: onHoldStart, onStop: onHoldEnd });
  const barRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    const app = bar?.closest<HTMLElement>('.mavea-app');
    if (!bar || !app) return;
    const apply = (): void => app.style.setProperty('--dock-h', `${bar.offsetHeight}px`);
    apply();
    // jsdom has no ResizeObserver; the one-shot measure above still runs there.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    ro?.observe(bar);
    return () => {
      ro?.disconnect();
      app.style.removeProperty('--dock-h');
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: PointerEvent): void => {
      if (hintRef.current && !hintRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPickerOpen(false);
        // standard menu-button pattern: return focus to the trigger, not the void
        hintRef.current?.querySelector<HTMLButtonElement>('.dock-hint-btn')?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  return (
    <div className="live-dock dock-bar" ref={barRef}>
      <div className="dock-main">{children}</div>
      {holdEnabled && showHint && (
        <div className="dock-hint-wrap" ref={hintRef}>
          <button
            type="button"
            className="dock-hint dock-hint-btn"
            onClick={() => setPickerOpen((o) => !o)}
            title="Click to change hold-to-talk key"
          >
            Hold {pttKeyLabel(pttKey || 'Alt', pttSide)} to talk
          </button>
          {pickerOpen && (
            <div className="dock-hint-picker" role="menu" aria-label="Choose hold-to-talk key">
              <div className="dock-hint-row">
                {PTT_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitemradio"
                    aria-checked={(pttKey || 'Alt') === k}
                    className={`dock-hint-key${(pttKey || 'Alt') === k ? ' active' : ''}`}
                    title={PTT_KEY_TOOLTIP[k]}
                    onClick={() => onChangePttKey?.(k)}
                  >
                    {pttKeyLabel(k)}
                  </button>
                ))}
              </div>
              <div className="dock-hint-row dock-hint-sides">
                {PTT_SIDES.map(({ side, label }) => (
                  <button
                    key={side}
                    type="button"
                    role="menuitemradio"
                    aria-checked={pttSide === side}
                    className={`dock-hint-key${pttSide === side ? ' active' : ''}`}
                    title={
                      side === 'any'
                        ? 'Either side of the key'
                        : `Only the ${label.toLowerCase()} key`
                    }
                    onClick={() => onChangePttSide?.(side)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
