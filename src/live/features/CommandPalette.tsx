// CommandPalette.tsx — the ⌘K "everything Mavéa can do" surface.
// Renders the feature registry as a searchable, keyboard-driven list. It owns no behavior of its
// own: the host passes each feature already resolved to { available, reason, run }, so the palette
// just filters, navigates, and fires. Unavailable features stay visible (greyed, with a reason)
// rather than hidden — discovery is the whole point. Reuses the topbar menu's row styling and the
// app's token-based modal grammar so it's consistent in light and dark.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../icons/icons';
import { preloadIntentProps } from '../../lib/preloadableLazy';
import { FEATURE_GROUPS, featureHaystack, type Feature } from './registry';
import './commandPalette.css';

export interface PaletteItem {
  feature: Feature;
  /** False → rendered greyed with `reason`; the row still runs (the action enables/explains). */
  available: boolean;
  reason?: string;
  run: () => void;
  /** Code-only warmup. It must never execute feature or model logic. */
  preload?: () => Promise<void>;
  /** If set, the row gets a "Watch" affordance that plays this feature's key-free mini-demo. The
   *  palette owns no behavior of its own — the host decides what watching means. */
  watch?: () => void;
}

interface Props {
  items: PaletteItem[];
  surface: 'live' | 'demo';
  onClose: () => void;
  /** When true (the tour's palette chapter has this panel spotlighted), Escape and scrim clicks
   *  don't close it — a stray key mustn't kill the control the chapter is pointing at. */
  pinned?: boolean;
}

export function CommandPalette({ items, surface, onClose, pinned = false }: Props): ReactElement {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Fuzzy filter: every whitespace term must appear somewhere in the feature's haystack.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const terms = q.split(/\s+/);
    return items.filter((it) => {
      const hay = featureHaystack(it.feature);
      return terms.every((t) => hay.includes(t));
    });
  }, [items, query]);

  // Grouped for display (registry order), flattened for keyboard navigation.
  const groups = useMemo(
    () =>
      FEATURE_GROUPS.map((g) => ({
        heading: g,
        items: filtered.filter((it) => it.feature.group === g),
      })).filter((g) => g.items.length > 0),
    [filtered],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Reset selection whenever the result set changes.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Focus the input on open; restore the previously-focused element on close (focus trap hygiene).
  useEffect(() => {
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    inputRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, []);

  // Keep the active row in view as the user arrows through. Guarded: scrollIntoView isn't
  // implemented in every environment (jsdom) and must never break the list.
  useEffect(() => {
    const row = listRef.current?.querySelector('.is-active');
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const runItem = useCallback(
    (it: PaletteItem): void => {
      it.run();
      onClose();
    },
    [onClose],
  );
  // Watch this feature's mini-demo (⌘↵ or the row's "Watch" chip). Same close-on-fire as run.
  const watchItem = useCallback(
    (it: PaletteItem): void => {
      it.watch?.();
      onClose();
    },
    [onClose],
  );

  // Escape/arrow/enter navigation, on a window listener rather than a JSX handler on the panel —
  // the panel carries role="dialog" (non-interactive per ARIA), so it can't own DOM listeners
  // directly. A window listener also keeps navigation working no matter which descendant of the
  // palette currently has focus, exactly like the bubbled container handler it replaces.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Pinned (tour palette chapter): swallow Escape so it can't close the spotlighted panel,
        // but still preventDefault so it doesn't leak to a listener beneath.
        e.preventDefault();
        if (!pinned) onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(Math.max(0, flat.length - 1), a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = flat[active];
        if (!it) return;
        // ⌘/Ctrl+Enter on a row that has a demo plays it; plain Enter runs the feature.
        if ((e.metaKey || e.ctrlKey) && it.watch) watchItem(it);
        else runItem(it);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, flat, onClose, runItem, watchItem, pinned]);

  const activeId = flat[active]?.feature.id;

  return (
    <div
      className="cmdk-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pinned) onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          if (!pinned) onClose();
        }
      }}
    >
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Find a feature">
        <div className="cmdk-search">
          <Icon.sparkle className="cmdk-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              surface === 'demo' ? 'Find anything Mavéa can do…' : 'Search everything Mavéa can do…'
            }
            aria-label="Search features"
            aria-activedescendant={activeId ? `cmdk-opt-${activeId}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {/* The esc hint would be a lie while pinned (Escape is swallowed) — hide it there. */}
          {!pinned && <kbd className="cmdk-kbd">esc</kbd>}
        </div>
        {/* Outside Live you have no session, so a feature can't run for real — clicking one plays a
            quick demo of it on the real surface. Say so up front, so the whole palette reads as a
            "see it in action" gallery rather than a menu of things that mysteriously don't do much. */}
        {surface === 'demo' && <p className="cmdk-note">Click any feature to see it in action.</p>}
        <div className="cmdk-list" role="listbox" aria-label="Features" ref={listRef}>
          {flat.length === 0 ? (
            <div className="cmdk-empty">No features match “{query.trim()}”.</div>
          ) : (
            groups.map((g) => (
              <div key={g.heading} className="more-menu-group">
                <span className="more-menu-heading">{g.heading}</span>
                {g.items.map((it) => {
                  const idx = flat.indexOf(it);
                  const isActive = idx === active;
                  // Row + its optional "Watch" chip are SIBLINGS in a wrapper — not nested — so the
                  // option stays a real <button> (a nested button would be invalid HTML and would
                  // break the option's accessible name). The wrapper is presentational.
                  return (
                    <div key={it.feature.id} className="cmdk-row-wrap" role="presentation">
                      <button
                        type="button"
                        role="option"
                        id={`cmdk-opt-${it.feature.id}`}
                        aria-selected={isActive}
                        className={`more-menu-row cmdk-row${isActive ? ' is-active' : ''}${
                          it.available ? '' : ' is-unavailable'
                        }`}
                        onMouseMove={() => setActive(idx)}
                        onClick={() => runItem(it)}
                        {...(it.preload ? preloadIntentProps(it.preload) : {})}
                      >
                        <span className="more-menu-name">{it.feature.label}</span>
                        <span className="more-menu-blurb">
                          {it.available ? it.feature.blurb : (it.reason ?? it.feature.blurb)}
                        </span>
                      </button>
                      {it.watch && (
                        <button
                          type="button"
                          className="cmdk-watch"
                          aria-label={`See how ${it.feature.label} works`}
                          title="See how it works — a quick demo (⌘↵)"
                          onMouseMove={() => setActive(idx)}
                          onClick={() => watchItem(it)}
                        >
                          <Icon.play className="cmdk-watch-ic" aria-hidden="true" />
                          See how
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
