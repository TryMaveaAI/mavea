// The mic-mode switcher: Tap (one-shot), Always on (hands-free), or Hold (push-to-talk). Lives
// behind a small chevron badge on the mic button's own corner rather than a permanent row next
// to it — a setting you pick once and rarely revisit doesn't earn a standing row. Opens UPWARD:
// the mic sits at the very bottom of the viewport, so a downward popover would clip against the
// window edge (the same lesson the model picker learned the hard way).
//
// Reuses the app's own dropdown-row language (.more-menu-row/-name/-blurb, the Create/Practice/
// Share/Explore menus) rather than inventing a new one — title + description per row, a check on
// the active choice. Hold is still just the composer's existing press-and-hold gesture (always
// available whenever the mic isn't in Always-on mode) rather than a mode with its own listening
// lifecycle — but it IS a real, remembered preference: picking it keeps the mic in Tap's
// underlying behavior while flipping the checkmark (and the default hint) to Hold, so the choice
// the user actually made is what's reflected here, not silently collapsed into Tap.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../icons/icons';
import { pttKeyLabel } from './useHoldToTalk';
import type { PttSide } from '../useLiveConfig';

export type MicMode = 'tap' | 'always' | 'hold';

export function MicModePopover({
  mode,
  onChange,
  pttKey,
  pttSide,
}: {
  mode: MicMode;
  onChange: (mode: MicMode) => void;
  pttKey?: string;
  pttSide?: PttSide;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const heldKey = pttKeyLabel(pttKey || 'Alt', pttSide);
  const pick = (next: MicMode): void => {
    onChange(next);
    setOpen(false);
  };
  const rows: {
    key: MicMode;
    title: string;
    blurb: string;
    checked: boolean;
    onClick: () => void;
  }[] = [
    {
      key: 'tap',
      title: 'Tap',
      blurb: 'Tap once, speak, tap to stop',
      checked: mode === 'tap',
      onClick: () => pick('tap'),
    },
    {
      key: 'always',
      title: 'Always on',
      blurb: 'Hands-free — responds to "Mavéa"',
      checked: mode === 'always',
      onClick: () => pick('always'),
    },
    {
      key: 'hold',
      title: `Hold ${heldKey}`,
      blurb: `Push-to-talk with the ${heldKey} key`,
      checked: mode === 'hold',
      onClick: () => pick('hold'),
    },
  ];

  return (
    <div className="mic-mode-pop-root" ref={rootRef}>
      <button
        type="button"
        className="mic-mode-chevron"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Mic mode"
        title="Mic mode"
      >
        {/* 8px chevron, stroke-width 3 in a 24 viewBox, currentColor — the exact spec sampled
            from the Design source. currentColor follows the badge's per-theme `color`. */}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="mic-mode-pop" role="menu" aria-label="Mic mode">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              role="menuitemradio"
              aria-checked={r.checked}
              className="more-menu-row mic-mode-row"
              onClick={r.onClick}
            >
              <span className="more-menu-name">{r.title}</span>
              <span className="more-menu-blurb">{r.blurb}</span>
              {r.checked && <Icon.check className="mic-mode-row-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
