// A named dropdown for the Live/Demo topbar. Each menu is a stable, worded category (Create,
// Practice, Share, Explore) holding the features that belong to it — so the bar reads like a
// real menu bar (File / Edit / View) instead of a row of loose verbs and a catch-all "⋯".
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { preloadIntentProps } from '../lib/preloadableLazy';

export interface TopbarMenuItem {
  label: string;
  blurb: string;
  onClick: () => void;
  /** Starts only this item's lazy UI chunk; never invokes the item action itself. */
  preload?: () => Promise<void>;
  /** When false the item is omitted (the menu stays lean + contextual). */
  show: boolean;
}

interface Props {
  /** The category shown on the trigger — also the dropdown's accessible name. */
  label: string;
  items: TopbarMenuItem[];
  /** Optional count surfaced on the trigger as an ambient badge (e.g. review cards due), so a
   *  signal worth glancing at survives moving its action into a dropdown. */
  badge?: number;
}

export function TopbarMenu({ label, items, badge }: Props): ReactElement | null {
  const visibleItems = items.filter((i) => i.show);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The dropdown is right-anchored to its trigger (`right: 0`), so a leftmost category (Create) on a
  // narrow bar would push its left edge off-screen. Measure the panel once it opens and nudge it back
  // in if it overflows the viewport's left margin — keeps every menu on-screen from 431px up without
  // hard-coding which category sits where. Runs before paint (no flash) and re-checks on resize.
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    if (!open) return;
    const clamp = (): void => {
      const root = rootRef.current;
      const menu = menuRef.current;
      if (!root || !menu) return;
      const margin = 8;
      const naturalLeft = root.getBoundingClientRect().right - menu.offsetWidth;
      setShift(naturalLeft < margin ? Math.round(margin - naturalLeft) : 0);
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        // standard menu-button pattern: return focus to the trigger, not the void — otherwise
        // a keyboard user loses their place and has to re-tab from the page top
        rootRef.current?.querySelector<HTMLButtonElement>('.more-menu-trigger')?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A menu with nothing to show in the current context disappears entirely, so the bar only
  // ever carries categories that have something actionable behind them.
  if (visibleItems.length === 0) return null;

  return (
    <div className="more-menu-root" ref={rootRef}>
      <button
        type="button"
        className="topbar-text-btn more-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label}
        {badge != null && badge > 0 && <span className="topbar-badge">{badge}</span>}
        <span className="more-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="tpl-menu more-menu"
          role="menu"
          aria-label={label}
          ref={menuRef}
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          {visibleItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="more-menu-row"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              {...(item.preload ? preloadIntentProps(item.preload) : {})}
            >
              <span className="more-menu-name">{item.label}</span>
              <span className="more-menu-blurb">{item.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
