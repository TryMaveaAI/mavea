// ExploreNav — the landing topbar's Explore dropdown: direct entry to the standalone surfaces
// (Deep Zoom, Courses, Dashboards, Prism, Ripple), no conversation needed. On a phone the
// standalone nav links beside it are hidden (no room for five items in a row) — this trigger
// becomes the ONE way in, so it also folds in Take the tour / Demo there (the
// fl-explore-item--compact rows, CSS-shown only under the mobile breakpoint) rather than
// dropping those destinations entirely. The gallery is deliberately NOT offered here: it's a
// QA/browse surface, reachable at #/gallery directly, not part of the landing's story.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { MenuIcon } from '../icons/coreIcons';

interface ExploreItem {
  name: string;
  sub: string;
  onClick: () => void;
  /** CSS-shown only under the mobile breakpoint (duplicates a full-width nav link). */
  compact?: boolean;
}

/** The rows a keyboard user can actually land on: the compact duplicates are display:none above
 *  the phone breakpoint, and arrowing into a row nobody can see strands the focus ring. */
function reachableItems(menu: HTMLElement | null): HTMLButtonElement[] {
  const rows = menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [];
  return [...rows].filter((row) => getComputedStyle(row).display !== 'none');
}

/** Hand focus back to the trigger whenever the menu closes — the rows unmount with it, and
 *  focus left on a removed node drops the keyboard user back at the top of the page. */
function focusTrigger(root: HTMLElement | null): void {
  root?.querySelector<HTMLButtonElement>('.fl-explore-trigger')?.focus();
}

export function ExploreNav({
  onStartTour,
  onScrollToDemo,
}: {
  onStartTour: () => void;
  onScrollToDemo: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // role="menu" tells assistive tech the arrows drive this list, so opening lands on the first
  // row and the arrows move between rows — without it the announcement promises navigation the
  // menu doesn't have.
  useEffect(() => {
    if (open) reachableItems(menuRef.current)[0]?.focus();
  }, [open]);

  // Close on outside click or Escape (Escape returns focus to the trigger — standard
  // menu-button pattern, so a keyboard user never loses their place).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        focusTrigger(rootRef.current);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Roving arrow navigation, wired to the rows themselves — a keystroke belongs to the focused
  // item, and the menu container must not become a focus stop of its own.
  const moveFocus = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const rows = reachableItems(menuRef.current);
    if (!rows.length) return;
    const from = Math.max(0, rows.indexOf(document.activeElement as HTMLButtonElement));
    let next: number;
    if (e.key === 'ArrowDown') next = (from + 1) % rows.length;
    else if (e.key === 'ArrowUp') next = (from - 1 + rows.length) % rows.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else return;
    e.preventDefault();
    rows[next].focus();
  };

  const go = (hash: string) => () => {
    window.location.hash = hash;
  };
  const items: ExploreItem[] = [
    {
      name: 'Take the tour',
      sub: 'A guided, 2-minute walkthrough',
      onClick: onStartTour,
      compact: true,
    },
    {
      name: 'Demo',
      sub: 'Watch a curated prerecorded replay',
      onClick: onScrollToDemo,
      compact: true,
    },
    { name: 'Deep Zoom', sub: 'Explore any topic, level by level', onClick: go('#/deepzoom') },
    { name: 'Courses', sub: 'Learn any topic, lesson by lesson', onClick: go('#/courses') },
    { name: 'Flashcards', sub: 'What you asked to remember', onClick: go('#/flashcards') },
    { name: 'Dashboards', sub: 'Track what matters, live', onClick: go('#/dashboards') },
    { name: 'Prism', sub: 'Chat with your documents', onClick: go('#/prism') },
    {
      name: 'Ripple',
      sub: "A change's blast radius, or a whole repo's course",
      onClick: go('#/ripple'),
    },
  ];

  return (
    <div className="fl-explore-root" ref={rootRef}>
      <button
        type="button"
        className="fl-nav-link fl-explore-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Explore"
      >
        <span className="fl-explore-label-full" aria-hidden="true">
          Explore
        </span>
        <MenuIcon className="fl-explore-label-compact" aria-hidden="true" />
        <span className="fl-explore-caret" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="fl-explore-menu tpl-menu"
          role="menu"
          aria-label="Explore features"
          ref={menuRef}
        >
          {items.map((item) => (
            <button
              key={item.name}
              type="button"
              role="menuitem"
              // Roving focus: the arrows move between rows, so Tab leaves the menu instead of
              // walking it one item at a time.
              tabIndex={-1}
              className={'fl-explore-item' + (item.compact ? ' fl-explore-item--compact' : '')}
              onKeyDown={moveFocus}
              onClick={() => {
                setOpen(false);
                focusTrigger(rootRef.current);
                item.onClick();
              }}
            >
              <span className="fl-explore-name">{item.name}</span>
              <span className="fl-explore-sub">{item.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
