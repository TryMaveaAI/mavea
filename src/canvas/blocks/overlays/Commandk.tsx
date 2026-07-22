import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useFocusTrap } from '../../../live/useFocusTrap';
import { OverlayPortal } from './portal';
import type { CommandkProps, OverlayAction } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CommandkProps & { delay?: number };

const DEFAULT_GROUPS = [
  {
    label: 'Actions',
    commands: [
      { label: 'New report', icon: 'plus' as const, shortcut: '⌘N', hint: 'Start a blank canvas' },
      { label: 'Import sources', icon: 'upload' as const, shortcut: '⌘I' },
      { label: 'Share workspace', icon: 'share' as const },
    ],
  },
  {
    label: 'Navigate',
    commands: [
      { label: 'Go to dashboard', icon: 'chart' as const, shortcut: 'G D' },
      { label: 'Open documents', icon: 'doc' as const, shortcut: 'G O' },
      { label: 'Search sources', icon: 'globe' as const },
    ],
  },
  {
    label: 'Preferences',
    commands: [
      { label: 'Toggle theme', icon: 'moon' as const, shortcut: '⌘\\' },
      { label: 'Notification settings', icon: 'bell' as const },
    ],
  },
];

interface FlatCmd extends OverlayAction {
  group: string;
}

export function Commandk({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  trigger = 'Search commands',
  triggerIcon = 'spark',
  description = 'A ⌘K command palette — search, ↑/↓ to highlight, Enter to run.',
  placeholder = 'Type a command or search…',
  groups = DEFAULT_GROUPS,
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const TrigIc = Icon[triggerIcon] || Icon.spark;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Restore focus to the trigger when the palette closes and keep Tab cycling inside it. Escape and
  // the ↑/↓/Enter keys are still owned by the palette's own handler below (it needs them on window),
  // so the trap only manages Tab + focus restore here.
  useFocusTrap(dialogRef, { active: open });

  const flat: FlatCmd[] = useMemo(
    () => groups.flatMap((g) => g.commands.map((c) => ({ ...c, group: g.label }))),
    [groups],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q),
    );
  }, [flat, query]);

  // grouped view of current results, preserving original group order
  const grouped = useMemo(() => {
    const map = new Map<string, FlatCmd[]>();
    for (const c of results) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return Array.from(map.entries());
  }, [results]);

  useEffect(() => {
    if (open) {
      setActive(0);
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        // floor at 0: when results is empty `results.length - 1` is -1, which would
        // otherwise leave `active` on a negative (out-of-bounds) index.
        setActive((a) => Math.max(0, Math.min(results.length - 1, a + 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results.length]);

  // flat index helper for highlight across groups
  let flatIdx = -1;

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
        <button type="button" className="ov-trigger ov-ck-trigger" onClick={() => setOpen(true)}>
          <TrigIc className="ic" /> {trigger}
          <kbd className="ov-kbd ov-ck-kbd">⌘K</kbd>
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
              className="ov-ck"
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
            >
              <div className="ov-ck-search">
                <Icon.globe className="ic ov-ck-search-ic" />
                <input
                  ref={inputRef}
                  className="ov-ck-input"
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  spellCheck={false}
                />
                <kbd className="ov-kbd">esc</kbd>
              </div>
              <div className="ov-ck-list">
                {grouped.length === 0 && (
                  <div className="ov-ck-empty">
                    No commands match “<strong>{query}</strong>”
                  </div>
                )}
                {grouped.map(([gLabel, cmds]) => (
                  <div className="ov-ck-group" key={gLabel}>
                    <div className="ov-ck-group-label">{gLabel}</div>
                    {cmds.map((c) => {
                      flatIdx += 1;
                      const idx = flatIdx;
                      const CmdIc = c.icon ? Icon[c.icon] : Icon.chevR;
                      return (
                        <button
                          type="button"
                          key={c.label}
                          className={'ov-ck-item' + (active === idx ? ' on' : '')}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => setOpen(false)}
                        >
                          <span className="ov-ck-item-ic">
                            <CmdIc className="ic" />
                          </span>
                          <span className="ov-ck-item-meta">
                            <span className="ov-ck-item-label">{c.label}</span>
                            {c.hint && <span className="ov-ck-item-hint">{c.hint}</span>}
                          </span>
                          {c.shortcut && <kbd className="ov-kbd">{c.shortcut}</kbd>}
                          <Icon.chevR className="ic ov-ck-item-go" />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="ov-ck-foot">
                <span className="ov-ck-foot-hint">
                  <kbd className="ov-kbd">↑</kbd>
                  <kbd className="ov-kbd">↓</kbd> navigate
                </span>
                <span className="ov-ck-foot-hint">
                  <kbd className="ov-kbd">↵</kbd> select
                </span>
                <span className="ov-ck-foot-count">{results.length} commands</span>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
